# AgnoLab Project Resources

This document consolidates the main resources and capabilities currently available in the project, based on the existing documentation, repository structure, and implemented backend and frontend modules.

## Product overview

AgnoLab is a visual builder for Agno workflows focused on:

- building flows on a low-code canvas
- generating executable Python code
- running flows locally with output inspection
- exporting flows as runnable Python projects
- supporting integrations, queues, skills, and external channels

## Core visual editor capabilities

### Flow canvas

- Graph-based visual editor built on React Flow in [`apps/web/src/FlowCanvas.tsx`](apps/web/src/FlowCanvas.tsx).
- Drag from a port to connect (or click port to port); source/target compatibility is validated live and invalid targets are rejected.
- Drag components from the library onto the canvas; multi-selection (Shift+drag box, Ctrl/Cmd+click), copy/paste/duplicate with internal connections, layered auto-layout and fit-to-view.
- Command palette (`Ctrl/Cmd+K`) for every action, theme, export, node and tool in [`apps/web/src/CommandPalette.tsx`](apps/web/src/CommandPalette.tsx).
- Five themes (Agno Dark, Agno Light, Dracula, One Dark, Neon) driven by tokens in [`apps/web/src/themes.ts`](apps/web/src/themes.ts); the code editor follows the theme.
- Node organization by categories such as Core, Logic, Integrations, Queues, and Interfaces in [`apps/web/src/nodeCatalog.ts`](apps/web/src/nodeCatalog.ts).
- Canvas minimap, zoom, and pan in [`apps/web/src/FlowCanvas.tsx`](apps/web/src/FlowCanvas.tsx).
- Visual execution badges on nodes during runs; connections from running nodes animate.
- Undo and redo support with local graph edit history in [`apps/web/src/App.tsx`](apps/web/src/App.tsx).

### Editing and persistence

- Autosave for the current flow.
- Local draft persistence per route/flow through `localStorage` in [`apps/web/src/App.tsx`](apps/web/src/App.tsx).
- Manual saving of named flows to the backend.
- Loading previously saved flows.
- Deleting saved flows.
- Locally persisted theme switching in [`apps/web/src/App.tsx`](apps/web/src/App.tsx).

### Preview and inspection

- Python code preview before execution.
- Output view with a response-only mode that shows only the clean assistant response when available in [`apps/web/src/App.tsx`](apps/web/src/App.tsx) and [`apps/api/app/models.py`](apps/api/app/models.py).
- Improved text and markdown rendering in the frontend in [`apps/web/src/App.tsx`](apps/web/src/App.tsx).
- Monaco-based editor/viewer for snippets, generated code, payloads, and custom tools in [`apps/web/src/MonacoToolEditor.tsx`](apps/web/src/MonacoToolEditor.tsx).

## Available node types

The available node types are defined in [`apps/api/app/models.py`](apps/api/app/models.py) and detailed in the frontend catalog in [`apps/web/src/nodeCatalog.ts`](apps/web/src/nodeCatalog.ts).

### Core nodes

- `input`
- `agent`
- `team`
- `workflow`
- `output`

### Logic nodes

- `condition`
- `workflow_step`
- `workflow_router`
- `workflow_parallel`
- `workflow_loop`
- `workflow_branch`

### Integration and advanced resource nodes

- `tool`
- `skills`
- `interface`
- `database`
- `vector_db`
- `knowledge`
- `learning_machine`
- `memory_manager`
- `session_summary_manager`
- `compression_manager`
- `output_api`

### Queue and messaging nodes

- `rabbitmq_input`
- `rabbitmq_output`
- `kafka_input`
- `kafka_output`
- `redis_input`
- `redis_output`
- `nats_input`
- `nats_output`
- `sqs_input`
- `sqs_output`
- `pubsub_input`
- `pubsub_output`

## Functional capabilities by node type

### Input

