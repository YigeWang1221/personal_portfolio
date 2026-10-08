// Keyword retrieval over the world book (ADR-022, SDD-AICHAT-001 §5.6 "检索"). BM25 with bilingual aliases; no
// embeddings, so results are deterministic and testable. Shared by the backend and `npm run chat:preview`.
//
// Two signals beyond plain BM25:
//   - Naming a project ("Cloud-Native", "KK Knock") boosts that project's entries: a question about one project
//     should not be answered from another that merely repeats the question's common words.
//   - Confidence is not a raw score. A question is "confident" when the best few entries cover most of its words
//     (ASCII words count one each, Chinese characters half each, filler characters not at all) AND it names a
//     project or uses a reviewed alias ("backend", "后端", "education"…). "What's the weather in Boston?" matches
//     "Boston" in the education entry, but uses no portfolio vocabulary, so it stays below the threshold.
//     Calibrated with the T-RET set (backend/tests/retrieval.test.mjs).
import { compileAliases, estimateTokens, hasCjk, tokenize } from './tokenize.mjs';

const K1 = 1.2;
const B = 0.75;
/** Weight of the visitor's previous question, which keeps follow-ups ("and the second one?") on topic. */
const PREVIOUS_TURN_WEIGHT = 0.5;
/** Score multiplier for entries of the project page the visitor is reading (FR-10). */
const PAGE_BOOST = 1.5;
/** Score multiplier for entries of a project the question names. */
const NAME_BOOST = 2.5;
/** Query weight of a reviewed alias concept ("tech stack", "后端"), against 1 for an ordinary word. */
const ALIAS_WEIGHT = 2;
/** Score multiplier for the catalog entry when the question asks for a list of projects. */
const LIST_BOOST = 3;
const LIST_QUESTION = [/\b(which|what|all( the)?|any)\s+(\w+\s+){0,2}projects?\b/i, /哪些.{0,8}项目/, /所有.{0,4}项目/, /项目.{0,4}有哪些/];
/** Hits whose matched terms count toward coverage. */
const COVERAGE_HITS = 3;
/** Chinese filler characters that carry no topic ("他做过哪些…是什么"): not counted for coverage. */
const ZH_FILLER = new Set([...'的了是吗呢和在他她我你有么什哪些怎样做过用一个这那请帮告诉下']);
/** Generic Chinese question words, removed before coverage is measured ("体现了…方面的能力"). */
const ZH_QUESTION_WORDS = ['体现', '方面', '主要', '使用', '哪些', '什么', '怎么', '怎样', '如何', '是否', '有没有', '介绍', '一下', '请问', '关于', '具体', '情况', '相关', '能否', '可以', '以及', '还有', '哪个', '多少', '分别'];
const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
/** Title words that name no project in particular. */
const GENERIC_TITLE_TOKENS = new Set(
  ['application', 'app', 'system', 'platform', 'project', 'web', 'research', 'pipeline', 'overview', 'with', 'using', 'based', 'modeling', 'model', 'training', 'learning', 'on', 'for', 'and'].concat(
    ['系统', '平台', '项目', '应用', '网站', '研究', '概览', '模型', '训练', '流程'],
  ),
);

/** Defaults calibrated on the T-RET set; see backend/tests/retrieval.test.mjs and docs/AI_Chat/CHANGELOG.md. */
export const DEFAULT_THRESHOLD = { coverage: 0.75 };
/** Hits kept next to the profile overview when a question is below the threshold. */
export const FALLBACK_HITS = 2;

/**
 * @typedef {{id: string, scope: string, kind: string, locale: 'en'|'zh', sectionId: string, title: string,
 *   text: string, tags: string[], sourcePath: string, pagePath: string, hash: string}} Entry
 */

