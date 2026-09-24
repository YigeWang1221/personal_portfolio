# personal_portfolio

Source repository for **Yige Wang's bilingual engineering portfolio** (English / 简体中文), to be published at
[wangyige1221.website](https://wangyige1221.website).

**What the portfolio does**
- Complements a one-page resume: it keeps the resume's essentials and adds what a resume has no room for.
  - How each system was planned and designed.
  - Which decisions and trade-offs were made, and why.
  - How the work was tested and operated.
  - Projects that are not on the resume.
- Groups projects into three tracks: **SDE**, **Cloud & LLM**, and **Data Science & Finance**.

## Status

**Phase: documentation and project discovery.**
- No site code exists yet.
- Site implementation starts only after the discovery gate in [`DECISIONS.md`](DECISIONS.md) (ADR-009) is cleared.

## Documentation map

| File | Purpose |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Rules for AI coding agents (Codex, Cursor, Claude Code) and human contributors |
| [`CLAUDE.md`](CLAUDE.md) | Imports `AGENTS.md` for Claude Code |
| [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) | Purpose, audiences, tracks, languages, domain, naming, repository map |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Current repository layout; proposed content model, site map and build requirements |
| [`DECISIONS.md`](DECISIONS.md) | Architecture decision records |
| [`docs/style/BILINGUAL_STYLE.md`](docs/style/BILINGUAL_STYLE.md) | Writing rules for English and Chinese content |
| [`docs/style/GLOSSARY.md`](docs/style/GLOSSARY.md) | English ↔ Chinese terminology |
| [`content/README.md`](content/README.md) | Content skeleton: staged design assets and how the build phase uses them |

## Internal documents

`internal/` is **intentionally not tracked** (see `.gitignore` and ADR-001).
- It holds the material that backs every public claim:
  - the project source registry;
  - project inventories and evidence ledgers;
  - resume cross-checks;
  - content strategy and estimates;
  - private-project details.
- A fresh clone of this repository does not contain it.
