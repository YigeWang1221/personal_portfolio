// Knowledge and prompt build for the AI assistant (ADR-022, SDD-AICHAT-001 §5.2, §5.3).
// Reads generated/raw/projection.json (written by postbuild.mjs) and content/ai/, then writes a complete snapshot:
//   generated/ai/worldbook.json      entries, aliases, page titles
//   generated/ai/prompt-bundle.json  compiled prompt blocks, canned replies, starters
//   generated/ai/manifest.json       versions, hashes, source commit, dirty flag
// Everything is written to an empty temporary directory first and swapped in only when every step succeeded, so a
// removed or hidden item can never survive from an earlier build (full replacement, no merging).
// Usage: node scripts/build-ai.mjs [--generated generated] [--content content/ai]
// PROMPT_LOCAL_OVERRIDES=1 applies content/ai/prompts/local/ (the manifest is then marked dirty).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { buildWorldbook } from './build-worldbook.mjs';
import { buildPrompts, CLAIM_EXEMPT } from './build-prompts.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const GENERATED = arg('--generated', 'generated');
const CONTENT_AI = arg('--content', 'content/ai');

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function fail(msg, errors = []) {
  console.error(`build-ai: ${msg}${errors.length ? `\n- ${errors.join('\n- ')}` : ''}`);
  process.exit(1);
}

const rawPath = join(GENERATED, 'raw', 'projection.json');
if (!existsSync(rawPath)) fail(`${rawPath} is missing; run astro build and postbuild first`);
const projection = JSON.parse(readFileSync(rawPath, 'utf8'));
if (projection.schemaVersion !== 1) fail(`unsupported projection schemaVersion ${projection.schemaVersion}`);

let aliases;
try {
  aliases = parseYaml(readFileSync(join(CONTENT_AI, 'aliases.yaml'), 'utf8'))?.groups ?? [];
} catch (e) {
  fail(`content/ai/aliases.yaml: ${e.message}`);
}
if (!Array.isArray(aliases) || aliases.some((g) => !Array.isArray(g) || g.length < 2 || g.some((s) => typeof s !== 'string' || !s.trim()))) {
  fail('content/ai/aliases.yaml: "groups" must be a list of lists with at least two spellings each');
}

const localOverrides = process.env.PROMPT_LOCAL_OVERRIDES === '1';
const { worldbook, knowledgeVersion } = buildWorldbook(projection, aliases);
const { bundle, errors } = buildPrompts({ dir: CONTENT_AI, projection, localOverrides, claimExempt: CLAIM_EXEMPT });
if (!bundle) fail(`prompt build failed (${errors.length})`, errors);

const worldbookJson = JSON.stringify(worldbook);
const bundleJson = JSON.stringify(bundle);
const status = git(['status', '--porcelain', '--', 'content', 'src', 'shared', 'scripts']);
const manifest = {
  schemaVersion: 1,
  knowledgeVersion,
  promptHash: bundle.hash,
  sourceCommit: git(['rev-parse', '--short', 'HEAD']) ?? 'unknown',
  dirty: Boolean(status) || bundle.overrides.length > 0,
  overrides: bundle.overrides,
  entryCount: worldbook.entries.length,
  sha256: { worldbook: sha256(worldbookJson), promptBundle: sha256(bundleJson) },
};

const target = join(GENERATED, 'ai');
const tmp = join(GENERATED, `.ai-tmp-${process.pid}`);
const old = join(GENERATED, `.ai-old-${process.pid}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, 'worldbook.json'), worldbookJson);
writeFileSync(join(tmp, 'prompt-bundle.json'), bundleJson);
writeFileSync(join(tmp, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
if (existsSync(target)) renameSync(target, old);
renameSync(tmp, target);
rmSync(old, { recursive: true, force: true });

const note = manifest.overrides.length ? `, local overrides: ${manifest.overrides.join(', ')}` : '';
console.log(`build-ai: ${manifest.entryCount} entries, knowledge ${knowledgeVersion}, prompts ${bundle.hash}${manifest.dirty ? ' (dirty)' : ''}${note}`);
