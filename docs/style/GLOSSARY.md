# Glossary (English ↔ 简体中文)

Use these terms consistently on every page. "Keep EN" means the English term stays in Chinese text, optionally with
a Chinese gloss on first use.

## Portfolio terms

| English | 中文 | Keep EN | Notes |
|---|---|---|---|
| Capability | 能力 | — | Catalog filter (ADR-016); replaces the retired "Track / 方向" |
| Business modeling | 业务建模 | — | Capability |
| Backend & Cloud | 后端与云 | — | Capability |
| Planning & Delivery | 规划与交付 | — | Capability |
| AI & Research | AI 与研究 | — | Capability |
| Selected projects | 精选项目 | — | Home section and catalog flag (ADR-017) |
| More work | 更多项目 | — | Home section after the selected projects |
| My role | 我的角色 | — | The one responsibility statement on a project page |
| Product introduction page | 产品介绍页 | — | Link kind `product` |
| Source / Demo / Demo video | 源码 / 演示 / 演示视频 | — | Link kinds: Demo only for something that runs; the case study itself is always the site's own page |
| Case study | 项目详解 | — | Avoid "案例研究" on project pages |
| Decision record | 决策记录 | — | Pattern: Context → Options → Decision → Trade-off |
| Roadmap / milestones | 路线图 / 里程碑 | — | |
| What I owned | 我负责的部分 | — | Required on team projects |
| Current architecture | 当前架构 | — | Diagram label `CURRENT` |
| Proposed architecture | 规划架构 | — | Diagram label `PROPOSED` |
| Early sketch / wireframe | 早期草图 / 线框图 | — | Asset label `HISTORICAL` |
| Team of N | N 人团队 | — | Always stated on team projects (ADR-012) |
| Led | 主导 | — | Owner's lead area |
| Co-implemented | 参与实现 / 共同实现 | — | Shared implementation |
| Design notes | 设计笔记 | — | e.g. the owner's Obsidian design documents |

## Status labels

| English | 中文 |
|---|---|
| Self-hosted pilot | 自托管试运行 |
| In development | 开发中 |
| Implemented, not deployed | 已实现，未部署 |
| Course project (team of N) | 课程项目（N 人团队） |
| Course project (solo) | 课程项目（个人） |
| Undergraduate capstone (solo) | 本科毕业设计（个人） |
| Course benchmark | 课程基准实验 |
| Research prototype | 研究原型 |
| Archived | 已归档 |

## Software and systems

| English | 中文 | Keep EN | Notes |
|---|---|---|---|
| Idempotency | 幂等 | first use | "幂等（idempotency）" |
| Idempotency key | 幂等键 | — | |
| Outbox pattern | 发件箱模式 | yes | "发件箱模式（Outbox）" |
| At-least-once delivery | 至少一次投递 | — | |
| Offline-first / local-first | 离线优先 / 本地优先 | — | |
| State machine | 状态机 | — | |
| Retry with backoff | 退避重试 | — | |
| Rate limiting / quota | 限流 / 配额 | — | |
| Observability | 可观测性 | — | |
| Structured logging | 结构化日志 | — | |
| Infrastructure as code | 基础设施即代码 | yes | "基础设施即代码（IaC）" |
| Immutable image | 不可变镜像 | — | e.g. Packer AMI |
| Rolling update / instance refresh | 滚动更新 / 实例刷新 | — | |
| Least privilege | 最小权限 | — | Only when evidenced |
| Secrets management | 密钥管理 | — | |
| Multi-AZ | 多可用区 | yes | |
| Auto scaling / scale to zero | 自动扩缩容 / 缩容至零 | — | |
| Reverse proxy | 反向代理 | — | |
| Self-hosted | 自托管 | — | |
| Contract-first API | 契约优先的 API 设计 | — | |
| Domain model | 领域模型 | — | |

## Machine learning and LLM

| English | 中文 | Keep EN | Notes |
|---|---|---|---|
| Data parallelism | 数据并行 | — | |
| DDP / FSDP | DDP / FSDP | yes | |
| Sharding | 分片 | — | |
| Gradient accumulation | 梯度累积 | — | |
| Mixed precision | 混合精度 | — | |
| Throughput | 吞吐量 | — | tokens/s written as "tokens/s" |
| Scaling efficiency | 扩展效率 | — | |
| Fine-tuning | 微调 | — | |
| LoRA / QLoRA / adapter | LoRA / QLoRA / 适配器 | yes | |
| Multi-tenant | 多租户 | — | |
| Inference serving | 推理服务 | — | |
| On-device speech recognition | 端侧语音识别 | first use | "端侧语音识别（ASR）" |
| Prompt | 提示词 | — | |

## Data science and finance

| English | 中文 | Keep EN | Notes |
|---|---|---|---|
| Hierarchical Bayesian model | 分层贝叶斯模型 | — | |
| Prior / posterior | 先验 / 后验 | — | |
| MCMC / NUTS | MCMC / NUTS | yes | Gloss: 马尔可夫链蒙特卡罗 |
| Convergence diagnostics | 收敛诊断 | — | R-hat, ESS keep EN |
| Monte Carlo simulation | 蒙特卡罗模拟 | — | |
| Maximum likelihood estimation | 最大似然估计 | yes | "最大似然估计（MLE）" |
| Method of moments | 矩估计 | — | |
| Hypothesis test | 假设检验 | — | |
| Backtest | 回测 | — | |
| Walk-forward validation | 滚动前推验证 | yes | "滚动前推验证（walk-forward）" |
| Information coefficient | 信息系数 | yes | "信息系数（IC）" |
| Transaction cost / turnover | 交易成本 / 换手率 | — | |
| Look-ahead bias / survivorship bias | 前视偏差 / 幸存者偏差 | — | |
| Long/short | 多空 | — | |
| Factor / residual return | 因子 / 残差收益 | — | |

## Identity

| English | 中文 |
|---|---|
| Northeastern University | 美国东北大学（Northeastern University） |
| Master of Science in Software Engineering Systems | 软件工程系统硕士 |
| Expected graduation Dec 2026 | 预计 2026 年 12 月毕业 |
| Zhejiang Gongshang University | 浙江工商大学 |

## Words to avoid

| English | 中文 |
|---|---|
| cutting-edge, revolutionary, seamless, world-class, blazing-fast | 赋能、打造、闭环、抓手、颠覆、极致 |
