// Schemas for everything under content/ (ARCHITECTURE.md content model, ADR-015).
import { z } from 'astro/zod';

/** A string that must exist in both languages (ADR-005). */
export const localized = z.strictObject({
  en: z.string().trim().min(1),
  zh: z.string().trim().min(1),
});
export type Localized = z.infer<typeof localized>;

/**
 * A term that normally stays in English in both languages (industry-standard names such as
 * "FastAPI" or "Contract-first API"). Use { en, zh } only when a translation reads better.
 */
export const term = z.union([z.string().trim().min(1), localized]);
export type Term = z.infer<typeof term>;

export const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case slug');
export const TRACK_IDS = ['sde', 'cloud-llm', 'ds-finance'] as const;
export const trackId = z.enum(TRACK_IDS);
export type TrackId = z.infer<typeof trackId>;

/** Status labels from docs/style/GLOSSARY.md. */
export const STATUS_KEYS = [
  'self-hosted-pilot',
  'implemented-not-deployed',
  'course-project',
  'course-benchmark',
  'undergraduate-capstone',
  'research-prototype',
  'archived',
] as const;
export const statusKey = z.enum(STATUS_KEYS);
export type StatusKey = z.infer<typeof statusKey>;

/** Asset labels (ADR-008, ADR-011). */
export const assetLabel = z.enum(['CURRENT', 'PROPOSED', 'HISTORICAL']);
export type AssetLabel = z.infer<typeof assetLabel>;

/** "2026-08" or "2020"; the display format is built per locale. */
export const monthOrYear = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'YYYY or YYYY-MM');
export const period = z.strictObject({
  start: monthOrYear,
  end: monthOrYear.nullable(),
  expected: z.boolean().optional(),
});
export type Period = z.infer<typeof period>;

/**
 * A number or outcome shown on the site. Values are language-neutral; every fact cites the internal
 * ledger row that approves it. The claim ID is validated here and never rendered.
 */
export const fact = z.strictObject({
  /** Usually language-neutral ("3.8–4.0×"); { en, zh } when the unit is a word ("14 days" / "14 天"). */
  value: term,
  label: localized,
  condition: localized,
  claim: z.string().regex(/^[A-Z0-9]+-\d{2}$/, 'ledger claim ID such as KK-08'),
});
export type Fact = z.infer<typeof fact>;

const figureCommon = {
  id: slug,
  /** Section of the narrative the figure belongs to. */
  section: slug,
  caption: localized,
};

export const diagramFigure = z.strictObject({
  ...figureCommon,
  kind: z.literal('diagram'),
  /** Rendered SVG, relative to the module folder. */
  file: z.string().regex(/\.svg$/),
  /** Mermaid source, when the SVG is generated (ADR-008). */
  source: z.string().regex(/\.mmd$/).optional(),
  label: assetLabel,
  alt: localized,
});

export const imageFigure = z.strictObject({
  ...figureCommon,
  kind: z.literal('image'),
  file: z.string().regex(/\.(png|jpe?g|webp|svg)$/),
  label: assetLabel.optional(),
  alt: localized,
});

export const screensFigure = z.strictObject({
  ...figureCommon,
  kind: z.literal('screens'),
  items: z
    .array(
      z.strictObject({
        /** One file per language, e.g. localized app screenshots. */
        file: localized,
        alt: localized,
      }),
    )
    .min(1),
});

export const figure = z.discriminatedUnion('kind', [diagramFigure, imageFigure, screensFigure]);
export type Figure = z.infer<typeof figure>;

export const link = z.strictObject({
  kind: z.enum(['code', 'product']),
  url: z.url({ protocol: /^https$/ }),
  label: localized,
});

export const roadmap = z.strictObject({
  /** Narrative section the roadmap is shown in. */
  section: slug,
  title: localized,
  phases: z
    .array(
      z.strictObject({
        name: localized,
        detail: localized.optional(),
        status: z.enum(['done', 'in-progress', 'planned']),
        when: term.optional(),
      }),
    )
    .min(1),
});
export type Roadmap = z.infer<typeof roadmap>;

export const projectMeta = z.strictObject({
  slug,
  title: localized,
  subtitle: localized,
  /** One-line problem for the 30-second scan. */
  summary: localized,
  /** Track membership (ADR-006). Order lives in content/tracks.yaml. */
  tracks: z.strictObject({ primary: trackId, also: z.array(trackId).default([]) }),
  status: statusKey,
  /** size = people on the team; mixed = coursework done partly alone and partly in pairs. */
  team: z.strictObject({ size: z.number().int().min(1), mixed: z.boolean().optional() }),
  role: localized,
  context: localized,
  period,
  stack: z.array(z.string().min(1)).min(1),
  links: z.array(link).default([]),
  /** Fact keys shown in the scan layer. */
  highlights: z.array(z.string()).max(4).default([]),
  facts: z.record(z.string().regex(/^[a-z0-9_]+$/), fact).default({}),
  figures: z.array(figure).default([]),
  roadmap: roadmap.optional(),
  /** First section of the deep-dive layer. */
  deep_dive_from: slug.optional(),
});
export type ProjectMeta = z.infer<typeof projectMeta>;

export const tracksFile = z.strictObject({
  tracks: z
    .array(
      z.strictObject({
        id: trackId,
        title: localized,
        positioning: localized,
        /** Display order; the only place ordering lives (ADR-006). */
        projects: z.array(slug).min(1),
      }),
    )
    .length(TRACK_IDS.length),
  featured: z.array(slug).min(1).max(6),
});
export type TracksFile = z.infer<typeof tracksFile>;

export const profileFile = z.strictObject({
  name: localized,
  headline: localized,
  target_roles: z.array(localized).min(1),
  links: z.array(z.strictObject({ label: localized, url: z.url({ protocol: /^https$/ }) })).min(1),
  education: z
    .array(
      z.strictObject({
        school: localized,
        degree: localized,
        location: localized,
        period,
        details: z.array(localized).default([]),
      }),
    )
    .min(1),
  experience: z
    .array(
      z.strictObject({
        org: localized,
        role: localized,
        location: localized,
        period,
        /** Internship bullets are RESUME-ONLY and restated as written (RESUME_CROSSCHECK §4). */
        bullets: z.array(localized).min(1),
      }),
    )
    .min(1),
  highlights: z.array(z.strictObject({ project: slug, fact: z.string() })).min(3).max(5),
  skills: z
    .array(
      z.strictObject({
        group: localized,
        items: z.array(z.strictObject({ name: term, evidence: z.array(slug).min(1) })).min(1),
      }),
    )
    .min(1),
});
export type ProfileFile = z.infer<typeof profileFile>;

export const planPageMeta = z.strictObject({
  /** Projects whose roadmap is shown side by side, in order. */
  roadmaps: z.array(slug).min(1),
  /** Decision records: section id in the page narrative → the project section it summarizes. */
  records: z
    .array(z.strictObject({ id: slug, project: slug, anchor: slug }))
    .min(1),
  /** Diagrams shown as architecture thumbnails: project slug + figure id. */
  thumbnails: z.array(z.strictObject({ project: slug, figure: slug })).default([]),
});
export type PlanPageMeta = z.infer<typeof planPageMeta>;
