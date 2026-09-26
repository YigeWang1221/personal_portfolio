// Loads and validates everything under content/ once per build (ADR-005, ADR-006, ADR-015).
// Any violation is collected and the build fails with the full list.
import type { ImageMetadata } from 'astro';
import { parse as parseYaml } from 'yaml';
import { LOCALES, type Locale } from '../i18n';
import {
  factRefs,
  metricViolations,
  renderSection,
  splitSections,
  type RawSection,
  type RenderedSection,
} from './markdown';
import {
  type AssetLabel,
  type CatalogFile,
  type ChartFigure,
  catalogFile,
  planPageMeta,
  profileFile,
  projectMeta,
  type Fact,
  type FocusId,
  type Localized,
  type Term,
  type PlanPageMeta,
  type ProfileFile,
  type ProjectMeta,
} from './schema';

const RAW = import.meta.glob('/content/**/*.{yaml,md,mmd}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const RASTERS = import.meta.glob('/content/**/assets/**/*.{png,jpg,jpeg,webp}', {
  import: 'default',
  eager: true,
}) as Record<string, ImageMetadata>;
const SVG_URLS = import.meta.glob('/content/**/assets/**/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const SVG_RAW = import.meta.glob('/content/**/assets/**/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface SvgAsset {
  url: string;
  width: number;
  height: number;
}

export type ResolvedFigure =
  | {
      kind: 'diagram' | 'image';
      id: string;
      section: string;
      label?: AssetLabel;
      caption: Localized;
      alt: Localized;
      svg?: SvgAsset;
      raster?: ImageMetadata;
    }
  | {
      kind: 'screens';
      id: string;
      section: string;
      caption: Localized;
      items: { image: Record<Locale, ImageMetadata>; alt: Localized; label?: Localized }[];
    }
  | (Omit<ChartFigure, 'panels'> & {
      panels: (Omit<ChartFigure['panels'][number], 'bars'> & {
        bars: (ChartFigure['panels'][number]['bars'][number] & { display: Term })[];
      })[];
    });

export interface Project {
  meta: ProjectMeta;
  sections: Record<Locale, RenderedSection[]>;
  figures: ResolvedFigure[];
  /** The page figure shown next to a featured card, when the card has no step list. */
  cardFigure?: ResolvedFigure;
  /** Primary capability first, then the others. */
  focusIds: FocusId[];
}

export interface Focus {
  id: FocusId;
  title: Localized;
  description: Localized;
}

export interface Page {
  sections: Record<Locale, RenderedSection[]>;
}

export interface Content {
  focus: Focus[];
  /** Every published project, in catalog order. */
  catalog: Project[];
  /** Home page sections, in reading order (ADR-017). */
  home: { flagship: Project; cases: Project[]; exploring: Project[]; more: Project[] };
  /** Projects presented as selected case studies (flagship and cases). */
  featured: Project[];
  projects: Map<string, Project>;
  profile: ProfileFile;
  strings: Record<Locale, Record<string, string>>;
  pages: {
    background: Page;
    plan: Page & { meta: PlanPageMeta };
  };
}

/** Section and sub-heading ids of a project, for anchor checks. */
export function projectAnchors(p: Project): Set<string> {
  return new Set(p.sections.en.flatMap((s) => [s.id, ...s.subIds]));
}

// ---------------------------------------------------------------------------------------------------

function readRaw(path: string, errors: string[]): string | null {
  const text = RAW[path];
  if (text === undefined) {
    errors.push(`missing file: ${path.slice(1)}`);
    return null;
  }
  return text;
}

function readYaml(path: string, errors: string[]): unknown {
  const text = readRaw(path, errors);
  if (text === null) return undefined;
  try {
    return parseYaml(text);
  } catch (e) {
    errors.push(`${path.slice(1)}: invalid YAML: ${(e as Error).message}`);
    return undefined;
  }
}

function validate<T>(schema: { safeParse(v: unknown): { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown, file: string, errors: string[]): T | null {
  const result = schema.safeParse(value);
  if (result.success) return result.data as T;
  for (const issue of result.error?.issues ?? []) {
    errors.push(`${file}: ${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`);
  }
  return null;
}

function flatten(obj: unknown, prefix = '', out: Record<string, string> = {}, file: string, errors: string[]): Record<string, string> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out, file, errors);
    }
  } else if (typeof obj === 'string' && obj.trim()) {
    out[prefix] = obj;
  } else {
    errors.push(`${file}: "${prefix}" must be a non-empty string`);
  }
  return out;
}

