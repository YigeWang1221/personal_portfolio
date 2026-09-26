// Post-build gate (ARCHITECTURE.md "Content safety", ADR-015). Fails the build when dist/ contains:
//   - private data: local paths, private IPv4 ranges, AWS account IDs or keys, private keys, email addresses,
//     internal ledger claim IDs, internal/ references, private working names, workers.dev / pages.dev URLs;
//   - inline code: <style>, style="…" or on*="…" attributes, and any <script> other than the one first-party
//     enhancement file /js/site.js (ADR-016; the CSP has no 'unsafe-inline');
//   - resources loaded from third-party origins;
//   - broken internal links or #anchors, a wrong <html lang>, a missing CSP <meta>, missing 404 pages;
//   - _redirects entries whose target does not exist, or that point at another redirect (a chain).
// Usage: node scripts/check-dist.mjs [--dir dist]
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';

const argDir = process.argv.indexOf('--dir');
const DIST = argDir > -1 ? process.argv[argDir + 1] : 'dist';
/** Exact public contact address explicitly confirmed by the owner (ADR-019). */
const ALLOWED_EMAILS = new Set(['wang.yige@northeatsern.edu']);
/** Internal names that must never appear on the site. */
const PRIVATE_NAMES = [/KK Boost/i, /KKnock-Boost/i, /KKKnockBoost/i, /codex_dev/, /cursor_dev/, /AI_prompts_Recording/, /ObsidianWorkSpace/];
const CLAIM_ID = /\b(?:KK|HPC|CN|LORA|F1|QA|EQ|FS|SB|DS|PSA)-\d{2}\b/;
/** The only script the site ships (ADR-016): progressive enhancement, loaded from its own origin. */
const SITE_SCRIPT = '/js/site.js';

const problems = [];
const report = (file, msg) => problems.push(`${file}: ${msg}`);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error(`check-dist: ${DIST}/ does not exist; run the build first`);
  process.exit(1);
}

const files = walk(DIST);
const rel = (p) => relative(DIST, p).split(sep).join('/');
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const htmlCache = new Map(htmlFiles.map((f) => [rel(f), readFileSync(f, 'utf8')]));

