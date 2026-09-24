# content/ — site content skeleton

**Status:** skeleton with staged assets only (ADR-011). No page text, no facts files and no site code exist yet.
Those start after the discovery gate (ADR-009).

## What may live here now

- Per-project folders `projects/<slug>/`, each with:
  - `ASSETS.md`: a manifest of staged assets. For each asset it gives a status label, where it came from, the review
    status, and how to use it.
  - `assets/`: public-safe images (SVG / PNG) and diagram sources (Mermaid `.mmd`) that passed review.
- Nothing else. In particular: no `en.md` / `zh.md` narratives, no `meta.yaml` facts, no `tracks.yaml`.

## Asset labels

Every staged asset carries exactly one label, both in its manifest row and inside the asset itself:

| Label | Meaning | Where it may appear |
|---|---|---|
| `CURRENT` | Matches the implementation as it exists | Architecture sections |
| `PROPOSED` | Designed but not implemented or not deployed | "Designed / next" sections, clearly marked |
| `HISTORICAL` | An earlier design artifact (sketch, wireframe) that the current design grew out of | Design-process sections only ("how it was planned"). Never shown as the current architecture |

## Rules

- **Public-safe only.** Every tracked file must be safe to publish:
  - no secrets, account IDs, private IPs or internal hostnames;
  - no local paths or personal data;
  - no classmates' names or faces.
- **Provenance without paths.** Describe where an asset came from in general terms (e.g. "owner's design notes").
  The exact source locations are recorded only in the internal source registry.
- **No invented components.** Diagrams must follow the evidence (ADR-008). Mermaid sources are rendered at build time.
- **Build-phase duty.** When project pages are written, use the staged assets as their manifests specify, and delete
  any asset that no page uses.

## Planned layout (PROPOSED; see `ARCHITECTURE.md`)

```text
content/
├── tracks.yaml                 (after the gate)
├── profile.yaml                (after the gate)
├── site/{en,zh}.yaml           (after the gate)
└── projects/<slug>/
    ├── meta.yaml               (after the gate)
    ├── en.md, zh.md            (after the gate)
    ├── ASSETS.md               (now)
    └── assets/                 (now)
```

## Staged so far

| Project | Assets | Manifest |
|---|---|---|
| `personal-writing-lora` | 3 early UI wireframes, early ER sketch, training-worker lifecycle (Mermaid) | [`projects/personal-writing-lora/ASSETS.md`](projects/personal-writing-lora/ASSETS.md) |
