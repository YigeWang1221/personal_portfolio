# Decisions

Architecture decision records for the portfolio repository.
- Append new records at the end with the next number.
- To change a decision, add a new record that supersedes the old one. Don't edit accepted records.

---

## ADR-001 — Public repository with git-ignored internal documents

- **Status:** Accepted · **Date:** 2026-09-24
- **Context:**
  - The repository is public.
  - Portfolio work needs an evidence base that is not safe to publish: private-project details, resume cross-checks,
    unresolved claims and security notes.
- **Decision:**
  - Keep the repository public.
  - Keep internal documents in `internal/`, which is git-ignored. It mirrors the paths named in the discovery
    specification: `internal/PROJECT_SOURCES.md`, `internal/docs/ESTIMATE.md`, `internal/docs/projects/`.
  - Every tracked file must be safe to publish.
- **Consequences:**
  - Internal documents have no git history and no remote backup. The owner may later turn `internal/` into its own
    private repository.
  - Agents must open internal files by path, because search tools skip ignored files.
  - A public clone has no evidence base, so evidence work stops there.

## ADR-002 — External projects are read-only evidence

- **Status:** Accepted · **Date:** 2026-09-24
- **Context:** Portfolio content describes work that lives in other repositories and folders, some public and some
  private.
- **Decision:**
  - External projects are inspected read-only.
  - They are referenced by repository, commit SHA and path.
  - They are never vendored, copied wholesale, or modified from this repository.
  - Public pages link to public repositories instead of reproducing their code.
- **Consequences:**
  - Evidence is reproducible, because SHAs are pinned.
  - Any change to an external project is a separate task that the owner must approve.

## ADR-003 — Evidence model and discrepancy handling

- **Status:** Accepted · **Date:** 2026-09-24
- **Context:** Claims on the site must survive technical review. The resume is a summary, not a source of truth.
- **Decision:**
  - **Source priority**, highest first: implementation, git history, repository docs, deployment configuration,
    tests/benchmarks/logs, resume/LinkedIn, verbal description.
  - **Every claim has a ledger row** with: the claim, its origin, an evidence locator, the verified value and
    conditions, a status, and a public-use rule.
  - **Resume claims without evidence** are `NEEDS VERIFICATION`.
  - **Conflicts** are recorded as `DISCREPANCY`, and neither side is rewritten automatically.
  - **Team work** is attributed only when corroborated.
- **Consequences:**
  - Public content uses only ledger-approved values, together with their conditions.
  - Unverified statements stay off the site until the owner resolves them.

## ADR-004 — Sensitive data and the public-link gate

- **Status:** Accepted · **Date:** 2026-09-24
- **Context:** External projects contain configuration and history that must not be amplified.
- **Decision:**
  - **Never written into any file**, public or internal. Placeholders are used instead:
    - secrets, keys, tokens and passwords;
    - account IDs;
    - private IPs and internal hostnames;
    - private URLs;
    - personal emails and user data;
    - student IDs.
  - **`.env` files are not read.** Examples and schemas are read instead.
  - **Public-link gate:** a public page links to an external repository only after the owner confirms it has no open
    security finding.
- **Consequences:** some projects may be described without code links until they are cleaned up.

## ADR-005 — Bilingual content model

- **Status:** Accepted · **Date:** 2026-09-24
- **Context:** The audience includes recruiters and engineers in the US and mainland China.
- **Decision:**
  - English and Simplified Chinese, with a switch on every page.
  - Language-neutral facts are stored once and rendered in both languages.
  - Narratives are written natively in each language rather than machine-translated. The owner reviews the Chinese.
  - Internal engineering documents are written in English.
- **Consequences:**
  - Writing effort roughly doubles.
  - Numbers cannot drift between languages.

## ADR-006 — Three tracks and modular project modules

- **Status:** Accepted · **Date:** 2026-09-24
- **Context:** The owner targets several role families and wants to re-order, add, remove or cross-list projects
  freely.
- **Decision:**
  - The tracks are **SDE**, **Cloud & LLM** and **Data Science & Finance**.
  - Each project is a self-contained module, with one primary track and optional cross-listings.
  - Ordering lives in exactly one registry:
    - `internal/docs/CONTENT_STRATEGY.md` for now;
    - `content/tracks.yaml` after the discovery gate.
- **Consequences:** adding, removing, re-ranking or cross-listing a project touches one module and one registry line.

## ADR-007 — Content complements the resume and shows planning and design ability

- **Status:** Accepted · **Date:** 2026-09-24
- **Context:** A one-page resume lists outcomes. It cannot show how the work was planned, how the architecture was
  chosen, or what did not work.
- **Decision:**
  - **Lead with what a resume cannot show:**
    - problem framing and phased plans;
    - architecture decisions and trade-offs, including CURRENT vs PROPOSED designs;
    - failure analysis;
    - testing and operations;
    - projects that are not on the resume.
  - **Keep the resume's essentials consistent**, but don't repeat them at length.
  - **Add a visual, bilingual résumé page** whose skills link to the evidence behind them.
  - **Present weak-result research through its implementation** (Quant AI).
- **Consequences:**
  - Project pages are depth-first.
  - Outcomes are claimed only where they are verified.

## ADR-008 — Diagrams derived from the implementation

- **Status:** Accepted · **Date:** 2026-09-24
- **Decision:**
  - Diagrams are derived from code and configuration.
  - They are kept as Mermaid source.
  - Each one is labeled `CURRENT` or `PROPOSED`.
  - Planned components are never drawn as deployed.
- **Consequences:** some diagrams are simpler than an idealized design would be, and every one can be traced to the
  source.

## ADR-009 — Discovery gate before site implementation

