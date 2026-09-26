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
/** Capability views of the project catalog (ADR-016). They replace the three tracks of ADR-006. */
export const FOCUS_IDS = ['business-modeling', 'backend-cloud', 'planning-delivery', 'ai-research'] as const;
export const focusId = z.enum(FOCUS_IDS);
export type FocusId = z.infer<typeof focusId>;

/** Status labels from docs/style/GLOSSARY.md. */
export const STATUS_KEYS = [
  'self-hosted-pilot',
  'in-development',
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
        /** Short caption under the screen, e.g. "1 · Speak". */
        label: localized.optional(),
      }),
    )
    .min(1),
});

/**
 * A small bar chart drawn as inline SVG from measured values. Bar geometry comes from the ledger row named in
 * `claim`; every printed number is a fact of the project (`fact`) or a plain baseline text (`text`), so the chart
 * cannot show a value that the page does not state with its conditions.
 */
export const chartFigure = z.strictObject({
  ...figureCommon,
  kind: z.literal('chart'),
  title: localized,
  alt: localized,
  panels: z
    .array(
      z.strictObject({
        title: localized,
        /** e.g. "higher is better". */
        note: localized.optional(),
        claim: z.string().regex(/^[A-Z0-9]+-\d{2}$/, 'ledger claim ID such as HPC-05'),
        /** Right end of the axis. */
        max: z.number().positive(),
        reference: z.strictObject({ value: z.number().positive(), label: localized }).optional(),
        bars: z
          .array(
            z.strictObject({
              x: term,
              value: z.number().nonnegative(),
              /** Upper end when the value is a range. */
              high: z.number().positive().optional(),
              fact: z.string().regex(/^[a-z0-9_]+$/).optional(),
              text: term.optional(),
            }),
          )
          .min(1)
          .max(6),
      }),
    )
    .min(1)
    .max(2),
});

export const figure = z.discriminatedUnion('kind', [diagramFigure, imageFigure, screensFigure, chartFigure]);
export type Figure = z.infer<typeof figure>;
export type ChartFigure = z.infer<typeof chartFigure>;

export const link = z.strictObject({
  /**
   * product → a product introduction page; demo → something that runs; video → a recorded demo; code → a source
   * repository (grouped under "Source"). Case studies are always the site's own project page.
   */
  kind: z.enum(['code', 'product', 'demo', 'video']),
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

/** Editor-written card copy for the home page. Nothing here is derived automatically. */
export const card = z.strictObject({
  /** One or two natural sentences: what it does for someone, then what I did. */
  intro: localized,
  /** One engineering point worth opening the case study for. No bare measurements. */
  highlight: localized.optional(),
  /** Optional concrete responsibility list for work that needs more than one highlight. */
  bullets: z.array(localized).min(1).max(5).optional(),
  /** Short status for the card, when the page's status note is too long for it. */
  status: localized.optional(),
  /** At most three technologies, chosen by the editor (not the first items of `stack`). */
  tech: z.array(z.string().min(1)).min(1).max(3),
  /** Label of the main link into the case study. */
  cta: localized.optional(),
  /** Section or sub-heading of the case study the main link opens. */
  anchor: slug.optional(),
  /** Figure of the page shown next to the card… */
  figure: slug.optional(),
  /** …or a short flow drawn as HTML (a schematic of the implementation, labeled like a diagram). */
  steps: z
    .strictObject({
      label: assetLabel,
      items: z.array(z.strictObject({ title: localized, detail: term.optional() })).min(3).max(5),
      note: localized.optional(),
    })
    .optional(),
});

export const projectMeta = z.strictObject({
  slug,
  title: localized,
  /** One line on what the project does. */
  subtitle: localized,
  /** Two or three sentences for the page description (search results, link previews). */
  summary: localized,
  /** Capability membership (ADR-016). Order lives in content/catalog.yaml. */
  focus: z.strictObject({ primary: focusId, also: z.array(focusId).default([]) }),
  status: statusKey,
  /** Plain-language qualifier shown next to the status, e.g. what has not been validated. */
  status_note: localized.optional(),
  /** size = people on the team; mixed = coursework done partly alone and partly in pairs. */
  team: z.strictObject({ size: z.number().int().min(1), mixed: z.boolean().optional() }),
  /** The one statement of my responsibility on the page: what I owned, what was shared, how AI tools were used. */
  role: localized,
  context: localized,
  period,
  stack: z.array(z.string().min(1)).min(1),
  links: z.array(link).default([]),
  /** Fact keys shown near the top of the case study. */
  highlights: z.array(z.string()).max(4).default([]),
  /** Figure shown right under the page header (product screens, a key chart or an architecture preview). */
  lead: slug.optional(),
  card: card.optional(),
  /** One related case study, linked at the end of the page. */
  related: slug.optional(),
  /** Retired section ids → the section that replaced them, so old #anchors keep landing in the right place. */
  anchor_aliases: z.record(slug, slug).default({}),
  facts: z.record(z.string().regex(/^[a-z0-9_]+$/), fact).default({}),
  figures: z.array(figure).default([]),
  roadmap: roadmap.optional(),
  /** First section of the deep-dive layer. */
  deep_dive_from: slug.optional(),
});
export type ProjectMeta = z.infer<typeof projectMeta>;

export const catalogFile = z.strictObject({
  /** Filters of the project catalog, in display order. */
  focus: z
    .array(z.strictObject({ id: focusId, title: localized, description: localized }))
    .length(FOCUS_IDS.length),
  /** Home page, in reading order (ADR-017). */
  home: z.strictObject({
    /** The one project the home page leads with. */
    flagship: slug,
    /** The main case studies right after it. */
    cases: z.array(slug).min(1).max(3),
    /** Smaller cards for work in progress or exploration. */
    exploring: z.array(slug).max(2).default([]),
    /** A compact list of further projects. */
    more: z.array(slug).max(4).default([]),
  }),
  /** Catalog order of every published project; the only place ordering lives (ADR-006, ADR-016). */
  order: z.array(slug).min(1),
});
export type CatalogFile = z.infer<typeof catalogFile>;

export const profileFile = z.strictObject({
  contact: z.strictObject({ email: z.email(), attachment_limit_mb: z.number().int().positive() }),
  name: localized,
  headline: localized,
  /** Date the résumé data was last checked, YYYY-MM-DD. */
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