// 1. Private data in every text file -----------------------------------------------------------------
const TEXT_EXT = new Set(['.html', '.xml', '.txt', '.css', '.js', '.mjs', '.svg', '.json', '.webmanifest', '']);
for (const f of files) {
  const ext = extname(f);
  if (!TEXT_EXT.has(ext)) continue;
  const r = rel(f);
  const text = readFileSync(f, 'utf8');
  const isMarkup = ext === '.html' || ext === '.xml' || ext === '.txt';
  const checks = [
    [/\/Users\/|\/home\/[a-z_][\w-]*\/|[A-Z]:\\Users\\/, 'local file path'],
    [/(^|[^\d.])(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?![\d.])/, 'private IPv4 address'],
    [/AKIA[0-9A-Z]{16}/, 'AWS access key ID'],
    // Built from parts so that this file does not match the repository's own pre-commit secret scan.
    [new RegExp('-----BEGIN [A-Z ]*PRIVATE' + ' KEY-----'), 'private key'],
    [/key-[0-9a-f]{32}/, 'API key pattern'],
  ];
  if (ext !== '.svg' && ext !== '.css') checks.push([/(?<![\d.])\d{12}(?![\d.])/, '12-digit number (AWS account ID?)']);
  if (isMarkup) {
    checks.push([CLAIM_ID, 'internal ledger claim ID']);
    checks.push([/\binternal\//, 'reference to internal/']);
    checks.push([/workers\.dev|pages\.dev/, 'workers.dev / pages.dev URL']);
    for (const re of PRIVATE_NAMES) checks.push([re, `private working name (${re.source})`]);
  }
  for (const [re, what] of checks) {
    const m = re.exec(text);
    if (m) report(r, `${what}: "${text.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25).replace(/\s+/g, ' ')}"`);
  }
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) {
    if (!ALLOWED_EMAILS.has(m[0].toLowerCase())) report(r, `email address: ${m[0]}`);
  }
  if ((ext === '.js' || ext === '.mjs') && '/' + r !== SITE_SCRIPT) report(r, `JavaScript file in the output (only ${SITE_SCRIPT} is allowed)`);
  if (ext === '.css' && /url\(\s*["']?(https?:)?\/\//i.test(text)) report(r, 'CSS loads a remote URL');
}

// 2. HTML: inline code, third-party resources, lang, CSP ------------------------------------------------
const TAG = /<([a-zA-Z][\w:-]*)(\s[^<>]*?)?\/?>/g;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
function attrs(raw) {
  const out = {};
  for (const m of (raw ?? '').matchAll(ATTR)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}
const isExternal = (url) => /^(https?:)?\/\//i.test(url);

const links = []; // [fromFile, href]
const idsByFile = new Map();
for (const [r, html] of htmlCache) {
  const ids = new Set();
  const expectedLang = r.startsWith('zh/') ? 'zh-CN' : 'en';
  let sawCspMeta = false;
  let htmlLang = null;
  if (/<style[\s>]/i.test(html)) report(r, 'inline <style> element');
  for (const m of html.matchAll(TAG)) {
    const tag = m[1].toLowerCase();
    const a = attrs(m[2]);
    if (a.id) ids.add(a.id);
    if ('style' in a) report(r, `style="" attribute on <${tag}>`);
    for (const name of Object.keys(a)) if (/^on[a-z]+$/.test(name)) report(r, `inline event handler ${name} on <${tag}>`);
    if (tag === 'script' && (a.src ?? '').split('?')[0] !== SITE_SCRIPT) report(r, `<script> element${a.src ? ` (src=${a.src})` : ' (inline)'}`);
    if (tag === 'html') htmlLang = a.lang ?? null;
    if (tag === 'meta' && (a['http-equiv'] ?? '').toLowerCase() === 'content-security-policy') sawCspMeta = true;
    const resource = [];
    if (tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio' || tag === 'iframe' || tag === 'embed') {
      if (a.src) resource.push(a.src);
      if (a.srcset) resource.push(...a.srcset.split(',').map((s) => s.trim().split(/\s+/)[0]));
    }
    if (tag === 'object' && a.data) resource.push(a.data);
    if (tag === 'link') {
      const relAttr = (a.rel ?? '').toLowerCase();
      if (relAttr === 'canonical' || relAttr === 'alternate') {
        if (a.href && isExternal(a.href) && /workers\.dev|pages\.dev/.test(a.href)) report(r, `canonical/alternate points to ${a.href}`);
      } else if (a.href) resource.push(a.href);
    }
    for (const url of resource) {
      if (isExternal(url)) report(r, `resource from a third-party origin: <${tag}> ${url}`);
    }
    if (tag === 'a' && a.href !== undefined) links.push([r, a.href]);
  }
  idsByFile.set(r, ids);
  if (!sawCspMeta) report(r, 'missing Content-Security-Policy <meta>');
  if (htmlLang !== expectedLang) report(r, `<html lang="${htmlLang}">, expected "${expectedLang}"`);
  if (!/<title>[^<]+<\/title>/.test(html)) report(r, 'missing <title>');
}

// 3. Internal links and anchors -------------------------------------------------------------------------
function targetFile(path) {
  const clean = decodeURI(path.split('#')[0].split('?')[0]);
  if (clean.endsWith('/')) return `${clean.slice(1)}index.html`;
  if (/\.[a-z0-9]+$/i.test(clean)) return clean.slice(1);
  return null; // directory URL without a trailing slash
}
for (const [from, href] of links) {
  if (!href || /^(https?:|mailto:|tel:)/i.test(href)) continue;
  if (href.startsWith('#')) {
    const id = decodeURIComponent(href.slice(1));
    if (id && !idsByFile.get(from)?.has(id)) report(from, `broken anchor ${href}`);
    continue;
  }
  if (!href.startsWith('/')) {
    report(from, `relative link ${href} (use root-relative paths)`);
    continue;
  }
  const target = targetFile(href);
  if (!target) {
    report(from, `link without a trailing slash: ${href}`);
    continue;
  }
  if (!existsSync(join(DIST, target))) {
    report(from, `broken link ${href}`);
    continue;
  }
  const hash = href.includes('#') ? decodeURIComponent(href.split('#')[1]) : '';
  if (hash && target.endsWith('.html') && !idsByFile.get(target)?.has(hash)) report(from, `broken anchor ${href}`);
}

// 4. Redirects -----------------------------------------------------------------------------------------
const redirectsFile = join(DIST, '_redirects');
if (existsSync(redirectsFile)) {
  const rules = readFileSync(redirectsFile, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/));
  const sources = new Set(rules.map(([from]) => from));
  for (const [from, to, status] of rules) {
    if (!to || !['301', '308'].includes(status)) report('_redirects', `${from}: expected "<from> <to> 301"`);
    if (!to) continue;
    const toPath = to.split('?')[0].split('#')[0];
    if (sources.has(toPath)) report('_redirects', `${from} → ${to} points at another redirect (chain)`);
    const target = targetFile(toPath);
    if (!target || !existsSync(join(DIST, target))) report('_redirects', `${from} → ${to}: target does not exist`);
    if (existsSync(join(DIST, from.replace(/^\//, ''), 'index.html'))) report('_redirects', `${from} is redirected but still built`);
  }
}

// 5. Required files ------------------------------------------------------------------------------------
for (const required of ['404.html', 'zh/404.html', 'index.html', 'zh/index.html', '_headers', '_redirects', 'robots.txt', 'js/site.js']) {
  if (!existsSync(join(DIST, required))) report(required, 'required file is missing');
}

if (problems.length) {
  console.error(`check-dist: ${problems.length} problem(s)\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`check-dist: OK (${htmlFiles.length} pages, ${links.length} links checked)`);
