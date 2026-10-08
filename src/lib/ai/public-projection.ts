// Public projection for the AI assistant (ADR-022, SDD-AICHAT-001 §5.2).
//
// Turns the validated content model into a JSON-safe DTO that contains only what the site already shows.
// Every field is picked explicitly from a whitelist; nothing is spread or serialized wholesale, so a new
// schema field never reaches the assistant until it is added here on purpose.
// Never output: fact.claim, chart panels[].claim (internal ledger IDs), track, figures, roadmap,
// anchor_aliases, deep_dive_from, related, highlight keys, profile.updated, contact.attachment_limit_mb.
import type { Content, Project } from '../content/load';
import { termText } from '../content/load';
import type { RenderedSection } from '../content/markdown';
import type { Fact, Localized } from '../content/schema';
import { formatPeriod, statusLabel, teamLabel } from '../format';
import { LOCALES, localePath, type Locale } from '../i18n';

export const PROJECTION_SCHEMA_VERSION = 1;

type PerLocale<T> = Record<Locale, T>;

export interface ProjectedFact {
  key: string;
  value: PerLocale<string>;
  label: Localized;
  condition: Localized;
}

export interface ProjectedSection {
  id: string;
  title: string;
  text: string;
  /** Keys of the facts whose values appear in this section, so their conditions travel with them. */
  facts: string[];
  /** Root-relative page path with the locale prefix and the section anchor. */
  path: string;
}

export interface ProjectedProject {
  slug: string;
  title: Localized;
  subtitle: Localized;
  summary: Localized;
  focus: { primary: string; also: string[] };
  status: PerLocale<string>;
  statusNote?: Localized;
  team: PerLocale<string>;
  teamSize: number;
  role: Localized;
  context: Localized;
  period: PerLocale<string>;
  stack: string[];
  links: { kind: string; url: string; label: Localized }[];
  card?: { intro: Localized; highlight?: Localized; status?: Localized };
  facts: ProjectedFact[];
  path: PerLocale<string>;
  sections: PerLocale<ProjectedSection[]>;
}

export interface ProjectedPage {
  path: PerLocale<string>;
  sections: PerLocale<ProjectedSection[]>;
}

