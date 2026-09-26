# Portfolio Project Context

**Last reviewed:** 2026-09-26 · **Phase:** build (discovery gate cleared 2026-09-24)

## Purpose

A bilingual (English / 简体中文) engineering portfolio for Yige Wang, published at `portfolio.wangyige1221.website`.

**Purpose in practice.** This is an expanded personal résumé: what I did, my responsibilities, concrete technical work, and the capabilities that work demonstrates (ADR-018). Projects and outcomes support that account. Education, internships and target roles remain essential.

**Why it exists.** A one-page resume cannot show:
- how a system was planned and designed;
- why decisions were made;
- what was measured;
- what did not work.

**What it adds.** The site keeps the resume's essentials and adds that depth, plus projects that are not on the
resume. Two qualities are shown on purpose:
- **Project planning:** problem framing, phased roadmaps, and decision records.
- **Architecture design:** system boundaries, trade-offs, and diagrams of CURRENT vs PROPOSED architecture.

## Non-goals

- **Not a resume copy, a blog, or a source-code mirror.** Pages explain engineering work and link to public
  repositories; they don't reproduce them.
- **No claims beyond the evidence.** Every number and outcome traces to a repository, log or document (ADR-003).

## Audiences

- Recruiters and hiring managers in the US and mainland China who screen quickly.
- Engineers who read deeply and check claims against code.

Every project page therefore works at three depths: a 30-second scan, a 3-minute read, and a deep dive
(`docs/style/BILINGUAL_STYLE.md`).

## Position and target roles

- **Primary position on the site (ADR-016):** Software Engineer — Backend & Systems. The home page names one role; the
  other interests show through the projects.
- **Roles the owner applies for:** software engineer (backend / full-stack); AI infrastructure and LLM training;
  cloud / platform engineering; quantitative or trading engineering.

## Capabilities (catalog filters)

| Id | English | 中文 | Shown by |
|---|---|---|---|
| `business-modeling` | Business modeling | 业务建模 | Objects, roles and states behind a real workflow |
| `backend-cloud` | Backend & Cloud | 后端与云 | APIs, data, infrastructure, delivery |
| `planning-delivery` | Planning & Delivery | 规划与交付 | Phased plans, decision records, iterations |
| `ai-research` | AI & Research | AI 与研究 | Training, modeling and measurement |

- Each project has one primary capability and may show others (ADR-016, replacing the three tracks of ADR-006).
- Ordering, featuring and membership are managed in one registry, `content/catalog.yaml`, so a project can be
  re-ordered, added or removed without editing any other project.

## Languages

English and Simplified Chinese, switchable on every page. Both versions carry the same facts, and neither is a
machine translation of the other (ADR-005).

## Identity

| Field | English | 中文 |
|---|---|---|
| Name | Yige Wang | 王一格 |
| Graduate study | Northeastern University (Boston, MA), Master of Science in Software Engineering Systems, expected Dec 2026 | 美国东北大学（Northeastern University）软件工程系统硕士，预计 2026 年 12 月毕业 |
| Undergraduate | Zhejiang Gongshang University, Bachelor of Engineering in Computer Science and Technology (2020 – 2024) | 浙江工商大学 计算机科学与技术 学士（2020 – 2024） |
| Profiles | github.com/YigeWang1221 · linkedin.com/in/yigewang1221 | 同左 |

## Domain and hosting

- Production domain: `wangyige1221.website`. DNS is managed on Cloudflare.
- **Technology route:** Astro (ADR-014), hosted as Cloudflare Workers static assets (ADR-015). English is the default
  language.
- **Rollout:** the owner deploys to workers.dev first, then binds a custom subdomain. The public URL is passed to the
  build as `SITE_URL`; it is not hard-coded, and workers.dev is never the canonical URL.
- **Live since 2026-09-24** at `https://portfolio.wangyige1221.website` (Worker `portfolio`). The live build does not
  set `SITE_URL` yet, so it has no canonical URLs and stays `noindex`.

## Naming

Public pages use display names only. Working names and repository names stay internal. Final wording is settled in
the build phase.

| Display name | Primary capability | Also | Home page (ADR-017) |
|---|---|---|---|
| KK Knock | Planning & Delivery | Backend & Cloud | Selected: large card |
| Cloud-Native Web Application on AWS | Backend & Cloud | — | Selected: case study |
| Distributed LLM Training on HPC | AI & Research | Backend & Cloud | Selected: case study |
| Personal Writing LoRA Platform | Backend & Cloud | AI & Research, Planning & Delivery | More work: in-development card |
| FoodShelter: Food-Rescue Workflow System | Business modeling | — | More work |
| Equipment & Assignment Grading System | Backend & Cloud | Business modeling | More work |
| F1 Race Prediction with Hierarchical Bayesian Modeling (includes the INFO 6105 methods) | AI & Research | — | More work |
| Quant AI: Transformer Stock-Ranking Research Pipeline | AI & Research | — | Catalog |
| SmartBuyer E-commerce | Backend & Cloud | — | Catalog |

## Repository map

| Path | Purpose | Tracked |
|---|---|---|
| `README.md`, `AGENTS.md`, `CLAUDE.md` | Orientation and agent rules | yes |
| `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `DECISIONS.md` | Project memory | yes |
| `docs/style/` | Bilingual writing rules and glossary | yes |
| `internal/` | Source registry, project inventories, evidence ledgers, resume cross-check, content strategy, estimate, current state | **no** (git-ignored) |
| `content/` | Content model: catalog registry, résumé data, UI strings, one module per project, reviewed assets and their manifests (ADR-011, ADR-015) | yes |
| `src/`, `public/`, `scripts/`, `astro.config.mjs`, `wrangler.jsonc` | Astro site source, static files, build gates, hosting configuration | yes |

## Current maturity

- **Documentation foundation:** in place.
- **Project discovery:** complete for the registered sources. The inventories live in `internal/`.
- **Discovery gate:** cleared on 2026-09-24 (ADR-009).
- **Site:** implemented as an Astro 7 static site (ADR-015), redesigned on 2026-09-25 (ADR-016) and revised on
  2026-09-26 (ADR-017): a résumé summary first, then the selected projects, more work, capabilities and contact.
  Nine project modules and all global pages exist in English and Chinese; the build enforces language parity and
  scans its output before it succeeds.
  - Deployed by the owner on 2026-09-24, with the custom domain bound.
  - Remaining: rebuild with `SITE_URL` and redeploy; review the Chinese copy and the facts added in the build phase;
    finish the repository cleanup behind the pending code links; turn off Cloudflare Web Analytics injection for the
    site's hostname; then enable indexing.
