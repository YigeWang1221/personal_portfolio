## Product scope and engineering responsibilities {#product}

KK Knock began with an everyday need: capture a passing thought or reminder when my hands are busy. I developed the idea into requirements and development documents, interaction prototypes, technology decisions and coding guidelines, then scheduled work in phases across the app, backend and admin console.

I connected on-device speech recognition to backend intent classification: an actionable reminder becomes a todo with a due time, while an idea that needs exploration goes through research and becomes a note with sources. These are alternative outputs. The goal is to reduce typing and organizing, so a thought can be captured now and acted on or developed later.

Four rules shape both the product and the architecture behind it:

- **Transcribed on the phone.** Whisper runs on the device, and audio never leaves it.
- **Audio stays on the device.** The capture path sends transcribed text rather than audio. This is a boundary for recording data, not a claim that account and profile features send no other data.
- **Notes live on the phone.** Todos and thoughts are stored locally, not in an online notebook.
- **Editing stays local.** Changing, organizing or searching notes never calls an LLM.

It is deliberately not a chatbot, a project-management suite or a document editor.

## Capture queue and status feedback {#iteration}

**What I wanted.** Recording should be free again as soon as the transcript is saved. Classification and research run in a background queue, so a second thought can be captured while the first is still being processed. I made capture asynchronous in September 2026.

**What real use showed.** A look at the job history on my phone showed that no capture had ever overlapped a running job: I always waited. The cause was the interface, not the queue. The widget used the same artwork for "transcribing, taps are ignored" and "processing in the background, you can record again". The app counted the waiting jobs but never showed the number, and the list of recent captures appeared only after something failed.

**A failure nobody could see.** Reviewing the code for this change turned up a real bug. A network, server or rate-limit error left a job in processing forever: the automatic retry went out without its retry flag, and the controller handled only success.

**What I changed, and what I left alone.** The queue's behavior stayed as it was; the change covers what the user sees and how failures end.

- The widget keeps its ready artwork and adds a count while jobs run in the background. The progress ring now means local transcription only.
- One Recent Captures page lists failed, running and recently finished captures, with Retry, Play and Delete on each. It is reachable from a permanent icon, which I added after I could not find the list myself when no jobs were active.
- Every result other than success becomes a visible failure. Retries always go out as retries, which is safe because the capture ID makes them idempotent. Jobs whose lease expired are re-queued, and back-off wake-ups get their own work name so WorkManager no longer drops them.

**Where it stands.** New tests cover a network retry, an unfinished submission, an expired lease and failures staying in the list. I accepted the change on my phone and use it every day; it is not in a public release yet. One gap stays open on purpose, described in the next section.

## Failure recovery and idempotency {#reliability}

A voice note has to survive a killed app, a flaky network and a failed LLM call without being lost or filed twice. Each capture is a job with explicit states on the phone, and the rule is that a retry never redoes work that is already saved.

- **Save before the next step.** Audio is deleted only after its transcript is stored, so a crash during transcription can be retried from the audio. Once the transcript is stored, the job is queued and the microphone is free.
- **One worker per job.** A background worker claims a queued job with a lease in Room, so two workers never process the same capture.
- **Retry by stage.** A failed transcription retries from the saved audio; a failed classification or research retries from the saved transcript. Automatic retries for temporary network errors are capped, honor `429 Retry-After`, and never loop on `401`.
- **One ID for the whole life of a capture.** A client capture ID is created when recording starts and never regenerated. Local records use IDs derived from the account and that capture ID, so a replayed result overwrites instead of duplicating.
- **Replay instead of re-running (backend implementation).** Where the response-cache migration is enabled, the server keeps its response for each account and capture ID. Within {{fact:idempotency_window}}, a retry after a lost response gets the same result back, without a second LLM call or a second charge.

**Response-cache scope.** This is implemented in the backend, but I have not confirmed that it is enabled on my self-hosted machine. The retention period is a configuration choice, not a performance result. The cache does not store transcripts. The response cache does hold what it returned — the generated todo or thought, including a researched article and its sources — keyed by account and capture ID. An entry counts as expired after {{fact:idempotency_window}} and is dropped the next time that capture ID is looked up.

**The open gap.** The cache holds only completed responses. A retry that reaches the server while the first request is still running, for example after a dropped connection during a long research call, runs the pipeline again and can be charged twice. A server-side "in progress" marker would close it; I have left it for after the first release.

## Transcription on a phone CPU {#asr}

Keeping audio on the phone means paying for speech recognition in phone CPU time. Transcription runs in incremental {{fact:asr_window}} windows, with a whole-file pass as the fallback: windowed batches, not token streaming.

I tried the usual levers on one test phone, with short synthetic clips and no thermal control, so the numbers show a direction rather than a benchmark:

