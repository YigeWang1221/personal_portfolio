# AI 助手实施日志

SDD-AICHAT-001（`AI_CHAT_DESIGN.md`）的实施记录。每完成一个功能或阶段追加一节，内容包括：改了哪些文件、设计理由、执行过的命令及脱敏后的结果、哪些检查没有执行及原因、剩余的风险和钩子。

所有者决定 O-4：实施期间只改文件，不 commit、不 push、不部署，提交时机由所有者决定。

---

## 2026-10-08 · P0 现场确认与文档整理

**结论：** 16 个钩子都已给出结论，见 `deployment-contract.md` §2、§3。设计文档升到 v2.1。

**文件**
| 文件 | 变更 |
|---|---|
| `docs/AI_Chat/AI_CHAT_DESIGN.md` | 由 `com.apple.SetupAssistant.plist.backup` 改名而来，内容不变的部分原样保留。升到 v2.1，改动包括：ADR 编号 019 → 022；后端改用 `node:http`、零依赖；key 改为环境变量；compose 项目改为 `ai_web`；统一 system / post-history 的放置方式；`run_worker_first` 加入 `/api`；新增 `build-ai.mjs` 统一编排；补齐白名单；各钩子写入结论；风险登记新增 3 条；新增附录 C |
| `docs/AI_Chat/deployment-contract.md` | 新建。内容：所有者决定 O-1 至 O-4、LOCAL / WEB 钩子结论、运行时契约、待实测项 T-1 至 T-5 |
| `docs/AI_Chat/CHANGELOG.md` | 新建（本文件） |
| `DECISIONS.md` | 新增 ADR-022（AI 助手，Proposed）和 ADR-023（联系邮箱更正，Accepted）。该文件规定不改已接受的记录，所以 ADR-015、016、019 原文不动，由新记录写明修订关系 |
| `AGENTS.md` | 新增 "AI chat work" 一节，内容是设计文档 §13.3 的规则，路径改为 `docs/AI_Chat/`，并补充：不在受跟踪文件中写栈内名称，改动 Mac mini 栈前须征得所有者同意 |
| `.gitignore` | 新增 `/generated/`、`.dev.vars*`、`content/ai/prompts/local/`、`backend/.env`、`backend/state/` |
| `content/profile.yaml`、`scripts/check-dist.mjs` | 公开邮箱 `northeatsern` → `northeastern`（ADR-023） |

**命令与结果**
- `npm ci --prefer-offline`：成功，安装了 225 个包。提示 `undici@8.11.2` 要求 Node ≥22.19，本机是 22.13.1（deployment-contract T-3）。
- `npm run build`：邮箱修正前后各运行一次，都通过（30 个页面，1042 个链接）。修正后的 `dist/` 已另存，作为 T-STATIC-02 的比较基线（放在会话临时目录，不进仓库）。
- 栈的检查只用了只读命令：`docker ps`；`docker inspect`，只取 Labels、Mounts 和网络别名，**没有读取 Env**；对 compose 文件做了 grep，只看结构键。没有读取 `.env` 等密钥文件。

**未执行**
- `internal/` 不存在，所以无法更新 `internal/CURRENT_STATE.md`（AGENTS.md 规定的阶段与日志主页）。本日志暂时代替它记录 AI 助手的进度。
- 没有对任何 provider 发起真实调用（P4 才做）。

**剩余风险**
- 设计文档提到了所有者的自托管栈（例如 SillyTavern）。仓库是公开的，是否公开这些信息由所有者在提交前决定。

---

## 2026-10-08 · P1 知识与 Prompt 构建

**结论：** 构建阶段的知识流水线已实现，状态为 CURRENT。在不开启聊天的情况下，`dist/` 与改动前的基线**逐字节一致**。T-KB-01 至 T-KB-05、T-PROMPT-01 至 T-PROMPT-03 全部通过。

