// Post-build fix-ups for Cloudflare Workers static assets (ADR-015, ADR-022).
// 1. Astro emits src/pages/zh/404.astro as zh/404/index.html. Cloudflare serves the *nearest 404.html*, so move it
//    to zh/404.html; missing /zh/* paths then get the Chinese 404 page.
// 2. src/pages/ai/knowledge.json.ts emits the AI assistant's public projection (SDD-AICHAT-001 §5.2). It is a
//    build input for scripts/build-ai.mjs, never a page: move it to generated/raw/ and remove dist/ai/.
// 3. With PUBLIC_CHAT_ENABLED=true, copy the assistant's client files (src/client/chat.js, chat.css) to /js/ and
//    /css/. Without the flag nothing is copied, so the output equals a build without the assistant.
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, rmdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { siteConfig } from '../src/lib/site-config.mjs';

const dist = process.argv[2] ?? 'dist';
const generated = process.argv[3] ?? 'generated';
const nested = join(dist, 'zh', '404', 'index.html');
const target = join(dist, 'zh', '404.html');

if (existsSync(nested)) {
  renameSync(nested, target);
  rmdirSync(join(dist, 'zh', '404'));
  console.log('postbuild: moved zh/404/index.html → zh/404.html');
} else if (!existsSync(target)) {
  console.error('postbuild: zh/404 page not found in the build output');
  process.exit(1);
}

const projection = join(dist, 'ai', 'knowledge.json');
const projectionTarget = join(generated, 'raw', 'projection.json');
if (!existsSync(projection)) {
  console.error('postbuild: ai/knowledge.json not found in the build output');
  process.exit(1);
}
mkdirSync(dirname(projectionTarget), { recursive: true });
renameSync(projection, projectionTarget);
const leftover = readdirSync(join(dist, 'ai'));
if (leftover.length) {
  console.error(`postbuild: unexpected files in dist/ai/: ${leftover.join(', ')}`);
  process.exit(1);
}
rmSync(join(dist, 'ai'), { recursive: true });
console.log(`postbuild: moved ai/knowledge.json → ${projectionTarget} (not published)`);

if (siteConfig.chatEnabled) {
  mkdirSync(join(dist, 'js'), { recursive: true });
  mkdirSync(join(dist, 'css'), { recursive: true });
  copyFileSync(join('src', 'client', 'chat.js'), join(dist, 'js', 'chat.js'));
  copyFileSync(join('src', 'client', 'chat.css'), join(dist, 'css', 'chat.css'));
  console.log('postbuild: AI assistant enabled → js/chat.js, css/chat.css');
}
