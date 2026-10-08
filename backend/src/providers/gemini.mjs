// Gemini streamGenerateContent (Provider C, the paid Gemini API). SDD-AICHAT-001 §5.6, H11.
// The canonical prompt becomes systemInstruction + contents (assistant → model). Temperature stays at the model's
// default (Gemini 3.x guidance). A blocked prompt has promptFeedback.blockReason; a blocked answer has a safety
// finishReason.
import { createSseParser } from '../sse.mjs';
import { ProviderError, discard } from './errors.mjs';

const BLOCKED = new Set(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'RECITATION']);

export function toGeminiRequest(prompt, maxOutputTokens) {
  return {
    systemInstruction: { parts: [{ text: prompt.system }] },
    contents: prompt.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
    generationConfig: { maxOutputTokens },
  };
}

/**
 * @param {{id: string, url: string, key: string, model: string}} cfg  url is the API base (…/v1beta)
 * @param {{fetchImpl?: typeof fetch, maxOutputTokens?: number}} [opts]
 */
export function geminiProvider(cfg, { fetchImpl = fetch, maxOutputTokens = 1024 } = {}) {
  return {
    id: cfg.id,
    async *stream(prompt, signal) {
      const url = `${cfg.url}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`;
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream', 'x-goog-api-key': cfg.key },
          body: JSON.stringify(toGeminiRequest(prompt, maxOutputTokens)),
          signal,
        });
      } catch (e) {
        if (signal.aborted) throw e;
        throw new ProviderError('network');
      }
      if (!res.ok) {
        await discard(res);
        throw new ProviderError('http', { status: res.status });
      }
      if (!res.body) throw new ProviderError('protocol');
      const parser = createSseParser();
      let finish = null;
      let usage;
      try {
        for await (const chunk of res.body) {
          for (const ev of parser.push(chunk)) {
            if ('comment' in ev) {
              yield { type: 'keepalive' };
              continue;
            }
            let json;
            try {
              json = JSON.parse(ev.data);
            } catch {
              throw new ProviderError('protocol');
            }
            if (json.promptFeedback?.blockReason) {
              yield { type: 'finish', reason: 'blocked' };
              return;
            }
            if (json.usageMetadata) usage = { in: json.usageMetadata.promptTokenCount, out: json.usageMetadata.candidatesTokenCount };
            const cand = json.candidates?.[0];
            for (const part of cand?.content?.parts ?? []) {
              if (!part.thought && typeof part.text === 'string' && part.text) yield { type: 'text', text: part.text };
            }
            if (cand?.finishReason) {
              const r = cand.finishReason;
              finish = r === 'STOP' ? 'stop' : r === 'MAX_TOKENS' ? 'length' : BLOCKED.has(r) ? 'blocked' : 'stop';
            }
          }
        }
      } catch (e) {
        if (signal.aborted || e instanceof ProviderError) throw e;
        throw new ProviderError('network');
      }
      if (!finish) throw new ProviderError('protocol');
      yield { type: 'finish', reason: finish, usage };
    },
  };
}
