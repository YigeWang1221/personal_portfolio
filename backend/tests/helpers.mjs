// Backend test helpers: fake provider responses, an event-collecting writer, a test server on a random port.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { loadKnowledge } from '../src/knowledge.mjs';
import { createLimits } from '../src/limits.mjs';
import { createProviderState } from '../src/chat.mjs';
import { createApp } from '../src/server.mjs';
import { compileGuard } from '../../shared/ai/guard.mjs';

export const KNOWLEDGE_DIR = join(import.meta.dirname, '..', '..', 'generated', 'ai');

/** A fetch Response whose body streams the given chunks (strings or bytes), optionally with delays. */
export function streamResponse(chunks, { status = 200, delayMs = 0 } = {}) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async pull(controller) {
      const next = chunks.shift();
      if (next === undefined) return controller.close();
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      controller.enqueue(typeof next === 'string' ? enc.encode(next) : next);
    },
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

export function collectWriter() {
  const events = [];
  return {
    events,
    event: (name, payload) => (events.push({ name, payload }), true),
    comment: () => true,
    names: () => events.map((e) => e.name),
    text: () => events.filter((e) => e.name === 'delta').map((e) => e.payload.text).join(''),
  };
}

export const FAST = { firstTextMs: 80, idleMs: 80, totalMs: 600, heartbeatMs: 20, cooldownMs: 1000 };

/** Start the app with the given providers on a random port. */
export async function testServer({ providers, env = {}, stateDir, knowledgeDir = KNOWLEDGE_DIR, limits: limitOverrides = {} } = {}) {
  const dir = stateDir ?? mkdtempSync(join(tmpdir(), 'pf-api-'));
  const config = loadConfig({ PORTFOLIO_ORIGIN_KEY: 'test-key', KNOWLEDGE_DIR: knowledgeDir, STATE_DIR: dir, ...env });
  Object.assign(config.timing, FAST);
  Object.assign(config.limits, limitOverrides);
  const knowledge = loadKnowledge(knowledgeDir);
  const ctx = { config, knowledge, providers, guard: knowledge.ok ? compileGuard(knowledge.bundle.guard) : null, state: createProviderState(), limits: createLimits({ ...config.limits, stateDir: dir }) };
  const server = createApp(ctx);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    ctx,
    base,
    stateDir: dir,
    chat: (body, headers = {}, init = {}) =>
      fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-origin-key': 'test-key', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body), ...init }),
    close: () => new Promise((r) => server.close(r)),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Parse a whole SSE response body into events. */
export async function readEvents(res) {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((f) => f.startsWith('event:'))
    .map((f) => {
      const [e, d] = f.split('\n');
      return { name: e.slice(7), payload: JSON.parse(d.slice(6)) };
    });
}