- Manual text input to start flows.
- JSON metadata submission alongside the input.
- File upload and forwarding for multiple formats.
- Input support for documents, images, audio, and video in [`apps/web/src/App.tsx`](apps/web/src/App.tsx).
- Email-based input configuration.
- Webhook/form-based input configuration.
- WhatsApp-based input configuration.

### Agent

- Configuration of provider, model, instructions, and agent parameters.
- Connections to tools, skills, databases, knowledge resources, vector databases, and managers.
- Debug mode and datetime context enrichment in [`apps/web/src/nodeCatalog.ts`](apps/web/src/nodeCatalog.ts).
- Compatibility with multiple remote and local providers.
- Agno 3 options: fallback models / fallback config, context compaction, checkpoints, tool-result offloading, filesystem tools.
- Guardrails via `pre_hooks` / `post_hooks` (PromptInjection, PIIDetection, OpenAIModeration); the compiler auto-resolves their imports in [`apps/api/app/compiler.py`](apps/api/app/compiler.py).

### Team

- Coordination of multiple agents in a shared execution.
- Team coordination mode configuration.
- Final answer consolidation across participants.
- Integration with memory, knowledge, databases, and tools.

### Workflow and Workflow Step

- Sequential orchestration of ordered execution steps.
- Step ordering configuration.
- Retry control, confirmation behavior, input validation, and error handling options in [`apps/web/src/nodeCatalog.ts`](apps/web/src/nodeCatalog.ts).
- Workflow settings for event streaming, history, telemetry, and executor output storage in [`apps/web/src/nodeCatalog.ts`](apps/web/src/nodeCatalog.ts).

### Condition

- Gates the flow result on a rule evaluated at runtime (with `resultado` in scope), compiled in [`apps/api/app/compiler.py`](apps/api/app/compiler.py). The output "sees through" the condition to its real producer, and an invalid rule is reported rather than crashing the run.

### Workflow control flow (Router, Parallel, Loop, Branch)

- Step-like nodes that connect into a Workflow (or nest in each other) and compile to Agno `Router`, `Parallel`, `Loop` and `Condition` in [`apps/api/app/workflow_control.py`](apps/api/app/workflow_control.py).
- Router picks a step by a rule that returns its name; Loop repeats until an end condition (`outputs`, `last`) or `max_iterations`; Branch runs its *if* port or its *else* port.
- Rules are Python expressions, syntax-checked at compile time; a runtime error is reported and falls back safely.
- Human review per step (Agno 3 `HumanReview`): confirmation, user input, output review, timeout and on-timeout action.

### Output and API Output

- Final result display on the canvas.
- Text or structured result output.
- Result delivery to an external API through POST with configurable headers, bearer token, and timeout in [`apps/web/src/nodeCatalog.ts`](apps/web/src/nodeCatalog.ts).
- Prepared fields for payload templates, email, chat/webhook, and tabular output in [`apps/web/src/nodeCatalog.ts`](apps/web/src/nodeCatalog.ts).

## Tools and extensibility

### Custom tools

- Creation of custom Python tools using Agno's tool decorator.
- Inline editing of tool function code.
- Persistence of user-saved tools in the frontend.
- Starter tool catalog in [`apps/web/src/starterTools.ts`](apps/web/src/starterTools.ts).

### Built-in tools

- Frontend catalog of 110+ Agno built-in tools in [`apps/web/src/toolCatalog.ts`](apps/web/src/toolCatalog.ts), including reasoning (`ReasoningTools`, `KnowledgeTools`), human-in-the-loop (`UserControlFlowTools`), search (Exa, Tavily, Serper, SerpApi, Linkup, SearXNG, PubMed), messaging (Slack, Discord, Telegram, Gmail, X), developer (GitLab, Reddit), memory (Mem0), and web scraping (Apify, Browserbase, AgentQL).
- Backend endpoint for discovering functions exposed by built-in tool classes in [`apps/api/app/main.py`](apps/api/app/main.py).
- Each catalog entry carries a `prerequisite` pip hint; the executor's preflight reports missing dependencies with an actionable message.
- Runtime dependency export based on selected tools, as described in [`README.md`](README.md).

