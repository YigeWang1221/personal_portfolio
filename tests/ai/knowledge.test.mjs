// T-KB-01 … T-KB-05 (SDD-AICHAT-001 §9): the knowledge snapshot follows the content exactly, through the real
// pipeline (astro build → postbuild → build-ai → check-ai-artifacts) in a throwaway copy of the repository.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import YAML from 'yaml';
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
    r.edit('content/profile.yaml', (s) => {
      const profile = YAML.parse(s);
      for (const group of profile.skills) {
        group.items = group.items.map((item) => ({ ...item, evidence: item.evidence.filter((slug) => slug !== 'smartbuyer') }))
          .filter((item) => item.evidence.length);
      }
      return YAML.stringify(profile);
    });
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
    r.edit('content/projects/quant-ai/meta.yaml', (s) => s.replace('anchor: model', 'anchor: pipeline'));
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

// Guard against stale résumé data surviving through the actual projection/prompt pipeline.
test('public knowledge presents LoRA implementation and ownership without progress records', () => {
  const entries = base.worldbook.entries.filter((e) => e.scope === 'personal-writing-lora');
  const text = JSON.stringify(entries);
  assert.match(text, /on AWS/);
  assert.match(text, /AWS/);
  assert.match(text, /Personal project/);
  assert.match(text, /个人项目/);
  assert.doesNotMatch(text, /never deployed|从未部署|Not started|尚未开始|mock-provider tests/);
  const publicText = JSON.stringify(base.worldbook.entries) + JSON.stringify(base.bundle);
  assert.doesNotMatch(publicText, /AI coding assistants|AI-assisted code|AI-assistance wording|AI 编码助手|大部分代码由|大量代码由|AI 辅助代码/i);
  // Team projects retain their shared attribution; presentation changes must not make them solo projects.
  assert.match(JSON.stringify(base.worldbook.entries.filter((e) => e.scope === 'distributed-llm')), /Team of 2/);
});


test('reviewed names and visible project explanations survive the public projection', () => {
  const p = base.worldbook.projectNames.find((p) => p.scope === 'personal-writing-lora');
  assert.ok(p.aliases.includes('个性化写作'));
  assert.ok(!base.worldbook.projectNames.some((p) => p.scope === 'psa-ticketing'));
  const text = base.worldbook.entries.filter((e) => e.scope === 'personal-writing-lora').map((e) => e.text).join('\n');
  assert.match(text, /adapter|适配器/);
  const projection = JSON.parse(repo.read('generated/raw/projection.json'));
  for (const project of projection.projects) {
    assert.equal('status' in project, false);
    assert.equal('statusNote' in project, false);
    assert.equal('roadmap' in project, false);
  }
  for (const p of projection.projects) for (const loc of ['en','zh']) for (const section of p.sections[loc]) {
    const chunks = base.worldbook.entries.filter((e) => e.scope === p.slug && e.locale === loc && e.sectionId === section.id);
    assert.ok(chunks.length, `${p.slug}:${loc}:${section.id}`);
    // Check prose beyond metadata actually survives through the pipeline.
    assert.ok(chunks.some((e) => e.text.includes(section.text.slice(0, 60))));
  }
});


test('KK product content preserves the download link without status badges', () => {
  const text = JSON.stringify(base.worldbook.entries.filter((e) => e.scope === 'kk-knock'));
  assert.match(text, /Android downloads/);
  assert.match(text, /下载 Android/);
  assert.match(text, /Cloudflare/);
  assert.match(text, /github.com\/KKnock-Boost\/Introduction\/releases/);
  assert.doesNotMatch(text, /not in a public release yet|publish the first Android release|它还没有进入公开发布|公网 HTTPS、公开发布/);
});

test('output scan allows only the exact public introduction repository and its release URL', () => {
  const original = repo.read('dist/index.html');
  const run = () => execFileSync(process.execPath, ['scripts/check-dist.mjs'], {cwd:repo.dir, encoding:'utf8', stdio:['ignore','pipe','pipe']});
  assert.match(run(), /check-dist: OK/);
  try {
    for (const value of ['https://github.com/KKnock-Boost/Introduction', 'https://github.com/KKnock-Boost/Introduction/releases']) {
      repo.write('dist/index.html', original.replace('</body>', `<p>${value}</p></body>`));
      assert.match(run(), /check-dist: OK/);
    }
    for (const value of ['KKnock-Boost', 'https://github.com/KKnock-Boost/Introduction/releases-unknown', 'https://github.com/KKnock-Boost/Introduction-x', 'https://github.com/KKnock-Boost/Introduction/tree/main', 'https://github.com/KKnock-Boost/backend']) {
      repo.write('dist/index.html', original.replace('</body>', `<p>${value}</p></body>`));
      assert.throws(run, /private working name/);
    }
  } finally {
    repo.write('dist/index.html', original);
  }
});

test('home cloud visuals and explanations share one project boundary in both languages', () => {
  for (const path of ['dist/index.html', 'dist/zh/index.html']) {
    const html = repo.read(path);
    const rows = [...html.matchAll(/<article class="work work-row[^\"]*"[^>]*>([\s\S]*?)<\/article>/g)].map((m) => m[1]);
    assert.equal(rows.length, 3, path);
    for (const [i, slug] of ['personal-writing-lora', 'distributed-llm', 'cloud-native'].entries()) {
      assert.ok(rows[i].includes(`id="work-cloud-${slug}"`), `${path}: ${slug}`);
      assert.ok(rows[i].includes('class="work-heading"'));
      assert.ok(rows[i].includes('class="work-text"'));
    }
    for (const row of rows.slice(1)) {
      assert.ok(row.indexOf('</header>') < row.indexOf('<figure'));
      assert.ok(row.indexOf('<figure') < row.indexOf('class="work-text"'));
    }
    assert.ok(!rows[1].includes('Packer'), 'AWS flow must not appear in the HPC project');
    assert.ok(rows[2].includes('Packer'), 'AWS flow belongs to the AWS row');
  }
});


test('home tracks cross-list projects with unique accessible headings in both languages', () => {
  for (const path of ['dist/index.html', 'dist/zh/index.html']) {
    const html = repo.read(path);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${path}: duplicate id`);
    for (const [track, slug] of [['ai-ml', 'job-apply-agent'], ['sde', 'job-apply-agent'], ['ai-ml', 'personal-writing-lora'], ['cloud', 'personal-writing-lora'], ['ai-ml', 'distributed-llm'], ['cloud', 'distributed-llm']]) {
      assert.ok(ids.includes(`work-${track}-${slug}`), `${path}: ${track}/${slug}`);
    }
    assert.deepEqual([...html.matchAll(/data-track="([^"]+)"/g)].map((m) => m[1]), ['ai-ml','cloud','sde','finance-data']);
    assert.doesNotMatch(html, /class="status-badge|class="status-note|class="roadmap/);
  }
  assert.ok(base.worldbook.projectNames.some((p) => p.scope === 'job-apply-agent'));
  for (const locale of ['en','zh']) assert.ok(base.worldbook.entries.some((e) => e.scope === 'job-apply-agent' && e.locale === locale && e.sectionId === 'agent-loop'));
});
