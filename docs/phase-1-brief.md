# FlowMind AI: Phase 1 builder brief

The exact brief handed to the Base44 builder for Phase 1. Scope is deliberately closed: schema for all phases, then the shell that makes the product legible. No execution, no integrations, no scheduling.

---

Build "FlowMind AI", a visual AI workflow automation and autonomous agent platform (n8n / Zapier / Make class). Tagline: Build Intelligent Workflows. Automate Everything.

**PHASE 1 SCOPE ONLY:** authentication, full database schema, dashboard, and the Workflow Studio with a real working canvas. No AI execution, no external integrations, no scheduling yet, but create every entity now so later phases need no migration.

## Visual identity

Premium dark enterprise SaaS. Near-black `#0A0A0F` background, charcoal `#14141B` panels, hairline `#26262F` borders, purple `#7C5CFF` and electric-blue `#3B82F6` accents, Inter type, 1px gradients only, no illustrations, no generic admin template. Set `--radius: 12px`, a consistent 8px spacing scale, smooth 150ms transitions, collapsible nav on mobile.

## Auth

Base44 built-in auth (email/password plus Google). Everything behind login. `UserProfile` auto-created on first login with a default `Workspace`.

## Entities

All 16, with JSON schemas, enums and required fields: `UserProfile`, `Workspace`, `Workflow`, `WorkflowVersion`, `WorkflowNode`, `WorkflowConnection`, `WorkflowExecution`, `NodeExecution`, `AIAgent`, `Integration`, `ScheduledWorkflow`, `ApprovalRequest`, `WorkflowTemplate`, `Notification`, `UsageRecord`, `AuditLog`. Field-level detail lives in [`architecture.md`](architecture.md#1-data-model).

Enforce `workspace_id` as the isolation key with RLS so users only read rows in workspaces they own.

## Navigation

Slim 56px icon rail on the far left: Workflows, Node library, History, Models, Settings, with the user avatar and email pinned to the bottom and a primary "+ New workflow" button. Expanding a rail item opens a 260px secondary panel. Top bar carries a breadcrumb "Workspace / Workflows / <name>", an Active toggle, Share, Save, and an overflow menu.

## Dashboard

Eight KPI cards from live queries: total workflows, active workflows, total executions, successful, failed, active AI agents, scheduled automations, AI tokens consumed.

Below: a 14-day executions area chart (success vs failure, inline SVG, or recharts only if already a project dependency), a Recent Executions table with status pills and relative timestamps, Upcoming Schedules, and an Integration Status strip showing honest "0 connected / Not connected" states.

Zero data shows a real empty state with a "Create your first workflow" CTA. Never render invented numbers.

## Workflow Studio (`/studio/:workflowId`), three columns

**Left:** node library panel, searchable, grouped Triggers, AI, Logic, Applications, Data, Communication. Minimum set: Manual Trigger, Schedule Trigger, Webhook Trigger, Form Trigger, App Event, AI Agent, Chat Model, Text Generation, Summarize, Sentiment Analysis, Classify, Extract, Embeddings, IF, Switch, Filter, Loop, Merge, Delay, Gmail, Google Sheets, Google Drive, GitHub, Slack, Discord, Notion, HTTP Request, JSON Parser, Data Mapper, Text Processor, CSV Processor, Database Operation, Email, Notification, Slack Message, Discord Message. Each row has an icon, name and one-line description.

**Center:** canvas with Editor / Executions / Test tabs across the top. Dot-grid background. Drag from the library onto the canvas to create nodes; drag to reposition; connect ports with handles on the left (in) and right (out); render edges as 2px bezier curves with a soft glow in the source node's accent color.

Node cards show an icon, label, subtitle, a live summary of key config (for example "tools: 4", "channel: #internal", "daily 09:00"), and a status ring for idle / running / success / error. Agent nodes get a "MAIN" badge and an inline "+ Add tool" row.

Controls bottom-left: undo, redo, zoom in, zoom out, fit to screen, fullscreen. Minimap bottom-right. Support select, multi-select, delete, duplicate, copy/paste, undo/redo with a real history stack, and pan on empty-space drag.

**Right:** Properties panel on node select. Node ID chip, node name, description, type-specific config form, input mapping, output mapping, a credentials block that honestly reads "No credential connected", error handling (stop / continue / retry with attempt count and backoff), and a close control. Model dropdowns list only the model options the platform actually supports, defaulting to the platform default. Do not hardcode a provider list.

**Bottom dock:** two collapsible panels side by side. Left, "AI Copilot" chat input with a disabled send button until Phase 6, plus an honest "Copilot arrives in a later phase" note. Right, "Live execution logs" listing per-node status rows with duration and a JSON output viewer; the empty state reads "No executions yet". Never fabricate log rows.

Every position, config and connection write persists to `WorkflowNode` and `WorkflowConnection` with debounced auto-save and a "Saved" indicator. Reloading a workflow restores the exact graph.

Top bar Run Workflow is disabled with a tooltip "Execution engine lands in Phase 4". Validate runs graph checks: exactly one trigger, no orphan nodes, no unreachable nodes, no cycles, every non-trigger node has an inbound edge. Show results as a list.

## Templates

Ship 12 `WorkflowTemplate` records with real node graphs: Daily Email Summary, Automated Meeting Preparation, AI Research Monitor, GitHub Activity Reporter, Social Media Content Generator, Customer Support Automation, Lead Generation, SEO Monitoring, Spreadsheet Analyzer, Document Summarizer, Daily Business Report, Personal Productivity Automation. "Use template" clones `graph_json` into a new `Workflow` owned by the user.

## Rules

Real persistent data only. Use React Flow if it is already a project dependency; otherwise build the canvas with native pointer events and SVG. Do not assume an uninstalled package exists. Validate all writes. Loading and empty states everywhere.

Report implemented functionality, schemas created, and anything stubbed.

---

## Exit criteria for Phase 1

- A new user logs in and gets a `UserProfile` and a default `Workspace` without any manual setup.
- Dashboard renders eight real counts and an honest empty state on a fresh account.
- Dragging a node onto the canvas, moving it, connecting it to another node, and reloading the page reproduces the identical graph.
- Validate returns a concrete list of problems for a deliberately broken graph and no problems for a clean one.
- No screen anywhere displays a number that a query did not produce.
