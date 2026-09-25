// Build-time site settings, read from the environment (ADR-015).
//
// SITE_URL       Public origin of the deployed site, e.g. https://portfolio.example.com
//                Unset: no absolute canonical / hreflang / sitemap URLs, and the site is noindex.
//                workers.dev and pages.dev URLs are rejected: they must never become the canonical URL.
// SITE_INDEXING  "true" lets search engines index the site. Only allowed together with SITE_URL.

const REJECTED_HOSTS = /(^|\.)(workers\.dev|pages\.dev)$/i;

function readSiteUrl(raw) {
  if (!raw || !raw.trim()) return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`SITE_URL is not a valid URL: ${raw}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`SITE_URL must use https: ${raw}`);
  }
  if (REJECTED_HOSTS.test(url.hostname)) {
    throw new Error(
      `SITE_URL must not be a workers.dev or pages.dev address (${url.hostname}). ` +
        'Deploy without SITE_URL for the preview, and set it to the custom domain once it is bound.',
    );
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`SITE_URL must be an origin without a path, query or hash: ${raw}`);
  }
  return url.origin;
}

const siteUrl = readSiteUrl(process.env.SITE_URL);
const indexingRequested = (process.env.SITE_INDEXING ?? '').trim().toLowerCase() === 'true';

if (indexingRequested && !siteUrl) {
  throw new Error('SITE_INDEXING=true requires SITE_URL to be set to the public custom domain.');
}

export const siteConfig = Object.freeze({
  /** Public origin without a trailing slash, or null when unset. */
  siteUrl,
  /** Whether pages may be indexed by search engines. */
  indexable: Boolean(siteUrl && indexingRequested),
});
