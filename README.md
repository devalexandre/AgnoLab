# AgnoLab

AgnoLab is a low-code + code-first visual builder for Agno workflows.

The first MVP in this repository focuses on:

- a visual canvas for composing agents, teams, tools, conditions, and outputs
- an intermediate graph representation (IR) in JSON
- Python code generation targeting Agno
- preview/run/export oriented workflows instead of a locked internal runtime

## Monorepo layout

- `apps/api`: FastAPI backend for graph validation, code generation, and execution
- `apps/web`: React app for the canvas, properties panel, and generated code preview
- `docs`: architecture notes and roadmap

## Running locally

### API

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
cp .env.example .env
# fill OPENAI_API_KEY in .env
uvicorn app.main:app --reload --port 8000
```

### Web

```bash
cd apps/web
npm install --no-audit --no-fund
npm run dev
```

## MVP workflow

1. The user edits a graph in the canvas.
2. The frontend stores the graph as IR JSON.
3. The backend compiles the IR into readable Agno Python.
4. The generated code can be previewed, executed in an isolated runner, or exported later.

## Next steps

- add persistent project storage
- wire Docker-based execution workers
- expand node coverage for knowledge, memory, and triggers
- add AgnoGo generation from the same IR
