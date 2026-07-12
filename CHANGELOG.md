# Changelog

All notable changes to AgnoLab are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

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
