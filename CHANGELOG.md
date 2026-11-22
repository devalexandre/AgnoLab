# Changelog

All notable changes to AgnoLab are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### ⚠️ Breaking changes

- **Agno upgraded from 2.5.11 to 3.2.1** (a new major). The API now depends on
  `agno[os]==3.2.1`; reinstall with `pip install -r apps/api/requirements.txt`.
- Exported projects pin `agno==<version>` (`agno[os]==<version>` for AgentOS serve exports)
  instead of an unpinned `agno`, so an export can no longer pull an incompatible major.

### Changed

- **Workflow step human-in-the-loop** settings are emitted as
  `Step(human_review=HumanReview(...))`, the Agno 3.x API. Before this, Agno 3.x would have
  silently dropped them (the compiler filters kwargs the installed Agno does not accept).
- Saved flows keep working: legacy `search_session_history` / `num_history_sessions` are
  compiled to `search_past_sessions` / `num_past_sessions_to_search`, and removed fields
  (`reasoning`, `reasoning_min_steps`, `reasoning_max_steps`) produce a warning that says what
  to use instead. Built-in tools stored with an old import path are resolved to the new one.
- The Agent and Team inspectors drop the fields Agno 3.x removed and expose the
  `search_past_sessions` family on agents.

### Added

- Workflow step: **Requires Output Review**, **Review Timeout** and **On Timeout**, plus the
  `retry` reject action (Agno 3.x `HumanReview`).
- Compiler import + runtime-dependency support for `MySQLDb`, `SingleStoreDb`, `SurrealDb`,
  `GcsJsonDb`, `JsonDb`, `InMemoryDb`, the `Elasticsearch` and `OpenSearch` vector DBs, and the
  `MMRReranker` / `RecencyReranker` knowledge rerankers, when used in node expressions.
- Tests that validate every compiler import and every built-in tool catalog entry against the
  installed Agno, so a wrong module path or class name fails CI instead of a user's run.

### Added — Agno 3 features

- **Workflow control flow:** Router, Parallel, Loop and Branch (if / else) nodes that compile to
  Agno `Router`, `Parallel`, `Loop` and `Condition`, with Python-expression rules, nesting, and a
  "Workflow Control Flow" template.
- **Scheduled flows:** a Schedule (cron) input source runs a saved flow on a cron expression in a
  chosen time zone; status at `GET /api/integrations/schedules` and in the inspector.
- **Agent / Team options:** fallback models and fallback config, checkpoints, context compaction,
  tool-result offloading, filesystem tools.
- **Providers:** OpenAI-compatible endpoint, Open Responses, Azure OpenAI Responses, xAI Responses,
  MiniMax, Cloudflare AI Gateway.
- **28 built-in tools** (search, scraping, documents, messaging, CRM/commerce, memory).

### Fixed — workflows and editor

