# Architecture

## Product direction

AgnoLab treats the visual canvas as an authoring layer and generated code as the primary artifact.

That means the system is:

- low-code for building flows quickly
- code-first underneath for portability and debugging
- language-extensible so the same IR can target Agno Python now and AgnoGo later

## Core building blocks

### 1. Visual editor

The frontend owns:

- node rendering
- edge creation
- connection validation
- property editing
- project preview state

### 2. Intermediate representation

The IR is the contract between UI and backend.

It contains:

- `nodes`
- `edges`
- project metadata
- optional runtime settings

This decouples the editor from language-specific code generation.

### 3. Compiler

The compiler converts the graph into:

- validated execution order
- named Python variables
- Agno object definitions
- a runnable `main.py` body for the current graph

### 4. Executor

The executor runs generated code in isolation.

MVP plan:

- subprocess runner with timeouts
- temp directory per run
- structured stdout/stderr response

Future plan:

- Docker workers
- resource limits
- secret injection
- execution traces per node

## Initial node model

### Definition nodes

- `agent`
- `team`
- `tool`
- `model`

### Execution nodes

- `input`
- `condition`
- `output`

### Future nodes

- `knowledge`
- `vector_db`
- `memory`
- `workflow`
- `loop`
- `schedule`
- `human_approval`

## Type system direction

Each port should eventually declare a type:

- `text`
- `json`
- `message`
- `agent`
- `team`
- `tool`
- `knowledge`
- `bool`

That will let the canvas reject invalid links before code generation.

## AgnoGo path

The same IR should support more than one backend generator:

- `target=agno-python`
- `target=agnogo`

That keeps the visual model stable while generation becomes language-specific.

