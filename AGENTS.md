# Portfolio Repository Instructions

This repository is the source of a bilingual (English / 简体中文) engineering portfolio. It is a **public** GitHub
repository.

Read these before material work, in order:
1. `PROJECT_CONTEXT.md`
2. `DECISIONS.md`
3. `internal/CURRENT_STATE.md`
4. `internal/PROJECT_SOURCES.md`
5. The inventory of the project you are working on: `internal/docs/projects/<slug>.md`

Content work also reads:
- `internal/docs/CONTENT_STRATEGY.md`
- `docs/style/BILINGUAL_STYLE.md`
- `docs/style/GLOSSARY.md`

Treat every document as orientation only. Verify task-relevant facts against the source.

## Terms

- **CURRENT BRANCH**: the branch checked out in this repository. Read it with `git branch --show-current`. Never take
  it from documents.
- **EXTERNAL PROJECTS**: the repositories and folders that serve as evidence for portfolio content.
  - They are registered in `internal/PROJECT_SOURCES.md`.
  - They are never copied into this repository and never modified.
  - They do not exist inside any branch of this repository.
- **Public files**: everything tracked by git.
- **Internal files**: everything under `internal/`, which is git-ignored on purpose (ADR-001).
- **Claim statuses**, used in internal ledgers: `VERIFIED`, `PARTIAL`, `NEEDS VERIFICATION`, `DISCREPANCY`,
  `OWNERSHIP NEEDS VERIFICATION`, `OWNER-ATTESTED` (ADR-012), `RESUME-ONLY`.
- **Asset labels**, used in `content/`: `CURRENT`, `PROPOSED`, `HISTORICAL` (ADR-011).

## Working with internal/

- Search tools skip ignored files. Open internal files by path, or use `rg --no-ignore`.
- Never `git add -f` anything under `internal/`.
- Never copy internal text into a tracked file. The one exception is a claim whose ledger row says `Public use: Use`,
  and only in the wording that row allows.
- If `internal/` is missing, this is a public clone. Stop evidence work, and never rebuild evidence from memory.

## Evidence rules (ADR-003)

Source priority for technical facts, highest first:
1. Repository implementation
2. Git history
3. Repository documentation
4. Deployment configuration
5. Tests, benchmarks and logs
6. Resume and LinkedIn
7. The owner's verbal description

- **Sources 6–7 never verify a claim on their own.** A resume claim without repository evidence is `NEEDS VERIFICATION`.
- **When evidence and resume differ**, record a `DISCREPANCY` in `internal/docs/RESUME_CROSSCHECK.md`. Never rewrite
  either side to make them agree.
- **Commit authorship is not proof of design ownership.** For team course projects, the owner's attestation of
  co-implementation is accepted (`OWNER-ATTESTED`, ADR-012). Public copy states the team size, uses "we" for team
  results and "I" for the owner's roles, and never says "solely" about a teammate's work.
- **Incomplete code copies (ADR-013):** resume-described features missing from an incomplete copy are
  `OWNER-ATTESTED (code not preserved)`.
  - Don't link the incomplete repository as proof of those features.
  - Unmeasured metrics stay off the site unless the owner confirms them.
- **Never rank projects** by lines of code, file count, commit count or dependency count.

## Non-negotiable boundaries

- **External projects are read-only.**
  - Allowed git commands: `log`, `show`, `grep`, `blame`, `ls-files`, `rev-parse`, `remote -v`, `branch -a`,
    `shortlog`, and `status` (run as `git --no-optional-locks status`).
  - Forbidden: `checkout`, `switch`, `fetch`, `pull`, `stash`, `commit`, creating branches, `reset`, `clean`,
    `push`, and any build or test that writes files.
  - GitHub access is read-only `gh api` / `gh repo view`.
