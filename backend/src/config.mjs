// Runtime configuration from environment variables (ADR-022, SDD-AICHAT-001 §5.6 v2.1, deployment-contract §4).
// The owner chooses every model: there are no default providers or model names. Each plan is three variables,
//   API_URL_PLAN_A / MODEL_PLAN_A / KEY_PLAN_A   (and the same for B and C)
// tried in PROVIDER_ORDER (default A,B,C). A plan with an empty or invalid value is disabled. Values are never logged.
//
// The protocol follows the URL:
//   - generativelanguage.googleapis.com without "/openai" → the Gemini API (streamGenerateContent). Give the API base,
//     e.g. https://generativelanguage.googleapis.com/v1beta; a full ".../models/<m>:…" URL is cut back to it.
//   - anything else → OpenAI-compatible chat completions. "/chat/completions" is appended unless the URL already
//     ends with it, so "https://api.example.com/v1" and ".../v1/chat/completions" both work.
import { join } from 'node:path';

export const PLAN_IDS = ['A', 'B', 'C'];

const int = (v, fallback, min = 0) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
};
const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Endpoint and protocol of a plan URL, or null when it is not an http(s) URL. */
export function resolveEndpoint(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null; // keys belong in KEY_PLAN_x, never in a URL
  const path = url.pathname.replace(/\/+$/, '');
  if (url.hostname === 'generativelanguage.googleapis.com' && !path.includes('/openai')) {
    const base = path.includes('/models/') ? path.slice(0, path.indexOf('/models/')) : path;
    return { kind: 'gemini', url: `${url.origin}${base || '/v1beta'}` };
  }
  return { kind: 'openai', url: `${url.origin}${path.endsWith('/chat/completions') ? path : `${path}/chat/completions`}${url.search}` };
}

/** @param {Record<string, string | undefined>} env */
export function loadConfig(env = process.env) {
  const order = str(env.PROVIDER_ORDER || 'A,B,C')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s, i, all) => PLAN_IDS.includes(s) && all.indexOf(s) === i);
  const providers = {};
  for (const id of PLAN_IDS) {
    const endpoint = resolveEndpoint(str(env[`API_URL_PLAN_${id}`]));
    const model = str(env[`MODEL_PLAN_${id}`]);
    const key = str(env[`KEY_PLAN_${id}`]);
    providers[id] = {
      id,
      kind: endpoint?.kind ?? 'openai',
      url: endpoint?.url ?? '',
      model,
      key,
      enabled: Boolean(endpoint && model && key) && order.includes(id),
    };
  }
  return {
    port: int(env.PORT, 3000, 1),
    host: str(env.HOST) || '0.0.0.0',
    originKey: str(env.PORTFOLIO_ORIGIN_KEY),
    knowledgeDir: str(env.KNOWLEDGE_DIR) || join(import.meta.dirname, '..', '..', 'generated', 'ai'),
    stateDir: str(env.STATE_DIR) || join(import.meta.dirname, '..', 'state'),
    mode: str(env.PROVIDER_MODE) === 'mock' ? 'mock' : 'live',
    order,
    providers,
    // Short answers: a portfolio question needs a few sentences, and a low ceiling makes the window useless for
    // long free-form writing.
    maxOutputTokens: int(env.MAX_OUTPUT_TOKENS, 600, 64),
    limits: {
      perMinute: int(env.RATE_PER_MINUTE, 6, 1),
      perHour: int(env.RATE_PER_HOUR, 30, 1),
      maxConcurrent: int(env.MAX_CONCURRENT, 3, 1),
      dailyCap: int(env.DAILY_REQUEST_CAP, 300, 0),
      strikeLimit: int(env.GUARD_STRIKE_LIMIT, 3, 1),
      strikeWindowMs: int(env.GUARD_STRIKE_WINDOW_MS, 10 * 60_000, 1),
      strikeBlockMs: int(env.GUARD_BLOCK_MS, 10 * 60_000, 1),
    },
    timing: {
      firstTextMs: int(env.FIRST_TEXT_TIMEOUT_MS, 10_000, 1),
      idleMs: int(env.IDLE_TIMEOUT_MS, 15_000, 1),
      totalMs: int(env.TOTAL_TIMEOUT_MS, 60_000, 1),
      heartbeatMs: int(env.HEARTBEAT_MS, 10_000, 1),
      cooldownMs: int(env.COOLDOWN_MS, 60_000, 0),
    },
  };
}
