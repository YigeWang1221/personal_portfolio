# content/ — site content

**Status:** full content model (ADR-011, ADR-015). The build reads only this folder and `src/`; see
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) for how it is rendered and validated.

## Layout

```text
content/
├── catalog.yaml                capability filters, home-page slots (flagship / cases / exploring / more), catalog order
├── profile.yaml                résumé data
├── site/{en,zh}.yaml           UI strings (identical keys)
├── pages/background/           en.md, zh.md
├── pages/plan-and-design/      meta.yaml (roadmaps, records, thumbnails), en.md, zh.md
├── projects/<slug>/            meta.yaml, en.md, zh.md, ASSETS.md, assets/
└── ai/                         AI assistant prompts and retrieval aliases (ADR-022), see "AI assistant" below
```

## Writing a project module

- **`meta.yaml`** holds every language-neutral fact: capabilities (`focus`), status label and note, team, period,
  stack, links, facts, figures and the roadmap.
- **`role`** is the one statement of my responsibility on the page (owned / shared / AI assistance). Narratives do
  not repeat it. **`lead`** names the figure shown under the page header.
- **Home-page projects** also carry `card`: a short `intro` (my responsibilities and concrete work, with brief project context), one contribution-focused `highlight` or optional `bullets` for distinct responsibilities, an
  optional short `status`, at most three editor-chosen technologies, the `#anchor` the main link opens, and — for
  the flagship and the cases — either a page `figure` or a short `steps` flow labeled like a diagram. Write these by
  hand; never derive them from `stack`. Card text may not contain bare measurements.
- **Charts** (`kind: chart`) are small bar charts drawn from values in `meta.yaml`. Each panel names its ledger
  `claim`; each bar prints a project `fact` or a baseline `text`, so no chart shows a number the page does not state.
- **Anchors.** When a section id is retired, add it to `anchor_aliases` with the section that replaced it. Localized strings are `{ en: …, zh: … }`; quote values that contain commas or colons.
- **Facts.** Each fact has a `value` (a string, or `{ en, zh }` when the unit is a word), a `label`, a `condition`
  and the internal ledger `claim` ID it comes from. Only ledger rows marked `Public use: Use` may become facts
  (AGENTS.md).
- **Narratives.** `en.md` and `zh.md` contain only `## Title {#id}` sections, with the same ids in the same order.
  `###` headings may carry `{#id}` too. Reference numbers as `{{fact:key}}`; the build rejects measurements written
  directly into the text, raw HTML and inline images.
- **Links** inside narratives are root-relative (`/projects/f1-bayesian/`) and get the `/zh` prefix automatically, or
  absolute `https://` URLs.
- **Figures** are declared in `meta.yaml` and attached to a section. Each diagram carries exactly one label.

## Asset labels

Every staged asset carries exactly one label, both in its manifest row and inside the asset itself:

| Label | Meaning | Where it may appear |
|---|---|---|
| `CURRENT` | Matches the implementation as it exists | Architecture sections |
| `PROPOSED` | Designed but not implemented or not deployed | "Designed / next" sections, clearly marked |
| `HISTORICAL` | An earlier design artifact (sketch, wireframe) that the current design grew out of | Design-process sections only ("how it was planned"). Never shown as the current architecture |

Screenshots and result plots show shipped UI or published results; they carry no label.

## Rules

- **Public-safe only.** Every tracked file must be safe to publish:
  - no secrets, account IDs, private IPs or internal hostnames;
  - no local paths or personal data;
  - no classmates' names or faces.
- **Provenance without paths.** Describe where an asset came from in general terms (e.g. "owner's design notes").
  The exact source locations are recorded only in the internal source registry.
- **No invented components.** Diagrams must follow the evidence (ADR-008). Render Mermaid sources with
  `npm run diagrams` and commit the SVGs.
- **Delete unused assets** when a page stops using them.

## Modules

