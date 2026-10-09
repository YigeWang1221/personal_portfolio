// POST /api/chat (SDD-AICHAT-001 §5.6, §6.2): validate → limits → retrieve → assemble → providers in order.
//
// Fallback rule: a provider is tried once; the request moves to the next one only before the first visible text.
// Once text has reached the visitor, the provider is locked, and any later failure ends the answer as partial,
// so an answer is never stitched together from two models (D-5).
import { randomUUID } from 'node:crypto';
import { assemblePrompt } from '../../shared/ai/assemble.mjs';
import { search, selectSources, questionLocale } from '../../shared/ai/retrieve.mjs';
import { answerViolation, guardRequest, promptFingerprints } from '../../shared/ai/guard.mjs';
import { estimateTokens } from '../../shared/ai/tokenize.mjs';
import { log } from './log.mjs';
import { sseWriter } from './sse.mjs';

export const PROTOCOL = 1;
const BODY_KEYS = new Set(['message', 'locale', 'pagePath', 'history', 'knowledgeVersion']);
const MAX_MESSAGE = 1000;
const MAX_TURN_TEXT = 2000;
const MAX_HISTORY = 16; // eight completed rounds of user + assistant

export class RequestError extends Error {
  constructor(status, code, retryable = false) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

/** Strict request schema: unknown fields, wrong roles or oversized texts are rejected. */
export function validateChatBody(body) {
  const bad = () => new RequestError(400, 'BAD_REQUEST');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad();
  for (const k of Object.keys(body)) if (!BODY_KEYS.has(k)) throw bad();
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE) throw bad();
  if (body.locale !== 'en' && body.locale !== 'zh') throw bad();
  if (body.pagePath !== undefined && (typeof body.pagePath !== 'string' || body.pagePath.length > 200)) throw bad();
  if (body.knowledgeVersion !== undefined && (typeof body.knowledgeVersion !== 'string' || body.knowledgeVersion.length > 64)) throw bad();
  const history = body.history ?? [];
  if (!Array.isArray(history) || history.length > MAX_HISTORY) throw bad();
  const turns = history.map((t) => {
    if (!t || typeof t !== 'object' || Array.isArray(t)) throw bad();
    const keys = Object.keys(t);
    if (keys.length !== 2 || !keys.includes('role') || !keys.includes('text')) throw bad();
    if (t.role !== 'user' && t.role !== 'assistant') throw bad();
    if (typeof t.text !== 'string' || !t.text.trim() || t.text.length > MAX_TURN_TEXT) throw bad();
    return { role: t.role, text: t.text };
  });
  return { message, locale: body.locale, pagePath: body.pagePath, history: turns, knowledgeVersion: body.knowledgeVersion };
}

/** Per-provider health: cooled down after 429, disabled until restart after 401/402/403/404. */
export function createProviderState(now = Date.now) {
  const cooldown = new Map();
  const disabled = new Set();
  return {
    available: (id) => !disabled.has(id) && (cooldown.get(id) ?? 0) <= now(),
    cool: (id, ms) => cooldown.set(id, now() + ms),
    disable: (id) => disabled.add(id),
    snapshot: () => ({ disabled: [...disabled], cooling: [...cooldown].filter(([, t]) => t > now()).map(([id]) => id) }),
  };
}

/** Map [Sn] tags in the answer to the sources actually sent; invented tags are dropped. */
export function citedSources(answer, sources) {
  const byTag = new Map(sources.map((s) => [s.tag, s]));
  const seen = new Set();
  const items = [];
  // Models write single tags ("[S1]") and grouped ones ("[S1, S3]", "[S1，S2]").
  for (const m of answer.matchAll(/\[(S\d{1,2}(?:\s*[,，、]\s*S\d{1,2})*)\]/g)) {
    for (const tag of m[1].split(/\s*[,，、]\s*/)) {
      const s = byTag.get(tag);
      if (!s || seen.has(s.tag) || !s.path.startsWith('/') || s.path.startsWith('//')) continue;
      seen.add(s.tag);
      items.push({ id: s.tag, path: s.path, title: s.title });
    }
  }
  return items;
}

/**
 * Run one generation over the providers, writing SSE events. Exactly one terminal event (done or error) is sent.
 * @returns {Promise<{outcome: string, provider?: string, partial: boolean, answer: string, usage?: {in?: number, out?: number}, attempts: number, firstTextMs?: number}>}
 */
