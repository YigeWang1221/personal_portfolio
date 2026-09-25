## The product {#product}

Tasks and ideas rarely wait for a free hand. KK Knock is built for those moments — just parked, pushing a shopping cart, cooking. Tap the KK Capture widget on the home screen, say what is on your mind, and tap again. The app turns it into a todo with the due time you mentioned, or into a thought that it researches and writes up with sources. If there is nothing worth keeping, nothing is created.

Four rules shape the product:

- **Transcribed on the phone.** Speech-to-text runs on the device with Whisper; audio is never uploaded.
- **Only text goes out.** To classify and research a capture, only its transcript is sent to the backend and the LLM providers.
- **Notes live on the phone.** Todos and thoughts are stored locally, not in an online notebook. The server keeps a copy of each response only to answer retries (see below).
- **Editing stays local.** Changing, organizing or searching notes never calls an LLM.

It is deliberately not a chatbot, a project-management suite or a document editor.

## What I owned {#ownership}

Everything, alone: the product definition, the Android app, the backend, the admin console, the deployment and the test suites. Every commit in its five repositories is mine.

I built it with AI coding agents, and the split of work matters. I wrote the product specifications and the phase documents, made each decision and recorded it in the decision log, and reviewed what the agents produced. The agents wrote much of the code, working under instructions and a shared project memory that I maintain. There is no team to manage; the agents are tools.

## Architecture {#architecture}

The system has two halves with a strict data-ownership line between them.

- **The Android app** (Kotlin Multiplatform, Jetpack Compose) owns the notes. One foreground service is the only component allowed to record. whisper.cpp, compiled with the NDK, transcribes on the device. Captures move through a job queue in Room driven by WorkManager, and results are written to Room and shown in home-screen widgets.
- **The backend** (FastAPI, async SQLAlchemy, PostgreSQL 16) owns accounts, profiles, prompts, usage metering and announcements. It stores no transcripts and has no notes table. Its one capture-related table is an idempotency cache that keeps the response it returned for each capture, so a retry can be answered without calling the LLM again.
- **The LLM layer** is provider-neutral. A DeepSeek model, called through an OpenAI-compatible API, is the judge that files a capture as TODO, THOUGHT or IGNORED. Gemini with Google Search grounding researches thoughts. Each slot picks its protocol from the configured URL.
- **A React admin console** (TypeScript, Vite) manages users, usage, announcements and system settings, behind its own admin authentication.

## When a capture fails {#reliability}

A voice note has to survive a killed app, a flaky network and a failed LLM call without being lost or filed twice. Each capture is a job with explicit states on the phone, and the design rule is that a retry never redoes work that is already saved.

- **Saved before the next step.** Audio is deleted only after its transcript is stored, so a crash during transcription can be retried from the audio. Once the transcript is stored, the job is queued and the microphone is free for the next capture.
- **One worker per job.** A background worker claims a queued job with a lease in Room, so two workers never process the same capture.
- **Retries by stage.** A failed transcription retries from the saved audio; a failed classification or research retries from the saved transcript. Automatic retries for temporary network errors are capped, honor `429 Retry-After`, and never loop on `401`.
- **One ID for the whole life of a capture.** A client capture ID is created when recording starts and is never regenerated. Local records use stable IDs derived from the account and that capture ID, so a replayed result overwrites instead of duplicating.
- **Replay instead of re-running.** The server keeps the response for each account and capture ID; within {{fact:idempotency_window}}, a retry after a lost response gets the same result back without a second LLM call or a second charge.

**What the server keeps, exactly.** The server does not store transcripts. The idempotency cache does hold the response it returned — the generated todo or thought, including a researched article and its sources — keyed by account and capture ID. An entry is treated as expired after {{fact:idempotency_window}} and is dropped when that capture ID is looked up again. On the phone, transcripts and job metadata are cleared on their own retention schedule.

**Known gap.** The cache only holds completed responses. A retry that reaches the server while the first request is still running — for example after a dropped connection during a long research call — runs the pipeline again and can be charged twice. A server-side "in progress" marker would close this; it is not built yet.

## One iteration: making the queue visible {#iteration}

The asynchronous queue above was itself an iteration, and using it exposed the next one.

1. **The change.** Capture used to wait for the backend before the next recording could start. I made it asynchronous: the interactive part ends when the transcript is saved, and classification runs from the job queue in the background. Host tests passed; acceptance on the phone was still open.
2. **What real use showed.** In practice I never recorded while an earlier job was still processing. The widget used the same artwork for "transcribing, taps ignored" and "processing in the background, taps start a new recording"; the app computed the number of waiting jobs but never showed it; and a network, server or rate-limit failure could leave a job in processing forever — the automatic retry was sent without the retry flag, and the controller only handled success.
3. **Scope.** Keep the queue's semantics; change only what the user sees and how failures end. The widget shows the ready artwork plus a count while jobs run in the background. The app gets one Recent Captures page — failed, in progress and recently finished — reachable from a permanent icon, with Retry, Play and Delete on each row.
4. **Fixes behind it.** The pipeline always submits as a retry, because the queue owns re-submission and the capture ID makes it idempotent. Any result other than success becomes a visible failure. Jobs whose lease expired are re-queued. Backoff wake-ups get their own work name, so WorkManager no longer drops them.
5. **Acceptance.** Every failure should end up listed and retryable, and the next capture should start as soon as the transcript is saved. This work is decided and in progress on the phone; it is not committed or accepted yet, and the in-flight duplicate gap above is recorded as out of scope.

## How the work is planned {#planning}

Every repository carries instructions for AI coding agents, and a shared project memory — context, architecture, current state and a decision log — keeps me and the agents aligned. The decision log reached {{fact:adrs}} records in about four weeks. Each record states its context, the decision and its consequences, and superseded decisions say so explicitly; the iteration above is two such records.

Work is cut into phases, each with its own document. The on-device transcription work has a requirements document that fixes hard phase boundaries and the incremental-window design. A feature audit in September 2026 reviewed the scope and set the backlog for the next phases.

## On-device speech recognition {#asr}

Transcription runs in incremental {{fact:asr_window}} windows, with a whole-file pass as the fallback. It is windowed batch processing, not token streaming.

The performance work was measured on one test phone with short synthetic clips and no thermal control, so the numbers show a direction rather than a general benchmark:

- **Runtime ARM64 kernel selection** brought the Small model from {{fact:asr_before}} to {{fact:asr_after}} per clip.
- **Rejected after testing:** Flash Attention made transcription slower, six threads were unstable, and Vulkan on the phone's GPU failed with `DeviceLost`. The app stays CPU-only; the tests ran on one phone, so this is not a claim about other chips.
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
- **Next:** finish and accept the visible queue, measure latency distributions (stop → transcript, transcript → result) and the cost per capture, add a second test device, record a short demo, and close the in-flight duplicate gap with a server-side marker.
