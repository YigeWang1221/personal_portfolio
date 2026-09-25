# content/ — site content

**Status:** full content model (ADR-011, ADR-015). The build reads only this folder and `src/`; see
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) for how it is rendered and validated.

## Layout

```text
content/
├── catalog.yaml                capability filters, featured / more / catalog order, home capability entries
├── profile.yaml                résumé data
├── site/{en,zh}.yaml           UI strings (identical keys)
├── pages/background/           en.md, zh.md
├── pages/plan-and-design/      meta.yaml (roadmaps, records, thumbnails), en.md, zh.md
└── projects/<slug>/            meta.yaml, en.md, zh.md, ASSETS.md, assets/
```

## Writing a project module

- **`meta.yaml`** holds every language-neutral fact: capabilities (`focus`), status label and note, team, period,
  stack, links, facts, figures and the roadmap.
- **Featured projects** also carry `overview` (problem, contributions, outcome) and `card` (key question, one-line
  contribution, at most three editor-chosen technologies, the `#anchor` the main link opens, and either a page
  `figure` or a short `steps` list labeled like a diagram). Write these by hand; never derive them from `stack`.
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
| `kk-knock` | Planning & Delivery, Backend & Cloud | Screenshots and widget art from the public product page; three CURRENT diagrams |
| `enterprise-workflow` | Business modeling | Two CURRENT diagrams (donation flow, partial class diagram) |
| `cloud-native` | Backend & Cloud | Two CURRENT diagrams |
| `personal-writing-lora` | Planning & Delivery, Backend & Cloud, AI & Research | Two wireframes and an ER sketch (HISTORICAL), two CURRENT diagrams, one PROPOSED diagram |
| `distributed-llm` | AI & Research, Backend & Cloud | One CURRENT diagram |
| `equipment-assignment` | Backend & Cloud, Business modeling | One CURRENT diagram |
| `f1-bayesian` | AI & Research | Two CURRENT diagrams, two result plots |
| `smartbuyer` | Backend & Cloud | — |
| `quant-ai` | AI & Research | One CURRENT diagram |
| `info6105-methods` | AI & Research | — |