- **Never open secret files:** `.env*` (except `*.example`), `*.tfstate*`, `*.tfvars` (except examples), `*.pem`,
  `*.key`, `*.p12`, `*.jks`, `*.pkrvars.hcl`, `local.properties`, `credentials*`. You may record that they exist.
- **Never write these into any file:** secrets, tokens, account IDs, private IPs, internal hostnames, private URLs,
  personal emails or user data. Use placeholders such as `<REDACTED:TOKEN>` or `<CLOUDFLARE_TUNNEL_TOKEN>`.
- **Never publish:**
  - instructor course materials;
  - graded or exam work;
  - classmates' names or faces;
  - student IDs;
  - third-party copyrighted files.
- **Owner-only actions:** pushing, repository visibility, GitHub Pages, DNS, editing resumes, and any change to an
  external project. Do these only when the owner explicitly asks in the current task.
- **Discovery gate (ADR-009, ADR-011):** no site code, no page text and no facts files until
  `internal/CURRENT_STATE.md` shows the gate cleared.
  - Before the gate, `content/` holds only the skeleton, meaning `ASSETS.md` manifests and reviewed, labeled assets.
    See `content/README.md`.
  - When pages are written, use the staged assets as their manifests specify.
- **Diagrams (ADR-008):**
  - They come from the implementation.
  - Each one is labeled `CURRENT` or `PROPOSED`.
  - Never draw a planned component as deployed.

## Content rules for the build phase

- **Language parity (ADR-005):** every public page exists in English and Chinese, with the same structure and the
  same facts.
- **Numbers and outcome claims** come only from ledger rows marked `Public use: Use`, with their stated conditions.
- **Status labels are honest**, e.g. "Implemented, not deployed / 已实现，未部署".
- **Complement the resume, don't repeat it (ADR-007).**
  - Show planning and architecture-design work: problem framing, options, decisions, phased plans, and CURRENT vs
    PROPOSED diagrams.
  - Quant AI is described by its implementation, not by its results.
- **Modular projects (ADR-006):**
  - Each project is a self-contained module.
  - Track membership lives in the project's metadata.
  - Ordering lives only in the track registry.

## Keeping documents current

| Fact | Home |
|---|---|
| Sources, access rules, Final Discovery Summary | `internal/PROJECT_SOURCES.md` |
| Project facts, planning evidence, claim ledger | `internal/docs/projects/<slug>.md` |
| Resume text and discrepancies | `internal/docs/RESUME_CROSSCHECK.md` |
| Polished resume and site copy (EN / 中文) | `internal/docs/RESUME_POLISHED.md` |
| Staged assets and their intended use | `content/projects/<slug>/ASSETS.md` |
| Positioning, track order, overlap with the resume | `internal/docs/CONTENT_STRATEGY.md` |
| Effort and confidence | `internal/docs/ESTIMATE.md` |
| Phase, gate, owner actions, log | `internal/CURRENT_STATE.md` |
| Policies | `DECISIONS.md` |
| Terminology | `docs/style/GLOSSARY.md` |

- Record each fact once, in its home, and link to it elsewhere.
- Security findings go to the owner in chat and into the owner-only notes in `internal/`. Never put them in a tracked
  file.

## Before any commit

Commits and pushes happen only when the owner asks. Each of these checks must print nothing:

```bash
# Nothing from internal/ is tracked
git ls-files | grep -E '^internal/|\.local\.md$'
# Staged changes contain no local paths or secret patterns
git diff --cached | grep -nE '/Users/|AKIA[0-9A-Z]{16}|PRIVATE KEY|key-[0-9a-f]{32}|[0-9]{12}'
# Staged changes contain no private-range IPs
git diff --cached | grep -nE '(^|[^0-9.])(10\.[0-9]{1,3}|192\.168|172\.(1[6-9]|2[0-9]|3[01]))\.[0-9]{1,3}\.[0-9]{1,3}'
```

`git status --porcelain --ignored` must show `internal/` as ignored (`!!`).
