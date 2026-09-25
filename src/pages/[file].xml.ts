// sitemap.xml, generated only when SITE_URL is configured (absolute URLs need a real origin).
import type { APIRoute } from 'astro';
import { siteConfig } from '../lib/site-config.mjs';
import { absoluteUrl } from '../lib/i18n';
import { getContent } from '../lib/content/load';

export function getStaticPaths() {
  return siteConfig.siteUrl ? [{ params: { file: 'sitemap' } }] : [];
}

export const GET: APIRoute = () => {
  const { catalog } = getContent();
  const paths = [
    '/',
    '/projects/',
    '/background/',
    '/resume/',
    '/plan-and-design/',
    ...catalog.map((p) => `/projects/${p.meta.slug}/`),
  ];
  const urls = paths.flatMap((path) =>
    (['en', 'zh'] as const).map((locale) => {
      const alternates = [
        ['en', absoluteUrl('en', path)],
        ['zh-CN', absoluteUrl('zh', path)],
        ['x-default', absoluteUrl('en', path)],
      ]
        .map(([lang, href]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${href}"/>`)
        .join('\n');
      return `  <url>\n    <loc>${absoluteUrl(locale, path)}</loc>\n${alternates}\n  </url>`;
    }),
  );
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls.join('\n') +
    '\n</urlset>\n';
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
