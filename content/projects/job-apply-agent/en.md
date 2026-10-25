## A workspace for the application process {#overview}

JobApply brings job research, application materials, browser form filling and follow-up records into one workspace. I built the Java backend and React interface around the information a job seeker reuses across applications.

The project organizes that information through Project, Session and Job. A Project holds a job-search direction and its materials. A Session holds research and discussion. A Job holds an individual application, so the conversation can move on while its application record remains available.

## Workspace interface design {#workspace-design}

I organized the workspace around job-search directions, research conversations and individual applications. The global view brings application stages, interview schedules and follow-ups together. The application table keeps a record for each job across conversations.

## A shared model-and-tool loop {#agent-loop}

I implemented a common `AgentLoop` for research and application filling. Before each model call, the loop receives new user messages and asks the task adapter to assemble its context. It then executes the model's tool calls, adds their results to the conversation and starts the next round.

`SessionLoop` supplies research context and tools for searching jobs, reading descriptions, managing candidates and choosing a resume. `HarnessLoop` supplies application materials and browser tools for filling a selected job's form. Spring AI carries the model messages and tool schemas; the Java loop controls execution and persistence.

Recruitment pages vary in their fields, navigation and requests for information. I replaced an earlier fixed-step application flow with this loop so the model can choose its next action from the page and tool feedback. The `ask_user` tool requests missing information; `finish` returns a filling report for the user to review and submit in the browser.

## Context assembly and conversation continuation {#context}

I separate stable instructions from changing task information. Each request contains the Agent's instructions, the current materials and plan, then the conversation history. Research receives the user's job-search direction; application filling receives the selected job, reusable facts and upload references.

The conversation layer preserves the ID connecting each tool call to its result. If an interrupted call has no saved result, it inserts an interruption response when reconstructing model messages. It includes the latest page snapshot and keeps earlier actions as records, so repeated page content does not accumulate in each request.

User messages enter an inbox while a task runs. The loop reads that inbox before the next model call, allowing the user to adjust requirements during an application. Saved conversations provide the context for continuing after a reply.

## Skills and layered personal materials {#memory}

I use a Skills index to expose available methods by name and description. The model calls `read_skill` to load a method's body when it needs that guidance. Site-specific experience and reusable form-handling methods therefore have their own files rather than being embedded in the loop.

Personal facts follow an explicit precedence: the current answer, the current Project's overrides, inherited Project overrides, then base materials. An `unset` entry suppresses an inherited value. This lets a job seeker reuse their education and experience while maintaining different materials for different directions.

The memory writer adds, replaces or removes facts and experience notes. For a Skill revision, it locates a unique passage and replaces that passage. Markdown holds readable materials; JSON and JSONL hold application runs and conversations.

## Application scheduling and live updates {#architecture}

I separate task execution from the browser page displaying it. `ApplicationRunner` schedules applications through a worker pool with configurable overall and per-site concurrency. When one site's capacity is occupied, the scheduler can start a queued task for another site.

The backend publishes numbered runtime events over SSE. React subscribes to the relevant Session or Job and updates the conversation, current activity and application view. Reconnection can replay buffered events; a reset makes the interface reload its saved view. Refreshing the interface therefore does not own or restart the task loop.

## Design influences {#references}

I adapted specific mechanisms from other Agent projects into the Java runtime:

- **OpenMAIC:** its user handoff informed `ask_user`, which returns control to the user and continues with their next message. [Director loop](https://github.com/THU-MAIC/OpenMAIC/blob/dff201b49857918885cc5ebadb4a8af254b6ae9d/lib/chat/pi/director-loop.ts).
- **Deep Agents:** its interrupted-tool handling informed the conversation layer's completion of missing tool responses. [Tool-call repair](https://github.com/langchain-ai/deepagents/blob/3e7d5faa9d275beb3d54f11266aac3c60e3d50b9/libs/deepagents/deepagents/middleware/patch_tool_calls.py).
- **Hermes Agent:** its memory operations informed the add, replace and remove interface used for persistent facts and experience notes. [Memory tool](https://github.com/NousResearch/hermes-agent/blob/e5dad4ac57ad11d39fe18b1ac895c0e0ae5b6494/tools/memory_tool.py).