### Local skills

- Support for local Agno skills through skill directories.
- Discovery of valid skill paths in both the repository and the user skill directory in [`apps/api/app/main.py`](apps/api/app/main.py).
- Skill validation before use.
- Dedicated node for attaching skill packs to agents in [`apps/web/src/nodeCatalog.ts`](apps/web/src/nodeCatalog.ts).

## Providers and model support

### Multi-provider support

According to [`README.md`](README.md), the project supports both local and remote providers, including:

- Ollama
- OpenAI
- Anthropic
- Google
- Groq
- Mistral
- Cohere
- Cerebras
- OpenRouter
- LiteLLM
- Azure
- Bedrock
- Vertex
- IBM WatsonX
- Portkey
- LangDB
- MiniMax, Cloudflare AI Gateway, xAI Responses, Azure OpenAI Responses
- any OpenAI-compatible or Open Responses endpoint
- and other providers supported by Agno (55 in the catalog)

### Provider-related capabilities

- Provider presets in the frontend.
- Manual configuration of provider, model, API key, base URL, and extra environment values.
- Environment credential fallback when fields are left blank, as noted in [`README.md`](README.md).
- Ollama model discovery through a dedicated endpoint in [`apps/api/app/main.py`](apps/api/app/main.py).
- Configurable execution timeout for local providers.

## Backend, compilation, and execution

### FastAPI backend

The backend in [`apps/api/app/main.py`](apps/api/app/main.py) currently provides resources for:

- health checks
- serving the home page
- returning the default canvas graph
- listing and loading canvas templates
- listing available skills
- inspecting built-in tool functions
- code generation preview
- executing compiled graphs
- listing, saving, loading, and deleting flows
- running saved flows by name
- exporting projects
- listing runtime status for flows
- listing and controlling integration listeners/subscribers
- integration endpoints for form/webhook and WhatsApp flows

### Flow compilation

- Conversion of the visual graph into executable Python code, as described in [`README.md`](README.md) and [`docs/architecture.md`](docs/architecture.md).
- Validated execution ordering.
- Named Python variable generation.
- Agno object definition generation for flow components.
- Runtime target modeling with current support for `agno-python` and architectural direction for `agnogo` in [`apps/api/app/models.py`](apps/api/app/models.py) and [`docs/architecture.md`](docs/architecture.md).

### Isolated execution

- Local subprocess execution in a per-run temporary directory, in [`apps/api/app/executor.py`](apps/api/app/executor.py).
- Configurable timeout for generated code, with a hard ceiling (`AGNOLAB_MAX_EXECUTION_SECONDS`) that overrides per-flow settings to prevent runaway runs.
- POSIX resource limits (CPU, output size, optional memory) and process-group termination so a timed-out run's whole process tree is killed.
- Optional environment isolation (`AGNOLAB_ISOLATE_ENV`): the runner sees only system essentials, known provider credential vars, and the flow's own injected secrets — not the full host environment.
- Structured capture of `stdout`, `stderr`, `exit_code`, and warnings in [`apps/api/app/models.py`](apps/api/app/models.py).
- Clean output extraction for simplified frontend display.
- Runtime checks and dependency preflight validation, as noted in [`README.md`](README.md).

## Templates, saved flows, and export

### Templates

- Default canvas template.
- Listing of ready-made templates through the API in [`apps/api/app/main.py`](apps/api/app/main.py).
- Loading a specific template by identifier.

### Saved flows

- Persistent flow saving by name.
- Reloading flows for later editing or execution.
- Re-running saved flows by name.
- Host-side persistence under [`apps/api/data`](apps/api/data), as described in [`README.md`](README.md).