- **Runtime ARM64 kernel selection** brought the Small model from {{fact:asr_before}} to {{fact:asr_after}} per clip. This is what shipped.
- **Rejected after testing:** Flash Attention made transcription slower, six threads were unstable, and Vulkan on the phone's GPU failed with `DeviceLost`. The app stays CPU-only; one phone is not a claim about other chips.
- **Instant cancellation.** A native abort patch cut the time to cancel a transcription that had not started from {{fact:cancel_before}} to {{fact:cancel_after}}; a cancel issued mid-run returns in {{fact:cancel_mid_run}}.

The patch is applied at build time as an overlay that checks its anchor before patching, so the vendored whisper.cpp stays pinned and hash-checked. Speech models are downloaded with SHA verification and swapped in atomically.

## What has been verified {#validation}

- **On the phone.** The app is accepted on one Android phone (OnePlus, Android 16), and I use it daily, including the visible queue. It has not been tried on a second device.
- **The backend.** The self-hosted deployment was accepted in September 2026: ARM64 build, health checks, admin routes, the unauthenticated boundary, container recreation with data kept, and a backup. The response cache for retries is in the backend code and running on another server; I have not yet confirmed it on the self-hosted machine.
- **Tests.** {{fact:tests}} automated test cases across the backend (with PostgreSQL integration suites), the Android app (unit, host and instrumented tests) and the admin console, including the capture pipeline's retry paths.
- **Not done yet.** Public HTTPS through the tunnel, a public release, iOS (a scaffold only), a second test device, and measured latency and cost per capture.

**Next:** measure latency from stop to transcript and from transcript to result, measure the cost per capture, publish the first Android release with a short demo video, and close the in-flight duplicate gap.

## Architecture {#architecture}

The system has two halves with a strict data-ownership line between them.

- **The Android app** (Kotlin Multiplatform, Jetpack Compose) owns the notes. One foreground service is the only component allowed to record. whisper.cpp, compiled with the NDK, transcribes on the device. Captures move through a job queue in Room driven by WorkManager; results are written to Room and shown in home-screen widgets.
- **The backend** (FastAPI, async SQLAlchemy, PostgreSQL 16) owns accounts, profiles, prompts, usage metering and announcements. It has no notes table; its one capture-related table is the response cache described above.
- **The LLM layer** is provider-neutral. A DeepSeek model, called through an OpenAI-compatible API, is the judge that files a capture as TODO, THOUGHT or IGNORED. Gemini with Google Search grounding researches thoughts. Each slot picks its protocol from the configured URL.
- **A React admin console** (TypeScript, Vite) manages users, usage, announcements and system settings, behind its own admin authentication.

## LLM cost controls {#cost}

A free consumer app that calls LLMs needs hard limits. Every provider call is metered by provider, model and cache use, and the counters are incremented atomically in the database.

- **Fail closed.** A call with an unknown tariff is refused rather than estimated. Price changes apply only to future usage.
- **Budget snapshots.** Each plan has an AI cost budget per usage period; the defaults for Free, Lite and Pro are {{fact:budgets}}. The budget is copied into each period when it starts, so a later change never alters a running period. Periods are anchored to each account's own start date.
- **Quotas, with a test exception.** Test accounts bypass the quota but are still metered.

## Self-hosting and the AWS fallback {#operations}

**Self-hosted pilot.** The backend runs on an owned Mac mini with Docker Compose. PostgreSQL keeps its data on an external volume; the FastAPI service runs as a non-root container with a health check; Nginx serves the admin console, reverse-proxies the API and is the only published port. A first-run initializer only touches an empty database, and backups are written with restricted file permissions.

**The same backend on AWS.** Before settling on self-hosting, I built a disposable AWS path. Terraform creates a small VPC and one EC2 instance managed through SSM Session Manager instead of SSH. A CI pipeline tests the backend, packages a deterministic artifact, verifies its digest and bakes a Packer AMI through GitHub's OIDC federation, with no static AWS keys. Both ran in August 2026, including one full apply, test and destroy cycle; the path is kept as a fallback.

**Forced updates.** The backend is the authority on the minimum supported app version. Older apps receive HTTP 426 and an update prompt. Diagnostics record request IDs and timings, never content.

## Development plan {#planning}

Every repository carries instructions for AI coding agents, and a shared project memory — context, architecture, current state and a decision log — keeps me and the agents working from the same facts. The decision log reached {{fact:adrs}} records in about four weeks. Each record states its context, the decision and its consequences, and a superseded decision says so; the queue iteration above is two such records.

Work is cut into phases, each with its own document. The phase names below are the plain ones; the project documents use codes, shown in brackets. A feature audit in September 2026 reviewed the scope and set the backlog for the next phases.
