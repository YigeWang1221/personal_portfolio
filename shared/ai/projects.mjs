// Reviewed project references only; spelling correction never expands the knowledge corpus.
const normalize = (text) => text.normalize('NFKC').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
const CJK = /[\u3400-\u9fff]/u;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Bounded Levenshtein distance, with early exit for clearly unrelated strings. */
function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) {
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(a[i] !== b[j])));
    }
    if (Math.min(...next) > limit) return limit + 1;
    row = next;
  }
  return row[b.length];
}

export function projectReferences(worldbook) {
  // Retain compatibility with old fixtures/snapshots that predate the explicit names projection.
  const projects = worldbook.projectNames ?? [...new Map(
    worldbook.entries.filter((e) => e.kind === 'project' && e.sectionId === '@overview')
      .map((e) => [e.scope, { scope: e.scope, title: { en: e.scope, zh: e.scope }, aliases: [] }]),
  ).values()];
  return projects.map((p) => ({
    ...p,
    names: [...new Set([p.scope, ...Object.values(p.title), ...p.aliases].map(normalize))],
  }));
}

function windows(text, name, limit) {
  const out = [];
  if (CJK.test(name)) {
    for (const run of text.match(/[\u3400-\u9fff]+/gu) ?? []) {
      for (let size = Math.max(4, name.length - limit); size <= name.length + limit; size++) {
        for (let i = 0; i + size <= run.length; i++) out.push(run.slice(i, i + size));
      }
    }
  } else {
    const words = text.match(/[a-z0-9]+/g) ?? [];
    const count = name.split(' ').length;
    for (let i = 0; i + count <= words.length; i++) out.push(words.slice(i, i + count).join(' '));
  }
  return out;
}

export function resolveProjects(projects, question) {
  const text = normalize(question);
  const exact = projects.filter((p) => p.names.some((name) => CJK.test(name)
    ? text.includes(name)
    : new RegExp(`(^|[^a-z0-9])${escape(name)}($|[^a-z0-9])`, 'u').test(text)));
  if (exact.length) return { named: exact.map((p) => p.scope), candidates: [], method: 'exact' };

  const scores = [];
  for (const p of projects) {
    let best = 0;
    for (const name of p.names) {
      if (name.length < 5) continue;
      const limit = Math.min(2, Math.floor(name.length / 4));
      for (const window of windows(text, name, limit)) {
        const d = distance(name, window, limit);
        if (d <= limit) best = Math.max(best, 1 - d / Math.max(name.length, window.length));
      }
    }
    if (best >= 0.75) scores.push({ scope: p.scope, score: best, title: p.title });
  }
  scores.sort((a, b) => b.score - a.score || a.scope.localeCompare(b.scope));
  if (!scores.length) return { named: [], candidates: [], method: 'none' };
  if (scores[1] && scores[0].score - scores[1].score < 0.12) {
    return { named: [], candidates: scores.filter((s) => scores[0].score - s.score < 0.12).slice(0, 3), method: 'ambiguous' };
  }
  return { named: [scores[0].scope], candidates: [], method: 'fuzzy' };
}
