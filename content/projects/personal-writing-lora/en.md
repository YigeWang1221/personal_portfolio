## Personal writing adapters from training to serving {#problem}

I built a platform for training LoRA adapters from personal writing and using them in a chat interface. I designed the product workflow, API, data model and AWS infrastructure, then connected the training queue, GPU worker and vLLM serving path.

The central design separates the lifetime of a training job from the lifetime of a chat request. Training produces a versioned adapter in object storage; the serving layer loads that adapter when a user selects the corresponding writing style.

## Product model and component contracts {#planning}

I first mapped the writing workflow into projects, chats, styles and versions. Wireframes defined the workspace and drafts panel; the ER design connected those concepts to the database.

I then defined the product API and the interfaces between the backend, training worker and serving layer with OpenAPI and JSON Schema. Request IDs, named error codes and backend-generated version labels give the components a shared vocabulary. The early wireframes and ER sketch below show how the product structure developed.

## Database ownership and GPU capacity {#decisions}

### Workers report through the backend {#decision-callback}

I kept database access in the product backend. Training workers receive jobs through SQS and return progress and results through an authenticated callback. This keeps database credentials with one component and avoids giving every training instance a database connection. The callback contract defines the payload and authentication shared by the worker and backend.

### Auto Scaling owns instance capacity {#decision-lifecycle}

I assigned capacity management to the Auto Scaling group. Queue backlog requests more instances; each worker protects its instance while training and releases protection when finished. The group reclaims capacity through its scaling policy. This keeps job execution in the worker and instance lifecycle management in AWS Auto Scaling.

## Connecting personal writing to chat {#validation}

I ran the training and serving path on AWS with my own writing. The GPU worker produced an adapter, and vLLM loaded it for chat generation. This connected the product's style-version model to the actual training artifact and the adapter selected for inference.

## Current architecture {#architecture}

- **Product.** A Next.js app (strict TypeScript, App Router) talks to a FastAPI backend organized as router → service → repository. PostgreSQL holds {{fact:tables}} tables under Alembic migrations, with CHECK constraints guarding status fields. Sessions use HttpOnly cookies with opaque tokens; only their SHA-256 hashes are stored.
- **Training hand-off.** Submitting a training job writes an outbox row in the same transaction; a dispatcher moves it to SQS. A GPU worker claims the job, fine-tunes with QLoRA and publishes the adapter to S3.
- **Serving.** An adapter manager sits in front of vLLM's runtime LoRA API: it loads, unloads and caches adapters and proxies chat and streaming requests.

## Safe job hand-off under at-least-once delivery {#job-handoff}

SQS delivers a message at least once, and GPU instances can disappear mid-job. The design assumes both:

- **Outbox.** The backend records the job and its outbox row in one transaction, so a crash between saving a job and queueing it cannot lose the job. Duplicates are handled downstream.
- **One job identity per style version**, so re-queued work is recognized as the same job.
- **Claim by conditional write.** The worker claims a job with a conditional write in S3, so two workers that receive the same message cannot both train it.
- **Lease heartbeat.** While training, the worker extends the message's visibility timeout. If it loses the lease, it stops working.
- **Delete last.** The message is deleted only after the backend confirms the result. Callback retries resend identical bytes, so the backend can deduplicate them.
- **Artifact integrity.** Each adapter goes to an immutable folder per user, job and artifact version, with a manifest and a SHA-256 hash for every file. The `READY` marker is written last, adapters are moved into the cache atomically, and the system never silently falls back to the base model.

## Queue-driven GPU training {#scale-from-zero}

The training Auto Scaling group rests at zero instances when the queue is empty. Scaling policies observe visible messages per running instance and add capacity for queued jobs. A worker takes a message, protects its instance during training and releases protection when the job finishes.

I chose this queue-driven design because training demand arrives as separate jobs. Capacity follows queued work, while the product backend only records and dispatches jobs.

## Adapter loading and cache management {#serving}

I placed an adapter manager in front of vLLM's runtime LoRA API. It loads and unloads adapters, proxies chat and streaming requests, and manages a bounded cache.

Concurrent requests for the same adapter share a download. The manager checks file hashes and the `READY` marker before loading, moves files into the cache atomically, and protects adapters while requests are using them. LRU eviction applies to idle adapters; when capacity is occupied, the manager returns an explicit resource response. These rules coordinate download, cache ownership and model use within the manager process.

## AWS infrastructure and component roles {#infrastructure}

I defined the platform in Terraform with {{fact:tf_resources}} resource blocks. The network separates public, application and database subnets. Security groups connect the application, database and GPU services through component references.

Launch templates configure encrypted disks and IMDSv2, with SSM for instance access. RDS PostgreSQL holds product data; S3 holds datasets and adapters; SQS carries training jobs and includes a dead-letter queue. KMS encrypts the data services.

IAM follows the component boundaries: deployment roles pass roles, release roles write launch templates, and runtime roles trust EC2. The training role reads its callback secret while database credentials stay with the backend.

## Versioned training artifacts {#next}

Each adapter is published under its user, job and artifact version. A manifest records file hashes, and the worker writes `READY` after publishing the files. The serving layer uses this structure to resolve the selected style version to a specific artifact.
