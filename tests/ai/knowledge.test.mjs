// T-KB-01 … T-KB-05 (SDD-AICHAT-001 §9): the knowledge snapshot follows the content exactly, through the real
// pipeline (astro build → postbuild → build-ai → check-ai-artifacts) in a throwaway copy of the repository.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CLAIM_LIKE } from '../../scripts/build-prompts.mjs';
import { buildAll, tempRepo } from './helpers.mjs';

let repo;
let base;
before(() => {
  repo = tempRepo();
  base = buildAll(repo);
});
after(() => repo?.cleanup());

test('the projection never ships: dist/ has no ai/ folder', () => {
  assert.equal(existsSync(join(repo.dir, 'dist', 'ai')), false);
  assert.equal(existsSync(join(repo.dir, 'generated', 'raw', 'projection.json')), true);
});

test('T-KB-01: no claim IDs and no unrendered fact references in the artifacts', () => {
  const all = base.worldbookJson + JSON.stringify(base.bundle);
  assert.equal([...all.matchAll(CLAIM_LIKE)].length, 0);
  assert.ok(!all.includes('{{fact:'));
  assert.ok(!all.includes('"claim"'));
});

test('T-KB-05: the same input gives the same knowledge version', () => {
  const again = buildAll(repo);
  assert.equal(again.manifest.knowledgeVersion, base.manifest.knowledgeVersion);
  assert.equal(again.worldbookJson, base.worldbookJson);
});

test('T-KB-02: a project removed from the catalog order disappears from the world book', () => {
  const r = tempRepo();
  try {
    r.edit('content/catalog.yaml', (s) => s.replace(/^\s*- smartbuyer\n/m, '\n'));
    // Skills that cite only this project go with it; the loader rejects evidence for unpublished projects.
    r.edit('content/profile.yaml', (s) => s.split('\n').filter((l) => !/evidence: \[smartbuyer\]/.test(l)).join('\n').replace(/, smartbuyer\]/g, ']'));
    const out = buildAll(r);
    assert.ok(base.worldbook.entries.some((e) => e.scope === 'smartbuyer'), 'present before');
    assert.equal(out.worldbook.entries.filter((e) => e.scope === 'smartbuyer').length, 0);
    assert.ok(!out.worldbookJson.includes('/projects/smartbuyer/'));
    assert.ok(!out.worldbookJson.includes('SmartBuyer'), 'not even in the catalog list or skills');
  } finally {
    r.cleanup();
  }
});

test('T-KB-03: a changed fact value replaces the old one everywhere', () => {
  const r = tempRepo();
  try {
    const old = '19.4–19.7 s → 11.9–12.6 s';
    assert.ok(base.worldbookJson.includes(old), 'present before');
    r.edit('content/projects/kk-knock/meta.yaml', (s) => s.replace(`value: ${old}`, 'value: 99.1 s → 88.2 s'));
    const out = buildAll(r);
    assert.ok(!out.worldbookJson.includes(old));
    assert.ok(out.worldbookJson.includes('99.1 s → 88.2 s'));
    assert.notEqual(out.manifest.knowledgeVersion, base.manifest.knowledgeVersion);
  } finally {
    r.cleanup();
  }
});

test('T-KB-04: a deleted section takes its entries and source links with it', () => {
  const r = tempRepo();
  try {
    const drop = (s) => s.replace(/## [^\n]*\{#model\}\n[\s\S]*?(?=\n## )/, '');
    r.edit('content/projects/quant-ai/en.md', drop);
    r.edit('content/projects/quant-ai/zh.md', drop);
    const out = buildAll(r);
    assert.ok(base.worldbook.entries.some((e) => e.id.startsWith('quant-ai:en:model')), 'present before');
    assert.equal(out.worldbook.entries.filter((e) => e.scope === 'quant-ai' && e.sectionId === 'model').length, 0);
    assert.ok(!out.worldbookJson.includes('/projects/quant-ai/#model'));
  } finally {
    r.cleanup();
  }
});

test('every entry has both languages and a source link into a built page', () => {
  const sections = (loc) => new Set(base.worldbook.entries.filter((e) => e.locale === loc).map((e) => `${e.scope}|${e.sectionId}`));
  assert.deepEqual([...sections('en')].sort(), [...sections('zh')].sort());
  for (const e of base.worldbook.entries) assert.match(e.sourcePath, /^\/(zh\/)?[a-z0-9/#-]*$/);
});