export async function generate({ prompt, providers, state, timing, writer, clientSignal, cannedBlocked, cannedRefusal = cannedBlocked, fingerprints = [], now = Date.now }) {
  const started = now();
  let attempts = 0;
  let answer = '';
  let locked = null;
  let firstTextMs;
  const end = (outcome, extra) => ({ outcome, provider: locked ?? extra?.provider, partial: Boolean(extra?.partial), answer, usage: extra?.usage, attempts, firstTextMs });
  const fail = (code, partial, outcome, extra = {}) => {
    writer.event('error', { code, partial });
    return end(outcome, { ...extra, partial });
  };

  for (const p of providers) {
    if (clientSignal.aborted) return end('cancelled', { partial: Boolean(locked) });
    if (!state.available(p.id)) continue;
    const remaining = timing.totalMs - (now() - started);
    if (remaining <= 0) break;
    if (attempts++ > 0) writer.event('status', { stage: 'switching' });

    const ac = new AbortController();
    const onClient = () => ac.abort('client');
    clientSignal.addEventListener('abort', onClient, { once: true });
    let timer;
    const arm = (ms, why) => {
      clearTimeout(timer);
      timer = setTimeout(() => ac.abort(why), Math.min(ms, Math.max(1, timing.totalMs - (now() - started))));
    };
    arm(timing.firstTextMs, 'timeout');
    try {
      for await (const ev of p.stream(prompt, ac.signal)) {
        if (ev.type === 'keepalive') continue; // provider keep-alives never extend the time budget
        if (ev.type === 'text') {
          if (!locked) {
            locked = p.id;
            firstTextMs = now() - started;
          }
          answer += ev.text;
          if (answerViolation(answer, fingerprints)) {
            // The model started writing code or repeating its instructions: stop it and replace the whole answer.
            ac.abort('guard');
            answer = cannedRefusal;
            writer.event('replace', { text: cannedRefusal });
            writer.event('done', { finishReason: 'refused' });
            return end('guarded', { partial: false });
          }
          arm(timing.idleMs, 'timeout');
          if (!writer.event('delta', { text: ev.text })) ac.abort('client');
          continue;
        }
        if (ev.type === 'finish') {
          if (ev.reason === 'blocked') {
            if (locked) return fail('BLOCKED', true, 'blocked', { usage: ev.usage });
            writer.event('delta', { text: cannedBlocked });
            answer = cannedBlocked;
            writer.event('done', { finishReason: 'blocked' });
            return end('blocked', { provider: p.id, usage: ev.usage });
          }
          if (!locked) break; // an empty answer counts as a failure before text: try the next provider
          if (ev.reason === 'length') return fail('OUTPUT_LIMIT', true, 'length', { usage: ev.usage });
          return end('done', { usage: ev.usage });
        }
      }
      if (locked) return fail('UPSTREAM_INTERRUPTED', true, 'interrupted');
      // Fell through: the provider produced no text.
    } catch (e) {
      const reason = ac.signal.reason;
      if (reason === 'client' || clientSignal.aborted) return end('cancelled', { partial: Boolean(locked) });
      if (reason === 'guard') return end('guarded', { partial: false });
      if (locked) return fail('UPSTREAM_INTERRUPTED', true, 'interrupted');
      const status = e?.status;
      if (status === 429) state.cool(p.id, timing.cooldownMs);
      else if ([401, 402, 403, 404].includes(status)) {
        state.disable(p.id);
        log({ event: 'provider_disabled', provider: p.id, status });
      } else if (status === 400 || status === 422) {
        // The request itself is wrong: another provider would fail the same way.
        return fail('UNAVAILABLE', false, 'bad_request', { provider: p.id });
      }
    } finally {
      clearTimeout(timer);
      clientSignal.removeEventListener('abort', onClient);
    }
  }
  if (clientSignal.aborted) return end('cancelled', { partial: Boolean(locked) });
  return fail('UNAVAILABLE', false, 'unavailable');
}

/** A fixed reply streamed like an answer, ending with finishReason "refused" (the client does not store it). */
function refuse(res, knowledge, requestId, text) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-content-type-options': 'nosniff' });
  const writer = sseWriter(res);
  writer.event('meta', { protocol: PROTOCOL, requestId, knowledgeVersion: knowledge.knowledgeVersion });
  writer.event('delta', { text });
  writer.event('done', { finishReason: 'refused' });
  res.end();
}

/**
 * Handle a validated chat request on an open response. The caller has already checked the origin key.
 */
