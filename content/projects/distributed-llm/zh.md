## 分布式训练与数据准备 {#question}

在团队中，我主导分布式训练实现与实验分析，编写 OpenWebText 并行分词，并参与 DDP 和 FSDP 训练器开发。同学协助连接 Slurm 集群。

我们使用 nanoGPT 的模型实现，围绕它开发数据管线、分布式训练器和启动脚本，在 HPC 节点上对比 GPU 扩展、分片策略与通信路径。

## 并行代码 {#pipeline}

- **分词。** OpenWebText 共 {{fact:corpus_docs}} 篇文档，用 tiktoken 的 GPT-2 BPE 在多个 worker 进程中分词，按 90/10 划分训练集和验证集，写成 `uint16` 二进制文件。训练时通过 `np.memmap` 读取，任何一次运行都不需要把语料整个载入内存；每次运行使用其中 {{fact:subset}} 的数据。
- **DDP。** `torchrun` 为每块 GPU 启动一个进程，每个进程从环境变量读取 rank，加入 NCCL 进程组。模型用 `DistributedDataParallel` 包装，每八个微批次中有七个在 `no_sync()` 下累积梯度，验证集损失通过 `all_reduce` 在各 rank 间取平均。
- **FSDP。** 同一个模型改用 `FullyShardedDataParallel`，分别尝试 `FULL_SHARD`、`SHARD_GRAD_OP` 和 `NO_SHARD`，按 Transformer block 包装，并用 fp16 混合精度训练。
- **测量。** 每次运行由 rank 0 写出一份摘要：每秒 token 数、平均迭代时间、GPU 峰值显存和验证集 perplexity。

## 用 Slurm 组织训练实验 {#automation}

我按 GPU 数量、DDP 与 FSDP 策略、NCCL 通信方式组织配置矩阵。每组配置包含训练参数和 Slurm 脚本，由脚本申请 GPU 类型并通过 `torchrun` 启动作业。

通信脚本通过 `NCCL_P2P_DISABLE` 切换 NCCL 点对点通信，并记录通信拓扑。扩展实验保持总 token 预算一致，在增加 GPU 数量时相应减少迭代次数。

## 结果 {#results}

| 测量项 | 结果 | 条件 |
|---|---|---|
| DDP 吞吐扩展，1 → 4 卡 | {{fact:ddp_scaling}} | 相同 token 预算；单次运行 |
| NVLink 与共享内存通信 | 吞吐相差 {{fact:transport_gap}} | 每八个微批次同步一次梯度 |
| FSDP 与 DDP 的峰值显存 | FSDP 降低 {{fact:fsdp_memory}} | 这个规模下显存主要被激活值占用 |
| 分词，仅靠多进程 | 加速 {{fact:tokenize_mp}} | 八个 worker 进程 |
| 分词，重复运行 | 加速 {{fact:tokenize_repeat}} | 多进程分片加上复用已分词的缓存 |

扩展接近线性，是因为通信很少：每八个微批次才做一次 all-reduce。同样的原因也让两种通信方式的差距很小。

## 批量大小、吞吐与收敛 {#time-to-quality}

固定 token 预算将 GPU 数量与优化步数联系起来。增加 GPU 会扩大有效 batch，并减少处理同一批数据所需的优化步数。

我们同时分析吞吐和验证集困惑度。记录中的单卡基线与 FSDP 运行，在 GPU 数量增加时分别得到 {{fact:ppl_1gpu}}、{{fact:ppl_2gpu}} 和 {{fact:ppl_4gpu}}。这些结果呈现了 batch 与更新频率对收敛和执行速度的共同影响。

## NCCL 通信与梯度同步 {#transport}

训练器在多个微步中累积梯度，并在累积边界通过 NCCL 同步，减少 GPU 之间的通信频率。我们通过启动配置对比 NVLink 点对点通信和共享内存通信，记录的吞吐差距为 {{fact:transport_gap}}。

## FSDP 显存与吞吐取舍 {#fsdp}

我们把 FSDP 的几种分片模式和 DDP 做了对比。FSDP 让峰值显存降低了 {{fact:fsdp_memory}}，吞吐略有损失。在这个模型规模下，显存主要被激活值占用，而不是参数、梯度或优化器状态，分片只能减少后者。对这么小的模型，FSDP 不值得它带来的复杂度；只有当参数和优化器状态占主导时，它才开始发挥作用。

本项目使用的是原版 FSDP API，按 block 自动包装。

## 分词：把并行和缓存分开 {#tokenization}

我们在语料的 {{fact:sample}} 样本上对比了两种做法：

- **`datasets.map(num_proc=…)`**：从单进程的约十六分钟，降到双进程的几秒钟，即 {{fact:tokenize_repeat}}；从 2 个进程到 16 个进程，耗时几乎不变。曲线平坦说明原因不在并行：这部分收益主要来自重复运行时复用已经分好词的缓存。
- **`multiprocessing.Pool.imap`**：八个 worker 单靠并行带来 {{fact:tokenize_mp}} 的加速，调整分块大小又额外提升了 {{fact:chunk_tuning}}。

两个数字放在一起报告，并说明各自的原因，因为只有第二个才是真正的并行加速。

## 训练结果汇总 {#limits}

训练器将吞吐、平均迭代时间、验证集困惑度与 rank-zero 峰值显存写入运行摘要。我用这些数据对比配置，分析数据准备、梯度同步和参数分片各自带来的影响。
