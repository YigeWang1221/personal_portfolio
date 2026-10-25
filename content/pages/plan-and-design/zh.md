## 围绕组件职责设计系统 {#approach}

我从产品流程出发，为各个组件分配职责。下面的例子介绍这种方法如何用于移动采集、GPU 训练、适配器推理与云发布。

## 自托管移动应用后端 {#kk-self-hosting}

我用 Docker Compose 在 Mac mini 上运行 KK Knock 的 FastAPI 与 PostgreSQL 后端，通过 Cloudflare Tunnel 提供访问。Nginx 托管管理端并转发 API 请求，PostgreSQL 使用外部数据卷。这种方式用自有硬件承载应用后端，Terraform 与 Packer 则提供 AWS 部署路径。

## 复用已完成的采集响应 {#kk-idempotency}

我在录音开始时分配采集 ID，并在本地存储与后端请求中沿用。手机持久化音频、文本和任务进度，后端响应缓存按账号与采集 ID 保存已完成的结果，保留 {{fact:kk-knock.idempotency_window}}，供后续请求读取。

## 使用运行时内核的 CPU 语音识别 {#kk-cpu-asr}

我在测试设备上比较执行路径后，为 Android 应用选择 whisper.cpp CPU 转写。对于短合成音频，运行时 ARM64 内核选择将 Small 模型耗时从 {{fact:kk-knock.asr_before}} 降至 {{fact:kk-knock.asr_after}}。我通过 NDK 集成这条路径，并加入原生取消操作。

## 用队列驱动训练容量 {#lora-scale-from-zero}

写作风格训练以独立任务到达。我将 SQS 积压连接到空闲时保持零实例的 Auto Scaling 组。worker 在训练期间保护实例，结束后解除保护，由伸缩组处理缩容，将产品任务创建与 GPU 容量管理分开。

## 在内存中保留正在使用的适配器 {#lora-adapter-cache}

对话请求会复用写作风格适配器，而 GPU 显存容量固定。我实现 LRU 缓存，保护正在使用的适配器，并让同一适配器的并发请求共用下载。管理服务在加载前检查产物哈希，无法接收新加载时返回资源响应。

## 跨 AWS 账号发布机器镜像 {#cloud-immutable}

我将版本化 Packer 镜像作为 Spring Boot 应用的发布单元。GitHub Actions 在 dev 账号构建镜像，共享给 demo 账号，再通过新的启动模板版本触发实例刷新。之前的镜像保留用于回滚。成功运行中，从构建到实例刷新结束的耗时中位数为 {{fact:cloud-native.deploy_median}}。

## 扩展实验保持 token 总量一致 {#hpc-token-budget}

我们在不同 GPU 配置中保持训练 token 预算一致，并在增加 GPU 数量时减少迭代次数。我结合吞吐与验证集困惑度，分析执行速度、有效 batch 和优化更新之间的关系。单卡基线与四卡 FSDP 日志分别记录了 {{fact:distributed-llm.ppl_1gpu}} 和 {{fact:distributed-llm.ppl_4gpu}}。
