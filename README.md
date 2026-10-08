# personal_portfolio

Source repository for **Yige Wang's bilingual engineering portfolio** (English / 简体中文).

**What the portfolio does**
- Complements a one-page resume: it keeps the resume's essentials and adds what a resume has no room for.
  - How each system was planned and designed.
  - Which decisions and trade-offs were made, and why.
  - How the work was tested and operated.
  - Projects that are not on the resume.
- Leads with four case studies — business modeling, backend and cloud delivery, system planning, iteration — and
  lists every project in a catalog filterable by capability (ADR-016).

## Status

**Phase: build.** The discovery gate (ADR-009) was cleared on 2026-09-24.
- The site is an Astro 7 static build, hosted as Cloudflare Workers static assets (ADR-014, ADR-015).
- All pages exist in English and Chinese. The build fails if a page, string or fact exists in only one language.
- Live at <https://portfolio.wangyige1221.website>.
- Pages are `noindex` until the public URL is configured and indexing is switched on (see Deploy).

## Develop

Requires Node.js 22.12 or later.

```bash
npm ci
npm run dev        # local dev server at http://localhost:4321
npm run build      # content checks → astro build → AI knowledge build → post-build safety scans
npm test           # node --test suites (AI knowledge and prompt build; no network, no model calls)
npm run preview    # serve the built site
npm run chat:preview -- --q "Which projects show backend work?"   # print the AI assistant's assembled prompt
npm run chat:preview -- --q "…" --provider mock                     # …and stream a mock answer (no network)
npm run api:dev    # AI backend with mock providers on http://localhost:3000 (X-Origin-Key: dev-origin-key)
```

**Environment variables.**
- [`.env.example`](.env.example) lists the build switches and the Edge Worker secrets.
- The AI backend's settings, the origin key and the three model plans, go in `backend/.env`. That file is
  git-ignored; its template is [`backend/.env.example`](backend/.env.example).
- The Mac mini stack loads `backend/.env` into the container.
- The build fails if any value from it ever appears in the site output or the knowledge snapshot.

**AI assistant backend** (`backend/`, ADR-022). The backend has no dependencies to install. Its configuration is
listed in [`backend/.env.example`](backend/.env.example). To build the image, run this after `npm run build`:
`docker buildx build --platform linux/arm64 -f backend/Dockerfile -t portfolio-api:<version> .`
Deployment to the Mac mini is described in `docs/AI_Chat/AI_CHAT_DESIGN.md` §5.7 and §10.1.

`npm run build` fails when:
- a page, UI string, section or fact exists in one language but not the other;
- a measurement appears in a narrative outside a `{{fact:…}}` reference;
- `dist/` contains private data (local paths, private IPs, keys, emails, internal claim IDs), inline scripts or
  styles, any script other than `/js/site.js`, third-party resources, broken internal links and anchors, or a
  redirect in `_redirects` whose target is missing;
- the AI assistant's knowledge or prompts (`generated/ai/`, never published) contain claim-like IDs, unrendered
  facts, internal references, keys or unapproved emails, or point to a page or anchor that does not exist.
  Prompt files that contain fact values, unknown variables or an over-budget block also fail the build
  (see `content/README.md`, "AI assistant").

**Diagrams.** Mermaid sources (`content/**/assets/*.mmd`) are rendered to SVG by `npm run diagrams`, using the locally
installed Chrome; the rendered SVGs are committed, so the hosted build never needs a browser. Re-run it after
editing a `.mmd` file.

**Content.** See [`content/README.md`](content/README.md) for the content model and the authoring rules.

## Deploy (Cloudflare Workers static assets)

The Worker serves `dist/`. Its one script, [`edge/api-proxy.ts`](edge/api-proxy.ts), runs only for `/api` and
`/api/*` (the AI assistant, ADR-022). Configuration: [`wrangler.jsonc`](wrangler.jsonc), response headers:
[`public/_headers`](public/_headers).

### How a release happens: Git-connected builds (Workers Builds)

The Worker `portfolio` is connected to this GitHub repository.
- **A push to `main` is a production release.** Cloudflare runs the build command `npm run build` and the deploy
  command `npx wrangler deploy`. A push is therefore owner-only (AGENTS.md).
- **Other branches and pull requests** get preview versions that do not change the live site.
- The GitHub workflow (`.github/workflows/ci.yml`) only builds and tests. It never deploys.

**Settings in the Cloudflare dashboard** (Workers & Pages → `portfolio` → Settings), set once:

