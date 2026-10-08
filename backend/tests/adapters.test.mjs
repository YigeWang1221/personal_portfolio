// T-PROMPT-04 and provider protocol details (SDD-AICHAT-001 §5.3.5 v2.1, H10, H11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assemblePrompt } from '../../shared/ai/assemble.mjs';
import { openAiProvider, toOpenAiMessages } from '../src/providers/openai-compat.mjs';
import { geminiProvider, toGeminiRequest } from '../src/providers/gemini.mjs';
import { KNOWLEDGE_DIR, streamResponse } from './helpers.mjs';

const BUNDLE = join(KNOWLEDGE_DIR, 'prompt-bundle.json');
const skip = !existsSync(BUNDLE) && 'run npm run build first';

async function drain(provider) {
  const out = [];
  for await (const ev of provider.stream({ system: 's', messages: [{ role: 'user', text: 'q' }] }, new AbortController().signal)) out.push(ev);
  return out;
}

test('T-PROMPT-04: both adapters render the same canonical prompt in the same order', { skip }, () => {
  const bundle = JSON.parse(readFileSync(BUNDLE, 'utf8'));
  const prompt = assemblePrompt(bundle, {
    locale: 'en',
    message: 'And the second one?',
    history: [{ role: 'user', text: 'Which projects?' }, { role: 'assistant', text: 'KK Knock and others [S1].' }],
    sources: [{ tag: 'S1', title: 'Catalog', path: '/projects/', text: 'list' }],
  });
  const oa = toOpenAiMessages(prompt);
  assert.equal(oa.filter((m) => m.role === 'system').length, 1, 'one leading system message');
  assert.equal(oa[0].role, 'system');
  assert.deepEqual(oa.slice(1).map((m) => m.role), ['user', 'assistant', 'user']);
  const last = oa.at(-1).content;
  assert.match(last, /^<instructions>\n[\s\S]+\n<\/instructions>\n\nAnd the second one\?$/, 'post-history sits right before the question');

  const g = toGeminiRequest(prompt, 512);
  assert.equal(g.systemInstruction.parts[0].text, oa[0].content);
  assert.deepEqual(g.contents.map((c) => c.role), ['user', 'model', 'user']);
  assert.equal(g.contents.at(-1).parts[0].text, last);
  // Block order inside the system text follows prompt-order.yaml.
  const order = prompt.blocks.map((b) => b.id).filter((id) => !['history', 'user-message', 'post-history'].includes(id));
  assert.deepEqual(order, bundle.order.filter((i) => i.block && i.position === 'system').map((i) => i.block));
});

test('OpenAI-compatible: text deltas, keep-alives, usage and [DONE]; DeepSeek options are sent', async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return streamResponse([': keep-alive\n\n', 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n', 'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\ndata: [DONE]\n\n']);
  };
  const p = openAiProvider({ id: 'B', url: 'https://api.example/chat/completions', key: 'k', model: 'deepseek-flash', extraBody: { thinking: { type: 'disabled' } } }, { fetchImpl });
  const out = await drain(p);
  assert.deepEqual(out, [{ type: 'keepalive' }, { type: 'text', text: 'Hel' }, { type: 'text', text: 'lo' }, { type: 'finish', reason: 'stop', usage: { in: 10, out: 2 } }]);
  assert.equal(sent.init.headers.authorization, 'Bearer k');
  assert.deepEqual(sent.body.thinking, { type: 'disabled' });
  assert.equal(sent.body.stream, true);
  assert.equal(sent.body.messages[0].role, 'system');
});

test('OpenAI-compatible: content_filter is blocked; a cut-off stream is a protocol error; HTTP errors keep the status', async () => {
  const blocked = openAiProvider({ id: 'A', url: 'u', key: 'k', model: 'm' }, { fetchImpl: async () => streamResponse(['data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n']) });
  assert.deepEqual((await drain(blocked)).at(-1), { type: 'finish', reason: 'blocked', usage: undefined });
  const cut = openAiProvider({ id: 'A', url: 'u', key: 'k', model: 'm' }, { fetchImpl: async () => streamResponse(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n']) });
  await assert.rejects(drain(cut), (e) => e.kind === 'protocol');
  let calls = 0;
  const http = openAiProvider({ id: 'A', url: 'u', key: 'k', model: 'm' }, { fetchImpl: async () => (calls++, new Response('{"error":"secret detail"}', { status: 402 })) });
  await assert.rejects(drain(http), (e) => e.kind === 'http' && e.status === 402 && !e.message.includes('secret'));
  assert.equal(calls, 1, 'no automatic retry');
});

test('Gemini: system instruction, model role, thought parts skipped, finish reasons and blocked prompts', async () => {
  let sent;
  const ok = geminiProvider({ id: 'C', url: 'https://g.example/v1beta', key: 'gk', model: 'gemini-3.8-flash' }, {
    fetchImpl: async (url, init) => {
      sent = { url, init };
      return streamResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"thinking…","thought":true},{"text":"Hi"}]}}]}\r\n\r\n',
        'data: {"candidates":[{"content":{"parts":[{"text":" there"}]},"finishReason":"MAX_TOKENS"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3}}\r\n\r\n',
      ]);
    },
  });
  assert.deepEqual(await drain(ok), [{ type: 'text', text: 'Hi' }, { type: 'text', text: ' there' }, { type: 'finish', reason: 'length', usage: { in: 5, out: 3 } }]);
  assert.equal(sent.url, 'https://g.example/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse');
  assert.equal(sent.init.headers['x-goog-api-key'], 'gk');
  assert.equal(JSON.parse(sent.init.body).generationConfig.temperature, undefined, 'temperature left at the default');

  const blockedPrompt = geminiProvider({ id: 'C', url: 'u', key: 'k', model: 'm' }, { fetchImpl: async () => streamResponse(['data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n']) });
  assert.deepEqual(await drain(blockedPrompt), [{ type: 'finish', reason: 'blocked' }]);
  const blockedAnswer = geminiProvider({ id: 'C', url: 'u', key: 'k', model: 'm' }, { fetchImpl: async () => streamResponse(['data: {"candidates":[{"finishReason":"SAFETY"}]}\n\n']) });
  assert.equal((await drain(blockedAnswer)).at(-1).reason, 'blocked');
});