**新增文件**
| 文件 | 作用 |
|---|---|
| `src/lib/ai/public-projection.ts` | 公共投影：按白名单逐个取字段；复用 `renderSection` 的结果，以及 `termText`、`statusLabel`、`teamLabel`、`formatPeriod`、`localePath`；HTML 转为纯文本；记录每个 section 中出现了哪些事实 |
| `src/pages/ai/knowledge.json.ts` | 只在构建期使用的端点（写法与 `robots.txt.ts` 相同） |
| `shared/ai/tokenize.mjs` | 分词：英文词干化，中文 bigram，别名按词干后的整词匹配 |
| `shared/ai/retrieve.mjs` | BM25 检索；按当前页面加权；同一 section 只保留一种语言；3000 token 预算；低于阈值时退回 profile 概览 |
| `shared/ai/assemble.mjs` | 规范 prompt：一段 system，加历史，加 `<instructions>` 包裹的提醒和问题；按 drop_order 裁剪 |
| `scripts/build-worldbook.mjs` | 世界书：每个项目一个概览条目，各 section 分块，5 个 profile 条目，1 个 catalog 条目，背景页和规划页的 section；另含 `pages` 映射（路径 → 标题） |
| `scripts/build-prompts.mjs` | prompt 编译与校验，错误信息带文件名和行号 |
| `scripts/build-ai.mjs` | 编排入口：写入临时目录后原子替换 `generated/ai/`，并写 manifest |
| `scripts/check-ai-artifacts.mjs` | 知识产物安全闸门（§5.2 的全部检查项，另加邮箱白名单和 manifest 哈希校验） |
| `scripts/preview-prompt.mjs` | `npm run chat:preview`：打印检索命中和组装后的 prompt，不调用模型 |
| `content/ai/prompt-order.yaml`、`aliases.yaml`、`prompts/00…70` | 中英双语 prompt 初稿和 41 组别名 |
| `tests/ai/{helpers,tokenize,prompts,knowledge}.test.mjs` | 共 23 个测试。knowledge 测试在仓库的临时副本中运行真实的 astro 构建 |

**修改文件**
- `scripts/postbuild.mjs`：把 `dist/ai/knowledge.json` 移到 `generated/raw/projection.json`；`dist/ai/` 中如有其他文件则构建失败。
- `scripts/check-dist.mjs`：claim ID、`internal/`、workers.dev 和内部名称的扫描扩展到 `.json` 和 `.webmanifest`。
- `package.json`：build 串改为 `astro build → postbuild → build-ai → check-dist → check-ai-artifacts`；新增 `test`、`check:ai`、`chat:preview` 三个脚本。
- `.github/workflows/ci.yml`：构建后运行 `npm test`。
- 文档：`ARCHITECTURE.md`（新增 "CURRENT: AI assistant knowledge build"，PROPOSED 中加入运行时部分）、`content/README.md`（"AI assistant" 写作规则）、`README.md`（命令、构建闸门、文档地图）、`PROJECT_CONTEXT.md`（仓库地图、成熟度）、`AI_CHAT_DESIGN.md`（manifest 字段、overrides 记录方式）。

**设计上的取舍**
- **prompt 措辞**：站点正文是所有者的第一人称（"I own…"），所以 world-info 中加了一句说明："I" / "我" 指所有者，"we" / "我们" 指团队。所有者的代词未知，所以英文用 "they"，中文直接称名字，不用"他"或"她"。
- **中文模板**：变量与中文之间不留空格，例如"与{{owner_name}}确认"。
- **overrides 记录**：manifest 中记的是被覆盖的文件名（例如 `10-character.md`），设计文档已同步。
- **检测范围**：泄漏检测对 prompt 文件全文生效，包括注释。第一次构建时它拦下了我在 starters 注释中写的需求编号 "FR-03"，说明检测是有效的。

**命令与结果**
- `npm run build`：通过。173 个条目，en / zh 的 section 集合一致，产物约 0.26 MB；check-dist 和 check-ai-artifacts 都通过。
- `diff -rq <基线> dist`：没有差异。
- `npm test`：23 个测试全部通过（knowledge 套件约 4.4 秒）。
- `npm run chat:preview`：试了 3 个问题（"他做过哪些后端项目"、Cloud-Native 团队归属、天气），输出符合预期格式。

**已知问题（转入 P2）**
- **检索排序需要调优**：问 Cloud-Native 时，SmartBuyer 的概览条目排在 Cloud-Native 之前；天气这类无关问题因为 "Boston" 命中教育条目而超过阈值 4。按设计（§9 T-RET），用 20 道题的测试集标定阈值和权重，放在 P2 做。
- **prompt 初稿待审阅**：`content/ai/prompts/` 的措辞（尤其是 `20-owner-persona.md` 中的定位口径）需要所有者审阅。

**未执行**
- `--provider mock` 和 `--live` 预览依赖后端适配器，放在 P2。

---

## 2026-10-08 · P2 后端（mock）

**结论：** `portfolio-api` 已实现，状态为"已实现，未部署"。T-PROMPT-04、T-RET、T-FB-01 至 T-FB-05、T-SSE、T-CANCEL、T-LIMIT、T-XSS（服务端部分）、T-LOG 全部通过。`npm test` 共 52 个测试，全部通过。镜像已在本机完成构建并运行验证，验证后容器、volume 和镜像都已删除。

