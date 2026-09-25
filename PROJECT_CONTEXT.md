# Portfolio Project Context

**Last reviewed:** 2026-09-24 · **Phase:** build (discovery gate cleared 2026-09-24)

## Purpose

A bilingual (English / 简体中文) engineering portfolio for Yige Wang, published at `wangyige1221.website`.

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

## Target roles

- Software engineer (backend / full-stack)
- AI infrastructure and LLM training
- Cloud / platform engineering
- Quantitative or trading engineering

## Tracks

| Track id | English | 中文 | Focus |
|---|---|---|---|
| `sde` | SDE | 软件开发 | Product and backend engineering: APIs, data models, mobile, testing |
| `cloud-llm` | Cloud & LLM | 云计算与大模型 | Cloud infrastructure, IaC, CI/CD, distributed training, LLM serving |
| `ds-finance` | Data Science & Finance | 数据科学与金融 | Statistical modeling, Bayesian inference, quantitative research |

- Each project has one primary track and may be cross-listed in others.
- Ordering and membership are managed in one registry, so a project can be re-ordered, added or removed without
  editing any other project (ADR-006).

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
- As of 2026-09-24 the domain does not serve a site.

## Naming

Public pages use display names only. Working names and repository names stay internal. Final wording is settled in
the build phase.

| Display name (working) | Primary track | Also in |
|---|---|---|
| KK Knock | SDE | Cloud & LLM |
| Distributed LLM Training on HPC | Cloud & LLM | — |
| Cloud-Native Web Application on AWS | Cloud & LLM | SDE |
| Personal Writing LoRA Platform | Cloud & LLM | SDE |
| F1 Race Prediction with Hierarchical Bayesian Modeling | Data Science & Finance | — |
| Quant AI: Transformer Stock-Ranking Research | Data Science & Finance | — |
| FoodShelter: Enterprise Workflow System | SDE | — |
| SmartBuyer E-commerce (team project) | SDE | — |
| Equipment & Assignment Grading System | SDE | — |
| Data Science Methods (coursework highlights) | Data Science & Finance | — |

## Repository map

| Path | Purpose | Tracked |
|---|---|---|
| `README.md`, `AGENTS.md`, `CLAUDE.md` | Orientation and agent rules | yes |
| `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `DECISIONS.md` | Project memory | yes |
| `docs/style/` | Bilingual writing rules and glossary | yes |
| `internal/` | Source registry, project inventories, evidence ledgers, resume cross-check, content strategy, estimate, current state | **no** (git-ignored) |
| `content/` | Content model: track registry, résumé data, UI strings, one module per project, reviewed assets and their manifests (ADR-011, ADR-015) | yes |
| `src/`, `public/`, `scripts/`, `astro.config.mjs`, `wrangler.jsonc` | Astro site source, static files, build gates, hosting configuration | yes |

## Current maturity

- **Documentation foundation:** in place.
- **Project discovery:** complete for the registered sources. The inventories live in `internal/`.
- **Discovery gate:** cleared on 2026-09-24 (ADR-009).
- **Site:** implemented as an Astro 7 static site (ADR-015). Ten project modules and all global pages exist in
  English and Chinese; the build enforces language parity and scans its output before it succeeds.
  - Remaining before launch: the owner deploys the Worker and binds the custom domain, reviews the Chinese copy and
    the facts added in the build phase, finishes the repository cleanup behind the pending code links, and keeps
    Cloudflare Web Analytics off for the site's hostname.