### Project export

- Exporting a flow as a runnable Python project.
- Generation of [`main.py`](main.py), [`requirements.txt`](requirements.txt), and [`README.md`](README.md) for the exported flow, according to [`README.md`](README.md).
- Two export targets (`serve` flag on the codegen/export request): a run-once script, or an AgentOS server app (`AgentOS(...).get_app()` served with uvicorn) that exposes the flow's agents/teams/workflows as an API, compiled in [`apps/api/app/compiler.py`](apps/api/app/compiler.py).
- Export warnings when needed in [`apps/api/app/models.py`](apps/api/app/models.py).

## Input and output integrations

### Email

- Backend email listener support in [`apps/api/app/email_listener.py`](apps/api/app/email_listener.py).
- Input node configuration for protocol, host, mailbox, filters, and polling in [`apps/web/src/nodeCatalog.ts`](apps/web/src/nodeCatalog.ts).
- Endpoint for listing email listener statuses in [`apps/api/app/main.py`](apps/api/app/main.py).

### WhatsApp

- Backend WhatsApp gateway in [`apps/api/app/whatsapp_gateway.py`](apps/api/app/whatsapp_gateway.py).
- Endpoints for session status, start, stop, and webhook event intake in [`apps/api/app/main.py`](apps/api/app/main.py).
- Input node configuration for session, secret, filters, and reply template in [`apps/web/src/nodeCatalog.ts`](apps/web/src/nodeCatalog.ts).
- Optional WhatsApp gateway in development compose, as described in [`README.md`](README.md) and [`docker-compose.dev.yml`](docker-compose.dev.yml).
- Dedicated infrastructure under [`infra/wppconnect`](infra/wppconnect).

### Form/Webhook

- Endpoint for triggering a saved flow through form/webhook input in [`apps/api/app/main.py`](apps/api/app/main.py).
- Input node configuration for secret, header, text field name, and metadata fields in [`apps/web/src/nodeCatalog.ts`](apps/web/src/nodeCatalog.ts).

### Schedules (cron)

- Input source **Schedule (cron)**: a saved flow runs on a cron expression in a chosen time zone, with presets and an enable/pause switch.
- Background scheduler in [`apps/api/app/schedule_runner.py`](apps/api/app/schedule_runner.py): runs never overlap themselves, invalid schedules are reported, missed runs are not replayed.
- Status endpoint `GET /api/integrations/schedules` (next run, last run, run count, last error), also shown in the inspector.

### Queues and messaging

- Backend subscriber management in [`apps/api/app/queue_subscriber.py`](apps/api/app/queue_subscriber.py).
- Subscriber status by flow and node in [`apps/api/app/main.py`](apps/api/app/main.py).
- API and UI actions for starting and stopping queue subscribers in [`apps/api/app/main.py`](apps/api/app/main.py) and [`apps/web/src/App.tsx`](apps/web/src/App.tsx).
- Support for RabbitMQ, Kafka, Redis, NATS, SQS, and Google Pub/Sub as both inputs and outputs.
- Output dispatch is implemented for every provider (RabbitMQ, Kafka, Redis, NATS, SQS, Pub/Sub) when a flow runs through AgnoLab, in [`apps/api/app/main.py`](apps/api/app/main.py); publish failures are surfaced as dispatch errors. The exported standalone script does not publish to queues yet.

## Advanced knowledge and memory resources

- Database node for persisted session state, history, memory, and runtime state in [`apps/web/src/nodeCatalog.ts`](apps/web/src/nodeCatalog.ts).
- Vector DB node for vector-backed knowledge storage.
- Knowledge node for agentic RAG and runtime retrieval scenarios.
- Learning Machine for user profile, memory, session context, learned knowledge, and decision logging.
- Memory Manager for controlling memory creation and optimization.
- Session Summary Manager for long conversation summarization.
- Compression Manager for compressing tool results and saving context window space.