**新增文件**
| 文件 | 作用 |
|---|---|
| `backend/src/config.mjs` | 读取环境变量（O-3），未填 key 的 provider 自动禁用；DeepSeek 请求自动带 `thinking: disabled` |
| `backend/src/server.mjs` | `node:http` 服务：origin key 常量时间比较；两个路由；JSON 错误体 `{code, retryable}`；413 时排空请求体后再返回；`PROVIDER_MODE=mock` |
| `backend/src/chat.mjs` | 严格的请求 schema；切换判定表（§5.6）；时间预算；只在正文前切换；只把回答实际引用的 `[Sn]` 映射为来源 |
| `backend/src/providers/{openai-compat,gemini,mock,errors}.mjs` | A 和 B 共用 OpenAI 兼容适配器，C 用 Gemini 适配器；直接用 fetch，没有自动重试；mock 用脚本控制行为 |
| `backend/src/{sse,limits,knowledge,log}.mjs` | 增量 SSE 解析；限流、并发、每日计数（计数文件不可用时拒绝生成）；快照哈希校验；字段白名单日志 |
| `backend/tests/*.test.mjs`、`fixtures/retrieval-cases.json` | 29 个后端测试，以及 24 道 T-RET 题目 |
| `backend/Dockerfile`、`.dockerignore`、`backend/package.json`、`backend/.env.example` | 镜像（基础镜像按 digest 固定，uid 10001，只读根文件系统，带 HEALTHCHECK）；只把需要的目录发给 builder；变量说明只含占位符 |
| `deploy/compose.portfolio.yaml` | 栈的覆盖文件模板：`name: ai_web`、`PORTFOLIO_*` 变量、外部网络 `${STACK_NETWORK}`、不映射端口 |

**修改文件**
- 检索标定（`shared/ai/retrieve.mjs`、`tokenize.mjs`、`content/ai/aliases.yaml`）：
  - 按项目名加权 ×2.5；
  - 置信度改为"覆盖率 ≥ 0.75，且点名了项目或命中了别名词汇"；低于阈值时，profile 概览之外再加 2 条最佳命中；
  - 去掉英文所有格 `'s`；含 `. - + #` 的词不做词干化；英文别名按词干后的整词匹配；
  - 别名补充了动词形式（validate/validated、plan/planned 等），以及 know/familiar/熟悉/掌握、part/部分。
- `scripts/build-worldbook.mjs`：**修复了一个 bug**。生成的项目概览条目原本用 section id `overview`，与 Cloud-Native 正文里的 `overview` section 重名（`cloud-native:{en,zh}:overview` 各出现两次），现改为 `@overview`。构建脚本和 `check-ai-artifacts` 都新增了 id 唯一性检查。
- `scripts/preview-prompt.mjs`：新增 `--provider mock`，以及 `--provider A|B|C --live`（真实调用；不加 `--live` 时会拒绝执行）。
- `package.json`：`test` 加入后端测试；新增 `api:dev`。
- 文档：`AI_CHAT_DESIGN.md`（§5.6 检索、附录 C）、`ARCHITECTURE.md`（后端标为 CURRENT，已实现、未部署）、`README.md`（后端命令和镜像构建）、`deployment-contract.md`（基础镜像 digest、运行形态、变量前缀）、`PROJECT_CONTEXT.md`、`AGENTS.md`（npm test 要求）。

**T-RET 标定结果**（`npm run build` 之后运行）
- 相关问题 21/21 命中预期来源：其中设计文档要求的 16 道全部命中，标定时另加的 "Does Yige know Python?" 也命中了技能条目。
- 无关问题 7/7 低于阈值：天气（中英）、写排序代码（中英）、披萨、电影、薪资。
- 页面加权（"How was it validated?"，在 KK Knock 页面上提问）和追问延续上一话题，都有对应测试覆盖。
- 局限：词法检索无法判断意图。例如 "Write me a Python function" 低于阈值，是因为没有用到作品集词汇，而不是因为系统理解了这是离题请求。真正的离题拦截由 prompt 规则 6 完成，P4 用 T-POLICY 做真实验证。

**命令与结果**
- `npm run build`：通过（173 个条目）。`npm test`：52/52 通过。
- 本机冒烟测试（mock 模式）：`/api/health` 返回 available；不带 key 返回 403；SSE 事件依次为 meta、delta、sources、done。
- `docker buildx build --platform linux/arm64`：成功。以只读根文件系统、`cap-drop ALL` 的方式运行，健康检查、聊天和计数文件写入都正常。验证后已删除容器、volume 和镜像。镜像只绑定在 127.0.0.1 上，没有接入栈网络。

