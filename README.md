# AgnoLab

AgnoLab is a visual builder for [Agno](https://github.com/agno-agi/agno) agents, teams, and
workflows. Draw a flow on a low-code canvas, preview the Python it compiles to, run it in an
isolated sandbox, and export it as a runnable script or an AgentOS server app.

Built on **Agno 3.2.1**.

![AgnoLab editor](docs/screenshots/editor.png)

## Demo Video

- Watch on YouTube: https://www.youtube.com/watch?v=fQjQHiIHMsM

## Highlights

- **Visual canvas.** Built on React Flow: drag nodes in from the library, drag from a port to
  connect, multi-select, copy/paste, auto-layout, minimap, and live run badges on every node.
- **Command palette.** `Ctrl/Cmd+K` to run any action or add any node or tool by name.
- **Agents, Teams, and Workflows.** Compile to real Agno objects, including sequential
  workflows with human-in-the-loop review steps.
- **Code you can read.** Preview the generated Python before running, in an editor that
  follows the app theme.
- **Safe execution.** Isolated subprocess runner with timeouts, resource limits, optional
  environment isolation, and no secrets written into generated code.
- **110+ built-in tools** and 55 model providers, custom `@tool` functions, local skills,
  guardrails, knowledge/RAG, memory, and vector databases.
- **Integrations.** Email, webhook/form, WhatsApp, cron schedules, and six message queues
  (RabbitMQ, Kafka, Redis, NATS, SQS, Pub/Sub) as inputs and outputs.
- **Workflow control flow.** Router, Parallel, Loop, and if/else Branch nodes compile to Agno's
  own workflow primitives.
- **Export.** A run-once `main.py` or an AgentOS FastAPI server, with a pinned
  `requirements.txt`.
- **Five themes.** Agno Dark, Agno Light, Dracula, One Dark, and Neon.

## What's New

### Agno 3.2.1

AgnoLab now targets Agno 3.x, the latest major version:

- Workflow-step human-in-the-loop settings compile to Agno 3's `HumanReview` API. New step
  options: **Requires Output Review**, **Review Timeout**, **On Timeout**
  (`cancel` / `skip` / `approve`), and a `retry` reject action.
- Flows saved on Agno 2 keep working. Renamed fields are migrated automatically, and removed
  ones produce a warning that says what to use instead.
- Exported projects pin the exact Agno version (`agno[os]` for server exports), so an export
  cannot silently install an incompatible release.
- Compiler support for more backends: MySQL, SingleStore, SurrealDB, GCS JSON, JSON and
  in-memory databases; Elasticsearch and OpenSearch vector DBs; MMR and recency rerankers.
- Fixed eleven built-in tools that failed with "class not found", including the Google
  tools (BigQuery, Calendar, Sheets, Drive, Maps, Gmail), Crawl4AI, Jina Reader, and SearXNG.
  CI now checks every catalog entry against the installed Agno.

![Workflow step with human review](docs/screenshots/human-review.png)

### Workflow control flow

Four new **Logic** nodes sit in a workflow's step list like a Workflow Step, and can be nested:

| Node | Agno class | What it does |
| --- | --- | --- |
| **Router** | `Router` | Runs one of its connected steps, chosen by a rule that returns a step name. |
| **Parallel** | `Parallel` | Runs every connected step at the same time. |
| **Loop** | `Loop` | Repeats its steps until an end condition holds or the iteration limit is hit. |
| **Branch (if / else)** | `Condition` | Runs the steps on its *if* port when the rule is true, otherwise the steps on its *else* port. |

Rules are short Python expressions, for example `'Billing Step' if 'invoice' in text.lower() else 'Support Step'`
for a Router or `'APPROVED' in last` for a Loop. They are checked when the flow compiles, and a rule
that fails at runtime is reported instead of stopping the workflow. The **Workflow Control Flow**
template shows all four working together.

![Workflow control flow](docs/screenshots/control-flow.png)

### Scheduled flows

Set an Input node's source to **Schedule (cron)**, pick a cron expression (or a preset such as
"Weekdays at 09:00") and a time zone, and save. The API then runs the saved flow on that schedule,
and the inspector shows the next run, the last run, and any error.

