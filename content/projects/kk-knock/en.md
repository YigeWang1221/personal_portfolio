## The product {#product}

Tasks and ideas rarely wait for a free hand. KK Knock is built for those moments — just parked, pushing a shopping cart, cooking. Tap the KK Capture widget on the home screen, say what is on your mind, and tap again. The app turns it into a todo with the due time you mentioned, or into a thought that it researches and writes up with sources. If there is nothing worth keeping, nothing is created.

Four rules shape the product:

- **Transcribed on the phone.** Speech-to-text runs on the device with Whisper; audio is never uploaded.
- **Only text goes out.** To classify and research a capture, only its transcript is sent to the backend and the LLM providers.
- **Results live on the phone.** Todos and thoughts are stored locally, not in an online notebook.
- **Editing stays local.** Changing, organizing or searching notes never calls an LLM.

It is deliberately not a chatbot, a project-management suite or a document editor.

## Architecture {#architecture}

The system has two halves with a strict data-ownership line between them.

- **The Android app** (Kotlin Multiplatform, Jetpack Compose) owns all content. One foreground service is the only component allowed to record. whisper.cpp, compiled with the NDK, transcribes on the device. Captures move through a job queue in Room driven by WorkManager, and results are written to Room and shown in home-screen widgets.
- **The backend** (FastAPI, async SQLAlchemy, PostgreSQL 16) owns accounts, profiles, prompts, usage metering and announcements, and nothing else. It stores no transcripts and no results; its only capture-related table is a response-only idempotency cache.
- **The LLM layer** is provider-neutral. A DeepSeek model, called through an OpenAI-compatible API, is the judge that files a capture as TODO, THOUGHT or IGNORED. Gemini with Google Search grounding researches thoughts. Each slot picks its protocol from the configured URL.
- **A React admin console** (TypeScript, Vite) manages users, usage, announcements and system settings, behind its own admin authentication.

Sign-in exchanges a Google ID token for the app's own JWT, keyed by an internal account ID. Accounts are never merged by email.

## How it was planned {#planning}

The project runs on written decisions. Every repository carries instructions for AI coding agents, and a shared project memory — context, architecture, current state and a decision log — keeps me and the agents aligned. The decision log reached {{fact:adrs}} records in about four weeks. Each record states its context, the decision and its consequences, and superseded decisions say so explicitly.

Work is cut into phases, each with its own document. The on-device transcription work has a requirements document that fixes hard phase boundaries and the incremental-window design. A feature audit in September 2026 reviewed the scope and set the backlog for the next phases.

## Key decisions {#decisions}

| Decision | Options | Chosen | Trade-off |
|---|---|---|---|
| Where content lives | Server database, or the phone only | The phone only; the server stores no content | No cross-device sync; stronger privacy and a smaller server |
| Where speech is transcribed | Cloud ASR, or on the device | whisper.cpp on the device | Slower on weak phones and needs a model download; no audio leaves the phone and there is no per-minute cost |
| How to speed up ASR | GPU (Vulkan), NPU, Flash Attention, or CPU kernels | CPU, with ARM64 kernels chosen at runtime | Gives up possible GPU gains; behaves the same across chips |
| Streaming or windows | Token streaming, or incremental windows | Incremental windows with a whole-file fallback | Higher latency than streaming; simpler and more robust |
| Hosting | AWS EC2 (built and tested), or an owned Mac mini | Mac mini with Docker Compose | One host on a home network; no hosting bill and full control |
| Duplicate protection | None, a client key, or a server marker | A client capture ID plus a server response cache | A duplicate that arrives mid-request can still be charged; no content is stored |
| LLM provider | One vendor, or provider-neutral slots | Neutral slots chosen by URL | More configuration; the judge and the researcher can use different vendors |

## What I owned {#ownership}

Everything: the product definition, the Android app, the backend, the admin console, the deployment and the test suites. It is a solo project — every commit in its five repositories is mine. I built it with AI coding agents that work under the decision log and project memory described above. I wrote the specifications, made the decisions and reviewed the results.

## Near-exactly-once capture {#capture}

A capture has to survive a killed app, a flaky network and repeated retries without losing speech or filing it twice. The phone keeps three durable layers:

