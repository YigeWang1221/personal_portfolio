# AI 助手部署契约（P0 查证结果）

| 项 | 内容 |
|---|---|
| 关联 | `docs/AI_Chat/AI_CHAT_DESIGN.md`（SDD-AICHAT-001）§13 钩子；ADR-022 |
| 查证日期 | 2026-10-08 |
| 标签 | 本文结论均为 **CURRENT**（截至查证日期的实际状态）；"待实测"的条目在对应阶段补结论 |

> 本文只含脱敏信息：域名、key、账号、IP、本机路径一律用占位符。真实值只存在于所有者的 `.env`、Worker secrets 和 Cloudflare 面板中。

## 1. 所有者决定（2026-10-08）

| # | 决定 | 影响 |
|---|---|---|
| O-1 | 后端部署在 Mac mini 现有的自托管 AI Docker 栈（下称"栈"）中；该 compose 项目从 `st` 改名为 **`ai_web`**。容器名、栈内网络名、volume 名、隧道配置不变 | P4 改 3 个 compose 文件的 `name:`，并新增一个 portfolio 覆盖文件；改名会重建该项目的全部容器 |
| O-2 | Provider 顺序 **A（栈内 Gemini 网关）→ B（DeepSeek）→ C（付费 Gemini API）** | 与设计文档一致；H15 风险由所有者接受（§3） |
| O-3 | 所有 key 通过**环境变量**提供，所有者自己填写 `.env` | 取代设计文档原 §5.7 的 Docker secrets 文件方案 |
| O-4 | 实施过程中只改文件，不 commit、不 push、不部署 | 每阶段结束时汇报，由所有者决定提交 |
| O-5 | 模型的服务和种类由所有者选定。env 中只保留 `# plan A/B/C` 三组空变量：`API_URL_PLAN_x`、`MODEL_PLAN_x`、`KEY_PLAN_x` | 代码中去掉所有默认模型名和服务专用参数（例如 DeepSeek 的 thinking 开关）；协议由 URL 判断。H10、H11 的结果保留，供选型参考 |
| O-6 | 只回答简历和资料中的相关内容，其他一律拒绝；防止对话窗被当作通用聊天工具使用 | 新增三层请求拦截（`content/ai/guard.yaml`、`shared/ai/guard.mjs`）和滥用封禁；BR-06 收紧 |
| O-7 | 确认把 compose 项目改名为 `ai_web`（2026-10-08 执行） | 见 §5 T-4 和 CHANGELOG |
| O-9 | 精简配置：Worker 只需要 `ORIGIN_URL` 和 `ORIGIN_KEY`；不使用 Cloudflare Access 的 Service Token；去掉 `CLIENT_ID_SALT` | 代码中 Access 两项改为可选（两项都设置了才发送）；访客匿名 ID 改用 `ORIGIN_KEY` 计算 |
| O-8 | 后端读取作品集项目自己文件夹下的 env，不读栈的 `.env`；三个 API plan 也都放在这里 | 配置文件为 `backend/.env`（git-ignored，权限 600），由栈侧覆盖文件通过 `env_file` 读取；plan A 的网关 URL 也写在这个文件里 |

## 2. LOCAL-CHECK 结果

