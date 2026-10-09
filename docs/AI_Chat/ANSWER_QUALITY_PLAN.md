# Answer quality improvement plan

Date: 2026-10-09. Status: implemented locally for offline evaluation (ADR-025); not deployed. Real-model evaluation remains pending.

## Findings from the current implementation

- Knowledge includes public project metadata AND rendered EN/ZH narratives, not metadata alone
  (`src/lib/ai/public-projection.ts`, `scripts/build-worldbook.mjs`). External repositories and internal evidence
  documents are not runtime sources. Local file availability does not mean the model can read those files.
- The local world book contains 173 entries. Personal Writing LoRA has 11 Chinese entries, covering planning,
  decisions, architecture, infrastructure, job handoff, scale-from-zero, serving, validation and next steps.
- Retrieval uses BM25, aliases and distinctive title tokens. Project identity and question-word coverage influence
  confidence, but confidence does not measure whether the excerpts cover all aspects needed for an answer.
- For “介绍一下个人分隔化写作项目，具体做了哪些工作？”, the local search identifies LoRA, but coverage is 0.7,
  below 0.75. `selectSources` supplies profile overview, LoRA problem and LoRA overview, omitting technical sections.
- For “LoRA 项目为什么用 SQS？”, the six selected entries do not include `job-handoff`, which explains at-least-once
  delivery and safe task handoff. This is a coverage gap, not proof that every possible model answer would fail.
- Main/style/example/reminder prompts emphasize fixed replies, short answers and limitations. They do not adequately
  demonstrate a substantive recruiter explanation or technical discussion. Output defaults to 600 tokens.
- Roadmap and figure data are omitted by the projection. Their public semantic content may therefore be missing
  unless the narratives repeat it. Assess this per project; do not serialize metadata wholesale.
- Live model behavior and the live backend knowledge version were not checked in this task.

## Proposed implementation order

1. **Make evaluation cases first.** Cover all nine projects, EN/ZH names, shortened names, bounded spelling errors,
   descriptive references, ambiguous candidates, page context and follow-ups. Include recruiter summaries and
   technical why/how questions. Assert project identity, necessary evidence sections and preserved scope rules.
2. **Resolve project identity separately.** Add reviewed project aliases and descriptive cues in the project's
   metadata, with a strict schema and explicit public projection. Combine exact aliases with bounded fuzzy matching;
   require a meaningful candidate margin. Preserve explicit project references over page context. Ambiguous
   references should produce a short clarification rather than an invented project selection.
3. **Select evidence by answer needs.** Separate in-scope intent, project identity, relevance and evidence coverage.
   A recognized project must not lose its technical material solely because the visitor misspelled its name.
   Assemble an overview plus complementary sections for responsibility, architecture, decisions and validation,
   selected for the question within the existing context budget. Avoid filling the budget with redundant sections.
4. **Audit public knowledge coverage.** Compare each public page with its projection and world-book entries,
   including visible roadmap states and figure explanations. Add only missing, already-public semantic text through
   explicit field whitelists; keep internal claims, private material and external files out. Enrich a project's
   public content only after evidence review where the public narrative itself is insufficient.
5. **Revise the assistant's communication contract.** Update the design first, then main, character, owner-persona,
   examples and post-history blocks together. Recruiter answers should connect responsibility and concrete work to
   relevant capabilities. Technical answers should explain implementation, decisions, tradeoffs and validation.
   Permit supported synthesis and portfolio-specific role-fit analysis, identifying interpretation as such.
   Answer known parts before explaining missing details. Keep attribution, measurement conditions, privacy and
   refusal boundaries. Adjust length and output budget consistently, without hardcoding a model or provider.
6. **Verify offline, then with models.** Inspect assembled prompts without loading secret configuration, run both
   build modes and mock tests, and check source links and scope-regression cases. Real-provider evaluation requires
   owner authorization and compares factual coverage, naturalness, useful depth and unsupported claims. Mock tests
   alone cannot certify the quality of generated prose.

## Release considerations

Content and knowledge changes require rebuilding and updating the backend before publishing the site. Verify the
backend knowledge version against the generated manifest. Commit, push, deployment, stack changes and real model
calls are separate owner-authorized actions. The homepage ordering change is independent and already implemented
in `content/catalog.yaml`; validation is recorded in CHANGELOG.
