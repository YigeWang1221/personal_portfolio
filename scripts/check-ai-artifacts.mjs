// Safety gate for the AI assistant's knowledge artifacts (ADR-022, SDD-AICHAT-001 §5.2). Runs after check-dist.mjs and
// fails the build when generated/ai/ contains:
//   - anything that looks like a ledger claim ID, an unrendered {{fact:…}}, internal/ or local-path references,
//     internal document names, key-like strings, or an email address other than the approved one;
//   - a sourcePath whose page or #anchor does not exist in dist/;
//   - an entry for a project that is not in the catalog order;
//   - different section sets in English and Chinese;
//   - artifacts larger than 2 MiB, or files that do not match the manifest hashes.
// Usage: node scripts/check-ai-artifacts.mjs [--generated generated] [--dir dist]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLAIM_EXEMPT, CLAIM_LIKE } from './build-prompts.mjs';
import { leakedSecretNames, localSecretValues } from './local-secrets.mjs';

/** Exact public contact address explicitly confirmed by the owner (ADR-019, ADR-023); same as check-dist.mjs. */
const ALLOWED_EMAILS = new Set(['wang.yige@northeastern.edu']);
const MAX_BYTES = 2 * 1024 * 1024;

const TEXT_CHECKS = [
  [/\{\{fact:/, 'unrendered fact reference'],
  [/\binternal\//, 'reference to internal/'],
  [/\/Users\/|\/home\/[a-z_][\w-]*\/|[A-Z]:\\Users\\/, 'local file path'],
  [/RESUME_POLISHED|RESUME_CROSSCHECK|CONTENT_STRATEGY|CURRENT_STATE|PROJECT_SOURCES/, 'internal document name'],
  [/\bsk-[A-Za-z0-9_-]{16,}/, 'API key (sk-…)'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key ID'],
  [new RegExp('-----BEGIN [A-Z ]*PRIVATE' + ' KEY-----'), 'private key'],
  [/(^|[^\d.])(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?![\d.])/, 'private IPv4 address'],
  [/\{\{(?!locale\}\}|page_title\}\}|sources\}\}|low_confidence\}\})[\w.]+\}\}/, 'unresolved prompt variable'],
];

/** Ids present in a built HTML page, or null when the page does not exist. */
function pageIds(dist, path, cache) {
  const clean = path.split('#')[0];
  if (cache.has(clean)) return cache.get(clean);
  const file = join(dist, clean.endsWith('/') ? `${clean.slice(1)}index.html` : clean.slice(1));
  const ids = existsSync(file) ? new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])) : null;
  cache.set(clean, ids);
  return ids;
}

/**
 * @param {{worldbookJson: string, bundleJson: string, manifest: object, projection: object, distDir: string}} input
 * @returns {string[]} problems
 */
