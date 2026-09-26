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

- **Status:** Accepted · **Date:** 2026-09-24 · **Amended by ADR-016:** the three tracks are replaced by capability
  filters, and the registry is `content/catalog.yaml`. Modularity and the single registry stand.
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

## ADR-015 — Build-phase implementation choices; hosting on Cloudflare Workers static assets

- **Status:** Accepted · **Date:** 2026-09-24
- **Supersedes:** the "Hosting: Cloudflare Pages" line of ADR-014. The rest of ADR-014 stands.
- **Context:**
  - The discovery gate was cleared on 2026-09-24.
  - The owner deploys the site as a Cloudflare Worker with static assets, checks it on workers.dev, and then binds a
    custom subdomain. The production URL is not fixed yet.
  - Astro 7 renders Markdown with its own pipeline instead of remark/rehype plugins, and its compiler rejects invalid
    HTML.
- **Decision:**
  - **Framework:** Astro 7, static output, no adapter. Node 22.12 or later.
  - **Hosting:** Cloudflare Workers static assets, configured in `wrangler.jsonc`, with no Worker script.
    `not_found_handling: "404-page"` serves the nearest `404.html`, so each language has its own 404 page.
  - **URLs:** English at `/`, Chinese at `/zh/`, directory-style URLs with trailing slashes. Each page type is one route
    file that renders both languages from the same data.
  - **Site URL and indexing:**
    - `SITE_URL` comes from the environment. Without it, the build emits no absolute canonical, `hreflang` or sitemap
      URLs.
    - A `workers.dev` or `pages.dev` URL is rejected as `SITE_URL`.
    - Pages are `noindex` unless `SITE_URL` is set and `SITE_INDEXING=true`.
  - **No client-side JavaScript,** and no inline scripts or styles. *(Amended by ADR-016: one first-party
    progressive-enhancement script is allowed.)* The CSP is sent both as a `<meta>` tag and in
    `_headers`. SVG assets get their own policy so that diagram styles render.
  - **Content loading:** a small loader reads `content/` (YAML and Markdown), validates it, substitutes facts from
    `meta.yaml` and renders Markdown with `marked`. Section IDs do not depend on the language. The build fails on any
    English/Chinese parity violation.
  - **Diagrams:** Mermaid sources are rendered to SVG on the owner's machine (`npm run diagrams`, using the installed
    Chrome) and committed. The hosted build never needs a browser.
  - **Visual system:** the visual language of the KK Knock introduction page (warm off-white, Source Serif 4 display
    type, dark green accent) with an engineering-minimal information architecture.
  - **Gates:** after the build, a scan of `dist/` fails on private data, inline code, third-party origins and broken
    internal links. CI runs the full build.
- **Consequences:**
  - The output works on any static host. Only `_headers` and `wrangler.jsonc` are Cloudflare-specific.
  - Authors write plain Markdown with `{{fact:key}}` references and `{#id}` section anchors.
  - A diagram's SVG must be regenerated whenever its `.mmd` source changes.

## ADR-016 — Redesign: a résumé companion organized by capability, with case studies first

- **Status:** Accepted · **Date:** 2026-09-25 · **Amends:** ADR-006 (tracks), ADR-015 (client-side JavaScript)
- **Context:**
  - The owner's redesign brief (2026-09-24) asks the site to work as a quick companion to the résumé: a clear
    software-engineering position first, then case studies that show business modeling, backend and cloud delivery,
    and system planning, each with the owner's own contribution on the first screen.
  - Three role tracks made readers choose a job family before seeing any work.
  - The brief asks for a filterable catalog, a mobile menu with keyboard support, and old links that keep working.
- **Decision:**
  - **Navigation:** Projects / Background / Résumé / language switch. "How I plan & design" stays as a secondary page,
    linked from Background and the footer.
  - **Home:** position → three capability entries that open a section of a case study → four selected case studies
    (KK Knock, FoodShelter, Cloud-Native, Personal Writing LoRA) → three compact "more" projects → a short background.
  - **Capabilities replace tracks.** Four capability ids (`business-modeling`, `backend-cloud`, `planning-delivery`,
    `ai-research`) are declared per project (`focus` in `meta.yaml`) and used as catalog filters. The only ordering
    registry is `content/catalog.yaml` (featured, more, catalog order, capability entries).
  - **Case studies** open with status, role, team and a three-part overview (problem / my contribution / outcome and
    validation). Cards and overviews are written by an editor; nothing is truncated from the stack list.
  - **Card schematics.** A featured card shows either a page figure or a short HTML step list labeled like a diagram
    (CURRENT / PROPOSED). Dense diagrams stay on the case study, where they are readable.
  - **One script.** `public/js/site.js` adds the mobile menu, the catalog filter (with `?focus=` in the URL, refresh
    and back-button support) and a language switch that keeps the current `#section`. It is loaded from the site's own
    origin with a content-hash version, so the CSP stays `script-src 'self'`. Every page works without it.
    `scripts/check-dist.mjs` allows exactly this script and nothing else.
  - **Old links.** Retired pages (`/about/`, `/tracks/*`, and their `/zh/` versions) get permanent single-hop
    redirects in `public/_redirects`, checked by `check-dist`. Retired section ids of a case study are kept as
    anchor aliases (`anchor_aliases` in `meta.yaml`), so old `#anchors` still land on the section that replaced them.
  - **URLs and slugs are unchanged:** English at `/`, Chinese at `/zh/`, and the existing project slugs, so no project
    page needed a redirect.
