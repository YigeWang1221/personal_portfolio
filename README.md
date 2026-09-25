# personal_portfolio

Source repository for **Yige Wang's bilingual engineering portfolio** (English / 简体中文).

**What the portfolio does**
- Complements a one-page resume: it keeps the resume's essentials and adds what a resume has no room for.
  - How each system was planned and designed.
  - Which decisions and trade-offs were made, and why.
  - How the work was tested and operated.
  - Projects that are not on the resume.
- Groups projects into three tracks: **SDE**, **Cloud & LLM**, and **Data Science & Finance**.

## Status

**Phase: build.** The discovery gate (ADR-009) was cleared on 2026-09-24.
- The site is an Astro 7 static build, hosted as Cloudflare Workers static assets (ADR-014, ADR-015).
- All pages exist in English and Chinese. The build fails if a page, string or fact exists in only one language.
- Pages are `noindex` until the public URL is configured and indexing is switched on (see Deploy).

## Develop

Requires Node.js 22.12 or later.

```bash
npm ci
npm run dev        # local dev server at http://localhost:4321
npm run build      # content checks → astro build → post-build safety scan
npm run preview    # serve the built site
```

`npm run build` fails when:
- a page, UI string, section or fact exists in one language but not the other;
- a measurement appears in a narrative outside a `{{fact:…}}` reference;
- `dist/` contains private data (local paths, private IPs, keys, emails, internal claim IDs), inline scripts or
  styles, third-party resources, or broken internal links and anchors.

**Diagrams.** Mermaid sources (`content/**/assets/*.mmd`) are rendered to SVG by `npm run diagrams`, using the locally
installed Chrome; the rendered SVGs are committed, so the hosted build never needs a browser. Re-run it after
editing a `.mmd` file.

**Content.** See [`content/README.md`](content/README.md) for the content model and the authoring rules.

## Deploy (Cloudflare Workers static assets)

The Worker only serves `dist/`; there is no Worker script. Configuration: [`wrangler.jsonc`](wrangler.jsonc),
response headers: [`public/_headers`](public/_headers).

1. **First deployment (preview).** Build without `SITE_URL`, then deploy:
   ```bash
   npm run build
   npx wrangler login
   npx wrangler deploy
   ```
   The site answers on `<worker-name>.<account>.workers.dev`. Without `SITE_URL` it has no absolute canonical or
   `hreflang` URLs and stays `noindex`.
2. **Custom domain.** In the Cloudflare dashboard, open the Worker → Settings → Domains & Routes → add the custom
   domain.
3. **Canonical URL.** Rebuild with the custom domain and deploy again:
   ```bash
   SITE_URL=https://<your-domain> npm run build
   npx wrangler deploy
   ```
   `SITE_URL` must be an `https` origin; `workers.dev` and `pages.dev` addresses are rejected.
4. **Indexing.** After the content review, add `SITE_INDEXING=true` to the build to allow search engines and emit the
   sitemap reference in `robots.txt`.
5. **Git-connected builds (optional).** With Workers Builds, use build command `npm run build` and deploy command
   `npx wrangler deploy`, and set `SITE_URL` (and later `SITE_INDEXING`) as build variables.
6. **Keep analytics off.** Make sure Cloudflare Web Analytics does not inject its script into this hostname; the site
   ships no analytics, and its Content-Security-Policy would block the beacon anyway.

## Documentation map

| File | Purpose |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Rules for AI coding agents (Codex, Cursor, Claude Code) and human contributors |
| [`CLAUDE.md`](CLAUDE.md) | Imports `AGENTS.md` for Claude Code |
| [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) | Purpose, audiences, tracks, languages, domain, naming, repository map |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Repository layout, content model, site map and build requirements |
| [`DECISIONS.md`](DECISIONS.md) | Architecture decision records |
| [`docs/style/BILINGUAL_STYLE.md`](docs/style/BILINGUAL_STYLE.md) | Writing rules for English and Chinese content |
| [`docs/style/GLOSSARY.md`](docs/style/GLOSSARY.md) | English ↔ Chinese terminology |
| [`content/README.md`](content/README.md) | Content model, authoring rules and staged assets |

## Internal documents

`internal/` is **intentionally not tracked** (see `.gitignore` and ADR-001).
- It holds the material that backs every public claim:
  - the project source registry;
  - project inventories and evidence ledgers;
  - resume cross-checks;
  - content strategy and estimates;
  - private-project details.
- A fresh clone of this repository does not contain it.