| 钩子 | 结论 | 证据（命令 / 文件，摘要） |
|---|---|---|
| H1 | 分支 `main`，HEAD `f599b0d`（PR #7，首页三类项目标签页 ADR-021）。未跟踪文件只有 `docs/AI_Chat/` | `git branch --show-current`、`git log -1`、`git status --porcelain --ignored` |
| H1a | `internal/` 不存在（公开克隆状态）。AI 助手只用公开内容，不受影响；证据类工作暂停 | `ls internal` → 不存在 |
| H1b | 本地 Node 22.13.1、npm 10.9.2、Docker Compose v5.1.3。`npm ci` 提示 `undici@8.11.2` 要求 Node ≥22.19（wrangler 依赖）；astro build 不受影响 | `node -v`、`npm ci` 输出 |
| H2 | `scripts/postbuild.mjs` 只做一件事：把 `zh/404/index.html` 移成 `zh/404.html`。在其后加"把 `dist/ai/` 移出 dist"不冲突。`check-dist.mjs` 在 postbuild 之后运行，所以届时 dist 中已无该文件 | `scripts/postbuild.mjs`、`package.json` build 串 |
| H4 | 白名单以 `src/lib/content/schema.ts` 为准（全部为 `strictObject`）。除 `fact.claim` 外，`chart` 图的 `panels[].claim` 也是台账 ID，必须丢弃。`profileFile` 字段：`contact{email,attachment_limit_mb}, name, headline, updated, links, education, experience, highlights, skills`。`planPageMeta`：`roadmaps, records, thumbnails`（全是引用，不输出）。`markdown.ts:renderSection` 已经输出替换过事实的 HTML，投影只需把 HTML 转纯文本；`termText`、`localePath` 可复用 | `schema.ts`、`load.ts`、`markdown.ts` |
| H4a | `check-dist.mjs` 的 claim ID 和 `internal/` 检查只覆盖 `.html/.xml/.txt`，**不覆盖 `.json`**。需要补上（P1） | `check-dist.mjs` 第 63–68 行 |
| H5 | 双语一致性检查覆盖 `content/site/{en,zh}.yaml` 的全部键（`load.ts` "UI strings" 段）。`site.js` 在 `document` 上有两个 click 监听（点击页头外部会关菜单；点击 `a[href^="#"]` 会改写语言切换链接），并监听 `hashchange`、`popstate`。chat.js 的约束：不用 `#` 链接，不调用 `pushState`，事件在面板根节点上处理 | `public/js/site.js` |
| H9 | Provider A 是栈内网关服务 `<PROVIDER_A_SERVICE>`，位于栈内网络 `<STACK_NETWORK>`。协议为 **OpenAI 兼容**的 `POST /v1/chat/completions`，支持 SSE，网关不缓冲 SSE。认证方式 `Authorization: Bearer <project key>`：所有者在网关 dashboard 为 portfolio 新建一个专用项目 key，用量单独统计，可随时停用。公开模型 id 由网关的别名规则决定，从 `GET /v1/models` 中选取（配置项 `PROVIDER_A_MODEL`）。网关没有内置重试；上游只在 401 时自动重试一次 | 栈内文档与网关源码（只读）；`docker ps`、`docker inspect` 的 Labels/Mounts（未读取 Env） |
| H12 | cloudflared 以容器方式运行（栈内服务 `cloudflared`），隧道在 Cloudflare 面板中管理，栈内没有本地 `config.yml`，也不得创建。新增 hostname `<PORTFOLIO_API_HOSTNAME>` → `http://portfolio-api:3000`，由所有者在面板中手工添加。`portfolio-api` 加入 `<STACK_NETWORK>` 即可被 cloudflared 访问，**不映射宿主机端口** | 栈内 compose 与文档 |
| H12a | 改名可行性：compose 项目名在 3 个 compose 文件中写为 `name: st`；网络和全部 volume 都显式写了 `name:`，容器名都显式写了 `container_name`。所以改名**不会**换掉网络和 volume，但旧项目的容器必须删除后在新项目名下重建。栈的脚本从 compose 文件的 `name:` 读取项目名，无需修改。**已执行**（见 T-4） | 3 个 compose 文件的 `name:` 键（只读 grep）；栈的 `common.sh` 和 `restart.sh` |
| H15 | Provider A 的上游凭证是所有者个人 Google 账号的 OAuth 会话，不是付费 API 项目。把它用于公开服务存在违反服务条款、账号被限制的风险。**所有者已知情，并选择 A 作为首选（O-2）**。缓解：使用专用项目 key（可随时停用）；B 和 C 可立即接替；每日上限 | 栈内文档 |

## 3. WEB-CHECK 结果（只采信官方文档）