1. **Transcript receipts.** Audio is deleted only after its transcript receipt is safely stored.
2. **Submission receipts** that record each HTTP submission and its response.
3. **A job queue in Room** with a SQL claim lease, so only one worker handles a capture at a time.

A client capture ID is created when recording starts and is never regenerated. Local records use stable IDs derived from the account and that capture ID, and the server caches each response by account and capture ID for {{fact:idempotency_window}}. A retry after a lost response replays the cached result instead of calling the LLM again. Retries are stage-aware, honor `429 Retry-After`, and use backoff with retention caps.

**Known gap.** A duplicate that arrives while the first request is still running is not caught by the response cache, so it can be charged twice. A server-side "in progress" marker is planned.

## On-device speech recognition {#asr}

Transcription runs in incremental {{fact:asr_window}} windows, with a whole-file pass as the fallback. It is windowed batch processing, not token streaming.

The performance work was measured on one test phone with short synthetic clips and no thermal control, so the numbers show a direction rather than a general benchmark:

- **Runtime ARM64 kernel selection** brought the Small model from {{fact:asr_before}} to {{fact:asr_after}} per clip.
- **Rejected after testing:** Flash Attention made transcription slower, six threads were unstable, and Vulkan on the phone's GPU failed with `DeviceLost`. The app stays CPU-only, so it behaves the same across chips.
- **Instant cancellation.** A native abort patch cut the time to cancel a transcription that had not started from {{fact:cancel_before}} to {{fact:cancel_after}}. A cancel issued mid-run returns in {{fact:cancel_mid_run}}.

The abort patch is applied at build time as an overlay that verifies its anchor before patching, so the vendored whisper.cpp stays pinned and hash-checked. Speech models are downloaded with SHA verification and swapped in atomically.

## LLM cost governance {#cost}

A free consumer app that calls LLMs needs hard limits. Every provider call is metered by provider, model and cache use, and the counters are incremented atomically in the database.

- **Fail closed.** A call with an unknown tariff is refused rather than estimated. Price changes apply only to future usage.
- **Budget snapshots.** Each plan has an AI cost budget per usage period; the defaults for Free, Lite and Pro are {{fact:budgets}}. The budget is copied into each period when it starts, so later changes never alter a running period. Periods are anchored to each account's own start date.
- **Quotas, with a test exception.** Test accounts bypass the quota but are still metered.

## Self-hosting, testing and operations {#operations}

**Self-hosted pilot.** The backend runs on an owned Mac mini with Docker Compose. PostgreSQL keeps its data on an external volume; the FastAPI service runs as a non-root container with a health check; Nginx serves the admin console, reverse-proxies the API and is the only published port. A first-run initializer only touches an empty database, and backups are written with restricted file permissions. The deployment was accepted in September 2026: ARM64 build, health checks, admin routes, the unauthenticated boundary, container recreation with data retained, and a backup.

**The same backend on AWS.** Before settling on self-hosting, I built a disposable AWS path. Terraform creates a small VPC and one EC2 instance that is managed through SSM Session Manager instead of SSH. A CI pipeline tests the backend, packages a deterministic artifact, verifies its digest and bakes a Packer AMI through GitHub's OIDC federation, with no static AWS keys. Both ran successfully in August 2026, including one full apply, test and destroy cycle; the path is kept as a fallback.

**Forced updates.** The backend is the authority on the minimum supported app version. Older apps receive HTTP 426 and an update prompt.

**Tests.** {{fact:tests}} automated test cases cover the backend (with PostgreSQL integration suites), the Android app (unit, host and instrumented tests) and the admin console. Diagnostics record request IDs and timings, never content.

## Limits and what's next {#limits}

- **One test device.** Android acceptance so far covers a single phone (OnePlus, Android 16).
- **Not yet publicly released.** The product page is live; the first public Android release is still being prepared.
- **Public HTTPS pending.** A Cloudflare Tunnel in front of the Mac mini is configured, but its public acceptance has not been recorded yet.
- **iOS** exists only as a scaffold, and store billing is deferred.
- **Next:** measure latency distributions (stop → transcript, transcript → result) and the cost per capture, add a second test device, record a short demo, and close the in-flight duplicate gap with a server-side marker.