export async function handleChat({ input, res, clientId, clientSignal, ctx }) {
  const { knowledge, limits, providers, state, config } = ctx;
  const requestId = randomUUID();
  const startedAt = Date.now();
  if (!knowledge.ok) throw new RequestError(503, 'UNAVAILABLE', true);
  if (input.knowledgeVersion && input.knowledgeVersion !== knowledge.knowledgeVersion) throw new RequestError(409, 'KNOWLEDGE_MISMATCH', true);
  if (limits.blocked(clientId)) throw new RequestError(429, 'RATE_LIMITED', true);
  if (!limits.rate(clientId)) throw new RequestError(429, 'RATE_LIMITED', true);

  // Guard (SDD §5.6 "请求拦截"): off-topic use is refused here, before a slot, the daily cap or any provider.
  const index = knowledge.index;
  const pagePath = input.pagePath && index.pages[input.pagePath] ? input.pagePath : undefined;
  const previousTurn = [...input.history].reverse().find((t) => t.role === 'user')?.text;
  const firstResult = search(index, { question: input.message, previous: previousTurn, pagePath, locale: input.locale });
  const decision = guardRequest(ctx.guard, {
    message: input.message,
    history: input.history,
    result: firstResult,
    previousResult: previousTurn ? search(index, { question: previousTurn, locale: input.locale }) : undefined,
  });
  const replyLocale = questionLocale(input.message, input.locale);
  if (decision.action === 'refuse') {
    if (decision.strike) limits.strike(clientId);
    refuse(res, knowledge, requestId, knowledge.bundle.canned[decision.reply][replyLocale]);
    log({ event: 'chat', requestId, outcome: 'refused', reason: decision.id, attempts: 0, totalMs: Date.now() - startedAt });
    return;
  }
  if (firstResult.candidates?.length) {
    const titles = firstResult.candidates.map((p) => p.title[replyLocale]).join(replyLocale === 'zh' ? '、' : ' or ');
    refuse(res, knowledge, requestId, replyLocale === 'zh' ? `你指的是${titles}中的哪一个项目？` : `Which project do you mean: ${titles}?`);
    log({ event: 'chat', requestId, outcome: 'refused', reason: 'clarification', attempts: 0, totalMs: Date.now() - startedAt });
    return;
  }
  const history = decision.history;

  const release = limits.acquire();
  if (!release) throw new RequestError(429, 'RATE_LIMITED', true);
  try {
    const daily = limits.reserveDaily();
    if (!daily.ok) throw new RequestError(503, 'UNAVAILABLE', daily.reason === 'cap');

    const previous = [...history].reverse().find((t) => t.role === 'user')?.text;
    const result = history === input.history ? firstResult : search(index, { question: input.message, previous, pagePath, locale: input.locale });
    const sources = selectSources(index, result).map((e, i) => ({ tag: `S${i + 1}`, title: e.title, path: e.sourcePath, text: e.text }));
    const prompt = assemblePrompt(knowledge.bundle, {
      locale: result.locale,
      message: input.message,
      history,
      sources,
      pageTitle: pagePath ? index.pages[pagePath].title : undefined,
      lowConfidence: !result.confident && !result.topic?.length,
    });

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-content-type-options': 'nosniff',
      'x-accel-buffering': 'no',
    });
    const writer = sseWriter(res);
    writer.event('meta', { protocol: PROTOCOL, requestId, knowledgeVersion: knowledge.knowledgeVersion });
    const heartbeat = setInterval(() => writer.comment('hb'), config.timing.heartbeatMs);
    let outcome = { outcome: 'error', partial: false, answer: '', attempts: 0 };
    try {
      outcome = await generate({
        prompt,
        providers,
        state,
        timing: config.timing,
        writer,
        clientSignal,
        cannedBlocked: knowledge.bundle.canned.blocked[result.locale],
        cannedRefusal: knowledge.bundle.canned.off_topic[result.locale],
        fingerprints: promptFingerprints(knowledge.bundle, result.locale),
      });
      if (outcome.outcome === 'done') {
        // Sources go out just before a successful end, mapped from the tags the answer actually cites.
        const items = citedSources(outcome.answer, sources);
        if (items.length) writer.event('sources', { items });
        writer.event('done', { finishReason: 'stop' });
      }
    } catch {
      writer.event('error', { code: 'UNAVAILABLE', partial: false });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
    const tokensIn = outcome.usage?.in ?? estimateTokens(prompt.system) + prompt.messages.reduce((n, m) => n + estimateTokens(m.text), 0);
    const tokensOut = outcome.usage?.out ?? estimateTokens(outcome.answer);
    if (outcome.attempts > 0) limits.settle({ tokensIn, tokensOut });
    log({ event: 'chat', requestId, provider: outcome.provider, outcome: outcome.outcome, partial: outcome.partial, attempts: outcome.attempts, firstTextMs: outcome.firstTextMs, totalMs: Date.now() - startedAt, tokensIn, tokensOut });
  } finally {
    release();
  }
}
