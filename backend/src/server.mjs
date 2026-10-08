// portfolio-api (ADR-022, SDD-AICHAT-001 §5.6, §6). Node built-ins only.
//   GET  /api/health → {status, knowledgeVersion, protocol}; never calls a provider.
//   POST /api/chat   → text/event-stream (see chat.mjs).
// Every request must carry X-Origin-Key (set by the Edge Worker, compared in constant time); everything else is
// a JSON 404 / 405. Error bodies are {code, retryable}, without stack traces or internal details.
import { createServer } from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { loadKnowledge } from './knowledge.mjs';
import { createLimits } from './limits.mjs';
import { log } from './log.mjs';
import { PROTOCOL, RequestError, createProviderState, handleChat, validateChatBody } from './chat.mjs';
import { openAiProvider } from './providers/openai-compat.mjs';
import { geminiProvider } from './providers/gemini.mjs';
import { demoScript, mockProvider } from './providers/mock.mjs';
import { compileGuard } from '../../shared/ai/guard.mjs';

const MAX_BODY = 32 * 1024;
const CLIENT_ID = /^[A-Za-z0-9_-]{8,128}$/;

/** Constant-time comparison of two strings of any length. */
export function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb) && String(a).length === String(b).length;
}

/** Build the provider list in configured order, skipping providers without URL, key or model. */
export function buildProviders(config, fetchImpl = fetch) {
  const opts = { fetchImpl, maxOutputTokens: config.maxOutputTokens };
  return config.order
    .map((id) => config.providers[id])
    .filter((p) => (config.mode === 'mock' ? true : p.enabled))
    .map((p) => {
      if (config.mode === 'mock') return mockProvider(p.id, demoScript(p.id));
      return p.kind === 'gemini' ? geminiProvider(p, opts) : openAiProvider(p, opts);
    });
}

function json(res, status, body) {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (status === 413) headers.connection = 'close';
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        // Stop keeping data and drain the rest, so the client still receives the 413 (the Worker caps bodies first).
        req.off('data', onData);
        req.resume();
        reject(new RequestError(413, 'TOO_LARGE'));
        return;
      }
      chunks.push(c);
    };
    req.on('data', onData);
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => reject(new RequestError(400, 'BAD_REQUEST')));
  });
}

export function healthStatus(ctx) {
  const { knowledge, config, providers, state, limits } = ctx;
  const usable = providers.filter((p) => state.available(p.id));
  if (!knowledge.ok || !config.originKey || usable.length === 0 || limits.status().capReached || !limits.status().storageOk) return 'unavailable';
  return usable.length < providers.length ? 'degraded' : 'available';
}

/**
 * @param {{config: ReturnType<typeof loadConfig>, knowledge: ReturnType<typeof loadKnowledge>,
 *   providers: {id: string, stream: Function}[], limits: ReturnType<typeof createLimits>,
 *   state: ReturnType<typeof createProviderState>}} ctx
 */
export function createApp(ctx) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://origin');
    try {
      if (!ctx.config.originKey || !safeEqual(req.headers['x-origin-key'] ?? '', ctx.config.originKey)) throw new RequestError(403, 'FORBIDDEN');
      if (url.pathname === '/api/health') {
        if (req.method !== 'GET') throw new RequestError(405, 'METHOD_NOT_ALLOWED');
        return json(res, 200, { status: healthStatus(ctx), knowledgeVersion: ctx.knowledge.knowledgeVersion ?? null, protocol: PROTOCOL });
      }
      if (url.pathname === '/api/chat') {
        if (req.method !== 'POST') throw new RequestError(405, 'METHOD_NOT_ALLOWED');
        if (!/^application\/json(;|$)/i.test(req.headers['content-type'] ?? '')) throw new RequestError(400, 'BAD_REQUEST');
        const raw = await readBody(req);
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new RequestError(400, 'BAD_REQUEST');
        }
        const input = validateChatBody(body);
        const header = String(req.headers['x-client-id'] ?? '');
        const clientId = CLIENT_ID.test(header) ? header : 'anonymous';
        const client = new AbortController();
        res.on('close', () => {
          if (!res.writableFinished) client.abort('client');
        });
        return await handleChat({ input, res, clientId, clientSignal: client.signal, ctx });
      }
      throw new RequestError(404, 'NOT_FOUND');
    } catch (e) {
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      const err = e instanceof RequestError ? e : new RequestError(503, 'UNAVAILABLE', true);
      json(res, err.status, { code: err.code, retryable: err.retryable });
    }
  });
}

export function start(env = process.env) {
  const config = loadConfig(env);
  const knowledge = loadKnowledge(config.knowledgeDir);
  const providers = buildProviders(config);
  const ctx = {
    config,
    knowledge,
    providers,
    guard: knowledge.ok ? compileGuard(knowledge.bundle.guard) : null,
    state: createProviderState(),
    limits: createLimits({ ...config.limits, stateDir: config.stateDir }),
  };
  const server = createApp(ctx);
  server.listen(config.port, config.host, () => {
    log({
      event: 'start',
      knowledgeVersion: knowledge.ok ? knowledge.knowledgeVersion : undefined,
      reason: knowledge.ok ? (config.originKey ? 'ready' : 'origin key missing') : `knowledge ${knowledge.error}`,
      providers: providers.map((p) => p.id),
      outcome: config.mode,
    });
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return { server, ctx };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