export function checkArtifacts({ worldbookJson, bundleJson, manifest, projection, distDir, secrets = localSecretValues() }) {
  const problems = [];
  const exempt = new Set(CLAIM_EXEMPT);
  for (const [name, text] of [['worldbook.json', worldbookJson], ['prompt-bundle.json', bundleJson]]) {
    for (const m of text.matchAll(CLAIM_LIKE)) {
      if (!exempt.has(m[0])) problems.push(`${name}: looks like a ledger claim ID: "${text.slice(Math.max(0, m.index - 30), m.index + 30)}"`);
    }
    for (const [re, what] of TEXT_CHECKS) {
      const m = re.exec(text);
      if (m) problems.push(`${name}: ${what}: "${text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)}"`);
    }
    for (const secret of leakedSecretNames(text, secrets)) problems.push(`${name}: contains the value of ${secret} from backend/.env`);
    for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) {
      if (!ALLOWED_EMAILS.has(m[0].toLowerCase())) problems.push(`${name}: email address: ${m[0]}`);
    }
  }
  const size = Buffer.byteLength(worldbookJson) + Buffer.byteLength(bundleJson);
  if (size > MAX_BYTES) problems.push(`artifacts are ${size} bytes, over the ${MAX_BYTES}-byte limit`);

  const sha = (s) => createHash('sha256').update(s).digest('hex');
  if (manifest.sha256?.worldbook !== sha(worldbookJson)) problems.push('manifest.json: worldbook sha256 does not match');
  if (manifest.sha256?.promptBundle !== sha(bundleJson)) problems.push('manifest.json: prompt bundle sha256 does not match');

  const worldbook = JSON.parse(worldbookJson);
  if (manifest.entryCount !== worldbook.entries.length) problems.push('manifest.json: entryCount does not match');
  if (manifest.knowledgeVersion !== worldbook.knowledgeVersion) problems.push('manifest.json: knowledgeVersion does not match the world book');
  const listed = new Set(projection.order);
  const nonProject = new Set(['profile', 'catalog', 'background', 'plan']);
  const cache = new Map();
  const sections = { en: new Set(), zh: new Set() };
  const ids = new Set();
  for (const e of worldbook.entries) {
    if (ids.has(e.id)) problems.push(`${e.id}: duplicate entry id`);
    ids.add(e.id);
    if (!nonProject.has(e.scope) && !listed.has(e.scope)) problems.push(`${e.id}: project "${e.scope}" is not in the catalog order`);
    if (!/^\//.test(e.sourcePath)) problems.push(`${e.id}: sourcePath must be root-relative: ${e.sourcePath}`);
    const anchors = pageIds(distDir, e.sourcePath, cache);
    const anchor = e.sourcePath.includes('#') ? e.sourcePath.split('#')[1] : '';
    if (!anchors) problems.push(`${e.id}: sourcePath ${e.sourcePath} is not a built page`);
    else if (anchor && !anchors.has(anchor)) problems.push(`${e.id}: sourcePath ${e.sourcePath}: anchor #${anchor} does not exist`);
    if ((e.locale === 'zh') !== e.sourcePath.startsWith('/zh/')) problems.push(`${e.id}: sourcePath ${e.sourcePath} does not match locale ${e.locale}`);
    sections[e.locale]?.add(`${e.scope}|${e.sectionId}`);
  }
  const onlyEn = [...sections.en].filter((s) => !sections.zh.has(s));
  const onlyZh = [...sections.zh].filter((s) => !sections.en.has(s));
  if (onlyEn.length || onlyZh.length) problems.push(`English and Chinese section sets differ (en only: ${onlyEn.join(', ') || '—'}; zh only: ${onlyZh.join(', ') || '—'})`);
  for (const path of Object.keys(worldbook.pages)) if (!pageIds(distDir, path, cache)) problems.push(`pages: ${path} is not a built page`);
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : fallback;
  };
  const generated = arg('--generated', 'generated');
  const distDir = arg('--dir', 'dist');
  const ai = join(generated, 'ai');
  for (const f of ['worldbook.json', 'prompt-bundle.json', 'manifest.json']) {
    if (!existsSync(join(ai, f))) {
      console.error(`check-ai-artifacts: ${join(ai, f)} is missing; run the build first`);
      process.exit(1);
    }
  }
  const problems = checkArtifacts({
    worldbookJson: readFileSync(join(ai, 'worldbook.json'), 'utf8'),
    bundleJson: readFileSync(join(ai, 'prompt-bundle.json'), 'utf8'),
    manifest: JSON.parse(readFileSync(join(ai, 'manifest.json'), 'utf8')),
    projection: JSON.parse(readFileSync(join(generated, 'raw', 'projection.json'), 'utf8')),
    distDir,
  });
  if (problems.length) {
    console.error(`check-ai-artifacts: ${problems.length} problem(s)\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(join(ai, 'manifest.json'), 'utf8'));
  console.log(`check-ai-artifacts: OK (${manifest.entryCount} entries, knowledge ${manifest.knowledgeVersion})`);
}