**未执行**
- 没有对任何 provider 发起真实调用（P4，需所有者同意）。
- Gemini 3.x 的 `thinkingConfig` 没有设置，沿用模型默认值。`MAX_OUTPUT_TOKENS` 默认 1024，P4 实测时如发现思考占用了输出预算，再调整。

---

## 2026-10-08 · P3 前端浮窗与 Edge Worker

**结论：** 浮窗和 Edge Worker 已实现，状态为"已实现，未部署"。各项测试结果：
- T-STATIC-02 通过：开关关闭时，`dist/` 与基线**逐字节一致**；
- T-ROUTE-01 通过；
- T-SESSION 通过：换页、刷新、新开标签页、知识版本变化四种情况；
- T-UI 通过：键盘、Esc、1440px 和 390px 宽度；
- T-E2E 通过：浏览器 → `wrangler dev` → mock 后端。

`npm test` 共 62 个测试，全部通过。deployment-contract 中的 T-1、T-2、T-3 已有实测结论。

**新增文件**
| 文件 | 作用 |
|---|---|
| `src/components/ChatWidget.astro` | 浮窗骨架：启动按钮、对话框、隐私说明、预设问题（读取 `70-starters.yaml`）、输入框、停止和清空按钮、联系出口、aria-live 区域；所有元素默认 hidden |
| `src/client/chat.js` | 客户端逻辑：sessionStorage 状态（读入时清洗）、SSE 解析、409 时重置并重试一次、停止与重新生成、只用 textContent 渲染、`[Sn]` 只链接到站内路径、处理中文输入法（组字时按 Enter 不发送）；纯函数在 VM 中测试 |
| `src/client/chat.css` | 桌面 380×560，≤480px 时变为底部抽屉（85dvh），适配安全区，沿用站点的设计 token |
| `edge/api-proxy.ts` | Worker：只处理 `/api` 和 `/api/*`；校验 Origin、Content-Type 和 32 KiB 上限；重新构造发往 origin 的请求（Access token、origin key、IP 的 HMAC 伪名）；SSE 不缓冲透传；非 JSON、非 SSE 的响应和 3xx 一律转为 503；转发 abort 信号 |
| `tests/edge/api-proxy.test.mjs`、`tests/ai/chat-client.test.mjs` | Worker 测试 6 个；客户端纯函数测试 4 个（SSE、XSS、会话裁剪、状态清洗） |

**修改文件**
- `src/layouts/BaseLayout.astro`：开关打开时输出 chat.css、chat.js（带 `?v=` 哈希）和浮窗组件。
- `src/lib/site-config.mjs`：新增 `chatEnabled`（读取 `PUBLIC_CHAT_ENABLED`）。
- `scripts/postbuild.mjs`：开关打开时复制 chat.js 和 chat.css。
- `scripts/check-dist.mjs`：`ALLOWED_SCRIPTS` 集合；开关打开时两个文件为必需文件，关闭时出现任何助手文件都会失败。
- `wrangler.jsonc`：新增 `main`、`ASSETS` binding、`run_worker_first: ["/api", "/api/*"]`、`compatibility_flags: ["enable_request_signal"]`。
- `content/site/{en,zh}.yaml`：新增 `chat:` 文案，共 29 个键。双语一致性检查通过。
- **检索补充标定**（实测时发现 3 道预设问题低于阈值）：
  - 概览条目的标签 "Technologies" 改为 "Built with"，因为它是技能类别名，原来会出现在每个项目概览中；
  - 别名的查询权重 ×2；
  - "哪些项目"一类的列举问题，catalog 条目加权 ×3；
  - 计算覆盖率前先去掉通用疑问词（体现、方面、主要……）；已知别名覆盖的字和词计入覆盖；
  - 新增 capability 别名组，cloud 组加入"云"；
  - T-RET 加入 6 道预设问题，并要求每一道都达到可信阈值。最终结果：相关问题 23/23，无关问题 7/7。
