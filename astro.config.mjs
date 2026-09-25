// Astro configuration (ADR-014, ADR-015). Static output, no adapter, no client-side JavaScript.
import { defineConfig } from 'astro/config';
import { siteConfig } from './src/lib/site-config.mjs';

export default defineConfig({
  // Absolute URLs (canonical, hreflang, sitemap) only exist when SITE_URL is configured.
  site: siteConfig.siteUrl ?? undefined,
  output: 'static',
  trailingSlash: 'always',
  // 'jsx' (the Astro 7 default) strips whitespace between inline elements; keep plain collapsing.
  compressHTML: true,
  build: {
    format: 'directory',
    // The CSP has no 'unsafe-inline': styles must always ship as files.
    inlineStylesheets: 'never',
  },
  prefetch: false,
  devToolbar: { enabled: false },
  vite: {
    build: {
      // Never turn small assets into data: URIs (fonts would violate font-src 'self').
      assetsInlineLimit: 0,
    },
  },
});
