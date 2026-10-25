## Distributed training and data preparation {#question}

In our team, I led distributed-training implementation and experiment analysis, implemented parallel OpenWebText tokenization, and contributed to the DDP and FSDP trainers. My teammate helped connect to the Slurm cluster.

We used nanoGPT's model implementation and built the data pipeline, distributed trainers and launch scripts around it. Our experiments compare GPU scaling, sharding strategies and communication paths on an HPC node.

## The parallel code {#pipeline}

- **Tokenization.** OpenWebText — {{fact:corpus_docs}} documents — is tokenized with tiktoken's GPT-2 BPE across worker processes and written as `uint16` binaries with a 90/10 train/validation split. Training reads them through `np.memmap`, so no run loads the corpus into memory; each run uses {{fact:subset}} of the data.
- **DDP.** `torchrun` launches one process per GPU; each joins an NCCL process group with its rank read from the environment. The model is wrapped in `DistributedDataParallel`, gradients accumulate under `no_sync()` for seven of every eight micro-steps, and the validation loss is averaged across ranks with `all_reduce`.
- **FSDP.** The same model under `FullyShardedDataParallel` with `FULL_SHARD`, `SHARD_GRAD_OP` or `NO_SHARD`, wrapped per transformer block and trained in fp16 mixed precision.
- **Measurement.** Rank 0 writes a summary of each run: tokens per second, average iteration time, peak GPU memory and validation perplexity.

## Experiment automation on Slurm {#automation}

I organized the runs as a configuration matrix covering GPU count, DDP and FSDP strategies, and NCCL transport. Each configuration pairs a trainer config with a Slurm script that requests the GPU type and launches the job through `torchrun`.

The transport scripts switch NCCL peer-to-peer communication with `NCCL_P2P_DISABLE` and record its topology. For scaling comparisons, we hold the total token budget constant by reducing iterations as GPU count increases.

## Results {#results}

| Measurement | Result | Conditions |
|---|---|---|
| DDP throughput scaling, 1 → 4 GPUs | {{fact:ddp_scaling}} | Same token budget; single runs |
| NVLink versus shared-memory transport | {{fact:transport_gap}} throughput gap | Gradient sync once every eight micro-steps |
| FSDP versus DDP peak memory | {{fact:fsdp_memory}} lower with FSDP | Activations dominate memory at this size |
| Tokenization, multiprocessing alone | {{fact:tokenize_mp}} faster | Eight worker processes |
| Tokenization, repeated runs | {{fact:tokenize_repeat}} faster | Multi-process sharding plus cached shards |

Scaling is close to linear because communication is rare: one all-reduce per eight micro-steps. The same reason keeps the transport gap small.

## Batch size, throughput and convergence {#time-to-quality}

A fixed token budget connects GPU count to optimizer steps. Increasing the number of GPUs increases the effective batch and reduces the steps needed to process the same data.

We analyzed throughput alongside validation perplexity. The recorded baseline and FSDP runs produced {{fact:ppl_1gpu}}, {{fact:ppl_2gpu}} and {{fact:ppl_4gpu}} for increasing GPU counts. These measurements show how batch and update frequency affect convergence as well as execution speed.

## NCCL transport and gradient synchronization {#transport}

The trainer accumulates gradients across micro-steps and synchronizes through NCCL at the accumulation boundary. This reduces the frequency of cross-GPU communication. We used the launch configuration to compare NVLink peer-to-peer and shared-memory transport, with a recorded throughput gap of {{fact:transport_gap}}.

## FSDP memory and throughput trade-offs {#fsdp}

We benchmarked FSDP's sharding modes against DDP. FSDP saved {{fact:fsdp_memory}} of peak memory, at a small cost in throughput. At this model size most memory goes to activations, not to parameters, gradients or optimizer state, and sharding only reduces the latter. FSDP is not worth its complexity for a model this small; it starts to matter when parameters and optimizer state dominate.

This project uses the original FSDP API with a per-block auto-wrap policy.

## Tokenization: separating parallelism from caching {#tokenization}

Two approaches were benchmarked on a {{fact:sample}} sample of the corpus:

- **`datasets.map(num_proc=…)`** went from about sixteen minutes with one process to seconds with two — {{fact:tokenize_repeat}} — and stayed flat from two to sixteen processes. A flat curve means parallelism is not the cause: most of that gain comes from reusing cached tokenized shards on repeated runs.
- **`multiprocessing.Pool.imap`** with eight workers gave {{fact:tokenize_mp}} from parallelism alone, and tuning the chunk size added {{fact:chunk_tuning}}.

Both numbers are reported together, with their mechanisms, because only the second one measures parallel speedup.

## Training summaries {#limits}

The trainer writes throughput, average iteration time, validation perplexity and rank-zero peak memory into each run's summary. I used those measurements to compare the configurations and explain the different effects of data preparation, gradient synchronization and parameter sharding.