![Schedule input](docs/screenshots/schedule.png)

### More models, tools, and agent options

- **Models:** any OpenAI-compatible endpoint, Open Responses, Azure OpenAI Responses, xAI
  Responses, MiniMax, and Cloudflare AI Gateway.
- **Agent and Team options from Agno 3:** fallback models (tried when the main model errors, is rate
  limited, or runs out of context), context compaction, checkpoints, offloading large tool results,
  and a filesystem toolkit.
- **28 new built-in tools,** including Brave, You.com, Parallel, Valyu, Trafilatura, Docling, Resend,
  Twilio, WhatsApp, Salesforce, Shopify, Zendesk, and Zep.

### Themes and a new toolbar

Pick a theme from the toolbar or the home screen. The whole UI follows it: panels, nodes,
connections, minimap, and the code editor. Each node type gets its own accent color.

![The five AgnoLab themes](docs/screenshots/themes.png)

<p align="center">
  <img src="docs/screenshots/theme-picker.png" alt="Theme picker" width="640">
</p>

The canvas now has a single toolbar: flow name, Save, Integration, an export menu,
undo/redo, zoom, fit, auto-layout, command palette, theme, and an always-visible **Run** button.

### A faster canvas

The canvas moved to [React Flow](https://reactflow.dev):

- **Drag to connect.** Drag from a node's right port to another node's left port. Valid
  targets light up and invalid ones fade, so you only make connections Agno accepts.
  Clicking one port and then the other still works.
- **Drag from the library.** Drop any component where you want it; added nodes otherwise
  appear in the middle of the visible area.
- **Work with many nodes at once.** Shift+drag to box-select, Ctrl/Cmd+click to add to the
  selection, then move, copy, paste, duplicate, or delete them together.
- **Auto-layout** arranges the flow left to right by data flow, and **Fit** frames it.

![Connecting two nodes](docs/screenshots/connect.png)

![Command palette](docs/screenshots/command-palette.png)

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+K` | Command palette |
| `Ctrl/Cmd+Z` / `Ctrl/Cmd+Y` | Undo / redo |
| `Ctrl/Cmd+C` / `Ctrl/Cmd+V` | Copy / paste nodes (with the connections between them) |
| `Ctrl/Cmd+D` | Duplicate selection |
| `Ctrl/Cmd+A` | Select all nodes |
| `Delete` / `Backspace` | Delete the selected nodes or connection |
| `Shift+1` | Fit flow to view |
| `Shift+L` | Auto-layout |
| `Esc` | Clear the selection |

## Main Features

### Visual Canvas

- Add nodes from a searchable library grouped by category (Core, Logic, Queues,
  Integrations, Interfaces, Tools, Skills, Learning), by click or drag and drop.
- Connect nodes by dragging between ports; the node model validates every connection.
- See execution badges and run state on the canvas; connections from running nodes animate.
- Double-click an Input node to open the chat runner, or an Output node to show only the
  agent's response.
- Zoom with the scroll wheel, pan by dragging the background, and navigate with the minimap.
- Keyboard focus is visible on every control.

### Templates

Start from a blank canvas or a ready-made template: base agent, team support desk,
workflow handoff, workflow control flow (router, parallel, loop, if/else), memory, RAG,
learning, skills, workflow with tools, human-in-the-loop review, and WhatsApp interface.

![Templates](docs/screenshots/home-templates.png)

### Provider Management

- Choose a provider preset or set a provider manually.
- Use separate fields for provider, model, API key, base URL, extra env values, and timeout.
- Leave credentials blank to fall back to the system environment.
- Discover local Ollama models from the UI.

### Tooling

- Add built-in tools from the Agno tool catalog.
- Write function tools in the built-in editor, or start from saved code and starter templates.
- Read Excel files with the starter workbook tool.
- Attach guardrails (prompt injection, PII detection, OpenAI moderation) through
  `pre_hooks` / `post_hooks`.
- Export runtime dependency hints automatically from the selected tools.

### Execution

- Preview code before execution.
- Run flows locally in the backend sandbox, or run saved flows by name.
- Capture stdout, stderr, exit code, and warnings.
- Use debug mode to inspect tool calls and agent logs.

![Code preview](docs/screenshots/code-preview.png)

### Export

- Generate a runnable Python project from the graph.
- Produce a pinned requirements file for the selected flow nodes.
- Keep generated output portable and readable.

## Repository Layout

- `apps/api`: FastAPI backend for graph validation, code generation, execution, exports, provider tooling, and flow storage.
- `apps/api/app/main.py`: API entrypoint and runtime routes.
- `apps/api/app/compiler.py`: graph-to-Python code generation.
- `apps/api/app/executor.py`: isolated subprocess execution and dependency preflight.
- `apps/api/app/provider_catalog.py`: provider catalog, presets, and codegen mapping.
- `apps/api/app/runtime_dependencies.py`: runtime dependency synthesis for exports.
- `apps/api/app/exporter.py`: export bundle generation.
- `apps/api/app/flow_store.py`: saved-flow persistence.
- `apps/web`: React canvas, properties panel, run console, code preview, and library panels.
- `apps/web/src/App.tsx`: main editor experience and panel logic.
- `apps/web/src/FlowCanvas.tsx`: the React Flow canvas (nodes, ports, edges, minimap, drop).
- `apps/web/src/CommandPalette.tsx`: the `Ctrl/Cmd+K` command palette.
- `apps/web/src/inspector/`: one property inspector per node type.
- `apps/web/src/nodeData.tsx`, `apps/web/src/editorConstants.ts`: node factories, expression builders, and library catalogs.
- `apps/api/app/workflow_control.py`: Router / Parallel / Loop / Branch code generation.
- `apps/api/app/schedule_runner.py`: cron schedules for saved flows.
- `apps/web/src/providerCatalog.ts`: frontend provider catalog and presets.
- `apps/web/src/agentConfig.ts`: agent properties definition.
- `apps/web/src/nodeCatalog.ts`: node templates and defaults.
- `apps/web/src/toolCatalog.ts`: built-in tool catalog.
- `apps/web/src/starterTools.ts`: starter function tools.
- `apps/web/src/api.ts`: frontend API client.
- `apps/web/src/themes.ts`: theme definitions; the single source of every color token.
- `apps/web/src/ThemePicker.tsx`: theme selector.
- `docs`: architecture notes and project screenshots.

## Requirements

- Python 3.11+
- Node.js 18+ (run the frontend unit tests with `npm test` in `apps/web`)
- Agno 3.2.1 (installed by `requirements.txt` as `agno[os]`)
- An OpenAI API key if you want to use the default OpenAI provider out of the box

## Local Setup

### API

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
cp .env.example .env
# set OPENAI_API_KEY in .env if needed
uvicorn app.main:app --reload --port 8000
```

### Web

```bash
cd apps/web
npm install --no-audit --no-fund
export VITE_API_URL=http://localhost:8000
npm run dev
```

### Docker (production)

The production compose runs AgnoLab plus every self-hostable resource its flows can
use: Postgres with pgvector, Redis, RabbitMQ, Kafka, NATS, and the WhatsApp gateway.

```bash
cp .env.example .env
# Fill in the required secrets. Generate them with: openssl rand -hex 32
docker compose up --build -d
```

Compose refuses to start until the required secrets are set — `AGNOLAB_API_KEY`,
`WHATSAPP_GATEWAY_SECRET_KEY`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, and
`RABBITMQ_PASSWORD`. See [Security](#security) for why the API key is mandatory.

The web app is served on `http://localhost:5173` and the API on `http://localhost:8000`.

**Backing services are not published to the host.** The API reaches them over the
internal network, so use these hostnames inside your flow nodes (not `localhost`):

| Resource | Use this in the node |
| --- | --- |
| Postgres / pgvector | `postgresql+psycopg://agnolab:<POSTGRES_PASSWORD>@postgres:5432/agnolab` |
| Redis | `redis://:<REDIS_PASSWORD>@redis:6379/0` |
| RabbitMQ | `amqp://agnolab:<RABBITMQ_PASSWORD>@rabbitmq:5672/` |
| Kafka | `kafka:19092` |
| NATS | `nats://nats:4222` |

The RabbitMQ management UI (`:15672`) and the WhatsApp gateway (`:21465`, needed to
scan the pairing QR code) are bound to loopback only.

AWS SQS and Google Pub/Sub are cloud services: point those nodes at the real
endpoints and supply credentials. The local emulators are development-only.

The web image receives `VITE_API_URL` at build time, so you can point it at another
backend without changing the source. To reach a local Ollama instance from inside
Docker, use `http://host.docker.internal:11434` as the provider base URL.

Saved flows, runtime variables, and flow authentication settings persist under
`apps/api/data` by default; set `AGNOLAB_DATA_DIR` to relocate it, and back it up.

### Development Mode (Docker Dev)

```bash
docker compose -f docker-compose.dev.yml up --build
```

This development compose mounts `apps/api` and `apps/web` into the containers, runs `uvicorn --reload` for the API, and starts the Vite dev server with polling enabled for reliable hot reload inside Docker. The dev web app stays on `http://localhost:5173`, the API on `http://localhost:8000`, and the WhatsApp gateway on `http://localhost:21465`.

### Render

For Render, keep the services separate:

- Publish `apps/api` as a Web Service.
- Publish `apps/web` as a Static Site.
- Set `VITE_API_URL` in the web service build environment to the public URL of the API, for example `https://agnolab-api.onrender.com`.

This keeps backend and frontend independent while still letting you deploy both parts of the same repository.

## Security

**AgnoLab generates and executes Python code.** Anyone who can reach the API can make
it run arbitrary code on the host. Treat the API as a privileged service and never
expose it to an untrusted network without an API key.

### Authentication

Set `AGNOLAB_API_KEY` to a long random secret. Clients then send it as `X-API-Key: <key>`
or `Authorization: Bearer <key>`. When the variable is unset the API runs open — fine
for single-user local development, and the server logs a warning at startup. The
production compose **requires** it.

External trigger endpoints (webhook/form, WhatsApp events, run-by-name) are exempt from
the global key: they authenticate per-flow with the bearer token configured on the flow.

### Secrets

No secret you type into the canvas is written into generated or exported code. Provider
API keys, provider environment values, and email passwords are read via `os.getenv(...)`
in the generated source and injected into the runner's environment at execution time.

### Executor guards

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGNOLAB_MAX_EXECUTION_SECONDS` | `300` | Hard ceiling on any run, overriding per-flow timeouts |
| `AGNOLAB_MAX_OUTPUT_MB` | `128` | Cap on what a run may write to disk |
| `AGNOLAB_MAX_MEMORY_MB` | off | Optional memory cap (off by default: ML/vector libraries reserve large address ranges) |
| `AGNOLAB_ISOLATE_ENV` | off (on in prod compose) | Runner sees only system essentials, known provider credential vars, and the flow's own secrets — not the full host environment |
| `AGNOLAB_FORWARD_ENV` | — | Extra host env vars to forward into the isolated runner |

Runs also get POSIX CPU/output limits and are killed as a whole process group on timeout.

### CORS

`AGNOLAB_CORS_ORIGINS` takes a comma-separated list of allowed browser origins; it
defaults to the local dev servers. A wildcard is accepted but disables credentialed CORS.

## Provider Support

AgnoLab supports multiple providers through the canvas properties panel, including local options like Ollama as well as remote providers such as OpenAI, Anthropic, Google, Groq, Mistral, Cohere, Cerebras, OpenRouter, LiteLLM, Azure, Bedrock, Vertex, IBM WatsonX, Portkey, LangDB, and others supported by Agno.

For local providers, the agent properties include a configurable execution timeout so slower models do not stop the flow too early.

## Exported Flows

When you export a flow, AgnoLab generates:

- `main.py` with the compiled Agno workflow
- `requirements.txt` with the runtime dependencies for the selected nodes, pinned to the
  Agno version the code was generated for (`agno[os]` for server exports)
- `README.md` for the exported project

There are two export targets:

- **Run-once script** (`Export .py`) — the flow executes once and prints its result.
- **AgentOS server app** (`Export Server App`) — emits an `AgentOS(...)` FastAPI app that
  serves the flow's agents, teams, and workflows as an API. Run it with `python main.py`
  and it listens on port 7777.

No secrets are included in either export; supply them via the environment.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