| Module | Capabilities | Assets |
|---|---|---|
| `kk-knock` | Planning & Delivery, Backend & Cloud | Screenshots (lead and home card) and widget art from the public product page; three CURRENT diagrams |
| `enterprise-workflow` | Business modeling | Two CURRENT diagrams (donation flow, partial class diagram) |
| `cloud-native` | Backend & Cloud | Two CURRENT diagrams |
| `personal-writing-lora` | Backend & Cloud, AI & Research, Planning & Delivery | Two wireframes and an ER sketch (HISTORICAL), three CURRENT diagrams |
| `distributed-llm` | AI & Research, Backend & Cloud | One CURRENT diagram, one chart drawn from facts |
| `equipment-assignment` | Backend & Cloud, Business modeling | One CURRENT diagram |
| `f1-bayesian` | AI & Research | Two CURRENT diagrams, two result plots |
| `smartbuyer` | Backend & Cloud | — |
| `quant-ai` | AI & Research | One CURRENT diagram |

Home project tabs use `track` on each project (`sde`, `cloud`, `finance-data`); labels and tab order are in `catalog.yaml.tracks`. Project order follows `catalog.yaml.order`.

## AI assistant (`content/ai/`, ADR-022)

The assistant answers only from the site's own pages. `npm run build` derives its knowledge from the modules above
through a field whitelist, so **writing a page is all it takes to teach the assistant**. Nothing in `content/ai/`
holds facts.

```text
content/ai/
├── prompt-order.yaml           assembly order, token budget, what may be dropped (the only place order lives)
├── aliases.yaml                reviewed English ↔ Chinese spellings for retrieval ("backend" ↔ "后端")
├── guard.yaml                  what is refused before any model call (injection, tasks, personal, private)
└── prompts/
    ├── 00-main.md              rules and boundaries
    ├── 10-character.md         tone; front matter "name" is the assistant's name
    ├── 20-owner-persona.md     how to present me (positioning, not facts)
    ├── 30-world-info.md        the wrapper around the retrieved excerpts
    ├── 40-examples.md          example answers, about a fictional project only
    ├── 50-post-history.md      final reminders before the question (must keep "[S…]")
    ├── 60-canned.yaml          fixed replies (personal matters, off-topic, not covered, blocked)
    ├── 70-starters.yaml        suggested questions, three or four per language
    └── local/                  private overlay, git-ignored, used only with PROMPT_LOCAL_OVERRIDES=1
```

- **Prompts say how to answer, never what.** A fact value or anything that looks like a ledger claim ID in a prompt
  file fails the build with its file and line. Example dialogues use a fictional project.
- **Format.** Front matter (`id`, `role`, `enabled`, `max_tokens`, `locales`; `name` in `10-character.md`), then one
  `## en` and one `## zh` section. Each section must fit in `max_tokens`.
- **Variables.**
  - Filled in at build time: `{{char_name}}`, `{{owner_name}}`, `{{owner_contact}}`, `{{canned.<key>}}`.
  - Filled in per request: `{{locale}}`, `{{page_title}}`, and only in `30-world-info.md`, `{{sources}}` and
    `{{low_confidence}}`.
  - Any other `{{…}}` fails the build.
- **Chinese text** has no space between CJK characters and a variable (`与{{owner_name}}确认`). Spaces between CJK
  and Latin text follow `docs/style/BILINGUAL_STYLE.md`.
- **Check a change** with `npm run chat:preview -- --q "…" [--locale zh] [--page /zh/projects/kk-knock/]`. It prints
  the retrieved excerpts and the assembled prompt, and calls no model.
- **Guard rules** (`guard.yaml`): regular expressions per rule, case-insensitive, first match wins. Each rule names
  its fixed reply (a key of `60-canned.yaml`) and whether it counts as misuse. Keep patterns narrow, and add a
  question to both lists in `tests/ai/guard.test.mjs` (must refuse / must pass) whenever you change a rule.
- **Local overlay.** A file in `prompts/local/` replaces the public file of the same name, whole. It goes to the
  same third-party models, so it may not contain anything unpublished. A build that uses it is marked dirty.

