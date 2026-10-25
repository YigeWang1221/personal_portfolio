## From a spoken idea to a todo or researched note {#product}

I created KK Knock to capture a passing thought or reminder when typing is inconvenient. I designed the interaction and built the Android app, backend and admin console around a voice workflow.

The phone transcribes speech with whisper.cpp. The backend classifies the transcript: an actionable reminder becomes a todo with a due time, while an idea goes through research and becomes a note with sources. The Android app stores the result locally for editing, search and home-screen widgets.

I kept recording and note storage on the phone. The capture request sends text to the backend, while editing and organizing saved notes stay local.

## Recording alongside background processing {#iteration}

I separated recording from classification and research. Once the transcript is saved, the microphone becomes available while the job continues in the background.

I then designed the widget to communicate that separation: its ready artwork remains visible while background jobs run, a count shows queued work, and the progress ring represents local transcription. The Recent Captures page brings running, completed and failed captures together with Retry, Play and Delete actions.

The queue reuses saved audio or text for retries, requeues jobs with expired leases and schedules back-off work through WorkManager. The interface exposes these operations in the same place as the capture history.

## Durable capture jobs and response reuse {#reliability}

I gave each capture an ID when recording starts and kept that ID through transcription, processing and storage. Room stores the job and its progress; WorkManager claims queued jobs with a lease.

Audio remains available until its transcript is saved. A transcription retry uses the audio, while a classification or research retry uses the text. Local result IDs derive from the account and capture ID, so replaying a result updates the same record.

I also implemented a backend cache keyed by account and capture ID. It stores completed todo or note responses for {{fact:idempotency_window}} and returns the saved response on a subsequent request. The cache holds the returned content and sources; the transcript follows the processing path.

## Speech recognition on the phone CPU {#asr}

I integrated whisper.cpp through the Android NDK and implemented incremental {{fact:asr_window}} transcription windows with a whole-file fallback. Runtime ARM64 kernel selection brought Small-model transcription from {{fact:asr_before}} to {{fact:asr_after}} on a test phone with short synthetic clips.

I chose CPU execution after comparing the available paths on that device: Flash Attention increased transcription time, while Vulkan returned `DeviceLost`. Runtime kernel selection provides the app's ARM64 execution path.

I added a native abort patch so cancellation can reach the transcription code, and applied it as a build-time overlay against the pinned whisper.cpp source. Speech-model downloads use hash checks and atomic replacement.

## Android interface and home-screen widgets {#validation}

I connected the capture workflow to Compose screens and home-screen widgets. The recording widget starts a capture, the todo widget presents saved tasks, and the app provides note editing and a searchable capture history. Android downloads are available through the project's introduction page.

## Architecture {#architecture}

The system has two halves with a strict data-ownership line between them.

- **The Android app** (Kotlin Multiplatform, Jetpack Compose) owns the notes. One foreground service is the only component allowed to record. whisper.cpp, compiled with the NDK, transcribes on the device. Captures move through a job queue in Room driven by WorkManager; results are written to Room and shown in home-screen widgets.
- **The backend** (FastAPI, async SQLAlchemy, PostgreSQL 16) owns accounts, profiles, prompts, usage metering and announcements. It has no notes table; its one capture-related table is the response cache described above.
- **Model processing has separate stages.** Classification first decides whether input is a todo, a thought or nothing to retain. Complex todos receive a further decomposition step; thoughts go through research and synthesis. Simple todos skip that extra detail call. Classification, todo detail and research use configurable model slots, with protocol chosen from the URL.
- **A React admin console** (TypeScript, Vite) manages users, usage, announcements and system settings, behind its own admin authentication.

## LLM cost controls {#cost}

A free consumer app that calls LLMs needs hard limits. Every provider call is metered by provider, model and cache use, and the counters are incremented atomically in the database.

- **Fail closed.** A call with an unknown tariff is refused rather than estimated. Price changes apply only to future usage.
- **Budget snapshots.** Each plan has an AI cost budget per usage period; the defaults for Free, Lite and Pro are {{fact:budgets}}. The budget is copied into each period when it starts, so a later change never alters a running period. Periods are anchored to each account's own start date.
- **Quotas, with a test exception.** Test accounts bypass the quota but are still metered.

## Self-hosting and the AWS fallback {#operations}

**Current deployment.** The backend runs on an owned Mac mini with Docker Compose, accessed publicly through Cloudflare Tunnel. PostgreSQL keeps its data on an external volume; the FastAPI service runs as a non-root container with a health check; Nginx serves the admin console, reverse-proxies the API and is the only published port. A first-run initializer only touches an empty database, and backups are written with restricted file permissions.

**The same backend on AWS.** Before settling on self-hosting, I built a disposable AWS path. Terraform creates a small VPC and one EC2 instance managed through SSM Session Manager instead of SSH. A CI pipeline tests the backend, packages a deterministic artifact, verifies its digest and bakes a Packer AMI through GitHub's OIDC federation, with no static AWS keys. Both ran in August 2026, including one full apply, test and destroy cycle; the path is kept as a fallback.

**Forced updates.** The backend is the authority on the minimum supported app version. Older apps receive HTTP 426 and an update prompt. Diagnostics record request IDs and timings, never content.

## Product and system design {#planning}

I translated the original voice-capture idea into interaction prototypes, API responsibilities and component boundaries. The phone handles recording, transcription and saved notes; the backend handles model processing, accounts and usage; the admin console manages application settings.

That separation guided the product's asynchronous capture workflow: the phone can accept a new recording while the backend processes an earlier transcript.