## Operational visibility

- Flow runtime status tracking in the backend in [`apps/api/app/main.py`](apps/api/app/main.py).
- Counters for active runs, total runs, successful runs, and failed runs.
- Tracking of execution source, duration, and latest error.
- Dedicated endpoint exposure for the UI.

## Security

- Optional global API key (`AGNOLAB_API_KEY`) gating the code-generation and execution endpoints in [`apps/api/app/main.py`](apps/api/app/main.py); accepted via `X-API-Key` or `Authorization: Bearer`, compared in constant time. Health, the home page, and external per-flow-authenticated triggers (form/webhook, WhatsApp events, run-by-name) are exempt. When the key is unset the API runs open, for single-user local development, and logs a warning at startup.
- Configurable CORS origins (`AGNOLAB_CORS_ORIGINS`) instead of a wildcard; a wildcard disables credentialed CORS.
- No user secret is inlined into generated or exported code: provider API keys, provider extra env values, and email passwords are read via `os.getenv(...)` and injected into the runner environment at execution time, in [`apps/api/app/compiler.py`](apps/api/app/compiler.py).
- Executor hardening: hard timeout ceiling, POSIX resource limits, process-tree termination, and optional environment isolation (see Isolated execution).

## Testing, tooling, and CI

- Backend test suite (pytest) in [`apps/api/tests`](apps/api/tests): compiler golden/characterization tests, flow-store path-traversal safety, executor timeout/isolation behavior, API-key auth, secret routing, the condition node, guardrail imports, the built-in tool catalog, queue-output dispatch, and regression tests for fixed bugs.
- Linting and typing via Ruff and mypy, configured in [`apps/api/pyproject.toml`](apps/api/pyproject.toml).
- GitHub Actions CI in [`.github/workflows/ci.yml`](.github/workflows/ci.yml): backend lint + typecheck + tests, and frontend typecheck + build.
- Pinned Agno version (3.2.1, `agno[os]`) and reconciled dependency lists (core in `pyproject.toml`, full runtime in `requirements.txt`).
- Tests validate every compiler import, tool-catalog entry and provider class against the installed Agno, and keep the frontend and backend provider catalogs in sync.
- Frontend unit tests (Vitest) for graph transforms and the command palette.

## Architecture and technical direction

According to [`docs/architecture.md`](docs/architecture.md), the project currently follows these architectural pillars:

- visual editor as the authoring layer
- intermediate representation as the frontend/backend contract
- compiler for executable artifact generation
- isolated executor for operationally safe flow execution
- code-first orientation underneath the visual layer
- future extensibility toward multiple generation targets

## Run and deployment resources

- Separate local execution for API and Web, according to [`README.md`](README.md).
- Docker-based execution for a more production-like environment in [`docker-compose.yml`](docker-compose.yml).
- Docker development environment with hot reload in [`docker-compose.dev.yml`](docker-compose.dev.yml).
- Frontend/backend separation suitable for platforms such as Render, as described in [`README.md`](README.md).

## Executive summary of current project capabilities

In its current state, AgnoLab already provides:

- a full visual editor for Agno flows
- Python code generation and preview
- hardened local execution: API-key auth, no secrets in generated code, timeout/resource limits, and optional environment isolation
- flow persistence and rerun capabilities
- export to runnable project format
- support for agents, teams, workflows (with Router, Parallel, Loop and if/else Branch), and runtime-gated conditions
- guardrails on agents/teams via pre/post hooks
- a broad built-in tool catalog (110+), 55 model providers, custom tools, and local skills
- themes, a React Flow canvas with multi-select, copy/paste, auto-layout, and a command palette
- integrations with email, webhook/form, WhatsApp, cron schedules, and queues (inputs and outputs)
- memory, knowledge, and vector database capabilities
- support for multiple AI providers
- a backend test suite, linting/typing, and CI
- local and Docker-based operation
