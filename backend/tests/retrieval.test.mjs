// T-RET (SDD-AICHAT-001 §9): retrieval quality on the real world book. Needs `npm run build` first (CI builds before
// it tests). Pass: ≥ 90% of related questions get an expected source; every unrelated question is below the threshold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndex, search, selectSources } from '../../shared/ai/retrieve.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const WORLDBOOK = join(ROOT, 'generated', 'ai', 'worldbook.json');
const { cases } = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'retrieval-cases.json'), 'utf8'));

test('T-RET: related questions find their sources; unrelated ones stay below the threshold', { skip: !existsSync(WORLDBOOK) && 'run npm run build first' }, () => {
  const index = buildIndex(JSON.parse(readFileSync(WORLDBOOK, 'utf8')));
  const misses = [];
  const leaks = [];
  let related = 0;
  for (const c of cases) {
    const result = search(index, { question: c.q });
    if (c.relevant === false) {
      if (result.confident) leaks.push(`${c.q} (coverage ${result.coverage.toFixed(2)})`);
      continue;
    }
    related++;
    if (c.starter && !result.confident) misses.push(`${c.q} (a suggested question below the threshold, coverage ${result.coverage.toFixed(2)})`);
    const sent = selectSources(index, result).map((e) => `${e.scope}|${e.sectionId}`);
    if (!c.expect.some((x) => sent.some((s) => s === x || s.startsWith(`${x}|`)))) misses.push(`${c.q} → ${sent.join(', ')}`);
  }
  assert.ok((related - misses.length) / related >= 0.9, `hit rate below 90%:\n${misses.join('\n')}`);
  assert.deepEqual(misses.filter((m) => m.includes('suggested question')), [], 'every suggested question must be confident');
  assert.deepEqual(leaks, [], 'unrelated questions above the threshold');
  if (misses.length) console.log(`T-RET misses (within the 10% allowance):\n${misses.join('\n')}`);
});

test('the visitor\'s page is preferred for an ambiguous question', { skip: !existsSync(WORLDBOOK) && 'run npm run build first' }, () => {
  const index = buildIndex(JSON.parse(readFileSync(WORLDBOOK, 'utf8')));
  const result = search(index, { question: 'How was it validated?', pagePath: '/projects/kk-knock/' });
  assert.equal(result.hits[0].entry.scope, 'kk-knock');
});

test('a follow-up question keeps the topic of the previous one', { skip: !existsSync(WORLDBOOK) && 'run npm run build first' }, () => {
  const index = buildIndex(JSON.parse(readFileSync(WORLDBOOK, 'utf8')));
  const result = search(index, { question: 'How was it tested?', previous: 'Tell me about the F1 race prediction project' });
  assert.equal(result.hits[0].entry.scope, 'f1-bayesian');
});

test('an explicitly named project overrides the current page for a validation question', () => {
  const index = buildIndex(JSON.parse(readFileSync(WORLDBOOK, 'utf8')));
  const result = search(index, { question: 'How was Personal Writing LoRA validated?', pagePath: '/projects/kk-knock/' });
  assert.equal(result.hits[0].entry.scope, 'personal-writing-lora');
});