function svgAsset(path: string, errors: string[]): SvgAsset | undefined {
  const url = SVG_URLS[path];
  const raw = SVG_RAW[path];
  if (!url || raw === undefined) {
    errors.push(`missing asset: ${path.slice(1)}`);
    return undefined;
  }
  const viewBox = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(raw);
  if (!viewBox) {
    errors.push(`${path.slice(1)}: SVG needs a viewBox so its size can be set`);
    return undefined;
  }
  if (/<script\b/i.test(raw) || /\son[a-z]+\s*=/i.test(raw)) {
    errors.push(`${path.slice(1)}: SVG must not contain scripts or event handlers`);
  }
  return { url, width: Math.round(Number(viewBox[1])), height: Math.round(Number(viewBox[2])) };
}

function raster(path: string, errors: string[]): ImageMetadata | undefined {
  const img = RASTERS[path];
  if (!img) errors.push(`missing asset: ${path.slice(1)}`);
  return img;
}

interface ModuleSources {
  name: string;
  raw: Record<Locale, RawSection[]>;
}

/** Section structure and fact references must match across languages (ADR-005). */
function checkParity(mod: ModuleSources, errors: string[]) {
  const en = mod.raw.en.map((s) => s.id);
  const zh = mod.raw.zh.map((s) => s.id);
  if (en.join('|') !== zh.join('|')) {
    errors.push(`${mod.name}: section ids differ between languages\n    en: ${en.join(', ')}\n    zh: ${zh.join(', ')}`);
  }
  const refs = (loc: Locale) => new Set(mod.raw[loc].flatMap((s) => factRefs(s.body)));
  const enRefs = refs('en');
  const zhRefs = refs('zh');
  const onlyEn = [...enRefs].filter((k) => !zhRefs.has(k));
  const onlyZh = [...zhRefs].filter((k) => !enRefs.has(k));
  if (onlyEn.length || onlyZh.length) {
    errors.push(`${mod.name}: facts referenced in one language only (en only: ${onlyEn.join(', ') || '—'}; zh only: ${onlyZh.join(', ') || '—'})`);
  }
  for (const loc of LOCALES) {
    for (const s of mod.raw[loc]) {
      const hits = metricViolations(`${s.title}\n${s.body}`);
      for (const h of hits) {
        errors.push(`${mod.name}/${loc}.md section "${s.id}": measurement outside a {{fact:…}} reference: ${h}`);
      }
    }
  }
}

function checkSubheadingParity(name: string, sections: Record<Locale, RenderedSection[]>, errors: string[]) {
  const byId = (loc: Locale) => new Map(sections[loc].map((s) => [s.id, s.subIds.join('|')]));
  const en = byId('en');
  const zh = byId('zh');
  for (const [id, ids] of en) {
    if (zh.has(id) && zh.get(id) !== ids) {
      errors.push(`${name}: sub-heading ids differ in section "${id}" (en: ${ids || '—'}; zh: ${zh.get(id) || '—'})`);
    }
  }
}

function loadSections(dir: string, name: string, facts: Record<string, Fact>, errors: string[]): { raw: Record<Locale, RawSection[]>; rendered: Record<Locale, RenderedSection[]> } {
  const raw = {} as Record<Locale, RawSection[]>;
  const rendered = {} as Record<Locale, RenderedSection[]>;
  for (const loc of LOCALES) {
    const path = `${dir}/${loc}.md`;
    const text = readRaw(path, errors) ?? '';
    raw[loc] = splitSections(text, path.slice(1), errors);
  }
  checkParity({ name, raw }, errors);
  for (const loc of LOCALES) {
    rendered[loc] = raw[loc].map((s) => renderSection(s, { locale: loc, facts, file: `${dir.slice(1)}/${loc}.md`, errors }));
  }
  checkSubheadingParity(name, rendered, errors);
  return { raw, rendered };
}

