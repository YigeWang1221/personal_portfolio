# Bilingual Writing Style

- **Scope:** all public content — site pages, project pages, captions, the résumé page.
- **Internal documents** are written in English.
- **Terminology** lives in [`GLOSSARY.md`](GLOSSARY.md).

## Principles

1. **Evidence first.**
   - Every number has a source: a claim in the internal ledger.
   - Every number states its condition: hardware, dataset, run count, date.
2. **Same facts in both languages.** Write each language natively; never translate sentence by sentence.
3. **Mechanism over adjectives.** Say what the system does and why, not how impressive it is.
4. **Honest scope.**
   - Say what you owned in team work.
   - Put the status label next to the title.
5. **Show the thinking.** Planning and architecture decisions are content, not background.

## Reading layers

Every project page serves three readers.

| Layer | Reader | Content | Budget (EN / 中文) |
|---|---|---|---|
| Scan (30 s) | Recruiter | Title, one-line problem, role, status label, stack chips, 2–3 verified outcomes | ≤ 60 words / ≤ 120 字 |
| Read (3 min) | Hiring manager | CURRENT architecture diagram, how the work was planned, 3–5 key decisions with trade-offs, what I owned | 300–500 words / 600–900 字 |
| Deep dive | Engineer | Decision records, PROPOSED design and roadmap, failure analysis, testing and operations, next steps, code links | As needed |

## Showing planning and architecture ability

Use this pattern for each key decision:

| Step | Question it answers |
|---|---|
| Context | What problem or constraint forced a decision? |
| Options | What alternatives were considered? |
| Decision | What was chosen? |
| Trade-off | What did it cost, and what did it buy? |
| Evidence | Where in the code, config or log does this show? |
| Outcome / status | Did it work? Is it deployed? What is next? |

- **Show planning with a phase or milestone timeline:**
  - taken from the project's real history (e.g. phases, milestones, assignment iterations);
  - include the unfinished phases, labeled as planned.
- **Show architecture as a CURRENT diagram**, and add a separately labeled PROPOSED diagram when a design goes
  further than the deployment.

## Team projects (ADR-012)

Team course projects count fully toward experience and skills. Frame them so they stay honest and defensible.

| Situation | English pattern | 中文写法 |
|---|---|---|
| Header | "Course project · team of 3" | "课程项目 · 3 人团队" |
| Team result | "We benchmarked FSDP against DDP…" | "团队对比了 FSDP 与 DDP……" |
| Owner's lead area | "I led the backend: 9 schemas, REST APIs…" | "我主导后端：9 个数据模型与 REST API……" |
| Shared implementation | "I co-implemented the delivery workflow and debugged teammates' features" | "我参与实现配送工作流，并协助队友调试与实现功能" |
| Avoid | "Solely built…", "single-handedly…" for teammate-authored parts | 避免用"独立完成""一手打造"描述队友编写的部分 |

## Screening-friendly structure

- Lead with a role-relevant title and the problem. Outcomes come next.
- Use the industry's standard terms, because screeners search for them. Use them only when the work backs them.
- Tell one clear story per project, rather than listing every technology touched.
- Keep the résumé page and the PDF résumé consistent: same titles, dates and numbers.

## English

- Be concise and use the active voice.
- Use first person for owned work ("I designed…"). For team work, state the team size ("In a team of three, I…").
- Prefer verbs of mechanism: designed, implemented, measured, replaced, reduced, automated.
- Avoid hype: "cutting-edge", "revolutionary", "seamless", "world-class", "blazing-fast". Use "robust" only when
  failure cases were tested.
- **Numbers** = value + unit + condition, e.g. "p95 latency 120 ms at 50 requests/s (single load test)".
- **Dates:** "Dec 2026"; ranges as "Mar–Apr 2026".
- **Headings:** sentence case.

## 中文

- **Tone:** 专业、克制、准确。以机制和证据说话，不用宣传腔。
- **避免翻译腔**，例如"进行了……的操作""被……所……"。
- **避免营销词：** 赋能、打造、闭环、抓手、颠覆、极致、全链路（除非确指）。
- **Keep standard English terms**, e.g. DDP、NCCL、FastAPI、LoRA、Terraform、CI/CD. 首次出现可加中文说明，如"幂等（idempotency）".
- **Spacing and punctuation:**
  - 中文与英文、中文与数字之间加空格，如"在 4 块 V100 上使用 PyTorch DDP"。
  - 使用全角中文标点；英文专有名词内部保持半角。
- **Numbers:** 数值 + 单位 + 条件，与英文版完全一致（两种语言读取同一份事实数据）。
- **Dates:** 2026 年 12 月；区间写作"2026 年 3—4 月"。
- **School name:** 写"美国东北大学（Northeastern University）"，避免与沈阳的东北大学混淆。
- **Keywords:** 高并发、高可用、微服务、分布式等关键词，只有在有证据支持时才使用。

## Status labels

The same label is used in both languages. Labels are defined in the glossary.

| EN | 中文 | Use when |
|---|---|---|
| Self-hosted pilot | 自托管试运行 | Running on owned hardware for limited use |
| Implemented, not deployed | 已实现，未部署 | Code exists and is tested but has never run in its target environment |
| Course project (team of N) | 课程项目（N 人团队） | Coursework; state the team size |
| Course project (solo) | 课程项目（个人） | Coursework done alone |
| Undergraduate capstone (solo) | 本科毕业设计（个人） | The undergraduate capstone |
| Course benchmark | 课程基准实验 | Measurement-focused coursework |
| Research prototype | 研究原型 | Exploratory research code |
| Archived | 已归档 | No longer maintained |

## Numbers and claims

- Use only values from ledger rows marked `Public use: Use`, and carry their conditions.
- Keep the evidence's precision, or round conventionally. Never round in the flattering direction.
- A percentage improvement needs a stated baseline. Without one, describe the mechanism instead.
- Say when a measurement comes from a single run.

## Diagrams and media

- Label diagrams in English; both locales share them. Write a caption in each language.
- Mark each diagram `CURRENT` or `PROPOSED`, using the same visual convention on every page.
- Early sketches and wireframes are `HISTORICAL` (ADR-011).
  - Show them only in "How it was planned" sections.
  - Place them next to the final design, with a caption such as "Early wireframe (2026-06) → final design".
- Screenshots come only from demo or showcase data. Never show real user data, private hosts or credentials.
- Mask any privacy- or payment-related value that has to appear in text, a screenshot or a diagram (account names,
  emails, hostnames, billing details) as `*****`.
