// Tokenizer shared by the knowledge build and the backend (ADR-022, SDD-AICHAT-001 §5.2 "切块与索引").
// Index and query must tokenize the same way, so both sides import this one file. Pure functions, no dependencies.
//
// English: NFKC, lower case, light suffix stripping (plural, -ing, -ed), small stop list.
// Chinese: character bigrams of every CJK run (a single-character run is kept as is).
// Aliases: groups from content/ai/aliases.yaml map every spelling ("Kubernetes", "k8s", "容器编排") to one
// shared token, so an English question can match a Chinese section and the other way round.

const CJK = /[㐀-䶿一-鿿豈-﫿]/;
const CJK_RUN = /[㐀-䶿一-鿿豈-﫿]+/g;
const WORD = /[a-z0-9][a-z0-9+#]*(?:[.\-][a-z0-9+#]+)*/g;

const STOP = new Set(
  (
    'a an and are as at be but by can did do does for from had has have he her his how i if in into is it its ' +
    'me my of on or our she so that the their them they this to was we were what when where which who why will ' +
    'with you your about any did does done there these those than then also just main tell please give yige wang'
  ).split(' '),
);
const ZH_STOP = new Set(['的', '了', '是', '吗', '呢', '和', '在', '他', '她', '我', '你', '有', '么', '什么', '哪些', '怎么', '一个', '这个', '那个', '一格', '王一']);

export function normalize(text) {
  // Possessives carry no meaning for retrieval: "Yige's" → "yige".
  return String(text).normalize('NFKC').toLowerCase().replace(/[’']s\b/g, '');
}

export function hasCjk(text) {
  return CJK.test(String(text));
}

/** Light English stemming: enough to match "projects"/"project", "deployed"/"deploy", "training"/"train". */
export function stem(word) {
  if (word.length <= 3 || /[\d.+#-]/.test(word)) return word;
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('es') && /(ch|sh|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) return word.slice(0, -1);
  return word;
}

function cjkTokens(run) {
  if (run.length === 1) return ZH_STOP.has(run) ? [] : [run];
  const out = [];
  for (let i = 0; i < run.length - 1; i++) {
    const bi = run.slice(i, i + 2);
    if (!ZH_STOP.has(bi)) out.push(bi);
  }
  return out;
}

/** Stemmed words of a text, stop words kept: the form English aliases are matched on. */
function aliasWords(text) {
  return [...normalize(text).matchAll(WORD)].map((m) => stem(m[0]));
}

/**
 * Compile alias groups (arrays of spellings) into a matcher. Each group becomes the token "~<index>".
 * English spellings match on whole stemmed words ("backends" matches "backend"); Chinese spellings match as
 * substrings.
 * @param {string[][]} groups
 */
export function compileAliases(groups = []) {
  const ascii = [];
  const cjk = [];
  groups.forEach((group, i) => {
    for (const spelling of group) {
      const s = normalize(spelling).trim();
      if (!s) continue;
      if (hasCjk(s)) cjk.push([s, `~${i}`]);
      else {
        const words = aliasWords(s);
        if (words.length) ascii.push([` ${words.join(' ')} `, `~${i}`]);
      }
    }
  });
  return { ascii, cjk };
}

function countOccurrences(haystack, needle, step = needle.length) {
  let n = 0;
  let from = 0;
  let at;
  while ((at = haystack.indexOf(needle, from)) !== -1) {
    n++;
    from = at + step;
  }
  return n;
}

/**
 * Tokens of a text, with repeats (term frequency matters for scoring).
 * @param {string} text
 * @param {{ascii: [RegExp, string][], cjk: [string, string][]}} [aliases]
 */
export function tokenize(text, aliases) {
  const norm = normalize(text);
  const tokens = [];
  for (const m of norm.matchAll(WORD)) {
    const w = m[0];
    if (STOP.has(w)) continue;
    tokens.push(stem(w));
    // "next.js" / "ci-cd": also index the parts.
    if (/[.\-]/.test(w)) for (const part of w.split(/[.\-]/)) if (part.length > 1 && !STOP.has(part)) tokens.push(stem(part));
  }
  for (const m of norm.matchAll(CJK_RUN)) tokens.push(...cjkTokens(m[0]));
  if (aliases) {
    const words = ` ${aliasWords(norm).join(' ')} `;
    for (const [phrase, token] of aliases.ascii) {
      // Step by one word less than the phrase so overlapping occurrences sharing a space are still counted.
      for (let i = countOccurrences(words, phrase, phrase.length - 1); i > 0; i--) tokens.push(token);
    }
    for (const [str, token] of aliases.cjk) {
      for (let i = countOccurrences(norm, str); i > 0; i--) tokens.push(token);
    }
  }
  return tokens;
}

/** Rough token count for budgets: one per CJK character, one per four other characters. */
export function estimateTokens(text) {
  const s = String(text);
  let cjk = 0;
  for (const ch of s) if (CJK.test(ch)) cjk++;
  return cjk + Math.ceil((s.length - cjk) / 4);
}
