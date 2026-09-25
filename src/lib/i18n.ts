// Locale routing without Astro's i18n integration (ADR-015).
// English lives at the site root, Chinese under /zh/. Paths passed around the code base are
// language-neutral ("/projects/kk-knock/") and get the locale prefix only when they are rendered.

import { siteConfig } from './site-config.mjs';

export const LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];

/** Value of <html lang> and hreflang for each locale. */
export const HTML_LANG: Record<Locale, string> = { en: 'en', zh: 'zh-CN' };
export const OG_LOCALE: Record<Locale, string> = { en: 'en_US', zh: 'zh_CN' };

export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'zh' : 'en';
}

/** Route param for the [...locale] segment: undefined renders at the root. */
export function localeParam(locale: Locale): string | undefined {
  return locale === 'en' ? undefined : 'zh';
}

export function localeFromParam(param: string | undefined): Locale {
  if (param === undefined) return 'en';
  if (param === 'zh') return 'zh';
  throw new Error(`Unknown locale segment: ${param}`);
}

/** getStaticPaths() entries for pages that exist once per locale. */
export function localePaths() {
  return LOCALES.map((locale) => ({ params: { locale: localeParam(locale) }, props: { locale } }));
}

/** Prefix a language-neutral path ("/resume/") for a locale. Keeps hashes. */
export function localePath(locale: Locale, path: string): string {
  if (!path.startsWith('/')) throw new Error(`Internal paths must start with "/": ${path}`);
  if (locale === 'en') return path;
  return path === '/' ? '/zh/' : `/zh${path}`;
}

/** Absolute URL for a language-neutral path, or null when SITE_URL is not configured. */
export function absoluteUrl(locale: Locale, path: string): string | null {
  if (!siteConfig.siteUrl) return null;
  return siteConfig.siteUrl + localePath(locale, path);
}
