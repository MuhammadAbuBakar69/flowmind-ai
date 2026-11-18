# FlowMind AI

**Build Intelligent Workflows. Automate Everything.**

A visual AI workflow automation and autonomous agent platform in the class of n8n, Zapier, Make and MachineCraft.io. Built on [Base44](https://base44.com): real entities, real backend functions, real scheduling, real execution logs. No mock dashboards, no fake connected states, no invented run history.

> **Status: audited, not built.** The [implementation audit](docs/audit.md) found no application instance in the Base44 account: 0 of 18 entities, 0 backend functions, 0 pages. Every category is graded `missing`, not `broken`. The specification, data model, engine design, contracts and test plan are complete here. The app instance is created in the Base44 builder, since new app creation is not scriptable from an agent session, then driven phase by phase against the briefs in `docs/`.

---

## The problem

Automation tools force a tradeoff. Zapier is simple but shallow and linear. n8n is powerful but assumes you can read a JSON schema and wire ports blind. Neither treats an AI agent as a first-class node with tools, memory and a knowledge base.

FlowMind AI closes that gap: a node canvas you can actually read, agents that live inside the graph, and an execution engine that records exactly what each node received and returned.

## Core functionality

| # | Capability | Status |
| --- | --- | --- |
| 1 | Visual drag-and-drop workflow builder | Phase 1 |
| 2 | AI workflow generation from a text prompt (Copilot) | Phase 6 |
| 3 | Custom AI agent creation | Phase 5 |
| 4 | Multiple AI model integrations | Phase 5, 7 |
| 5 | API and application integrations | Phase 7 |
| 6 | Conditional logic and branching | Phase 1 (nodes), Phase 4 (evaluation) |
| 7 | Webhook triggers | Phase 4, 8 |
| 8 | Daily, weekly and monthly scheduling | Phase 8 |
| 9 | Real backend workflow execution | Phase 4 |
| 10 | Live execution monitoring and logs | Phase 1 (dock), Phase 4 (live) |
| 11 | Template marketplace | Phase 1 (data), Phase 9 (browse) |
| 12 | Agent memory and knowledge base | Phase 5 |

## Architecture

```
Browser (React)
  Dashboard · Workflow Studio · Agent Studio · Copilot · Executions · Templates
        │  Base44 SDK, authenticated session
        ▼
Base44 platform
  Entities (16) ── row-level security keyed on workspace_id
  Backend functions ── graph validation, node execution, scheduling, approvals
  Scheduled workflows ── cron cadence, never a browser timer
        ▼
External providers ── Gmail, Sheets, Drive, GitHub, Slack, Discord, Notion, LLM APIs
```

Full detail: [`docs/architecture.md`](docs/architecture.md).

### Workflow graph model

A workflow is a directed graph, not a list of steps.

```json
{
  "nodes": [
    { "key": "trigger_1", "type": "trigger.schedule", "config": { "cron": "0 9 * * *", "timezone": "Asia/Karachi" } },
    { "key": "agent_1",   "type": "ai.agent",        "config": { "agent_id": "...", "max_steps": 10 } },
    { "key": "if_1",      "type": "logic.if",        "config": { "expression": "$.urgency == 'high'" } }
  ],
  "connections": [
    { "from": "trigger_1", "handle": "out", "to": "agent_1", "input": "in" },
    { "from": "agent_1",   "handle": "out", "to": "if_1",    "input": "in" }
  ]
}
```

Every line drawn in the editor becomes a `WorkflowConnection` row. Every node becomes a `WorkflowNode` row. Execution walks the same graph, so what you see is what runs.

## Node system

| Group | Nodes |
| --- | --- |
| Triggers | Manual, Schedule, Webhook, Form submission, Application event |
| AI | AI Agent, Chat model, Text generation, Summarization, Sentiment analysis, Classification, Information extraction, Embeddings |
| Logic | IF, ELSE, Switch, Filter, Loop, Merge, Delay, Wait |
| Applications | Gmail, Google Sheets, Google Drive, Google Calendar, GitHub, Slack, Discord, Notion |
| Data | JSON parser, HTTP request, Data mapper, Text processor, CSV processor, Database operation |
| Communication | Email, Notification, Slack message, Discord message |

Each node type ships an input schema, an output schema, a config form, validation rules and an error policy (stop, continue, or retry with backoff and attempt count).

## Repository layout

```
README.md                     this file
docs/audit.md                 audit result, verified platform limits, first milestone
docs/architecture.md          18 entities, execution engine, security model
docs/phase-1-brief.md         the exact Phase 1 brief given to the Base44 builder
docs/node-catalog.md          node types with config keys and output shapes
docs/contracts.md             backend function contracts and environment reference
docs/testing.md               unit, integration, end-to-end and the required execution test
docs/production-readiness.md  acceptance gates, known limitations, deployment
LICENSE                       MIT
```

The application source does not live here. Base44 owns the app runtime and its own version history; this repository holds the design record, the phase briefs and the contracts each phase is held to.

## Roadmap

Ten phases, matching the tracked issues. The production prompt's eight phases map onto these: its 1 to 3 are issues 1 to 4, its 4 to 5 are issues 5 to 7, its 6 to 8 are issues 8 to 10.

| Phase | Scope | Definition of done |
| --- | --- | --- |
| 0 | App instance exists | Present in the account with working login |
| 1 | Auth, database, dashboard, Workflow Studio shell | Real drag-and-drop canvas, graphs persist and reload, zero fabricated data |
| 2 | Workflow editor depth | Copy/paste, multi-select, minimap, undo/redo history, validation report |
| 3 | Persistence and graph validation | Versioned graphs, migration path, server-side validation rejects bad graphs |
| 4 | Execution engine | A saved workflow runs end to end on the backend with per-node logs |
| 5 | AI Agent Studio | Agents with instructions, model, tools, memory, knowledge base |
| 6 | AI workflow generation | Prompt to validated graph, user approval required before activation |
| 7 | Integrations | Real OAuth connections, connection testing, honest status |
| 8 | Scheduling | Cron execution on the backend, timezone aware, enable/disable |
| 9 | Templates, analytics, admin | Cloneable templates, usage analytics, operational views |
| 10 | Security and hardening | RLS coverage, audit log, rate limits, prompt injection guards, test pass |

## Design language

Premium dark enterprise SaaS. Near-black canvas, charcoal panels, purple and electric-blue accents, hairline borders, restrained gradients, Inter typography, 12px radii, 150ms transitions.

| Token | Value |
| --- | --- |
| background | `#0A0A0F` |
| panel | `#14141B` |
| border | `#26262F` |
| accent purple | `#7C5CFF` |
| accent blue | `#3B82F6` |
| text primary | `#EDEDF2` |
| text muted | `#8A8A99` |

## Principles

1. **Real data or an honest empty state.** Never a fabricated execution log, token count, or connection status.
2. **Backend enforcement.** Approval gates, tool permissions and workspace isolation are enforced by functions, not by hiding buttons.
3. **One dependency direction.** Canvas, config panel and execution engine all read the same graph schema.
4. **No browser timers for schedules.** Recurring work belongs to the platform scheduler.
5. **Phase by phase, verified.** Nothing is declared ready until it has been exercised with real data.
6. **Constraints stated, not hidden.** The 5 minute function ceiling and the absence of a durable queue are designed around and documented, not papered over.

## License

MIT. See [LICENSE](LICENSE).