- **Status:** Accepted · **Date:** 2026-09-24
- **Decision:** no site code, no content files and no project pages until all of the following hold:
  1. Every registered source is inventoried, or its entry records why it is not.
  2. The Final Discovery Summary is complete.
  3. The owner has reviewed the priorities, the ownership questions for team projects, and the claims each planned
     page depends on.
  4. Every open security finding that affects a planned link is resolved, or that link is dropped.
- **Consequences:** the gate's state is tracked in `internal/CURRENT_STATE.md`.

## ADR-010 — Site stack and hosting

- **Status:** Deferred · **Date:** 2026-09-24
- **Context:**
  - The domain's DNS is on Cloudflare.
  - The site must be static, bilingual, fast and reachable from mainland China.
  - Builds from this public repository must never include internal documents.
- **Options under consideration:**
  - a static site generator with built-in i18n routing;
  - hosting on Cloudflare Pages (the DNS is already there) or on GitHub Pages;
  - testing reachability from mainland China;
  - cleaning up stale GitHub Pages configuration on the owner's account.
- **Decision:** to be made after the discovery gate.

## ADR-011 — Content skeleton and asset staging before the discovery gate

- **Status:** Accepted · **Date:** 2026-09-24
- **Supersedes:** part of ADR-009 (the ban on `content/` files before the gate). Extends ADR-008 labeling to
  non-architecture design artifacts.
- **Context:**
  - The owner asked to collect meaningful design material now, starting with the Personal Writing LoRA design notes.
  - The material should sit in the project skeleton, so the build phase uses it.
- **Decision:**
  - `content/` may exist before the gate, but only as a skeleton:
    - `content/README.md`;
    - per-project `projects/<slug>/ASSETS.md` manifests;
    - reviewed, public-safe assets in `projects/<slug>/assets/` (images, Mermaid sources).
  - Still not allowed before the gate: narrative text (`en.md` / `zh.md`), facts files (`meta.yaml`), `tracks.yaml`,
    site code.
  - Every staged asset carries exactly one label:
    - `CURRENT`: matches the implementation;
    - `PROPOSED`: designed, not implemented or not deployed;
    - `HISTORICAL`: an earlier sketch or wireframe the current design grew out of. It appears only in design-process
      sections, never as the current architecture.
  - Manifests describe provenance without local paths. The exact source locations stay in the internal registry.
  - An asset is staged only if it does not conflict with the current design and passes a public-safety review.
- **Consequences:**
  - The build phase starts with vetted design artifacts that demonstrate planning.
  - Unused assets are deleted when the pages are written.

## ADR-012 — Team course projects: attribution by owner attestation

- **Status:** Accepted · **Date:** 2026-09-24
- **Supersedes:** the ADR-003 clause "Team work is attributed only when corroborated".
- **Context:**
  - The owner states that in their team course projects, features were designed and built collaboratively.
  - The owner says they took part in implementation and often implemented features or debugged on teammates' machines.
  - That kind of work leaves no trace in git history.
- **Decision:**
  - **Evidence.** The owner's attestation (tier 7) is accepted as evidence of participation in team projects. Ledger
    status: `OWNER-ATTESTED`.
  - **Skills and experience.** Team-built features count toward the owner's demonstrated skills and experience.
  - **Public copy.** It must always:
    1. state the team size;
    2. use "we" for team results, and "I" for the owner's verified or attested roles (led, designed, co-implemented,
       debugged);
    3. never say "solely" or "single-handedly" about parts a teammate wrote;
    4. stay defensible in an interview. The owner must be able to explain anything the page attributes to them.
  - **Numbers are unaffected.** Metrics still need evidence (ADR-003).
- **Consequences:**
  - Team projects can be presented at full strength with honest framing.
  - Claims that contradict the repositories stay excluded.

## ADR-013 — Incomplete project copies: resume-described features by owner attestation

- **Status:** Accepted · **Date:** 2026-09-24
- **Extends:** ADR-012 (from participation to the existence of features).
- **Context:**
  - For some older projects, the only surviving copy of the code is incomplete.
  - The owner states that the missing parts existed and are described correctly on the resume.
  - First case: the Equipment & Assignment Grading System, whose feature backend is not in any available copy.
- **Decision:**
  - **Features.** Features that the resume describes and that are missing from an incomplete copy are recorded as
    `OWNER-ATTESTED (code not preserved)`. They may be described in resume and site copy as the owner's project
    features.
  - **Links.** Public pages do not link the incomplete repository as evidence for those features.
  - **Metrics.** Metrics with no measurement evidence stay owner-reported.
    - The site omits them by default.
    - Resume use is the owner's decision, with two conditions: one consistent value across all resume versions, and a
      measurement the owner can explain in an interview.
  - **Conflicts.** Claims that the available code contradicts are still excluded (ADR-003).
- **Consequences:**
  - Older projects can be shown even though their code copy is incomplete.
  - The ledger keeps the boundary between verified and attested features visible for interview preparation.

## ADR-014 — Technology route: Astro on Cloudflare Pages, English by default

- **Status:** Accepted · **Date:** 2026-09-24
- **Decides:** ADR-010 (Deferred).
- **Scope:** this record fixes the technology route only. Implementation choices are made in the build phase and must
  meet the requirements in `ARCHITECTURE.md`.
- **Decision:**
  - **Site framework:** Astro (static site).
  - **Hosting:** Cloudflare Pages, serving `wangyige1221.website`.
  - **Default language:** English at the site root; Chinese available through the language switch.
- **Consequences:**
  - $0 hosting beyond the domain.
  - Owner account actions before launch:
    - set up the Cloudflare Pages project;
    - clear the stale DNS records;
    - retire the stale `.me` CNAME on the github.io repo.