function resolveFigures(dir: string, meta: ProjectMeta, sectionIds: Set<string>, errors: string[]): ResolvedFigure[] {
  const figures: ResolvedFigure[] = [];
  const seen = new Set<string>();
  for (const f of meta.figures) {
    const where = `${dir.slice(1)}/meta.yaml figure "${f.id}"`;
    if (seen.has(f.id)) errors.push(`${where}: duplicate figure id`);
    seen.add(f.id);
    if (!sectionIds.has(f.section)) errors.push(`${where}: section "${f.section}" does not exist in the narrative`);
    if (f.kind === 'screens') {
      const items = f.items.map((item) => {
        const image = {} as Record<Locale, ImageMetadata>;
        for (const loc of LOCALES) {
          const img = raster(`${dir}/${item.file[loc]}`, errors);
          if (img) image[loc] = img;
        }
        return { image, alt: item.alt, label: item.label };
      });
      figures.push({ kind: 'screens', id: f.id, section: f.section, caption: f.caption, items });
      continue;
    }
    if (f.kind === 'chart') {
      const panels = f.panels.map((panel, pi) => ({
        ...panel,
        bars: panel.bars.map((bar, bi) => {
          const at = `${where} panel ${pi + 1} bar ${bi + 1}`;
          let display: Term = '';
          if (bar.fact && bar.text) errors.push(`${at}: use "fact" or "text", not both`);
          if (bar.fact) {
            const fact = meta.facts[bar.fact];
            if (!fact) errors.push(`${at}: unknown fact "${bar.fact}"`);
            else display = fact.value;
          } else if (bar.text) display = bar.text;
          else errors.push(`${at}: needs "fact" (a measured value) or "text" (a baseline)`);
          if (Math.max(bar.value, bar.high ?? 0) > panel.max) errors.push(`${at}: value exceeds the panel's "max"`);
          if (bar.high !== undefined && bar.high < bar.value) errors.push(`${at}: "high" is below "value"`);
          return { ...bar, display };
        }),
      }));
      figures.push({ ...f, panels });
      continue;
    }
    if (f.kind === 'diagram' && f.source && RAW[`${dir}/${f.source}`] === undefined) {
      errors.push(`${where}: Mermaid source ${f.source} is missing`);
    }
    const path = `${dir}/${f.file}`;
    const resolved: ResolvedFigure = {
      kind: f.kind,
      id: f.id,
      section: f.section,
      label: f.label,
      caption: f.caption,
      alt: f.alt,
    };
    if (f.file.endsWith('.svg')) resolved.svg = svgAsset(path, errors);
    else resolved.raster = raster(path, errors);
    figures.push(resolved);
  }
  return figures;
}