- A Function Tool used as a workflow step executor failed at runtime ("'Function' object is not
  callable"); it is now wrapped through its entrypoint.
- A node added from the library was never selected (two different random ids were generated).
- Fit-to-view could hide the top nodes under the toolbar.

### Added — UI

- **Themes:** Agno Dark, Agno Light, Dracula, One Dark and Neon, picked from the canvas
  toolbar, the home screen or the command palette. Every color is a theme token, including
  nodes, connections, minimap and the code editor; each node type has its own accent.
- **React Flow canvas:** drag from a port to connect (invalid targets are rejected live),
  drag components in from the library, box-select and Ctrl/Cmd+click multi-selection,
  copy/paste/duplicate with internal connections, layered auto-layout and fit-to-view.
- **Command palette** (`Ctrl/Cmd+K`) for every action, theme, export, node and tool.
- **Keyboard shortcuts:** `Ctrl/Cmd+C/V/D/A`, `Delete`, `Shift+1` (fit), `Shift+L` (layout), `Esc`.
- One canvas toolbar replaces the floating cards (Run is always visible); status messages
  are toasts; visible keyboard focus everywhere; reduced-motion support.
- Frontend unit tests (Vitest), run in CI.

### Changed — UI

- `App.tsx` is split into modules and one inspector component per node type (~11.5k → ~6.3k lines).

- Node drags commit once on release, so the editor no longer re-renders on every mouse move.
- A loaded flow is framed with fit-to-view instead of having its node positions rewritten.

### Fixed

- `DynamoDb` imported from the non-existent `agno.db.dynamodb` (now `agno.db.dynamo`).
- Removed `AgentKnowledge`, which does not exist in Agno.
- Built-in tools that failed with "class not found": BigQuery, Google Calendar, Google Sheets,
  Google Drive, Google Maps, Gmail (moved to `agno.tools.google.*`), Crawl4AI, Jina Reader,
  Luma Lab, ModelsLab and SearXNG (wrong class names).

## [0.2.0] — 2026-07-12

The first hardened release. AgnoLab generates and **executes** Python code, and this
release makes that surface safe to deploy: the execution endpoints now require
authentication, no user secret is written into generated code, and the runner is
sandboxed with resource limits.

### ⚠️ Breaking changes

- **The production `docker compose` now requires secrets** and refuses to start
  without them: `AGNOLAB_API_KEY`, `WHATSAPP_GATEWAY_SECRET_KEY`, `POSTGRES_PASSWORD`,
  `REDIS_PASSWORD`, `RABBITMQ_PASSWORD`. Copy `.env.example` to `.env` and fill them in.
- **Backing services are no longer published to the host.** Flow nodes must address them
  by service name (`postgres`, `redis`, `rabbitmq`, `kafka:19092`, `nats`) instead of
  `localhost`. See the deployment table in the README.

### Security

- **API authentication.** `AGNOLAB_API_KEY` gates the code-generation, execution, and
  flow-management endpoints (`X-API-Key` or `Authorization: Bearer`, constant-time
  comparison). Previously these were unauthenticated — remote code execution for anyone
  who could reach the port. External trigger endpoints keep their per-flow bearer auth.
- **No secrets in generated code.** Provider API keys, provider environment values, and
  email passwords are no longer inlined into generated/exported source. They are read via
  `os.getenv(...)` and injected into the runner's environment at execution time.
- **Executor hardening.** Hard timeout ceiling (`AGNOLAB_MAX_EXECUTION_SECONDS`), POSIX
  CPU/output/memory limits, and process-group termination so a timed-out run's whole tree
  is killed. Opt-in environment isolation (`AGNOLAB_ISOLATE_ENV`, on by default in the
  production compose) stops executed flow code from reading unrelated host secrets.
- **CORS.** Replaced the wildcard-plus-credentials misconfiguration with a configurable
  origin list (`AGNOLAB_CORS_ORIGINS`).
- **Flow storage.** Atomic writes plus a write lock: a crash mid-save can no longer
  corrupt a saved flow, and concurrent saves no longer race.
- The server now warns at startup when the API key is unset or the WhatsApp gateway is
  still using the built-in default secret.

### Added

- **AgentOS `serve()` export target.** Export a flow as a FastAPI app that serves its
  agents, teams, and workflows as an API, instead of a run-once script.
- **Guardrails.** `PromptInjectionGuardrail`, `PIIDetectionGuardrail`, and
  `OpenAIModerationGuardrail` are usable from an agent's or team's pre/post hooks; the
  compiler resolves their imports. Previously they compiled to an undefined name.
- **21 new built-in tools** (catalog now 85+), including reasoning (`ReasoningTools`,
  `KnowledgeTools`), human-in-the-loop (`UserControlFlowTools`), search (Exa, Tavily,
  Serper, SerpApi, Linkup, SearXNG, PubMed), messaging (Slack, Discord, Telegram, Gmail,
  X), GitLab, Reddit, Mem0, and web scraping (Apify, Browserbase, AgentQL).
- **Production compose with every self-hostable resource**: Postgres with pgvector,
  Redis, RabbitMQ, Kafka, NATS, and the WhatsApp gateway — with credentials, persistence
  volumes, and healthchecks.
- Test suite (96 tests), Ruff/mypy configuration, and GitHub Actions CI covering backend
  lint/typecheck/tests and frontend typecheck/build. The project previously had none.

### Fixed

- **Condition node did more harm than nothing.** It was never compiled: a flow routed
  through one silently returned the raw input instead of the agent's result. It now
  resolves the real producer behind it and gates the result on its rule at runtime.
  (Branching to different targets is still unsupported and warns.)
- **Queue outputs were silent no-ops.** Only NATS was dispatched; RabbitMQ, Kafka, Redis,
  SQS, and Pub/Sub output nodes appeared to succeed while delivering nothing. All are now
  dispatched, with failures surfaced as errors.
- **WhatsApp reported disconnected sessions as connected** (`openingSession`,
  `desconnectedMobile`).
- **Email listener reprocessed messages after a restart**: the dedup fallback key used
  Python's per-process-salted `hash()`, so the same message produced a different key.
- Migrated the deprecated FastAPI `@app.on_event` startup/shutdown hooks to `lifespan`.

### Performance

- **Code preview no longer floods the backend.** Dragging a node fired one codegen POST
  per mousemove; the preview is now debounced.
- **Monaco is bundled instead of fetched from a CDN**, so the editor works offline and
  under a strict CSP — and it is lazy-loaded, keeping the initial bundle at ~476 kB.

### Internal

- Pinned `agno` and reconciled the two dependency lists, which had drifted apart.
- Broke up the 676-line `compile_graph` into named, testable units (now 161 lines),
  guarded by byte-exact snapshot tests of the generated code.
- Extracted 12 cohesive modules out of the 12.9k-line `App.tsx` (now ~11.5k).
