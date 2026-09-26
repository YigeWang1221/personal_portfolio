## My training implementation and experiments {#question}

Our team studied distributed training on a single HPC node. I led the implementation and experiment analysis, covering parallel data preparation and contributions to both DDP and FSDP trainers. My teammate helped connect to the Slurm cluster. The measurements below are team results; they support the discussion of implementation and experimental choices.

1. How much parallel workers speed up tokenizing the OpenWebText corpus.
2. DDP strong scaling on one, two and four V100-SXM2 GPUs.
3. The memory-versus-throughput trade-off of FSDP sharding.
4. NCCL transport: NVLink peer-to-peer versus shared memory.

The model code is upstream nanoGPT, unchanged. Our work is the data pipeline, the distributed trainers, the experiment scripts and the measurements.

## The parallel code {#pipeline}

- **Tokenization.** OpenWebText — {{fact:corpus_docs}} documents — is tokenized with tiktoken's GPT-2 BPE across worker processes and written as `uint16` binaries with a 90/10 train/validation split. Training reads them through `np.memmap`, so no run loads the corpus into memory; each run uses {{fact:subset}} of the data.
- **DDP.** `torchrun` launches one process per GPU; each joins an NCCL process group with its rank read from the environment. The model is wrapped in `DistributedDataParallel`, gradients accumulate under `no_sync()` for seven of every eight micro-steps, and the validation loss is averaged across ranks with `all_reduce`.
- **FSDP.** The same model under `FullyShardedDataParallel` with `FULL_SHARD`, `SHARD_GRAD_OP` or `NO_SHARD`, wrapped per transformer block and trained in fp16 mixed precision.
- **Measurement.** Rank 0 writes a summary of each run: tokens per second, average iteration time, peak GPU memory and validation perplexity.

## Experiment automation on Slurm {#automation}

The plan was a matrix: GPU count (one, two, four) × strategy (DDP and three FSDP sharding modes) × transport (NVLink or shared memory). Every cell is a config file plus a Slurm script that requests the GPU type, sets the NCCL environment and launches the trainer — through `torchrun` for the multi-GPU runs — so the launch configuration can be reused and extended. This records how a run was launched; it does not guarantee identical results across runs.

- **Transport as a switch.** The shared-memory scripts disable NCCL peer-to-peer (`NCCL_P2P_DISABLE=1`), and check runs log the topology NCCL actually builds (`NCCL_DEBUG_SUBSYS=GRAPH`), so each run records which path it used.
- **A fixed token budget.** When the GPU count doubles, the iteration count halves. Every run sees the same amount of data, so throughput compares cleanly across GPU counts. The cost of that choice is the subject of the next sections.
- **What I would change.** Every DDP script wrote under the same job name, so a later run overwrote the NVLink runs' raw logs. Unique run IDs in the job name, and committing each summary as soon as it is written, would have prevented it.

## Results {#results}

| Measurement | Result | Conditions |
|---|---|---|
| DDP throughput scaling, 1 → 4 GPUs | {{fact:ddp_scaling}} | Same token budget; single runs |
| NVLink versus shared-memory transport | {{fact:transport_gap}} throughput gap | Gradient sync once every eight micro-steps |
| FSDP versus DDP peak memory | {{fact:fsdp_memory}} lower with FSDP | Activations dominate memory at this size |
| Tokenization, multiprocessing alone | {{fact:tokenize_mp}} faster | Eight worker processes |
| Tokenization, repeated runs | {{fact:tokenize_repeat}} faster | Multi-process sharding plus cached shards |

Scaling is close to linear because communication is rare: one all-reduce per eight micro-steps. The same reason keeps the transport gap small.

## Throughput and convergence {#time-to-quality}

The fixed token budget gives a clean throughput comparison, but it hides something. With four GPUs the run finishes in a quarter of the optimizer steps, each on a four-times-larger effective batch. In the committed logs, validation perplexity rose from {{fact:ppl_1gpu}} on one GPU to {{fact:ppl_2gpu}} on two and {{fact:ppl_4gpu}} on four.

So the four-GPU run is not four times faster at reaching the same model quality. A fair time-to-quality comparison would train each configuration to a target validation loss, or scale the learning rate with the batch size. That is how I would measure it next time.

## NVLink, shared memory and a node mix-up {#transport}

An early comparison seemed to show a large "PCIe versus NVLink" difference. It turned out to be a difference between nodes, not between transports: the runs had landed on different node types. After pinning the hardware, the gap shrank to {{fact:transport_gap}}.

## FSDP memory and throughput trade-offs {#fsdp}

We benchmarked FSDP's sharding modes against DDP. FSDP saved {{fact:fsdp_memory}} of peak memory, at a small cost in throughput. At this model size most memory goes to activations, not to parameters, gradients or optimizer state, and sharding only reduces the latter. FSDP is not worth its complexity for a model this small; it starts to matter when parameters and optimizer state dominate.

This project uses the original FSDP API with a per-block auto-wrap policy.

## Tokenization: separating parallelism from caching {#tokenization}

Two approaches were benchmarked on a {{fact:sample}} sample of the corpus:

- **`datasets.map(num_proc=…)`** went from about sixteen minutes with one process to seconds with two — {{fact:tokenize_repeat}} — and stayed flat from two to sixteen processes. A flat curve means parallelism is not the cause: most of that gain comes from reusing cached tokenized shards on repeated runs.
- **`multiprocessing.Pool.imap`** with eight workers gave {{fact:tokenize_mp}} from parallelism alone, and tuning the chunk size added {{fact:chunk_tuning}}.

Both numbers are reported together, with their mechanisms, because only the second one measures parallel speedup.

## Method limits {#limits}

- **Single runs.** Every configuration ran once, and warm-up iterations are included in the averages. Repeated runs with confidence intervals would make small differences, such as the transport gap, more trustworthy.
- **Rank-0 memory.** Peak memory was measured on rank 0 only.
- **Mixed node types.** The shared-memory and NVLink runs ran on different node types.
- **Lost raw logs.** Because the NVLink runs' raw logs were overwritten, the scaling result is given as a range: the preserved raw log and the report differ slightly.
- **Next:** measure time to a target perplexity, profile communication, record per-rank memory, and publish sanitized logs alongside the code.
