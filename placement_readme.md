# Placement README: Multi-Agent Software Development Simulator

This document details the project structure, tech stack, systems concepts, resume rating, and high-impact resume bullet points for the **Multi-Agent Software Development Simulator** to be used in SDE applications for FAANG-tier companies.

---

## 1. Project Description
This project is an advanced, event-driven multi-agent simulation framework that models an entire software development company lifecycle (SDLC). Users act as the CEO, writing a project brief. The orchestrator triggers specialized AI agents (CPO, CTO, CFO, Developers, QA Reviewers) to negotiate requirement documents, budget limits, design technical architectures, write parallel frontend/backend code, and test the implementation. The frontend provides a full web-based IDE experience, mounting the agent-written code inside a WebAssembly container to build, run, and review features entirely in the browser.

---

## 2. Tech Stack
- **Backend**: FastAPI (Python), SQLAlchemy (Async Session Engine), Alembic (DB Migrations)
- **Frontend**: Next.js (TypeScript, TailwindCSS), Monaco Editor (`@monaco-editor/react`), Xterm.js (`@xterm/xterm`)
- **Event Bus & Caching**: Redis (Pub/Sub Event Broker & Global Cache)
- **Sandboxed Execution**: StackBlitz WebContainers API (in-browser WebAssembly Node runtime)
- **Version Control**: Git (GitPython wrapper for automated repository commits)

---

## 3. Technical Concepts Used
- **Deterministic State-Machine & Phase Gates**: Enforces valid project lifecycle steps (discovery, PRD review, sprint planning, development, testing) via a rule-based state machine. Transitions require explicit approvals (review gates) from the CEO or CPO.
- **Event-Driven Microservices Architecture**: Implements Redis Pub/Sub to emit and capture system event payloads (`PROJECT_STARTED`, `AGENT_OUTPUT`, `GATE_REVIEWED`, `BUDGET_ALERT`), decoupling API routes from worker processes.
- **Automated Workspace Git Management**: Dynamically initializes code workspaces, handles file writes for developer agents, and performs local Git commits via background worker threads.
- **WebAssembly-Based Client Sandboxing**: Integrates StackBlitz WebContainers to mount the agent-produced repository in the browser, compiling code and executing Node.js web-servers completely client-side without spinning up remote VMs.
- **Runaway Cost Safeguards**: Implements a real-time token/budget tracker. It fires alerts at 60% and 80% cost thresholds, and triggers a hard-stop shutdown at 95% of the allocated budget, terminating all active agent execution threads.
- **Resilient Retry Recovery loops**: Standardizes agent execution exceptions, executing an automatic exponential backoff retry loop up to 2 times for individual agent failures before escalating project statuses to failed.

---

## 4. FAANG Resume Rating
### **Rating: 9.8 / 10**
- **Pros**: Masterclass-level systems project. It addresses complex backend architectures (state machines, Redis event buses, filesystem Git automation) and utilizes cutting-edge client-side WebAssembly technology (WebContainers). Highly relevant for platform infrastructure, developer tools, and AI platform teams at Google, Meta, or Netflix.
- **Cons**: Can benefit from scaling the relational model to PostgreSQL and adding Docker execution containers for backend agent runs.

---

## 5. Resume Bullet Points (Score > 7)
Include these highly optimized, metric-oriented bullet points directly in your resume:

* **Architected a multi-agent software engineering simulator** using **FastAPI**, **Redis Pub/Sub**, and **SQLAlchemy**, running automated SDLC state machines with deterministic review gates.
* **Implemented an interactive browser-based IDE** utilizing **StackBlitz WebContainers (WASM)**, **Monaco Editor**, and **Xterm.js**, compiling and running agent-generated code sandboxed client-side.
* **Engineered budget and runtime safeguards**, including a hard-stop monitor terminating agent pipelines at 95% budget consumption and a 2x automatic retry recovery loop for agent crashes.
