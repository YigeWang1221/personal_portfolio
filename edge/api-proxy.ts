// Edge Worker for the AI assistant (ADR-022, SDD-AICHAT-001 §5.5). It sees only /api and /api/* (run_worker_first in
// wrangler.jsonc); every other request is served by the static assets exactly as before.
//
//   POST /api/chat, GET /api/health → the origin (portfolio-api behind Cloudflare Tunnel + Access Service Auth)
//   any other /api path → JSON 404; wrong method → JSON 405
//
// The Worker builds the origin request from scratch: no client cookies, authorization or forged cf-access / origin-key
// headers can pass. It adds the origin key and a pseudonymous client id (an HMAC of the client IP keyed with the
// origin key; the IP itself is never sent). Streams are passed through unbuffered; nothing is cached or retried.
// Required (owner decision 2026-10-08, simplified setup):
//   ORIGIN_URL   https://<the tunnel hostname of portfolio-api>   (plain value; not secret)
//   ORIGIN_KEY   the shared secret, same as PORTFOLIO_ORIGIN_KEY in backend/.env   (wrangler secret put)
// Optional: ACCESS_CLIENT_ID + ACCESS_CLIENT_SECRET (only if the tunnel hostname is put behind Cloudflare Access with a
// service token), ALLOWED_ORIGINS (extra comma-separated origins allowed to POST; same-origin requests always are).

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ORIGIN_URL?: string;
  ACCESS_CLIENT_ID?: string;
  ACCESS_CLIENT_SECRET?: string;
  ORIGIN_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

const MAX_BODY = 32 * 1024;
const ROUTES: Record<string, string> = { '/api/chat': 'POST', '/api/health': 'GET' };
const SECURITY_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};

function json(status: number, code: string, retryable = false, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ code, retryable }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...extra },
  });
}

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

async function clientPseudonym(ip: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip)));
  let bin = '';
  for (const b of mac.slice(0, 24)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Read at most `limit` bytes of the body; null when it is larger. */
async function readLimited(request: Request, limit: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > limit) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  if (origin === new URL(request.url).origin) return true;
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(origin);
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = ROUTES[url.pathname];
  if (!method) return json(404, 'NOT_FOUND');
  if (request.method !== method) return json(405, 'METHOD_NOT_ALLOWED', false, { allow: method });
  if (!env.ORIGIN_URL || !env.ORIGIN_KEY) return json(503, 'UNAVAILABLE', true);

  const headers = new Headers({
    accept: method === 'POST' ? 'text/event-stream' : 'application/json',
    'x-origin-key': env.ORIGIN_KEY,
  });
  if (env.ACCESS_CLIENT_ID && env.ACCESS_CLIENT_SECRET) {
    headers.set('cf-access-client-id', env.ACCESS_CLIENT_ID);
    headers.set('cf-access-client-secret', env.ACCESS_CLIENT_SECRET);
  }
  let body: Uint8Array | undefined;
  if (method === 'POST') {
    if (!originAllowed(request, env)) return json(403, 'FORBIDDEN');
    if (!/^application\/json(;|$)/i.test(request.headers.get('content-type') ?? '')) return json(400, 'BAD_REQUEST');
    const read = await readLimited(request, MAX_BODY);
    if (!read) return json(413, 'TOO_LARGE');
    body = read;
    headers.set('content-type', 'application/json');
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    headers.set('x-client-id', await clientPseudonym(ip, env.ORIGIN_KEY));
  }

  let upstream: Response;
  try {
    upstream = await fetch(env.ORIGIN_URL.replace(/\/+$/, '') + url.pathname, {
      method,
      headers,
      body,
      redirect: 'manual',
      // H7: cancel the origin request when the visitor goes away (needs the enable_request_signal flag).
      signal: request.signal,
    });
  } catch {
    return json(503, 'UNAVAILABLE', true);
  }

  const type = upstream.headers.get('content-type') ?? '';
  const isStream = type.startsWith('text/event-stream');
  const isJson = type.startsWith('application/json');
  // An Access login page, a redirect or anything else unexpected must never reach the visitor.
  if ((upstream.status >= 300 && upstream.status < 400) || (!isStream && !isJson)) {
    await upstream.body?.cancel();
    return json(503, 'UNAVAILABLE', true);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': isStream ? 'text/event-stream; charset=utf-8' : 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
      'cache-control': isStream ? 'no-store, no-transform' : 'no-store',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!isApiPath(url.pathname)) return env.ASSETS.fetch(request);
    return handleApi(request, env);
  },
};