- `package.json`：`npm test` 加入 `--experimental-strip-types`（用于直接测试 Worker 的 TS 源码），并纳入 `tests/edge`。
- 本机开发配置：会话根目录的 `.claude/launch.json` 新增 `portfolio-api-mock` 和 `portfolio-wrangler-dev` 两项。该文件不在仓库内，只含本地测试值。
- 文档：`ARCHITECTURE.md`（新增浮窗与 Worker 章节和 CURRENT 图；Stack、Hosting、CI、Content safety 段落）、`README.md`（Deploy 第 7 步）、`PROJECT_CONTEXT.md`、`DECISIONS.md`（ADR-022 的 Client 条目）、`AI_CHAT_DESIGN.md`（§5.4 实施说明）、`deployment-contract.md`（T-1 至 T-3）。

**浏览器实测**（内置浏览器，`wrangler dev` + mock 后端）
- 1440px 下，在中文项目页点开浮窗：焦点进入输入框；点击预设问题后流式回答，出现 `[1]` 脚注链接和来源列表；aria-live 播报"回答完成。"。
- 换到背景页：面板保持打开，两轮对话都已恢复，没有抢焦点。用键盘输入并按 Enter：因为知识版本已更新，收到 409，出现"助理资料已更新，对话已重置。"，随后自动重试并得到回答。
- Shift+Enter 换行（输入框增高到 2 行）；Esc 关闭面板，焦点回到启动按钮；刷新后对话仍在，面板保持关闭。
- 新开标签页时对话为空。390px 下为底部抽屉（717/844 px），没有横向溢出。
- 停止：回答标为未完成，出现"重新生成"按钮，不写入存储。重新生成后只剩一组问答，并写入存储。回答引用指向 `/projects/cloud-native/#planning`。
- 后端停止时（模拟 T-STATIC-01）：显示"暂时不可用"，问题放回输入框，页面正常；`/api/health` 经 Worker 返回 JSON 503。
- 控制台只有上述有意制造的 409 和 503，没有 CSP 违规。
- 根据实测，把英文 placeholder 改短为 "Ask a question…"（原文在单行输入框中显示不全），中文同步改为"输入你的问题……"。

**未执行**
- **读屏器实测**（T-UI 中的读屏器部分）：已用 role、aria-label、aria-live 和 visually-hidden 前缀做了标注，但没有用 VoiceOver 实际走一遍，建议所有者上线前手工确认。
- **CI 上的 Node 版本**：CI 用 `.node-version` 指定的最新 Node 22.x 运行 `--experimental-strip-types`（Node 22.18 起该标志不再需要，但仍可接受），本地只在 22.13 上验证过。

**剩余风险**
- `wrangler` 会发送匿名遥测。本地命令已加 `WRANGLER_SEND_METRICS=false`，但第一次 `--dry-run` 没有加。

---

## 2026-10-08 · 所有者三项决定：模型改为 plan、严格限定回答范围、compose 项目改名

### 1. 模型由所有者选定（O-5）
- `backend/src/config.mjs` 重写，去掉所有默认服务和默认模型名，也去掉 DeepSeek 专用的 `thinking` 参数。
- 每个 plan 三个变量：`API_URL_PLAN_x`、`MODEL_PLAN_x`、`KEY_PLAN_x`（x = A、B、C）。三个值缺一个即禁用。
- 协议由 URL 判断：
  - Google Gemini API 地址（路径中不含 `/openai`）：用 Gemini 适配器；
  - 其他 URL：OpenAI 兼容，自动补 `/chat/completions`；
  - 带账号密码的 URL 一律拒绝。
- `backend/.env.example` 改为空的 `# plan A` / `# plan B` / `# plan C` 三组；`deploy/compose.portfolio.yaml` 同步修改。
- 新增 `backend/tests/config.test.mjs`（4 个测试）。

### 2. 只回答简历和资料相关内容（O-6）
**新增文件**
- `content/ai/guard.yaml`：规则可编辑，包括 greeting、injection、task、personal、private。
- `shared/ai/guard.mjs`：规则匹配、范围判断、历史清洗、回答检查。
- `tests/ai/guard.test.mjs`：T-POLICY 的离线部分。必须拒绝 41 条（含中英文），必须放行 19 条。放行组特意收入了容易误伤的问题，例如"他写了哪些代码""身份认证怎么做的""领域对象有哪些""高可用""health checks""act as team lead"。

