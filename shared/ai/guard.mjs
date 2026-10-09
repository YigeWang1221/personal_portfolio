// Request and answer guard (ADR-022, SDD-AICHAT-001 §5.6 "请求拦截"). Shared by the backend and `npm run chat:preview`.
// The assistant answers only about the owner's résumé and portfolio. Three layers, cheapest first:
//   1. rules from content/ai/guard.yaml (prompt injection, using the window as a tool, personal or private matters);
//   2. scope: a message that names no project, uses no reviewed term, does not mention the owner and has no confident
//      retrieval match is refused, unless it follows an in-scope question of the same conversation;
//   3. the answer: if a model starts writing code, or repeats its instructions, the answer is replaced.
// Layers 1 and 2 run before any model is called. The prompt rules (00-main.md) remain the last line of defence.

const PRONOUNS = /\b(he|him|his|she|her|hers)\b|[他她]/iu;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {{owner_names?: string[], rules: {id: string, reply: string, strike?: boolean, patterns: string[]}[]}} guard
 *   the "guard" section of the prompt bundle
 */
export function compileGuard(guard) {
  const names = (guard.owner_names ?? []).map((n) => String(n).trim()).filter(Boolean);
  const ascii = names.filter((n) => /^[\x20-\x7e]+$/.test(n)).map((n) => `\\b${escape(n)}\\b`);
  const other = names.filter((n) => !/^[\x20-\x7e]+$/.test(n)).map(escape);
  return {
    rules: guard.rules.map((r) => ({ id: r.id, reply: r.reply, strike: Boolean(r.strike), res: r.patterns.map((p) => new RegExp(p, 'iu')) })),
    owner: [...ascii, ...other].length ? new RegExp([...ascii, ...other].join('|'), 'iu') : null,
  };
}

/** The first rule the message matches, or null. */
export function matchRule(compiled, message) {
  const text = String(message).normalize('NFKC');
  for (const rule of compiled.rules) if (rule.res.some((re) => re.test(text))) return { id: rule.id, reply: rule.reply, strike: rule.strike };
  return null;
}

/** Does the message refer to the owner, by name or by a third-person pronoun? */
export function mentionsOwner(compiled, message) {
  const text = String(message).normalize('NFKC');
  return Boolean(compiled.owner?.test(text)) || PRONOUNS.test(text);
}

/** Is the message about the portfolio, judged from retrieval signals and the owner reference? */
export function inScope(compiled, message, result) {
  return result.candidates?.length > 0 || result.confident || result.vocabulary || result.named.length > 0 || mentionsOwner(compiled, message);
}

/**
 * Decide what happens to a request before any model call.
 * @param {ReturnType<typeof compileGuard>} compiled
 * @param {{message: string, history: {role: string, text: string}[], result: object, previousResult?: object}} req
 *   result: search() for the message; previousResult: search() for the previous user turn, if any
 * @returns {{action: 'answer', history: object[]} | {action: 'refuse', id: string, reply: string, strike: boolean}}
 */
export function guardRequest(compiled, { message, history, result, previousResult }) {
  const rule = matchRule(compiled, message);
  if (rule) return { action: 'refuse', ...rule };
  // History comes from the client and can be forged: drop it whole if any earlier visitor turn tries an injection.
  const injection = history.some((t) => t.role === 'user' && matchRule(compiled, t.text)?.id === 'injection');
  const kept = injection ? [] : history;
  const previous = [...kept].reverse().find((t) => t.role === 'user');
  const followUp = Boolean(previous && previousResult && !matchRule(compiled, previous.text) && inScope(compiled, previous.text, previousResult));
  if (inScope(compiled, message, result) || followUp) return { action: 'answer', history: kept };
  return { action: 'refuse', id: 'unrelated', reply: 'off_topic', strike: true };
}

/**
 * Answer check, run on the text streamed so far. Returns the reason, or null.
 * @param {string[]} fingerprints lines of the rule blocks (see promptFingerprints)
 */
export function answerViolation(answer, fingerprints = []) {
  if (answer.includes('```')) return 'code';
  if (/<\/?(instructions|material)>/i.test(answer)) return 'prompt';
  for (const line of fingerprints) if (answer.includes(line)) return 'prompt';
  return null;
}

/** Distinctive lines of the instruction blocks (never the material): repeating one means leaking the prompt. */
export function promptFingerprints(bundle, locale) {
  const ids = ['main', 'character', 'owner-persona', 'examples', 'post-history'];
  const lines = [];
  for (const id of ids) {
    const text = bundle.blocks[id]?.text?.[locale];
    if (!text) continue;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (line.length >= 30 && !line.includes('{{')) lines.push(line);
    }
  }
  return lines;
}