export interface PublicProjection {
  schemaVersion: number;
  locales: readonly Locale[];
  /** Catalog order: the only projects that exist for the assistant. */
  order: string[];
  focus: { id: string; title: Localized; description: Localized }[];
  profile: {
    name: Localized;
    headline: Localized;
    email: string;
    links: { label: Localized; url: string }[];
    education: { school: Localized; degree: Localized; location: Localized; period: PerLocale<string>; details: Localized[] }[];
    experience: { org: Localized; role: Localized; location: Localized; period: PerLocale<string>; bullets: Localized[] }[];
    highlights: { project: string; fact: ProjectedFact }[];
    skills: { group: Localized; items: { name: PerLocale<string>; evidence: string[] }[] }[];
    path: PerLocale<string>;
  };
  projects: ProjectedProject[];
  pages: { background: ProjectedPage; plan: ProjectedPage };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** Plain text of rendered section HTML: block elements become line breaks, list items keep a bullet. */
export function htmlToText(html: string): string {
  return html
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|li|h[1-6]|tr|div|blockquote|pre|ul|ol|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, name: string) => {
      if (ENTITIES[name] !== undefined) return ENTITIES[name];
      if (/^#\d+$/.test(name)) return String.fromCodePoint(Number(name.slice(1)));
      return m;
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function projectFact(key: string, f: Fact): ProjectedFact {
  return {
    key,
    value: { en: termText(f.value, 'en'), zh: termText(f.value, 'zh') },
    label: { en: f.label.en, zh: f.label.zh },
    condition: { en: f.condition.en, zh: f.condition.zh },
  };
}

function localized(l: Localized): Localized {
  return { en: l.en, zh: l.zh };
}

function perLocale<T>(fn: (locale: Locale) => T): PerLocale<T> {
  return { en: fn('en'), zh: fn('zh') };
}

/** Facts rendered into a section are wrapped in <span class="fact">; match them back to their keys. */
function factsIn(html: string, facts: ProjectedFact[], locale: Locale): string[] {
  const shown = new Set([...html.matchAll(/<span class="fact">([^<]*)<\/span>/g)].map((m) => htmlToText(m[1])));
  return facts.filter((f) => shown.has(f.value[locale])).map((f) => f.key);
}

function sections(list: RenderedSection[], locale: Locale, pagePath: string, facts: ProjectedFact[] = []): ProjectedSection[] {
  return list.map((s) => ({
    id: s.id,
    title: s.title,
    text: htmlToText(s.html),
    facts: factsIn(s.html, facts, locale),
    path: `${localePath(locale, pagePath)}#${s.id}`,
  }));
}

function projectProject(p: Project): ProjectedProject {
  const m = p.meta;
  const facts = Object.entries(m.facts).map(([k, f]) => projectFact(k, f));
  const pagePath = `/projects/${m.slug}/`;
  return {
    slug: m.slug,
    title: localized(m.title),
    subtitle: localized(m.subtitle),
    summary: localized(m.summary),
    focus: { primary: m.focus.primary, also: [...m.focus.also] },
    status: perLocale((l) => statusLabel(m.status, m.team, l)),
    statusNote: m.status_note ? localized(m.status_note) : undefined,
    team: perLocale((l) => teamLabel(m.team, l)),
    teamSize: m.team.size,
    role: localized(m.role),
    context: localized(m.context),
    period: perLocale((l) => formatPeriod(m.period, l)),
    stack: [...m.stack],
    links: m.links.map((l) => ({ kind: l.kind, url: l.url, label: localized(l.label) })),
    card: m.card
      ? {
          intro: localized(m.card.intro),
          highlight: m.card.highlight ? localized(m.card.highlight) : undefined,
          status: m.card.status ? localized(m.card.status) : undefined,
        }
      : undefined,
    facts,
    path: perLocale((l) => localePath(l, pagePath)),
    sections: perLocale((l) => sections(p.sections[l], l, pagePath, facts)),
  };
}

export function publicProjection(content: Content): PublicProjection {
  const { profile, catalog, projects, focus, pages } = content;
  const allFacts = new Map<string, ProjectedFact>();
  for (const p of catalog) for (const [k, f] of Object.entries(p.meta.facts)) allFacts.set(`${p.meta.slug}.${k}`, projectFact(k, f));
  const pageFacts = [...allFacts.values()];
  const page = (path: string, s: Record<Locale, RenderedSection[]>): ProjectedPage => ({
    path: perLocale((l) => localePath(l, path)),
    sections: perLocale((l) => sections(s[l], l, path, pageFacts)),
  });

  return {
    schemaVersion: PROJECTION_SCHEMA_VERSION,
    locales: LOCALES,
    order: catalog.map((p) => p.meta.slug),
    focus: focus.map((f) => ({ id: f.id, title: localized(f.title), description: localized(f.description) })),
    profile: {
      name: localized(profile.name),
      headline: localized(profile.headline),
      email: profile.contact.email,
      links: profile.links.map((l) => ({ label: localized(l.label), url: l.url })),
      education: profile.education.map((e) => ({
        school: localized(e.school),
        degree: localized(e.degree),
        location: localized(e.location),
        period: perLocale((l) => formatPeriod(e.period, l)),
        details: e.details.map(localized),
      })),
      experience: profile.experience.map((e) => ({
        org: localized(e.org),
        role: localized(e.role),
        location: localized(e.location),
        period: perLocale((l) => formatPeriod(e.period, l)),
        bullets: e.bullets.map(localized),
      })),
      highlights: profile.highlights
        .filter((h) => projects.has(h.project))
        .map((h) => ({ project: h.project, fact: projectFact(h.fact, projects.get(h.project)!.meta.facts[h.fact]) })),
      skills: profile.skills.map((g) => ({
        group: localized(g.group),
        items: g.items.map((i) => ({ name: perLocale((l) => termText(i.name, l)), evidence: i.evidence.filter((s) => projects.has(s)) })),
      })),
      path: perLocale((l) => localePath(l, '/resume/')),
    },
    projects: catalog.map(projectProject),
    pages: {
      background: page('/background/', pages.background.sections),
      plan: page('/plan-and-design/', pages.plan.sections),
    },
  };
}