**修改文件**
- `backend/src/chat.mjs`：在调用模型之前执行拦截。被拒绝的请求不占并发槽位，不计入每日上限，也不调用模型。流式过程中检查回答，出现代码或复述指令时中止，并发送 `replace` 事件。
- `backend/src/limits.mjs`：滥用封禁（10 分钟内 3 次，封禁 10 分钟）。
- `src/client/chat.js`：处理 `replace` 事件；`refused` 和 `blocked` 的回答不写入存储。
- `content/ai/prompts/00-main.md`：第 2、6、7 条收紧（只谈作品集；其他一律用固定话术；不写代码和长文；控制回答长度）。`50-post-history.md` 和 `40-examples.md` 补充了离题示例。`60-canned.yaml` 新增 `greeting`。
- `MAX_OUTPUT_TOKENS` 默认值从 1024 降到 600。
- `content/ai/aliases.yaml`：新增 high availability / 高可用一组。
- `backend/tests/server.test.mjs`：新增 3 个 HTTP 级测试：
  - 离题请求不调用模型、不占用每日配额；
  - 连续滥用会被封禁，其他访客不受影响，薪资类问题不算滥用；
  - 写代码的回答会被替换，代码围栏不会发出去。

**调优中发现的问题**
- 原本把单独的 "hi" / "thanks" 当作无关问题并记滥用，三句客套话就会封掉一位真实的招聘方。改为 greeting 规则：友好引导，不记滥用。
- "什么时候可以入职"没有命中 personal 规则，已补上对应的时间词。

**浏览器实测**（`wrangler dev` + mock）
- 依次提问"写一首关于大海的诗""thanks""What is KK Knock?"：分别得到 off_topic、greeting 和正常回答；sessionStorage 中只保存了最后一组问答。

### 3. compose 项目改名为 `ai_web`（O-7，所有者已确认）
**改名前**
- 只读检查：栈的脚本从 compose 文件的 `name:` 读取项目名，不需要修改。
- 本地 AI 任务队列为空，没有加载中的模型，重启不会中断任务。
- 记录基线：6 个容器 healthy，三个公网域名可达。

**T-4 实测**
- 在临时项目上测试：volume 带旧项目标签时只告警，数据照常复用。测试资源已清理。
- 官方文档只说明了 `external: true` 的用法，没有说明"标签不一致"时的具体行为，所以以实测为准。

**执行步骤**
1. 3 个 compose 文件备份为 `*.bak-20261008-aiweb`。
2. `name: st` 改为 `name: ai_web`，并通过 `config -q` 校验。
3. `docker compose -p st … down`：不带 `-v`，不带 `--remove-orphans`。
4. 用三个 compose 文件 `up -d`，6 个容器全部重建，中断约 30 秒。
- 第一次执行时，zsh 没有拆分 `$F` 变量，两条命令都直接报错退出，没有做任何改动。已确认容器未受影响，然后改为把参数直接写在命令里重新执行。

**改名后验证**
- 6 个容器 healthy，标签均为 `ai_web`；栈内网络子网不变。
- 三个卷重新挂载：Key 文件（707 字节）和两个月的用量记录都在。
- 网关 `/health` 正常；隧道 4 条连接；栈的三个公网域名响应与改名前相同；bridge 会话未过期。

**栈侧文档同步**（原文件均备份为 `.bak-20261008-aiweb`）
- 栈的 `AGENTS.md`：项目名改为 `ai_web`，并说明每次 `up` 出现的卷告警属预期。
- `docs/architecture.md`、`.cursor/skills/st-stack/SKILL.md`：项目名同步修改。
- `docs/incremental-changes.md`：新增一条变更记录，写明回滚步骤。

**Docker Desktop**：所有者截图中仍显示 `st`，那是改名前的旧页面。`docker compose ls` 显示 `ai_web running(6)`。

### 命令与结果
- `npm run build`：通过。关闭开关时，`dist/` 仍与基线逐字节一致（T-STATIC-02）。
- `npm test`：79/79 通过。

---

## 2026-10-08 · plan A 指向栈内 Gemini 网关；栈侧覆盖文件已就绪（未启动）

- **所有者决定**：plan A 的 URL 由我写成本地 Gemini 代理的地址，模型由所有者填写。
- **URL 写在哪里**：写在栈目录新增的覆盖文件 `docker-compose.portfolio.yml` 中（固定为栈内网关的 OpenAI 兼容 `/v1`），没有写进 `.env`，因为栈的 AGENTS.md 规定 `.env` 不得由 agent 修改。本仓库的模板和文档只用占位符。
- **连通性验证**：在栈网络上起一个临时容器（用完即删）：网关 `/health` 正常，`/v1/models` 不带 key 返回 401，说明从新容器按服务名可以访问到网关，并且需要 key。
- **可选的模型 id**：在网关 dashboard 的"模型"页查看（客户端填写的 ID）。为满足"10 秒内出现首段文字"，建议选低思考强度或不带思考的型号。
- **覆盖文件内容**：
  - 服务 `portfolio-api`，容器 `st-portfolio-api`，带 build 上下文（`../personal_portfolio`）；
  - 加固项与仓库模板一致（只读根文件系统、uid 10001、`cap_drop ALL`、内存和 PID 上限）；
  - 直接引用栈网络；不映射宿主机端口；
  - `--no-deps` 单独启动，不在 `common.sh` 中，日常命令和 `restart.sh` 都不受影响。
