# content/ — site content

**Status:** full content model (ADR-011, ADR-015). The build reads only this folder and `src/`; see
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) for how it is rendered and validated.

## Layout

```text
content/
├── tracks.yaml                 track order, cross-listing, featured projects
├── profile.yaml                résumé data
├── site/{en,zh}.yaml           UI strings (identical keys)
├── pages/about/                en.md, zh.md
├── pages/plan-and-design/      meta.yaml (roadmaps, records, thumbnails), en.md, zh.md
└── projects/<slug>/            meta.yaml, en.md, zh.md, ASSETS.md, assets/
```

## Writing a project module

- **`meta.yaml`** holds every language-neutral fact: tracks, status label, team, period, stack, links, facts,
  figures and the roadmap. Localized strings are `{ en: …, zh: … }`; quote values that contain commas or colons.
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

| Module | Track | Assets |
|---|---|---|
| `kk-knock` | SDE, Cloud & LLM | Screenshots and widget art from the public product page; two CURRENT diagrams |
| `distributed-llm` | Cloud & LLM | One CURRENT diagram |
| `cloud-native` | Cloud & LLM, SDE | Two CURRENT diagrams |
| `personal-writing-lora` | Cloud & LLM, SDE | Three wireframes and an ER sketch (HISTORICAL), three CURRENT diagrams, one PROPOSED diagram |
| `f1-bayesian` | Data Science & Finance | Two CURRENT diagrams, two result plots |
| `quant-ai` | Data Science & Finance | One CURRENT diagram |
| `equipment-assignment` | SDE | One CURRENT diagram |
| `enterprise-workflow` | SDE | One CURRENT class diagram |
| `smartbuyer` | SDE | — |
| `info6105-methods` | Data Science & Finance | — |
