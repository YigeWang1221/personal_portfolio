// T-PROMPT-01 … T-PROMPT-03 (SDD-AICHAT-001 §9): prompt validation, deterministic assembly, the local overlay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPrompts } from '../../scripts/build-prompts.mjs';
import { assemblePrompt } from '../../shared/ai/assemble.mjs';
import { ROOT, fixtureProjection, readArtifacts } from './helpers.mjs';

/** A copy of content/ai/ that a test may change. */
function promptDir() {
  const dir = mkdtempSync(join(tmpdir(), 'pf-prompts-'));
  cpSync(join(ROOT, 'content', 'ai'), dir, { recursive: true, filter: (src) => !src.includes(`${join('prompts', 'local')}`) });
  return {
    dir,
    edit(file, fn) {
      const p = join(dir, file);
      writeFileSync(p, fn(readFileSync(p, 'utf8')));
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function build(t, mutate, opts = {}) {
  const d = promptDir();
  t.after(d.cleanup);
  mutate?.(d);
  return buildPrompts({ dir: d.dir, projection: fixtureProjection(), ...opts });
}

test('the repository prompts compile', (t) => {
  const { bundle, errors } = build(t);
  assert.deepEqual(errors, []);
  assert.ok(bundle.blocks.main.text.en.includes('Test Owner'));
  assert.ok(!JSON.stringify(bundle).includes('{{owner_name}}'), 'build-time variables are filled in');
  assert.ok(bundle.blocks['world-info'].text.zh.includes('{{sources}}'), 'runtime variables stay');
});

test('T-PROMPT-01: an unknown variable fails with file and line', (t) => {
  const { bundle, errors } = build(t, (d) => d.edit('prompts/10-character.md', (s) => s.replace('No marketing superlatives', '{{favorite_color}} No marketing superlatives')));
  assert.equal(bundle, null);
  assert.ok(errors.some((e) => /prompts\/10-character\.md:\d+: unknown variable \{\{favorite_color\}\}/.test(e)), errors.join('\n'));
});

test('T-PROMPT-01: {{sources}} outside world-info fails', (t) => {
  const { errors } = build(t, (d) => d.edit('prompts/10-character.md', (s) => s.replace('## zh\n', '## zh\n{{sources}}\n')));
  assert.ok(errors.some((e) => /10-character\.md:\d+: \{\{sources\}\} is only allowed in the world-info block/.test(e)), errors.join('\n'));
});

test('T-PROMPT-01: a block over its budget fails', (t) => {
  const { errors } = build(t, (d) => d.edit('prompts/50-post-history.md', (s) => s.replace('max_tokens: 200', 'max_tokens: 20')));
  assert.ok(errors.some((e) => /50-post-history\.md:\d+: "## (en|zh)" is about \d+ tokens, over max_tokens 20/.test(e)), errors.join('\n'));
});

test('T-PROMPT-01: a missing language fails', (t) => {
  const { errors } = build(t, (d) => d.edit('prompts/20-owner-persona.md', (s) => s.slice(0, s.indexOf('## zh'))));
  assert.ok(errors.some((e) => e.includes('20-owner-persona.md: missing "## zh" section')), errors.join('\n'));
});

test('T-PROMPT-01: a fact value or a claim ID in a prompt fails with its line', (t) => {
  const { errors } = build(t, (d) => d.edit('prompts/40-examples.md', (s) => s.replace('median latency', 'median latency of 12.3 ms (see KK-04)')));
  assert.ok(errors.some((e) => /40-examples\.md:\d+: contains the fact value "12\.3 ms"/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /40-examples\.md:\d+: looks like a ledger claim ID: KK-04/.test(e)), errors.join('\n'));
});

test('T-PROMPT-01: post-history must keep the [S…] reminder', (t) => {
  const { errors } = build(t, (d) => d.edit('prompts/50-post-history.md', (s) => s.replaceAll('[S1]', 'tags')));
  assert.ok(errors.some((e) => e.includes('must keep the [S…] citation reminder')), errors.join('\n'));
});

test('T-PROMPT-02: assembly is deterministic, and editing the character changes only that block', (t) => {
  const input = { locale: 'en', message: 'Which projects?', history: [], sources: [{ tag: 'S1', title: 'Lumen', path: '/projects/lumen/', text: 'x' }], pageTitle: 'Lumen' };
  const a = build(t).bundle;
  assert.deepEqual(assemblePrompt(a, input), assemblePrompt(a, input));
  const b = build(t, (d) => d.edit('prompts/10-character.md', (s) => s.replace('professional, friendly and brief', 'warm and brief'))).bundle;
  const changed = Object.keys(a.blocks).filter((id) => JSON.stringify(a.blocks[id]) !== JSON.stringify(b.blocks[id]));
  assert.deepEqual(changed, ['character']);
});

test('T-PROMPT-03: the local overlay applies only when switched on, and marks the build dirty', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'pf-overlay-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const content = join(repo, 'content-ai');
  cpSync(join(ROOT, 'content', 'ai'), content, { recursive: true, filter: (src) => !src.includes(`${join('prompts', 'local')}`) });
  mkdirSync(join(content, 'prompts', 'local'));
  const original = readFileSync(join(content, 'prompts', '10-character.md'), 'utf8');
  writeFileSync(join(content, 'prompts', 'local', '10-character.md'), original.replace('professional, friendly and brief', 'LOCAL OVERLAY STYLE'));
  mkdirSync(join(repo, 'generated', 'raw'), { recursive: true });
  writeFileSync(join(repo, 'generated', 'raw', 'projection.json'), JSON.stringify(fixtureProjection()));
  const runBuild = (env) =>
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-ai.mjs'), '--generated', 'generated', '--content', 'content-ai'], { cwd: repo, env: { ...process.env, ...env }, encoding: 'utf8' });

  runBuild({ PROMPT_LOCAL_OVERRIDES: '' });
  let out = readArtifacts(repo);
  assert.ok(!out.bundle.blocks.character.text.en.includes('LOCAL OVERLAY STYLE'));
  assert.deepEqual(out.manifest.overrides, []);

  runBuild({ PROMPT_LOCAL_OVERRIDES: '1' });
  out = readArtifacts(repo);
  assert.ok(out.bundle.blocks.character.text.en.includes('LOCAL OVERLAY STYLE'));
  assert.deepEqual(out.manifest.overrides, ['10-character.md']);
  assert.equal(out.manifest.dirty, true);
});

test('a value from backend/.env in the output is reported by variable name only', async () => {
  const { leakedSecretNames } = await import('../../scripts/local-secrets.mjs');
  const secrets = [{ name: 'KEY_PLAN_A', value: 'sk-test-0123456789abcdef' }, { name: 'API_URL_PLAN_A', value: 'http://gateway.internal:8080/v1' }];
  assert.deepEqual(leakedSecretNames('<p>see http://gateway.internal:8080/v1</p>', secrets), ['API_URL_PLAN_A']);
  assert.deepEqual(leakedSecretNames('<p>clean</p>', secrets), []);
});