- **校验**：四个 compose 文件一起，以及栈日常使用的三个文件，`config -q` 都通过。校验时用临时的 origin key，不读取、不输出 `.env`。
- **栈侧文档同步**：`AGENTS.md`（文件归属表、Docker 拓扑）、`docs/incremental-changes.md`（新增一条记录）、`.env.example`（新增占位）、`docker-compose.gemini.yml`（注释中的项目名）。原文件都备份为 `.bak-20261008-portfolio`。
- **未执行**：没有构建镜像，没有启动容器，没有任何真实模型调用。
- **补充（所有者提问"为什么找不到 env"）**：仓库根目录新增 `.env.example`，集中列出本仓库用到的全部变量。包括：
  - 构建开关：`SITE_URL`、`SITE_INDEXING`、`PUBLIC_CHAT_ENABLED`；
  - 5 个 Edge Worker secret，并说明生产环境用 `wrangler secret put`，本地用 `.dev.vars`。

  其中说明了模型 key 不在本仓库，而在栈的 `.env` 中。`README.md` 的 Develop 一节加了指引。该文件受 `.gitignore` 中 `!.env.example` 的豁免，会被纳入版本控制，且只含占位符。

---

## 2026-10-08 · 后端改读作品集项目自己的 `backend/.env`（O-8）

**所有者要求**："这个项目读取的是自己文件夹下的 env 而不是 st 下的"，并且"三个 API plan 也挪到这个下面"。

**修改内容**
- **新建 `backend/.env`**（git-ignored，权限 600）：包含 `PORTFOLIO_ORIGIN_KEY`、plan A/B/C 的 `API_URL_PLAN_x`、`MODEL_PLAN_x`、`KEY_PLAN_x`，以及 `DAILY_REQUEST_CAP=100`。plan A 的 URL 已按所有者的要求预填为栈内 Gemini 网关地址，其余全部留空，由所有者填写。AGENTS.md 中"不得把栈内名称写入文件"的规则，对这个 git-ignored 文件按所有者授权开了一个例外，并写明了。
- **栈侧 `docker-compose.portfolio.yml`**：改用 `env_file: ../personal_portfolio/backend/.env`（`required: true`），删掉所有 `${…}` 插值和写死的 plan A URL。用 `config` 校验：容器只得到 11 个作品集变量，栈的任何密钥都不在其中。三个文件的日常配置不变。
- **栈的 `.env.example`**：撤回上一条中加入的作品集占位，改为一行指引。栈的 `AGENTS.md`、`docs/incremental-changes.md` 同步修改；改动前的原文件备份为 `.bak-20261008-envfile`。
- **新增发布防线 `scripts/local-secrets.mjs`**：`check-dist` 和 `check-ai-artifacts` 会读取 `backend/.env`，只要其中长度 ≥12 的值出现在 `dist/` 或知识快照中，构建就失败，报告里只给出变量名。验证方法：在 `dist` 的临时副本里埋入 plan A 的 URL，`check-dist` 报出 "contains the value of API_URL_PLAN_A"，没有输出值本身。
- **`npm run chat:preview`** 改为用 `node --env-file-if-exists=backend/.env` 启动，`--live` 时可以直接使用该文件中的 plan B、plan C。plan A 的网关地址只能在 Docker 网络内解析。
- **文档**：`backend/.env.example`、根目录 `.env.example`、`README.md`、`deploy/compose.portfolio.yaml`（模板改为 `env_file`）、`AI_CHAT_DESIGN.md` §5.7、`deployment-contract.md`（新增 O-8，更新 §4）、`DECISIONS.md`（ADR-022）、`ARCHITECTURE.md`、`AGENTS.md`。

**命令与结果**
- `npm run build`：通过。
- `npm test`：80/80 通过（新增一个泄漏检测测试）。

---

## 2026-10-08 · Worker 配置精简为两项（O-9）

