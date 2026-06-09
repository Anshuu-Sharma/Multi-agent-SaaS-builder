# Multi-Agent Software Dev Simulator - Pending Implementations & Technical Debt

This document outlines the gaps between the project's codebase and the features claimed on the developer's resume. Any AI agent reading this document should use it as a blueprint to fully complete the project's implementation.

## 1. Docker-in-Docker CI/CD Sandbox
**Status:** ❌ Wrongly Implemented
**Current State:** 
- The Dev and QA agents just output raw code text strings which are saved to the local host filesystem via `git_service.py`. There is no isolated execution environment or CI/CD test runner.

**Required Implementation for Future AI:**
1. Integrate the `docker` Python SDK (update `backend/pyproject.toml`).
2. When the backend or frontend developer agents finish writing code, spin up a transient Docker-in-Docker container (e.g., using `python:3.12-slim` for backend tests) using a new `backend/app/services/docker_service.py`.
3. Mount the `git_service` workspace volume to the container and run `pytest` (or `npm test`). Capture the stdout/stderr and feed it back to the QA agent in `backend/app/agents/qa_reviewer.py`.

## 2. LangGraph Routing & AST Analyzer
**Status:** ❌ Wrongly Implemented
**Current State:** 
- The project orchestrates agents using a custom Python `StateMachine` inside `engine.py` coupled with Redis PubSub. There is no LangGraph implementation.
- There is no AST analyzer; the CTO code review agent simply reads the code string.

**Required Implementation for Future AI:**
1. **LangGraph:** Refactor `backend/app/orchestrator/agent_manager.py` (and potentially `backend/app/orchestrator/engine.py`) to compile a `StateGraph` (from the `langgraph` library) where nodes are the CTO, Dev, and QA agents, and edges are the transitions. Add `langgraph` to `backend/pyproject.toml`.
2. **AST Static Analyzer:** Create a `backend/app/services/ast_analyzer.py` tool. Before the QA agent runs tests, parse the python AST of the workspace files to detect faulty imports, endless loops, or blocked `os`/`sys` calls, returning structural errors to the LangGraph router immediately.

## 3. Self-Healing Git-Revert Loop
**Status:** ❌ Missing
**Current State:** 
- `git_service.py` allows committing and diffing, but if QA fails, the system just asks the LLM to fix it. It does not perform a `git revert`.

**Required Implementation for Future AI:**
1. Update `backend/app/services/git_service.py` to include a `revert_last_commit` method.
2. Update `backend/app/orchestrator/engine.py` (or `qa_reviewer.py`): If the QA agent fails the code >2 times consecutively, trigger `GitService.revert_last_commit(workspace_path)` to restore the repo to the last known good state before asking the developer agent to try a completely different approach.

## 4. OpenTelemetry & ELK Stack Tracing
**Status:** ❌ Missing
**Current State:** 
- Logging is basic stdout using `logging.getLogger(__name__)`. 

**Required Implementation for Future AI:**
1. Install `opentelemetry-api`, `opentelemetry-sdk`, and exporter via `backend/pyproject.toml`.
2. Add a trace decorator to the `BaseAgent.run()` wrapper in `backend/app/agents/base.py` and the `engine.py` transition functions.
3. Configure the OpenTelemetry exporter to send OTLP spans to a local Logstash/Elasticsearch instance (stub the OTLP exporter setup in `backend/app/main.py`).
