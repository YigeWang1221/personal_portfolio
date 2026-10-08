// OpenAI-compatible chat completions (Provider A, the stack's gateway; Provider B, DeepSeek). SDD-AICHAT-001 §5.6.
// The canonical prompt becomes one leading system message, then user / assistant messages (v2.1 §5.3.5).
// Streams end with "data: [DONE]"; ": keep-alive" comments are reported but are not text (H10).
import { createSseParser } from '../sse.mjs';
import { ProviderError, discard } from './errors.mjs';

const FINISH = { stop: 'stop', length: 'length', content_filter: 'blocked' };

/** @param {{system: string, messages: {role: string, text: string}[]}} prompt */
export function toOpenAiMessages(prompt) {
  return [{ role: 'system', content: prompt.system }, ...prompt.messages.map((m) => ({ role: m.role, content: m.text }))];
}

/**
 * @param {{id: string, url: string, key: string, model: string, extraBody?: object}} cfg
 * @param {{fetchImpl?: typeof fetch, maxOutputTokens?: number}} [opts]
 */
export function openAiProvider(cfg, { fetchImpl = fetch, maxOutputTokens = 1024 } = {}) {
  return {
    id: cfg.id,
    async *stream(prompt, signal) {
      const body = {
        model: cfg.model,
        messages: toOpenAiMessages(prompt),
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: maxOutputTokens,
        ...cfg.extraBody,
      };
      let res;
      try {
        res = await fetchImpl(cfg.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream', authorization: `Bearer ${cfg.key}` },
          body: JSON.stringify(body),
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
      let done = false;
      try {
        for await (const chunk of res.body) {
          for (const ev of parser.push(chunk)) {
            if ('comment' in ev) {
              yield { type: 'keepalive' };
              continue;
            }
            if (ev.data === '[DONE]') {
              done = true;
              continue;
            }
            let json;
            try {
              json = JSON.parse(ev.data);
            } catch {
              throw new ProviderError('protocol');
            }
            if (json.usage) usage = { in: json.usage.prompt_tokens, out: json.usage.completion_tokens };
            const choice = json.choices?.[0];
            const text = choice?.delta?.content;
            if (typeof text === 'string' && text) yield { type: 'text', text };
            if (choice?.finish_reason) finish = FINISH[choice.finish_reason] ?? 'stop';
          }
          if (done) break;
        }
      } catch (e) {
        if (signal.aborted || e instanceof ProviderError) throw e;
        throw new ProviderError('network');
      }
      // A stream that stops without [DONE] or a finish reason was cut off.
      if (!done && !finish) throw new ProviderError('protocol');
      yield { type: 'finish', reason: finish ?? 'stop', usage };
    },
  };
}