/** Build the in-memory index once per process. */
export function buildIndex(worldbook) {
  const aliases = compileAliases(worldbook.aliases ?? []);
  const docs = worldbook.entries.map((entry) => {
    const tokens = tokenize(`${entry.title}\n${entry.title}\n${entry.text}\n${entry.tags.join(' ')}`, aliases);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { entry, tf, len: tokens.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, docs.length);

  // Name tokens: title words of a project's overview that belong to that project alone, plus its slug.
  const scopesOf = new Map();
  for (const d of docs) {
    if (d.entry.kind !== 'project' || d.entry.sectionId !== '@overview') continue;
    const words = new Set([...tokenize(d.entry.title), ...tokenize(d.entry.scope.replace(/-/g, ' ')), d.entry.scope]);
    for (const t of words) {
      if (GENERIC_TITLE_TOKENS.has(t) || t.length < 2) continue;
      if (!scopesOf.has(t)) scopesOf.set(t, new Set());
      scopesOf.get(t).add(d.entry.scope);
    }
  }
  const names = new Map([...scopesOf].filter(([, scopes]) => scopes.size === 1).map(([t, scopes]) => [t, [...scopes][0]]));
  return { aliases, docs, df, avgLen, n: docs.length, pages: worldbook.pages ?? {}, names };
}

function idf(index, token) {
  const n = index.df.get(token) ?? 0;
  return Math.log(1 + (index.n - n + 0.5) / (n + 0.5));
}

function queryWeights(index, question, previous) {
  const weights = new Map();
  const add = (text, w) => {
    for (const t of new Set(tokenize(text, index.aliases))) {
      const weight = t.startsWith('~') ? w * ALIAS_WEIGHT : w;
      weights.set(t, Math.max(weights.get(t) ?? 0, weight));
    }
  };
  if (previous) add(previous, PREVIOUS_TURN_WEIGHT);
  add(question, 1);
  return weights;
}

/** Language of a question: any CJK character means Chinese. */
export function questionLocale(question, fallback = 'en') {
  if (hasCjk(question)) return 'zh';
  return /[a-z]/i.test(question) ? 'en' : fallback;
}

/** Projects the question names (by distinctive title words or slug). */
export function namedScopes(index, question) {
  const scopes = new Set();
  for (const t of tokenize(question)) if (index.names.has(t)) scopes.add(index.names.get(t));
  return scopes;
}

/**
 * Rank entries for a question.
 * @param {ReturnType<typeof buildIndex>} index
 * @param {{question: string, previous?: string, pagePath?: string, locale?: 'en'|'zh', topK?: number,
 *   budgetTokens?: number, threshold?: {coverage: number, score: number}}} q
 * @returns {{hits: {entry: Entry, score: number}[], topScore: number, coverage: number, confident: boolean,
 *   vocabulary: boolean, locale: 'en'|'zh', named: string[]}}
 */
export function search(index, q) {
  const { question, previous, pagePath, topK = 6, budgetTokens = 3000, threshold = DEFAULT_THRESHOLD } = q;
  const locale = questionLocale(question, q.locale);
  const weights = queryWeights(index, question, previous);
  const pageScope = pagePath && index.pages[pagePath] ? index.pages[pagePath].scope : null;
  const named = namedScopes(index, question);
  const listQuestion = LIST_QUESTION.some((re) => re.test(question));
  if (named.size === 0 && previous) for (const s of namedScopes(index, previous)) named.add(s);
  const scored = [];
  for (const d of index.docs) {
    let score = 0;
    const matched = [];
    for (const [t, w] of weights) {
      const f = d.tf.get(t);
      if (!f) continue;
      matched.push(t);
      score += w * idf(index, t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / index.avgLen)));
    }
    if (score > 0 && named.has(d.entry.scope)) score *= NAME_BOOST;
    if (score > 0 && listQuestion && d.entry.kind === 'catalog') score *= LIST_BOOST;
    if (score > 0 && pageScope && d.entry.scope === pageScope) score *= PAGE_BOOST;
    if (score > 0) scored.push({ entry: d.entry, score, matched });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  const topScore = scored[0]?.score ?? 0;

  const { coverage, vocabulary } = relevance(index, question, scored.slice(0, COVERAGE_HITS));

  // One language per section: keep the question's language when that version scored at all.
  const sectionLocales = new Map();
  for (const h of scored) {
    const key = `${h.entry.scope}|${h.entry.sectionId}`;
    const set = sectionLocales.get(key) ?? new Set();
    set.add(h.entry.locale);
    sectionLocales.set(key, set);
  }
  const hits = [];
  let used = 0;
  for (const h of scored) {
    if (hits.length >= topK) break;
    const locales = sectionLocales.get(`${h.entry.scope}|${h.entry.sectionId}`);
    if (h.entry.locale !== locale && locales.has(locale)) continue;
    const cost = estimateTokens(h.entry.text);
    if (hits.length > 0 && used + cost > budgetTokens) continue;
    hits.push({ entry: h.entry, score: h.score });
    used += cost;
  }
  const confident = coverage >= threshold.coverage && (vocabulary || namedScopes(index, question).size > 0);
  return { hits, topScore, coverage, confident, vocabulary, locale, named: [...namedScopes(index, question)] };
}

/**
 * Relevance of the question itself (the previous turn helps ranking, but does not make a new question relevant).
 * coverage: share of the question's words found in the top entries (or inside a known Chinese alias).
 * vocabulary: the question uses a reviewed alias that occurs in the material.
 */
function relevance(index, question, top) {
  const docs = top.map((h) => index.docs.find((d) => d.entry === h.entry));
  const has = (t) => docs.some((d) => d.tf.has(t));
  const known = (t) => (index.df.get(t) ?? 0) > 0;
  let units = 0;
  let covered = 0;
  // Words of a known English alias phrase in the question ("tech stack") count as covered.
  const words = ` ${tokenize(question.replace(CJK_RUN, ' ')).join(' ')} `;
  const aliasWords = new Set();
  for (const [phrase, token] of index.aliases.ascii) if (known(token) && words.includes(phrase)) for (const w of phrase.trim().split(' ')) aliasWords.add(w);
  for (const t of new Set(tokenize(question.replace(CJK_RUN, ' ')))) {
    units += 1;
    if (aliasWords.has(t) || has(t)) covered += 1;
  }
  let zh = question.normalize('NFKC');
  for (const w of ZH_QUESTION_WORDS) zh = zh.split(w).join(' ');
  // Characters inside a known Chinese alias ("云原生", "技术栈") count as covered.
  const aliasCovered = new Set();
  for (const [str, token] of index.aliases.cjk) {
    if (!known(token)) continue;
    for (let at = zh.indexOf(str); at !== -1; at = zh.indexOf(str, at + 1)) for (let k = 0; k < str.length; k++) aliasCovered.add(at + k);
  }
  for (const m of zh.matchAll(CJK_RUN)) {
    const run = m[0];
    for (let i = 0; i < run.length; i++) {
      if (ZH_FILLER.has(run[i])) continue;
      units += 0.5;
      if (aliasCovered.has(m.index + i) || [run.slice(i - 1, i + 1), run.slice(i, i + 2)].some((b) => b.length === 2 && has(b))) covered += 0.5;
    }
  }
  // Portfolio vocabulary: a reviewed alias of the question that occurs anywhere in the material.
  const vocabulary = tokenize(question, index.aliases).some((t) => t.startsWith('~') && known(t));
  return { coverage: units ? covered / units : 0, vocabulary };
}

/**
 * Sources for a request. Below the threshold: the profile overview in the question's language plus the best
 * FALLBACK_HITS entries, and the prompt says the material may not answer the question (v2.1 §5.6: keeping a few
 * hits lets a lexically weak but real question such as "Does Yige know Python?" still be answered).
 * @param {ReturnType<typeof buildIndex>} index
 * @param {ReturnType<typeof search>} result
 */
export function selectSources(index, result) {
  if (result.confident) return result.hits.map((h) => h.entry);
  const overview = index.docs.map((d) => d.entry).filter((e) => e.kind === 'profile' && e.sectionId === 'overview' && e.locale === result.locale);
  const extra = result.hits.map((h) => h.entry).filter((e) => !overview.includes(e)).slice(0, FALLBACK_HITS);
  return [...overview, ...extra];
}