| 钩子 | 结论 | 来源 |
|---|---|---|
| H3 | Astro 7 的 `astro:build:done` 参数为 `{ pages, dir (URL), assets (Map), logger }`。静态模式下，`src/pages/ai/knowledge.json.ts` 导出 `GET` 会在构建时输出 `dist/ai/knowledge.json`。**采用端点方案**，不需要 integration | docs.astro.build/en/reference/integrations-reference/ ；docs.astro.build/en/guides/endpoints/ |
| H6 | `assets.run_worker_first` 接受路由模式数组（需 wrangler ≥4.20.0；仓库为 ^4.139），`*` 匹配多级路径，`!` 表示排除。文档没有说明 `/api/*` 是否匹配裸 `/api`，所以配置为 `["/api", "/api/*"]`。`_headers` 和 `_redirects` 对直接命中的静态资源仍然生效，但**不作用于 Worker 代码生成的响应**，所以 API 响应的安全头由 Worker 自己设置。`env.ASSETS.fetch()` 透传的响应是否应用 `_headers`，文档未写，待 P3 用 `wrangler dev` 加 `curl -I` 实测 | developers.cloudflare.com/workers/static-assets/binding/ ；…/static-assets/headers/ ；…/static-assets/redirects/ ；changelog 2025-06-17 advanced routing |
| H7 | Workers 支持 `request.signal`；要监听客户端断开时触发的 `abort`，需开启兼容标志 `enable_request_signal`。自动把 signal 传给子请求需另一个标志 `request_signal_passthrough`。**采用显式写法** `fetch(url, { signal: request.signal })` 并开启 `enable_request_signal` | developers.cloudflare.com/workers/runtime-apis/request/ ；…/configuration/compatibility-flags/ ；changelog 2025-05-22 |
| H8 | Fastify 当前稳定版 v5，支持 Node 20 和 22。**决定不用 Fastify**，改用 `node:http`、零依赖：与栈内网关"只用 Node 内置模块"的约定一致，也省去依赖锁定和审计 | fastify.dev/docs/latest/Reference/LTS/ |
| H10 | `deepseek-chat` 和 `deepseek-reasoner` 已于 2026-07-24 下线。改用 `deepseek-flash`，并设置 `"thinking": {"type": "disabled"}` 关闭思考（可配置 `DEEPSEEK_MODEL`）。Base URL `https://api.deepseek.com`，OpenAI 兼容。流式响应以 `data: [DONE]` 结束，等待期间发送 `: keep-alive` 注释行。错误码：400 格式错误、401 认证失败、402 余额不足、422 参数错误、429 限流、500 服务错误、503 过载 | api-docs.deepseek.com/quick_start/pricing ；…/api/create-chat-completion ；…/quick_start/rate_limit ；…/quick_start/error_codes ；…/news/news260910/ |
| H11 | 当前稳定的 Flash 模型是 `gemini-3.8-flash`（可配置 `GEMINI_MODEL`）。流式接口：`POST https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent?alt=sse`，请求头 `x-goog-api-key`。`systemInstruction` 格式为 `{ "parts": [{ "text": … }] }`。拦截分两种：提问被拦截时，`promptFeedback.blockReason` 有值且没有候选；回答被拦截时，`finishReason` 为 `SAFETY`、`BLOCKLIST`、`PROHIBITED_CONTENT` 或 `SPII`。Gemini 3.x 的 temperature 保持默认值（调低可能导致循环输出）。Google 推荐新项目使用 Interactions API，`generateContent` 仍完全支持；v1 继续用 `streamGenerateContent` | ai.google.dev/gemini-api/docs/models ；ai.google.dev/api/generate-content ；…/docs/migrate-to-interactions |
| H13 | 操作顺序：①Zero Trust → Service Tokens 新建 token（Client Secret 只显示一次）；②**先**创建 Self-hosted Access 应用，绑定 `<PORTFOLIO_API_HOSTNAME>`，策略动作设为 **Service Auth**，选择器为该 Service Token，并在附加设置中开启 401 响应；③**再**在隧道中添加该 hostname 的路由。调用方发送 `CF-Access-Client-Id` 和 `CF-Access-Client-Secret` 两个请求头 | developers.cloudflare.com/cloudflare-one/identity/service-tokens/ ；…/access-controls/policies/ ；…/self-hosted-public-app/ |
| H14 | 付费 Gemini API：不用于改进 Google 产品，日志保留 55 天，仅用于滥用检测。DeepSeek：隐私政策写明输入可能被用于训练，数据存储在中国，没有专门针对 API 的"不训练"承诺。UI 中的隐私提示保留"请勿输入敏感信息"；助手的语料只含公开内容 | ai.google.dev/gemini-api/terms ；DeepSeek 隐私政策（deepseek.com 官方 CDN 页面） |
| H16 | DeepSeek 文档没有说明能否在消息序列中间插入 `system` 消息。**统一策略**（三家相同）：全部 system 块合并为一个前置 system（Gemini 为 `systemInstruction`）；post-history 用 `<instructions>…</instructions>` 包起来，拼在最后一条 user 消息的前面 | api-docs.deepseek.com/api/create-chat-completion ；ai.google.dev/api/generate-content |

## 4. 运行时契约（实施以此为准）

