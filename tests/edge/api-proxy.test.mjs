// Edge Worker (SDD-AICHAT-001 §5.5, T-ROUTE-01, T-AUTH-01 Worker side). Runs edge/api-proxy.ts directly
// (node --experimental-strip-types); the origin is a stubbed global fetch, the static assets a stub binding.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../edge/api-proxy.ts';

const SITE = 'https://portfolio.example';
const env = (over = {}) => ({
  ASSETS: { fetch: async (req) => new Response(`asset ${new URL(req.url).pathname}`, { headers: { 'content-type': 'text/html' } }) },
  ORIGIN_URL: 'https://origin.example',
  ORIGIN_KEY: 'origin-key',
  ...over,
});
const realFetch = globalThis.fetch;
let calls = [];
function origin(respond) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
}
afterEach(() => {
  globalThis.fetch = realFetch;
});
const chatRequest = (body = '{"message":"hi","locale":"en"}', headers = {}) =>
  new Request(`${SITE}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', origin: SITE, ...headers }, body });

test('T-ROUTE-01: only /api and /api/* reach the Worker logic; everything else is a static asset', async () => {
  origin(() => new Response('{}', { headers: { 'content-type': 'application/json' } }));
  for (const path of ['/projects/', '/apix/', '/', '/zh/api/']) assert.match(await (await worker.fetch(new Request(SITE + path), env())).text(), /^asset /, path);
  for (const path of ['/api', '/api/x', '/api/chat/extra']) {
    const res = await worker.fetch(new Request(SITE + path), env());
    assert.equal(res.status, 404, path);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  }
  const wrong = await worker.fetch(new Request(`${SITE}/api/chat`), env());
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get('allow'), 'POST');
  assert.equal(calls.length, 0, 'the origin was never called');
});

test('missing secrets → 503 without calling the origin', async () => {
  origin(() => new Response('{}'));
  const res = await worker.fetch(chatRequest(), env({ ORIGIN_KEY: undefined }));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { code: 'UNAVAILABLE', retryable: true });
  assert.equal(calls.length, 0);
});

test('Origin, content type and body size are checked before the origin is called', async () => {
  origin(() => new Response('{}', { headers: { 'content-type': 'application/json' } }));
  assert.equal((await worker.fetch(chatRequest(undefined, { origin: 'https://evil.example' }), env())).status, 403);
  assert.equal((await worker.fetch(new Request(`${SITE}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), env())).status, 403, 'no Origin');
  assert.equal((await worker.fetch(chatRequest(undefined, { origin: 'http://localhost:4321' }), env({ ALLOWED_ORIGINS: 'http://localhost:4321' }))).status, 200, 'an allowed extra origin');
  calls = [];
  assert.equal((await worker.fetch(chatRequest('x', { 'content-type': 'text/plain' }), env())).status, 400);
  assert.equal((await worker.fetch(chatRequest(JSON.stringify({ message: 'x'.repeat(40_000) })), env())).status, 413);
  assert.equal(calls.length, 0);
});

test('the origin request is built from scratch: client credentials never pass, a pseudonym replaces the IP', async () => {
  origin(() => new Response('event: done\ndata: {}\n\n', { headers: { 'content-type': 'text/event-stream' } }));
  const res = await worker.fetch(
    chatRequest(undefined, { cookie: 'session=1', authorization: 'Bearer stolen', 'x-origin-key': 'forged', 'cf-access-client-secret': 'forged', 'x-client-id': 'forged', 'cf-connecting-ip': '203.0.113.7' }),
    env(),
  );
  assert.equal(res.status, 200);
  const { url, init } = calls[0];
  const h = init.headers;
  assert.equal(url, 'https://origin.example/api/chat');
  assert.equal(init.redirect, 'manual');
  assert.ok(init.signal, 'the visitor’s abort signal is passed on');
  assert.equal(h.get('cookie'), null);
  assert.equal(h.get('authorization'), null);
  assert.equal(h.get('x-origin-key'), 'origin-key');
  assert.equal(h.get('cf-access-client-secret'), null, 'no Access token configured, none sent (a forged one is dropped)');
  assert.equal(h.get('cf-access-client-id'), null);
  assert.match(h.get('x-client-id'), /^[A-Za-z0-9_-]{32}$/);
  assert.ok(!h.get('x-client-id').includes('203'));
  const again = await worker.fetch(chatRequest(undefined, { 'cf-connecting-ip': '203.0.113.7' }), env());
  await again.text();
  assert.equal(calls[1].init.headers.get('x-client-id'), h.get('x-client-id'), 'stable per IP');
  assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-store, no-transform');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await res.text(), 'event: done\ndata: {}\n\n', 'the stream passes through unchanged');
});

test('an Access login page, a redirect or a network failure becomes a JSON 503', async () => {
  origin(() => new Response('<html>Sign in</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
  assert.equal((await worker.fetch(chatRequest(), env())).status, 503);
  origin(() => new Response(null, { status: 302, headers: { location: 'https://login.example', 'content-type': 'application/json' } }));
  assert.equal((await worker.fetch(chatRequest(), env())).status, 503);
  origin(() => {
    throw new TypeError('network');
  });
  const res = await worker.fetch(chatRequest(), env());
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { code: 'UNAVAILABLE', retryable: true });
});

test('origin JSON errors (429, 409) pass through with their status', async () => {
  origin(() => new Response('{"code":"RATE_LIMITED","retryable":true}', { status: 429, headers: { 'content-type': 'application/json' } }));
  const res = await worker.fetch(chatRequest(), env());
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  origin(() => new Response('{"status":"available","knowledgeVersion":"v","protocol":1}', { headers: { 'content-type': 'application/json' } }));
  const health = await worker.fetch(new Request(`${SITE}/api/health`), env());
  assert.equal(health.status, 200);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.get('x-client-id'), null, 'health needs no client id');
});

test('two values are enough; an optional Access service token is sent when configured', async () => {
  origin(() => new Response('{"status":"available"}', { headers: { 'content-type': 'application/json' } }));
  assert.equal((await worker.fetch(new Request(`${SITE}/api/health`), env({ ORIGIN_URL: undefined }))).status, 503);
  assert.equal((await worker.fetch(new Request(`${SITE}/api/health`), env())).status, 200, 'ORIGIN_URL + ORIGIN_KEY only');
  await worker.fetch(new Request(`${SITE}/api/health`), env({ ACCESS_CLIENT_ID: 'id.access', ACCESS_CLIENT_SECRET: 'secret' }));
  assert.equal(calls.at(-1).init.headers.get('cf-access-client-id'), 'id.access');
  assert.equal(calls.at(-1).init.headers.get('cf-access-client-secret'), 'secret');
});

