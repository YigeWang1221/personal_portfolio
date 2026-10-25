## Designing around component responsibilities {#approach}

I start with the product's workflow and assign responsibilities to its components. The examples below show how that approach shaped mobile capture, GPU training, adapter serving and cloud releases.

## Self-hosting the mobile backend {#kk-self-hosting}

I run KK Knock's FastAPI and PostgreSQL backend on a Mac mini with Docker Compose, reached through Cloudflare Tunnel. Nginx serves the admin console and forwards API requests; PostgreSQL uses an external data volume. This uses owned hardware for the app's backend, while the Terraform and Packer path provides an AWS alternative.

## Reusing completed capture responses {#kk-idempotency}

I assign a capture ID when recording starts and reuse it through local storage and backend requests. The phone persists audio, text and job progress. The backend response cache stores completed results by account and capture ID for {{fact:kk-knock.idempotency_window}}, allowing subsequent requests to retrieve that result.

## CPU speech recognition with runtime kernels {#kk-cpu-asr}

I chose whisper.cpp CPU execution for the Android app after comparing execution paths on a test device. Runtime ARM64 kernel selection reduced Small-model transcription from {{fact:kk-knock.asr_before}} to {{fact:kk-knock.asr_after}} on short synthetic clips. I integrated that path through the NDK and added native cancellation.

## Queue-driven training capacity {#lora-scale-from-zero}

Writing-style training arrives as individual jobs. I connected SQS backlog to an Auto Scaling group that rests at zero instances. Workers protect their instances during training and release protection when finished; the group handles scale-in. This separates product job creation from GPU capacity management.

## Keeping active adapters in memory {#lora-adapter-cache}

Chat requests reuse writing-style adapters, while GPU memory has a fixed capacity. I implemented an LRU cache that protects adapters in use and shares concurrent downloads for the same adapter. The manager checks artifact hashes before loading and returns a resource response when it cannot accept another load.

## Promoting machine images across AWS accounts {#cloud-immutable}

I use a versioned Packer image as the release unit for the Spring Boot application. GitHub Actions builds it in the dev account, shares it with the demo account and starts an instance refresh through a new launch-template version. The previous image remains available for rollback. Successful build-to-refresh runs had a median duration of {{fact:cloud-native.deploy_median}}.

## Holding token count constant in scaling experiments {#hpc-token-budget}

We held the training token budget constant across GPU configurations, reducing iterations as GPU count increased. I analyzed throughput alongside validation perplexity to examine the relationship between execution speed, effective batch size and optimizer updates. The baseline and four-GPU FSDP logs recorded {{fact:distributed-llm.ppl_1gpu}} and {{fact:distributed-llm.ppl_4gpu}} respectively.