| 项 | 值 |
|---|---|
| 后端服务名 / 容器名 | `portfolio-api` / 容器名由栈内覆盖文件决定（沿用栈内既有前缀） |
| compose 项目 | `ai_web`；外部网络 `<STACK_NETWORK>`（环境变量 `STACK_NETWORK`） |
| 监听 | `0.0.0.0:3000`，只在 `<STACK_NETWORK>` 内可达，不映射宿主机端口 |
| 入站认证 | `X-Origin-Key` 常量时间比较（`backend/.env` 中的 `PORTFOLIO_ORIGIN_KEY`），同时挡住公网和 Docker 网络内的请求。Cloudflare Access 可选（O-9） |
| 模型 plan（O-5） | `API_URL_PLAN_x`、`MODEL_PLAN_x`、`KEY_PLAN_x`（x = A、B、C），按 `PROVIDER_ORDER` 依次尝试，全部由所有者填写。示例：栈内网关为 `http://<PROVIDER_A_SERVICE>:<PORT>/v1`，key 为 portfolio 专用项目 key，模型从网关的 `/v1/models` 中选 |
| 协议 | 由 URL 判断：Gemini API 地址（`generativelanguage.googleapis.com`，路径中不含 `/openai`）用 Gemini 适配器，其余一律 OpenAI 兼容（自动补 `/chat/completions`） |
| 配置文件（O-8） | `backend/.env`：`PORTFOLIO_ORIGIN_KEY`、三个 plan、限额，全部由所有者填写；只有 plan A 的 URL 已预填为栈内 Gemini 网关 `http://<PROVIDER_A_SERVICE>:<PORT>/v1`（OpenAI 兼容）。该文件 git-ignored，不进镜像（`.dockerignore` 白名单），其中的值若出现在站点产物或知识快照中，构建会失败（只报告变量名） |
| plan A 连通性 | 已从栈网络上的临时容器验证：网关健康，`/v1/models` 不带 key 返回 401 |
| 栈侧覆盖文件 | 在栈目录中，单独使用：四个 compose 文件 + `up -d --no-deps portfolio-api`；不在栈的日常命令里。通过 `env_file` 读取 `../personal_portfolio/backend/.env`，不使用任何 `${…}` 插值（经 `config` 校验：容器只得到 11 个作品集变量，不含栈的任何密钥）。直接引用栈网络，并带 build 上下文（`backend/Dockerfile`） |
| 未填完整 | 三个值缺一个，该 plan 就禁用（不报错）；启动日志只列出启用的 plan id |
| 请求拦截（O-6） | 规则在 `content/ai/guard.yaml`（构建进 prompt bundle）。滥用封禁：`GUARD_STRIKE_LIMIT=3`、`GUARD_STRIKE_WINDOW_MS=600000`、`GUARD_BLOCK_MS=600000`；`MAX_OUTPUT_TOKENS=600` |
| Worker 配置 | 必需：`ORIGIN_URL`（`https://<PORTFOLIO_API_HOSTNAME>`）和 `ORIGIN_KEY`（与 `PORTFOLIO_ORIGIN_KEY` 相同），都用 `wrangler secret put` 设置，所有者执行。可选：`ACCESS_CLIENT_ID` 和 `ACCESS_CLIENT_SECRET` |
| 基础镜像 | `node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`（多架构 index，含 arm64；2026-10-08 用 `docker buildx imagetools inspect` 查得） |
| 镜像运行形态 | uid 10001；只读根文件系统；`/app/state` 为可写 volume（每日计数）；知识快照位于 `/app/knowledge`；HEALTHCHECK 调用 `/api/health` |
| 栈内变量 | 使用 `PORTFOLIO_` 前缀（见 `deploy/compose.portfolio.yaml`），避免与栈内已有变量重名 |

## 5. 待实测（在对应阶段补结论）

| # | 事项 | 阶段 |
|---|---|---|
| T-1 | `run_worker_first` 数组对 `/api`、`/api/x`、`/apix/` 的实际匹配 | **已实测（P3，2026-10-08，`wrangler dev` 4.139.0）**：`/api`、`/api/x` 进入 Worker（JSON 404）；`/apix/`、`/projects/` 直接由静态资源响应 |
| T-2 | 加入 `main` 后，页面是否仍带 `_headers` 的 CSP | **已实测**：`/projects/` 的响应头仍有完整 CSP（含 `frame-ancestors 'none'`）和 `X-Frame-Options: DENY`。非 `/api` 请求不经过 Worker 代码 |
| T-3 | wrangler 在 Node 22.13 下能否运行（undici 要求 ≥22.19） | **已实测**：`wrangler dev` 和 `wrangler deploy --dry-run` 都正常；`npm ci` 只给出 EBADENGINE 警告 |
| T-4 | Compose v5 改项目名时对旧网络、旧 volume 标签的处理 | **已实测（2026-10-08，Compose v5.1.3）**：先在临时项目上测试，volume 带旧项目标签时只告警（"already exists but was created for project …"），数据照常复用；`down`（不带 `-v`）会删除网络，`up` 时重建。随后执行真实改名：6 个容器 healthy、网络子网不变、三个卷的数据都在、隧道重连、三个公网域名的响应与改名前相同 |
| T-5 | 公网链路（Cloudflare → Tunnel）是否缓冲 SSE | P4 |
