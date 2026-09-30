# Pr_Quality_Checker — PR Review Assistant

> AI-powered GitHub Pull Request analysis with a multi-agent review pipeline and static testing analysis.

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Main Review Workflow](#main-review-workflow)
- [Multi-Agent Architecture](#multi-agent-architecture)
- [Testing Agent](#testing-agent)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Local Setup](#local-setup)
- [Validation](#validation)
- [Usage](#usage)
- [IBM Bob Usage](#ibm-bob-usage)
- [Demo](#demo)

---

## Overview

**Pr_Quality_Checker** is a context-aware GitHub Pull Request review dashboard. It orchestrates a set of specialised review agents that analyse a PR's diff and surface evidence-backed findings covering security, performance, test coverage, dependency health, code style, and caller impact.

---

---

### 👨‍💻 My Role & Key Contributions

**Role:** Testing Agent Lead / Full-Stack Integration

* **Testing Sub-Agent Engine (`lib/testingAgent.ts`):** Developed testing-focused static review logic to identify missing tests, coverage gaps, test runner/config discrepancies, and correlate test suites with changed source files.
* **Multi-Stack Tech Detection:** Built heuristics to identify the project tech stack (React, Node.js, Python) to ensure relevant, stack-specific review findings (preventing Python PRs from receiving inappropriate TypeScript-style assertions).
* **Interactive UI (`components/TestingPanel.tsx`):** Built the dedicated Testing Review dashboard panel, seamlessly integrating standardized `Finding[]` diagnostics and evidence views into the main UI (`app/page.tsx`).
* **Vercel Production Debugging & Resiliency:** Resolved async execution and agent-stuck issues during review workflows in the deployed Vercel runtime environment.

---

## Problem Statement

Code review is time-consuming and inconsistently applied. Reviewers frequently miss:

- Security vulnerabilities introduced by small changes (e.g. unsafe JWT validation).
- Missing test coverage for new code paths.
- Performance regressions from hot-path changes.
- Dependency conflicts and outdated packages with known CVEs.
- Downstream callers broken by interface changes.

**Pr_Quality_Checker** automates the first pass of this review by running multiple specialised agents in parallel against the PR diff and returning structured, evidence-backed findings before a human reviewer touches the code.

---

## Main Review Workflow

```
User pastes GitHub PR URL
        │
        ▼
  PRSubmitCard (input)
        │
        ▼
  startReview() — orchestrates the full pipeline
        │
        ├─ Stage 1: loading_context    (~1.2s)
        │      Retrieve repository context scoped to changed files
        │
        ├─ Stage 2: activating_agents  (~2.4s)
        │      Activate specialised sub-agents selectively
        │
        ├─ Stage 3: reviewing          (~3.8s)
        │      Agents analyse diff in parallel; findings surface progressively
        │
        ├─ Stage 4: verifying          (~5.2s – 7.2s)
        │      Cross-verify findings; Testing Agent runs static analysis
        │      at t=6800ms — inside this window, after all other agents complete
        │
        └─ Stage 5: done               (~7.2s)
               Full results available: Findings panel + Testing Agent panel
```

---

## Multi-Agent Architecture

The application models a multi-agent review pipeline. Each agent has a defined responsibility, is activated selectively, and produces typed `Finding[]` results.

| Agent | Role | Responsibility | Output |
|---|---|---|---|
| **Context Agent** | Caller & impact tracer | Identifies all callers and configuration references affected by the changed symbols | Low-severity findings listing impacted files |
| **Security Agent** | Vulnerability scanner | Scans for injection flaws, auth bypasses, secrets exposure, and insecure patterns | Critical/High findings with direct code evidence |
| **Test Agent** (display) | Coverage analyser | Checks that changed code paths have corresponding unit and integration tests | High findings for uncovered branches |
| **Performance Agent** | Bottleneck detector | Identifies N+1 queries, hot-path expensive operations, missing caching | Medium findings with caller context |
| **Dependency Agent** | Dependency auditor | Cross-references changed imports against vulnerability databases and checks transitive conflicts | Info findings with CVE references |
| **Style Agent** | Standards enforcer | Enforces linting rules, naming conventions, and code style guidelines | Zero findings if no violations |
| **Testing Agent** | Static analysis engine | Post-review structural analysis — coverage gaps, config issues, project setup checks | `TestingResult` with typed `TestCheck[]` and new `Finding[]` |

> **Simulation note:** The Context, Security, Test (display), Performance, Dependency, and Style agents currently run as a timed simulation driving realistic UI state transitions. Their findings are representative mock data designed to demonstrate the workflow. The **Testing Agent** is the only agent with real logic — it performs genuine static analysis on the PR's accumulated findings.

---

## Testing Agent

`lib/testingAgent.ts` is the core Testing Agent module. It runs **after all other agents complete** (during the `"verifying"` pipeline stage) and performs **static structural analysis** — no test files are actually executed.

### What it does

1. **Collects changed files** from the findings produced by all other agents.
2. **Detects project type** — React/Next.js, Node/TypeScript, Python, or unknown — from file extensions and PR metadata.
3. **Coverage gap analysis** — for each changed source file, infers the expected test file path and flags missing coverage.
4. **Configuration checks** — detects modifications to `package.json`, `tsconfig.json`, `.env`, and `requirements.txt` and explains the risk.
5. **Project setup checks** — React hooks rules notice for `.tsx`/`.jsx` changes; Python venv reminder for Python projects.
6. **Produces `Finding[]`** with `agentId: "test"`, appropriate `evidenceType`, severity, and remediation guidance — appended to the shared findings state.
7. **Returns `TestingResult`** — a structured plain-data contract consumed by `TestingPanel`.

### Backend-ready design

The public `run(input: TestingAgentInput): Promise<TestingResult>` function is intentionally async. Replacing the body with a real backend/API call requires changing only that function — the orchestration in `page.tsx`, all types, and the `TestingPanel` UI remain unchanged.

### Honest labelling

Every `TestCheck` carries `analysisType: "static"`. The `TestingPanel` UI displays a prominent **"Static analysis mode — no test files were executed"** notice so results are never misrepresented as live test runs.

---

## Key Features

- **Evidence-backed findings** — every finding includes a direct code snippet you can verify without leaving the dashboard.
- **Real Testing Agent** — genuine async static analysis engine, not a mock.
- **Backend-ready architecture** — `lib/testingAgent.ts` can be replaced with an API call without touching the UI or types.
- **Progressive result revelation** — findings appear as agents complete, mimicking a real streaming pipeline.
- **Severity filtering** — filter findings by Critical / High / Medium / Low / Info.
- **Inline diff viewer** — syntax-highlighted diff with add/remove/context colouring.
- **Chat assistant** — right-side panel for asking questions about agents, findings, and the review process.
- **No secrets execution** — PR code is never executed; all tooling is read-only.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14.2.5 (App Router) |
| UI | React 18, TypeScript 5 |
| Styling | Tailwind CSS 3.4 |
| Language | TypeScript (strict mode) |
| Package manager | npm |
| AI-assisted development | IBM Bob 2.0 (Agent mode) |

---

## Project Structure

```
Pr_Quality_Checker/
├── app/
│   ├── page.tsx          # Main orchestrator — pipeline state, agent schedule, Testing Agent integration
│   ├── layout.tsx        # Root layout and metadata
│   └── globals.css       # Global styles and CSS animations
├── components/
│   ├── AgentPanel.tsx    # Agent status grid
│   ├── ChatPanel.tsx     # Right-side AI chat assistant
│   ├── DiffViewer.tsx    # Syntax-highlighted diff viewer
│   ├── FindingsPanel.tsx # Collapsible findings list with severity filter
│   ├── Navbar.tsx        # Fixed top navigation bar
│   ├── PRSubmitCard.tsx  # PR URL input, issue context, diff command
│   ├── ReviewProgress.tsx# Pipeline step progress bar
│   ├── Sidebar.tsx       # Side navigation (defined, not currently rendered)
│   └── TestingPanel.tsx  # Testing Agent results UI
├── lib/
│   ├── testingAgent.ts   # Testing Agent — static analysis engine
│   └── utils.ts          # parseDiff, parseGitHubUrl, formatTime helpers
├── types/
│   └── index.ts          # All shared types: Agent, Finding, PRInfo, ReviewStatus,
│                         #   TestCheck, TestingResult, ChatMessage, etc.
├── .gitignore            # node_modules/, .env, .next/, tsconfig.tsbuildinfo
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

## Local Setup

**Prerequisites:** Node.js 18+ and npm.

```bash
# 1. Clone the repository
git clone https://github.com/shkusaid/Pr_Quality_Checker.git
cd Pr_Quality_Checker

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Validation

```bash
# TypeScript type check (zero errors expected)
npx tsc --noEmit

# Production build (compiled successfully expected)
npm run build
```

Both commands pass cleanly with zero errors or warnings.

---

## Usage

1. Open the app at `http://localhost:3000`.
2. Paste a GitHub PR URL into the **Pull Request URL** field (e.g. `https://github.com/owner/repo/pull/42`).
3. Optionally describe the issue or context in the **Issue / Context** field.
4. Optionally run a git diff command using the **Git Diff Command** card.
5. Click **Start Review**.
6. Watch agents activate and findings appear progressively.
7. After the pipeline completes, the **Testing Agent** results panel appears below the findings, showing static analysis checks, coverage gaps, and configuration issues.
8. Use the right-side **Chat Assistant** to ask questions about any agent, finding, or the review process.

---

## IBM Bob Usage

This project was built with **IBM Bob 2.0** (Agent mode) as the primary development assistant throughout the hackathon.

IBM Bob was used for:

- Inspecting and understanding the existing codebase architecture before making changes.
- Designing the Testing Agent contract (`TestingAgentInput` → `TestingResult`) and the backend-ready `run()` interface.
- Implementing `lib/testingAgent.ts`, `components/TestingPanel.tsx`, type additions in `types/index.ts`, and orchestration integration in `app/page.tsx`.
- TypeScript type-check validation (`npx tsc --noEmit`) and production build verification (`npm run build`).
- Repository hygiene — identifying and removing tracked `.next/` build artifacts, updating `.gitignore`.
- Final hackathon readiness audit — read-only analysis of the entire codebase against submission requirements.

Bob operated in **Agent mode** across multi-turn task sessions, maintaining context across file inspection, code generation, validation, and cleanup within a single workflow.

> Session evidence: `Screenshot 2026-09-25 210445.png` is included in the repository root.

---

## Demo

> 🚧 **Deployment pending** — a live demo URL will be added here once the application is deployed to Vercel or an equivalent hosting platform.
>
> To run locally, follow the [Local Setup](#local-setup) instructions above.

---

*Built for IBM TechXchange Hackathon 2026 using IBM Bob 2.0.*