- **所有者意见**：原来要配置的 key 太多。改为精简版：Worker 只需要 `ORIGIN_URL` 和 `ORIGIN_KEY`。
- **`edge/api-proxy.ts`**：
  - `ACCESS_CLIENT_ID` 和 `ACCESS_CLIENT_SECRET` 改为可选，两项都设置了才发送；
  - 删除 `CLIENT_ID_SALT`，访客匿名 ID 改为用 `ORIGIN_KEY` 作为 HMAC 密钥计算；
  - 客户端伪造的 `cf-access-*` 请求头仍然一律丢弃。
- **测试**：`tests/edge/api-proxy.test.mjs` 同步修改，并新增一个测试，验证"两项就够；配置了 Access 时会发送 token"。`npm test` 81/81 通过，`wrangler deploy --dry-run` 正常。
- **取舍**：不使用 Access 时，陌生请求会经过 tunnel 到达 Mac mini，再被后端以 403 拒绝，不会检索资料，也不会调用模型。这与栈中已有的公网域名做法一致（由自己的网关做认证）。
- **文档**：`AI_CHAT_DESIGN.md`（D-2、§5.5、§5.7、§8、附录 C）、`deployment-contract.md`（新增 O-9，修改 §4）、`DECISIONS.md`、`ARCHITECTURE.md`、`README.md`、`wrangler.jsonc` 注释、根目录 `.env.example`、本地 `launch.json`。

---

## 2026-10-08 · 上线（P4 后半与 P5）

所有者在完成 `backend/.env`（origin key 与 plan A 的模型、key）、tunnel 子域名和两个 Worker secret 之后，授权"部署和重新启动"。

**部署前检查**：`backend/.env` 已填项只检查了是否非空，没有读取值。plan A 已启用，B 和 C 留空。wrangler 已登录。Worker secret 列表中有 `ORIGIN_KEY` 和 `ORIGIN_URL`（只看了名字）。

**后端**
1. 用栈侧覆盖文件构建 `portfolio-api:local`，然后执行 `up -d --no-deps portfolio-api`。容器状态 healthy，启动日志显示 `providers:["A"]`，知识版本 `3f8136f8…`。其他 6 个容器没有受影响。
2. 从公网访问 tunnel：不带暗号返回 403，带暗号时 `/api/health` 返回 available（暗号从文件直接读进请求头，没有显示）。
3. 一次真实调用（plan A，英文 T-ATTR）：4 秒内完成，首字 2.7 秒，归属表述正确（单人项目，AI 编码助手按规格生成代码，由所有者审查和集成）。
4. 拦截测试：写代码的请求被拒绝，用时 6 毫秒，没有调用模型。日志中只有白名单字段。
5. **发现并修复一个问题**：真实模型把引用写成 `[S1, S3, S4]`，原来的解析只认识 `[S1]`。服务端 `citedSources` 和客户端 `splitCitations` 都改为支持合并写法（逗号、全角逗号、顿号），并补了测试，`npm test` 83/83 通过。随后重建镜像并重启容器。

**网站**（两步发布）
1. 不带聊天窗的版本 `wrangler deploy`（Version `b70eb4d2…`）。线上 `/`、`/zh/`、项目页、简历页返回 200，`/about/` 返回 301，未知路径返回 404；CSP 头存在；邮箱已改为 northeastern；页面中没有浮窗。`/api/health` 经 Worker 和 tunnel 返回 available，`/api/x` 返回 JSON 404。
2. `PUBLIC_CHAT_ENABLED=true` 构建并部署（Version `6b4c4578…`）。页面中有浮窗，`/js/chat.js` 和 `/css/chat.css` 都返回 200。
3. 在线上浏览器端到端实测（中文 Cloud-Native 项目页，第二次真实调用）：中文提问，中文回答；内容与页面一致（个人项目，列出的职责与 `role` 相符）；引用链接都指向站内页面；对话写入 sessionStorage。

**运维要点**
- **改 plan**（模型、key、地址）：只需编辑 `backend/.env`，然后执行 `up -d --no-deps portfolio-api` 重建容器，不需要重新构建镜像或部署网站。注意 `docker restart` 不会重新读取 env 文件。
- **改网站内容或 `content/ai/` 的 prompt 和规则**：先 `npm run build`，重建镜像并重启后端，再部署网站（先后端，后前端）。
- **关闭聊天窗**：不带开关构建，然后 `wrangler deploy`。

**仍待所有者处理**
- ADR-022 目前仍是 Proposed，由所有者决定是否改为 Accepted。
- 所有改动都还没有 commit。
- 建议用 VoiceOver 手动走一遍读屏流程。
- **ADR-022 状态**：所有者确认后，于 2026-10-08 由 Proposed 改为 Accepted（`DECISIONS.md`），设计文档的状态栏和上线清单同步更新。
