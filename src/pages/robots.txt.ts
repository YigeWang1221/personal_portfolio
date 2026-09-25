// robots.txt follows the indexing switch (ADR-015): blocked unless SITE_URL and SITE_INDEXING=true are set.
import type { APIRoute } from 'astro';
import { siteConfig } from '../lib/site-config.mjs';

export const GET: APIRoute = () => {
  const body = siteConfig.indexable
    ? `User-agent: *\nAllow: /\n\nSitemap: ${siteConfig.siteUrl}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
