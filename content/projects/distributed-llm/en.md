## The question {#question}

How far does data parallelism take a small language model on a single GPU node, and where does it stop paying off? In a team of two, we trained a GPT-2 with {{fact:params}} parameters on one node of Northeastern's Explorer cluster and measured four things:

1. CPU tokenization parallelism for the OpenWebText corpus.
2. DDP strong scaling on one, two and four V100-SXM2 GPUs.
3. The memory-versus-throughput trade-off of FSDP sharding.
4. NCCL transport: NVLink peer-to-peer versus shared memory.

The model code is upstream nanoGPT, unchanged. Our work is the data pipeline, the distributed trainers, the experiment design and the measurements.

## Pipeline {#pipeline}

- **Tokenization.** OpenWebText — {{fact:corpus_docs}} documents — is tokenized with tiktoken's GPT-2 BPE across worker processes and written as `uint16` binaries with a 90/10 train/validation split. Training reads them through `np.memmap`, using {{fact:subset}} of the data per run.
- **DDP.** `torchrun` launches one process per GPU, and each joins an NCCL process group with its rank read from the environment. The model is wrapped in `DistributedDataParallel`, gradients are accumulated under `no_sync()` for seven of every eight micro-steps, and validation loss is averaged across ranks with `all_reduce`.
- **FSDP.** The same model under `FullyShardedDataParallel` with `FULL_SHARD`, `SHARD_GRAD_OP` or `NO_SHARD`, wrapped per transformer block and trained in fp16 mixed precision.
- **Measurement.** Rank 0 writes a summary of each run: tokens per second, average iteration time, peak GPU memory and validation perplexity.

## Experiment design {#plan}

The proposal named three parallelization strategies — multiprocess tokenization, DDP and FSDP — and the plan became a matrix: GPU count (one, two, four) × strategy (DDP and three FSDP sharding modes) × transport (NVLink or shared memory). Every cell is a config file plus a Slurm script, so any run can be repeated exactly.

The key protocol choice was a **fixed token budget**: when the GPU count doubles, the iteration count halves. That keeps the amount of data per run constant, so throughput can be compared cleanly across GPU counts. It also has a cost, which the deep dive explains.

## Results {#results}

| Measurement | Result | Conditions |
|---|---|---|
| DDP throughput scaling, 1 → 4 GPUs | {{fact:ddp_scaling}} | Same token budget; single runs |
| NVLink versus shared-memory transport | {{fact:transport_gap}} throughput gap | Gradient sync once every eight micro-steps |
| FSDP versus DDP peak memory | {{fact:fsdp_memory}} lower with FSDP | Activations dominate memory at this size |
| Tokenization, repeated runs | {{fact:tokenize_repeat}} faster | Multi-process sharding plus cached shards |
| Tokenization, multiprocessing alone | {{fact:tokenize_mp}} faster | Eight worker processes |

Scaling is close to linear because communication is rare: one all-reduce per eight micro-steps. The same reason keeps the transport gap small.

## What I owned {#ownership}

This was a team of two, and we built the features together; I also debugged parts of my teammate's work. The tokenization, the single-GPU baseline and the DDP experiments are my own runs. The FSDP benchmarks are team results. I wrote the public README and merged the FSDP code and logs into the repository.

## Throughput is not time-to-quality {#time-to-quality}

The fixed token budget gives a clean throughput comparison, but it hides something. With four GPUs the run finishes in a quarter of the optimizer steps, each on a four-times-larger effective batch. In the committed logs, validation perplexity rose from {{fact:ppl_1gpu}} on one GPU to {{fact:ppl_4gpu}} on four.

So the four-GPU run is not four times faster at reaching the same model quality. A fair comparison of time-to-quality would train each configuration to a target validation loss, or scale the learning rate with the batch size. I would measure it that way next time.

## NVLink, shared memory and a node mix-up {#transport}

To compare transports, the shared-memory runs disable NCCL peer-to-peer (`NCCL_P2P_DISABLE=1`), and check runs log the topology NCCL actually builds (`NCCL_DEBUG_SUBSYS=GRAPH`).

An early comparison seemed to show a large "PCIe versus NVLink" difference. It turned out to be a difference between nodes, not between transports: the runs had landed on different node types. After pinning the hardware, the gap shrank to {{fact:transport_gap}}. The episode is written up in the README; for me it was the clearest lesson of the project — check what hardware and topology a run actually used before explaining a number.

## Why FSDP did not pay off here {#fsdp}

We benchmarked FSDP's sharding modes against DDP. FSDP saved {{fact:fsdp_memory}} of peak memory, at a small cost in throughput. At this model size most memory goes to activations, not to parameters, gradients or optimizer state, and sharding only reduces the latter. FSDP is not worth its complexity for a model this small; it starts to matter when parameters and optimizer state dominate.

This project uses the original FSDP API with a per-block auto-wrap policy. My only work with FSDP2 (`fully_shard`) is a separate course assignment, not this project.

## Tokenization: separating parallelism from caching {#tokenization}

Two approaches were benchmarked on a {{fact:sample}} sample of the corpus:

- **`datasets.map(num_proc=…)`** went from about sixteen minutes with one process to seconds with two — {{fact:tokenize_repeat}} — and stayed flat from two to sixteen processes. A flat curve means parallelism is not the cause: most of that gain comes from reusing cached tokenized shards on repeated runs.
- **`multiprocessing.Pool.imap`** with eight workers gave a realistic {{fact:tokenize_mp}} from parallelism alone, and tuning the chunk size added {{fact:chunk_tuning}}.

I report both numbers together, with their mechanisms, because only the second one measures parallel speedup.

## Method limits and what I'd change {#limits}

- **Single runs.** Every configuration ran once, and warm-up iterations are included in the averages. Repeated runs with confidence intervals would make small differences, such as the transport gap, more trustworthy.
- **Rank-0 memory.** Peak memory was measured on rank 0 only.
- **Mixed node types.** The shared-memory and NVLink runs ran on different node types.
- **Lost raw logs.** Every DDP script wrote to the same job name, so the NVLink runs' raw logs were overwritten. That is why the scaling result is given as a range: the preserved raw log and the report differ slightly. Unique run IDs and committed logs would have prevented it.
- **Next:** measure time to a target perplexity, profile communication, record per-rank memory, and publish sanitized logs alongside the code.