| Where | Name | Value |
|---|---|---|
| Build → Variables and secrets | `PUBLIC_CHAT_ENABLED` | `true`. Without it, every Git build drops the chat window. |
| Build → Variables and secrets | `SITE_URL`, `SITE_INDEXING` | Later: the custom domain, then `true` once indexing is wanted |
| Variables and Secrets (runtime) | `ORIGIN_URL` (secret) | `https://` plus the backend's tunnel hostname |
| Variables and Secrets (runtime) | `ORIGIN_KEY` (secret) | Same value as `PORTFOLIO_ORIGIN_KEY` in `backend/.env` |

Runtime secrets are set with `npx wrangler secret put <NAME>` or in the dashboard. They survive every deployment.
Until both are set, `/api/*` answers 503 and the rest of the site is unaffected.

### Releasing a change

1. **Site-only change** (styles, components, anything outside the content model): push to `main`.
2. **Content change** (`content/`, including `content/ai/` prompts and guard rules): **update the backend first**,
   because its image carries the knowledge snapshot. Then push.
   In this repository:
   ```bash
   npm run build
   ```
   Then in the Mac mini stack folder (its compose files plus `docker-compose.portfolio.yml`):
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.gemini.yml -f docker-compose.gemini-bridge.yml -f docker-compose.portfolio.yml up -d --build --no-deps portfolio-api
   ```
   If the order slips, nothing breaks: the backend answers 409, and the chat resets and keeps answering from the
   snapshot it has until it is rebuilt.
3. **Model plans** (`backend/.env`): run the `up -d --no-deps portfolio-api` command above, without `--build`. No
   push is needed. `docker restart` does not reread the env file.

### Without Git (fallback)

- `npm run deploy` builds with the chat window (`PUBLIC_CHAT_ENABLED=true`) and deploys from this machine.
- `npm run deploy:no-chat` deploys without it.
- The next push to `main` replaces either one.
- A plain `npm run build`, as in CI, is always without the chat window.

### Other notes

- **Canonical URL and indexing:** `SITE_URL` must be an `https` origin; `workers.dev` and `pages.dev` are rejected.
  Without it, the site has no canonical or `hreflang` URLs and stays `noindex`. Add `SITE_INDEXING=true` only
  after the content review.
- **Keep analytics off:** make sure Cloudflare Web Analytics does not inject its script into this hostname. The site
  ships no analytics, and its Content-Security-Policy would block the beacon anyway.
- **Turning the assistant off:** remove the `PUBLIC_CHAT_ENABLED` build variable (or set it to anything but
  `true`), then push or retry the build. To stop it at once, stop the backend container: the chat window says it is
  unavailable, and the site keeps working.
- **Local end-to-end test:** `wrangler dev` with `--var ORIGIN_URL:http://127.0.0.1:<port> --var ORIGIN_KEY:…`
  pointing at `npm run api:dev` runs the whole chain with mock providers.

## Documentation map

| File | Purpose |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Rules for AI coding agents (Codex, Cursor, Claude Code) and human contributors |
| [`CLAUDE.md`](CLAUDE.md) | Imports `AGENTS.md` for Claude Code |
| [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) | Purpose, audiences, position and capabilities, languages, domain, naming, repository map |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Repository layout, content model, site map and build requirements |
| [`DECISIONS.md`](DECISIONS.md) | Architecture decision records |
| [`docs/style/BILINGUAL_STYLE.md`](docs/style/BILINGUAL_STYLE.md) | Writing rules for English and Chinese content |
| [`docs/style/GLOSSARY.md`](docs/style/GLOSSARY.md) | English ↔ Chinese terminology |
| [`content/README.md`](content/README.md) | Content model, authoring rules and staged assets, AI assistant prompts |
| [`docs/AI_Chat/AI_CHAT_DESIGN.md`](docs/AI_Chat/AI_CHAT_DESIGN.md) | AI assistant design (SDD-AICHAT-001, ADR-022) |
| [`docs/AI_Chat/deployment-contract.md`](docs/AI_Chat/deployment-contract.md) | AI assistant: verified facts and the runtime contract |
| [`docs/AI_Chat/CHANGELOG.md`](docs/AI_Chat/CHANGELOG.md) | AI assistant implementation log |

## Internal documents

`internal/` is **intentionally not tracked** (see `.gitignore` and ADR-001).
- It holds the material that backs every public claim:
  - the project source registry;
  - project inventories and evidence ledgers;
  - resume cross-checks;
  - content strategy and estimates;
  - private-project details.
- A fresh clone of this repository does not contain it.