function buildContent(): Content {
  const errors: string[] = [];

  // UI strings --------------------------------------------------------------------------------------
  const strings = {} as Record<Locale, Record<string, string>>;
  for (const loc of LOCALES) {
    const path = `/content/site/${loc}.yaml`;
    strings[loc] = flatten(readYaml(path, errors), '', {}, path.slice(1), errors);
  }
  const enKeys = Object.keys(strings.en);
  const zhKeys = new Set(Object.keys(strings.zh));
  const missingZh = enKeys.filter((k) => !zhKeys.has(k));
  const missingEn = [...zhKeys].filter((k) => !(k in strings.en));
  if (missingZh.length) errors.push(`content/site/zh.yaml is missing keys: ${missingZh.join(', ')}`);
  if (missingEn.length) errors.push(`content/site/en.yaml is missing keys: ${missingEn.join(', ')}`);

  // Catalog registry ----------------------------------------------------------------------------------
  const registry = validate<CatalogFile>(catalogFile, readYaml('/content/catalog.yaml', errors), 'content/catalog.yaml', errors);

  // Project modules -----------------------------------------------------------------------------------
  const metaPaths = Object.keys(RAW).filter((p) => /^\/content\/projects\/[^/]+\/meta\.yaml$/.test(p));
  const listed = new Set(registry?.order ?? []);
  if (registry && listed.size !== registry.order.length) errors.push('content/catalog.yaml: "order" lists a project twice');
  const projects = new Map<string, Project>();
  for (const metaPath of metaPaths.sort()) {
    const dir = metaPath.replace(/\/meta\.yaml$/, '');
    const folder = dir.split('/').pop()!;
    if (!listed.has(folder)) continue; // hidden: the module stays, the site skips it (ADR-006)
    const meta = validate(projectMeta, readYaml(metaPath, errors), metaPath.slice(1), errors);
    if (!meta) continue;
    if (meta.slug !== folder) errors.push(`${metaPath.slice(1)}: slug "${meta.slug}" must match its folder name`);
    for (const h of meta.highlights) {
      if (!meta.facts[h]) errors.push(`${metaPath.slice(1)}: highlight "${h}" is not a fact`);
    }
    const { rendered } = loadSections(dir, `content/projects/${folder}`, meta.facts, errors);
    const sectionIds = new Set(rendered.en.map((s) => s.id));
    if (meta.roadmap && !sectionIds.has(meta.roadmap.section)) {
      errors.push(`${metaPath.slice(1)}: roadmap section "${meta.roadmap.section}" is not a section`);
    }
    if (meta.deep_dive_from && !sectionIds.has(meta.deep_dive_from)) {
      errors.push(`${metaPath.slice(1)}: deep_dive_from "${meta.deep_dive_from}" is not a section`);
    }
    const figures = resolveFigures(dir, meta, sectionIds, errors);
    if (meta.lead && !figures.some((f) => f.id === meta.lead)) {
      errors.push(`${metaPath.slice(1)}: lead figure "${meta.lead}" is not a figure of the project`);
    }
    if (meta.card) {
      for (const loc of LOCALES) {
        const text = [meta.card.intro[loc], meta.card.highlight?.[loc] ?? '', meta.card.status?.[loc] ?? ''].join('\n');
        for (const h of metricViolations(text)) errors.push(`${metaPath.slice(1)} card (${loc}): measurement in card text: ${h}`);
      }
    }
    let cardFigure: ResolvedFigure | undefined;
    if (meta.card?.figure && meta.card.steps) {
      errors.push(`${metaPath.slice(1)}: card has both "figure" and "steps"; use one`);
    } else if (meta.card?.figure) {
      cardFigure = figures.find((f) => f.id === meta.card!.figure);
      if (!cardFigure) errors.push(`${metaPath.slice(1)}: card figure "${meta.card.figure}" is not a figure of the project`);
    }
    const focusIds = [meta.focus.primary, ...meta.focus.also.filter((f) => f !== meta.focus.primary)];
    projects.set(meta.slug, { meta, sections: rendered, figures, cardFigure, focusIds });
  }
  for (const slug of listed) {
    if (!projects.has(slug) && !metaPaths.includes(`/content/projects/${slug}/meta.yaml`)) {
      errors.push(`content/catalog.yaml lists "${slug}", but content/projects/${slug}/meta.yaml does not exist`);
    }
  }

  // Catalog: membership lives in meta.yaml, order lives in catalog.yaml (ADR-006, ADR-016) -------------
  const catalog = (registry?.order ?? []).map((slug) => projects.get(slug)).filter((p): p is Project => Boolean(p));
  const pick = (list: string[], what: string) =>
    list
      .map((slug) => {
        const p = projects.get(slug);
        if (!p) errors.push(`content/catalog.yaml: ${what} project "${slug}" is not in "order"`);
        return p;
      })
      .filter((p): p is Project => Boolean(p));
  const homeCfg = registry?.home;
  const [flagship] = pick(homeCfg ? [homeCfg.flagship] : [], 'flagship');
  const cases = pick(homeCfg?.cases ?? [], 'case');
  const exploring = pick(homeCfg?.exploring ?? [], '"exploring"');
  const more = pick(homeCfg?.more ?? [], '"more"');
  const onHome = [flagship, ...cases, ...exploring, ...more].filter(Boolean);
  if (new Set(onHome).size !== onHome.length) errors.push('content/catalog.yaml: a project appears twice on the home page');
  for (const p of [flagship, ...cases].filter((x): x is Project => Boolean(x))) {
    const where = `content/projects/${p.meta.slug}/meta.yaml`;
    if (!p.meta.card) errors.push(`${where}: a home-page case study needs "card"`);
    else if (!p.cardFigure && !p.meta.card.steps) errors.push(`${where}: a home-page case study needs "card.figure" or "card.steps"`);
  }
  for (const p of exploring) {
    if (!p.meta.card) errors.push(`content/projects/${p.meta.slug}/meta.yaml: an "exploring" project needs "card"`);
  }
  for (const p of projects.values()) {
    const where = `content/projects/${p.meta.slug}/meta.yaml`;
    if (p.meta.card?.anchor && !projectAnchors(p).has(p.meta.card.anchor)) {
      errors.push(`${where}: card anchor "#${p.meta.card.anchor}" is not a section or sub-heading`);
    }
    const anchors = projectAnchors(p);
    for (const [alias, target] of Object.entries(p.meta.anchor_aliases)) {
      if (anchors.has(alias)) errors.push(`${where}: anchor alias "${alias}" is still a section or sub-heading id`);
      if (!p.sections.en.some((s) => s.id === target)) errors.push(`${where}: anchor alias "${alias}" points to missing section "${target}"`);
    }
    if (p.meta.related && (!projects.has(p.meta.related) || p.meta.related === p.meta.slug)) {
      errors.push(`${where}: related project "${p.meta.related}" is not another published project`);
    }
  }
  const focus = registry?.focus ?? [];

  // All project facts, addressable from page narratives as {{fact:slug.key}} ---------------------------
  const allFacts: Record<string, Fact> = {};
  for (const p of projects.values()) {
    for (const [k, f] of Object.entries(p.meta.facts)) allFacts[`${p.meta.slug}.${k}`] = f;
  }

  // Profile -------------------------------------------------------------------------------------------
  const profile = validate(profileFile, readYaml('/content/profile.yaml', errors), 'content/profile.yaml', errors);
  if (profile) {
    for (const group of profile.skills) {
      for (const item of group.items) {
        for (const slug of item.evidence) {
          if (!projects.has(slug)) errors.push(`content/profile.yaml: skill "${termText(item.name, 'en')}" cites unpublished project "${slug}"`);
        }
      }
    }
    for (const h of profile.highlights) {
      if (!projects.get(h.project)?.meta.facts[h.fact]) {
        errors.push(`content/profile.yaml: highlight ${h.project}.${h.fact} is not a fact`);
      }
    }
  }

  // Pages ---------------------------------------------------------------------------------------------
  const background = loadSections('/content/pages/background', 'content/pages/background', allFacts, errors).rendered;
  const planMeta = validate(planPageMeta, readYaml('/content/pages/plan-and-design/meta.yaml', errors), 'content/pages/plan-and-design/meta.yaml', errors);
  const plan = loadSections('/content/pages/plan-and-design', 'content/pages/plan-and-design', allFacts, errors).rendered;
  if (planMeta) {
    const planIds = new Set(plan.en.map((s) => s.id));
    for (const slug of planMeta.roadmaps) {
      if (!projects.get(slug)?.meta.roadmap) errors.push(`plan-and-design/meta.yaml: "${slug}" has no roadmap`);
    }
    for (const r of planMeta.records) {
      if (!planIds.has(r.id)) errors.push(`plan-and-design/meta.yaml: record "${r.id}" is not a section of the page`);
      const p = projects.get(r.project);
      const anchors = p ? projectAnchors(p) : new Set<string>();
      if (!anchors.has(r.anchor)) errors.push(`plan-and-design/meta.yaml: record "${r.id}" points to missing anchor ${r.project}#${r.anchor}`);
    }
    for (const th of planMeta.thumbnails) {
      const fig = projects.get(th.project)?.figures.find((f) => f.id === th.figure);
      if (!fig || fig.kind === 'screens' || fig.kind === 'chart') errors.push(`plan-and-design/meta.yaml: thumbnail ${th.project}/${th.figure} is not a diagram`);
    }
  }

  if (errors.length) {
    throw new Error(`Content validation failed (${errors.length}):\n- ${errors.join('\n- ')}`);
  }
  return {
    focus,
    catalog,
    home: { flagship: flagship!, cases, exploring, more },
    featured: [flagship, ...cases].filter((x): x is Project => Boolean(x)),
    projects,
    profile: profile!,
    strings,
    pages: { background: { sections: background }, plan: { sections: plan, meta: planMeta! } },
  };
}

let cached: Content | undefined;

export function getContent(): Content {
  cached ??= buildContent();
  return cached;
}

/** Display text of a term: plain strings are shared by both languages. */
export function termText(value: Term, locale: Locale): string {
  return typeof value === 'string' ? value : value[locale];
}

/** UI string lookup with {name} placeholders. */
export function t(locale: Locale, key: string, vars: Record<string, string | number> = {}): string {
  const value = getContent().strings[locale][key];
  if (value === undefined) throw new Error(`Missing UI string "${key}" (${locale})`);
  return value.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
