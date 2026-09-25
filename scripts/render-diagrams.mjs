// Render every Mermaid source under content/ to an SVG next to it (ADR-008, ADR-015).
// The SVGs are committed, so the hosted build never needs a browser.
//
// Uses the locally installed Chrome instead of letting Puppeteer download Chromium
// (PUPPETEER_SKIP_DOWNLOAD). Override with PUPPETEER_EXECUTABLE_PATH.
// Usage: npm run diagrams [-- --force]
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const force = process.argv.includes('--force');
const CONFIG = 'diagrams/mermaid.config.json';
const CLI = '@mermaid-js/mermaid-cli@12';

const chrome = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((p) => p && existsSync(p));
if (!chrome) {
  console.error('render-diagrams: no local Chrome or Chromium found. Set PUPPETEER_EXECUTABLE_PATH.');
  process.exit(1);
}

function findSources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...findSources(p));
    else if (name.endsWith('.mmd')) out.push(p);
  }
  return out;
}

const puppeteerConfig = join(mkdtempSync(join(tmpdir(), 'mmdc-')), 'puppeteer.json');
writeFileSync(puppeteerConfig, JSON.stringify({ executablePath: chrome, headless: true }));
const env = { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true', PUPPETEER_EXECUTABLE_PATH: chrome };
const configTime = statSync(CONFIG).mtimeMs;

let rendered = 0;
for (const src of findSources('content')) {
  const out = src.replace(/\.mmd$/, '.svg');
  if (!force && existsSync(out)) {
    const outTime = statSync(out).mtimeMs;
    if (outTime > statSync(src).mtimeMs && outTime > configTime) continue;
  }
  const result = spawnSync(
    'npx',
    ['-y', CLI, '-i', src, '-o', out, '-c', CONFIG, '-p', puppeteerConfig, '-b', 'transparent', '-q'],
    { stdio: 'inherit', env },
  );
  if (result.status !== 0) {
    console.error(`render-diagrams: failed on ${src}`);
    process.exit(result.status ?? 1);
  }
  // Keep three decimals: smaller files, and no long digit runs that look like account IDs to the pre-commit scan.
  const svg = readFileSync(out, 'utf8').replace(/(\d+\.\d{3})\d+/g, '$1');
  writeFileSync(out, svg);
  if (/<script\b/i.test(svg)) {
    console.error(`render-diagrams: ${out} contains a <script> element`);
    process.exit(1);
  }
  rendered += 1;
  console.log(`render-diagrams: ${out}`);
}
console.log(`render-diagrams: ${rendered} diagram(s) rendered${rendered ? '' : ' (all up to date)'}`);
