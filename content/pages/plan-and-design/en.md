## How I work {#approach}

The projects on this site are very different — a mobile product, a training benchmark, cloud infrastructure, a Bayesian model — but I plan and design them the same way:

- **Write the decision down before building.** Context, options, the decision and its consequences. KK Knock's decision log reached {{fact:kk-knock.adrs}} records in about four weeks.
- **Freeze interfaces early.** The LoRA platform's worker, backend and serving contracts existed as JSON Schema and OpenAPI, with deliberately invalid examples, before the code that implements them.
- **Plan in phases, and keep unfinished phases visible.** Every roadmap below shows what is done, what is in progress and what has not started.
- **Separate what exists from what is planned.** Diagrams are labeled CURRENT or PROPOSED; early sketches are labeled as history.
- **Say what was measured, and under which conditions** — and when something was not measured at all.

## Self-hosting on a Mac mini instead of AWS {#kk-self-hosting}

**Context.** KK Knock is a pre-beta consumer app with a small backend (FastAPI and PostgreSQL), and a working AWS path — Terraform, a Packer image and an OIDC-based CI pipeline — had already been built and tested.

**Options.** Keep the EC2 deployment, or run the same backend with Docker Compose on an owned Mac mini.

**Decision.** The Mac mini with Docker Compose. The AWS path stays as a tested, disposable fallback.

**Trade-off.** One host on a home network with no redundancy, in exchange for no hosting bill and full control during pre-beta.

**Evidence and status.** The Compose stack — one published port, an external database volume, a first-run initializer, backups — passed a dated acceptance in September 2026. It runs as a self-hosted pilot; public HTTPS through a tunnel is not yet accepted.

## Near-exactly-once capture with a client key {#kk-idempotency}

**Context.** A spoken capture must survive a killed app, a flaky network and retries without being lost or charged twice.

**Options.** No protection, a client-generated key, or a server-side "in progress" marker.

**Decision.** A client capture ID created when recording starts and never regenerated, three durable layers on the phone, and a server cache of each returned response, valid for {{fact:kk-knock.idempotency_window}}, so a retry is replayed instead of re-run.

**Trade-off.** A duplicate that arrives while the first request is still running can still be charged. In exchange, the server never stores a transcript; the cache keeps only the response it already returned.

**Evidence and status.** Implemented across the capture service, the phone's capture repository and an idempotency migration. The server-side marker is planned.

## CPU-only speech recognition after testing GPU and NPU {#kk-cpu-asr}

**Context.** whisper.cpp has to run on Android phones with very different chips.

**Options.** The GPU through Vulkan, the NPU, Flash Attention, or the CPU with ARM64 kernels chosen at runtime.

**Decision.** The CPU, with runtime kernel selection.

**Trade-off.** It gives up possible GPU speed-ups, but avoids a dependency on Vulkan or NPU support; performance still varies by device.

**Evidence and status.** On one test phone with short clips, runtime kernel selection brought Small-model transcription from {{fact:kk-knock.asr_before}} to {{fact:kk-knock.asr_after}}; Flash Attention was slower and Vulkan failed with `DeviceLost`. Shipped in the app.

## Scale-from-zero GPU training {#lora-scale-from-zero}

**Context.** In the LoRA platform, training jobs are rare, and an idle GPU is expensive.

**Options.** Let the backend launch GPU instances itself, keep a GPU running, or let a queue drive an Auto Scaling group that rests at zero.

**Decision.** SQS plus a GPU Auto Scaling group with minimum and desired capacity at zero, scaled on backlog per instance. Workers protect their own instance while training and never terminate themselves.

**Trade-off.** Cold-start latency. In exchange, there is no idle GPU cost, and the backend needs no permission to launch instances.

**Evidence and status.** Terraform checked with mock-provider tests and a worker lifecycle tested against local fakes, then run on AWS: the training group scaled up from zero for a real training job. The environment was destroyed afterwards.

## An adapter cache that never evicts adapters in use {#lora-adapter-cache}

**Context.** Many users' LoRA adapters share one GPU. Loading an adapter is slow, and memory is finite.

**Options.** Load an adapter per request, cache without limits, or use an LRU cache that protects adapters in use.

**Decision.** An LRU cache that never evicts an adapter in use, one download per adapter at a time, and a bounded queue that answers 429 or 503 explicitly.

**Trade-off.** It can refuse a load under pressure. It never serves a half-loaded adapter.

**Evidence and status.** Implemented in the adapter manager and tested against fakes; served one trained adapter through vLLM on one GPU on AWS. Loading many users' adapters at once has not been benchmarked yet.

## Immutable releases promoted across AWS accounts {#cloud-immutable}

**Context.** A Spring Boot service in an Auto Scaling group has to be deployed often and rolled back safely.

**Options.** Update the running servers in place, or bake a new machine image for every release.

**Decision.** A Packer AMI per merge, built in a dev account, shared with a demo account and rolled out through a new launch-template version and an instance refresh.

**Trade-off.** Slower than updating in place — a median of {{fact:cloud-native.deploy_median}} — but versioned images can be reused for rollback, with separate dev and demo accounts.

**Evidence and status.** The GitHub Actions workflows and their run history; used across project releases.

## A fixed token budget for scaling experiments {#hpc-token-budget}

**Context.** Comparing training throughput on one, two and four V100 GPUs.

**Options.** A fixed number of iterations, or a fixed token budget.

**Decision.** A fixed token budget: when the GPU count doubles, the iteration count halves.

**Trade-off.** The throughput comparison is clean, but larger runs take fewer optimizer steps, and validation perplexity was worse: {{fact:distributed-llm.ppl_1gpu}} on one GPU against {{fact:distributed-llm.ppl_4gpu}} on four.

**Evidence and status.** The config files and the committed logs.
