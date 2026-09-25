// Post-build fix-ups for Cloudflare Workers static assets (ADR-015).
// Astro emits src/pages/zh/404.astro as zh/404/index.html. Cloudflare serves the *nearest 404.html*, so move it
// to zh/404.html; missing /zh/* paths then get the Chinese 404 page.
import { existsSync, renameSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
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
