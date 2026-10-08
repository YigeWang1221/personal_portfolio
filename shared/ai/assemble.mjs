// Prompt assembly (ADR-022, SDD-AICHAT-001 §5.3.3, §5.3.5 v2.1). Shared by the backend and `npm run chat:preview`,
// so the preview prints exactly what a provider would receive.
//
// The canonical prompt has one shape for every provider:
//   system   — the system blocks in prompt-order.yaml order, separated by a rule
//   messages — the client's completed turns, then the visitor's message with the post-history reminder in front of
//              it, wrapped in <instructions>.
// Provider adapters only translate this shape (OpenAI-compatible messages, or Gemini systemInstruction + contents).
import { estimateTokens } from './tokenize.mjs';

export const RUNTIME_VARIABLES = ['locale', 'page_title', 'sources', 'low_confidence'];
const SEPARATOR = '\n\n---\n\n';

/** "[S1] Title — /path/#id" followed by the excerpt. */
export function formatSources(sources) {
  return sources.map((s) => `[${s.tag}] ${s.title} — ${s.path}\n${s.text}`).join('\n\n');
}

function fill(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, name) => (name in vars ? vars[name] : m));
}

/**
 * @param {object} bundle generated/ai/prompt-bundle.json
 * @param {{locale: 'en'|'zh', message: string, history?: {role: 'user'|'assistant', text: string}[],
 *   sources?: {tag: string, title: string, path: string, text: string}[], pageTitle?: string,
 *   lowConfidence?: boolean}} input
 */
export function assemblePrompt(bundle, input) {
  const { locale, message } = input;
  const vars = {
    locale,
    page_title: input.pageTitle || (locale === 'zh' ? '（未知）' : '(unknown)'),
    sources: formatSources(input.sources ?? []) || (locale === 'zh' ? '（无）' : '(none)'),
    low_confidence: input.lowConfidence ? bundle.canned.low_confidence[locale] : '',
  };
  const blockText = (id) => fill(bundle.blocks[id].text[locale] ?? bundle.blocks[id].text.en, vars).replace(/\n{3,}/g, '\n\n').trim();

  const dropped = [];
  let history = [...(input.history ?? [])];
  const build = () => {
    const system = [];
    const blocks = [];
    let post = '';
    for (const item of bundle.order) {
      if (!item.block) continue;
      if (dropped.includes(item.block)) continue;
      const text = blockText(item.block);
      if (item.position === 'system') system.push(text);
      else if (item.position === 'after-history') post = text;
      blocks.push({ id: item.block, tokens: estimateTokens(text) });
    }
    const systemText = system.join(SEPARATOR);
    const last = { role: 'user', text: `<instructions>\n${post}\n</instructions>\n\n${message}` };
    const messages = [...history.map((t) => ({ role: t.role, text: t.text })), last];
    const historyTokens = history.reduce((n, t) => n + estimateTokens(t.text), 0);
    blocks.push({ id: 'history', tokens: historyTokens }, { id: 'user-message', tokens: estimateTokens(message) });
    const totalTokens = estimateTokens(systemText) + messages.reduce((n, m) => n + estimateTokens(m.text), 0);
    return { system: systemText, messages, blocks, totalTokens };
  };

  let out = build();
  for (const step of bundle.dropOrder) {
    if (out.totalTokens <= bundle.totalBudgetTokens) break;
    if (step === 'history-oldest') {
      while (out.totalTokens > bundle.totalBudgetTokens && history.length > 0) {
        // Drop a whole turn (user + assistant) so the history never starts with an assistant message.
        history = history.slice(history[0].role === 'user' && history[1]?.role === 'assistant' ? 2 : 1);
        if (!dropped.includes('history-oldest')) dropped.push('history-oldest');
        out = build();
      }
    } else if (bundle.blocks[step]?.droppable) {
      dropped.push(step);
      out = build();
    }
  }
  return { ...out, dropped, historyKept: history.length };
}