- **Consequences:**
  - Re-ranking or featuring a project still touches one registry file.
  - The site now ships one small script; the no-inline-code rule and the CSP are unchanged.
  - `_redirects` is Cloudflare-specific, like `_headers`; on another host the redirects must be re-created.

## ADR-017 — Home page as a résumé companion that leads into the work; case studies by their own story

- **Status:** Accepted · **Date:** 2026-09-26 · **Amends:** ADR-016 (home order, featured projects, case-study
  template)
- **Context:**
  - The owner's content brief (2026-09-26): the home page explained capabilities before showing any work; the copy
    read like an engineering review; role, status and contribution repeated across the page; the home-page schematics
    were text-heavy; every project used the same template; the AI-collaboration notes were defensive; some statuses
    were unclear or contradicted each other.
  - In the same session the owner asked for the first screen to be a short résumé — who they are, education and
    experience — with projects and capabilities below, and not to be framed only as KK Knock's solo developer.
  - The owner chose, project by project, what each should show (recorded in the internal content strategy).
- **Decision:**
  - **Home:** a résumé summary (headline, one short paragraph, education, experience, résumé and profile links) →
    selected projects (KK Knock as the large card with product screens; Cloud-Native AWS and Distributed LLM as the
    main case studies) → more work (Personal Writing LoRA as an in-development card; FoodShelter, Equipment, F1) →
    capabilities, derived from each project's `focus` → contact through LinkedIn and GitHub. The "Start from a
    capability" block is removed; capability filters stay on the catalog.
  - **Registry:** `catalog.yaml` declares `home: { flagship, cases, exploring, more }` instead of `featured`, `more`
    and `entries`.
  - **Cards:** a natural introduction with my part, one engineering highlight, a short status, at most three
    technologies, one case-study link and at most one outside link. The "My part / Key question" fields are removed.
  - **Case studies:** one status line, one role statement (`role`, which also states the AI-assistant split), the
    period and context, then a lead visual (`lead`) and a few facts with their conditions. The three-part overview is
    removed; each narrative is organized around its own story, with a "what has been verified" section before the
    deep dive. Internal phase codes move to details.
  - **Charts:** a new figure kind, drawn as inline SVG from values in `meta.yaml`; each panel cites its ledger claim
    and every printed value is a project fact.
  - **Links:** `product` (product introduction page), `demo` (only for something that runs), `video`, and `code`,
    grouped under one "Source" label.
  - **Statuses:** a new label "In development / 开发中" (Personal Writing LoRA).
  - **INFO 6105 coursework** becomes the "methods behind it" section of the F1 page; its old URL redirects there.
- **Consequences:**
  - The first screen shows the résumé summary and the start of the selected projects at common desktop sizes; on
    phones the flagship's screens sit right under its title, in a sideways-scrolling row.
  - Numbers still enter only through facts; card text is checked for bare measurements like narratives.
  - Owner-reported facts added in this revision are recorded as owner-attested in the internal ledgers and published
    without numbers.


## ADR-018 — An expanded personal résumé led by contributions

- **Status:** Accepted · **Date:** 2026-09-26
- **Amends:** ADR-007 and ADR-017 where their emphasis could put product behavior or research results ahead of personal work.
- **Decision:**
  - Lead with responsibilities and concrete technical actions. Projects, architecture and results are evidence of that work.
  - Keep education, internships and role targets. Retain the bilingual architecture and current visual design.
  - Cards should establish what I implemented, designed, integrated or investigated. Avoid repeating a product introduction as the engineering highlight.
  - Detail pages open with work context and contribution, then explain implementation choices and validation; fuller system descriptions and research discussion remain supporting material.
  - Team work distinguishes personal responsibilities from shared results. Cluster login identity does not determine contribution; owner attestations follow ADR-012.
  - Summaries, catalog cards and the résumé reuse project metadata to keep responsibility statements consistent.
- **Consequences:** Changes to emphasis do not authorize stronger facts, new metrics, or publication of private or graded source materials.


## ADR-019 — Owner-approved job contact email

- **Status:** Accepted · **Date:** 2026-09-26
- **Amends:** ADR-004 for the single owner-approved public contact address.
- **Decision:** Publish the job contact email exactly as explicitly confirmed by the owner, together with a bilingual attachment-total size limit. The authoritative contact data lives in `content/profile.yaml` and a shared component renders it on Home, Background and Résumé.
- **Safety gate:** Permit only that exact address in the output scan. All other email addresses remain blocked. External project links remain HTTPS-only; the contact component generates its own mailto link.
- **Boundary:** This is a contact instruction, not an upload form or enforcement of mailbox attachment limits. No message is sent by this change.


## ADR-020 — Project presentation without educational-origin labels

- **Status:** Accepted · **Date:** 2026-09-26
- **Decision:** Public project cards, headers and résumé entries use project descriptions, responsibilities, team size and runtime status rather than course-versus-personal categories. Existing internal status keys remain compatible; their visible labels are Project / 项目. Educational provenance remains in evidence records and relevant methodological background.
- **Content:** AWS summaries name the actual resources and the owner's API, infrastructure, CI/CD, serverless email and domain work. Concision must not remove the technical evidence needed to assess the work.
