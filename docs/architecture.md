# FlowMind AI: architecture

Design record for the Base44 implementation. Three layers: entities for state, backend functions for logic that must not be trusted to the browser, and the React app for everything a human touches.

## 1. Data model

Workspace is the isolation key. Every workflow-scoped row carries `workspace_id`; row-level security scopes reads to workspaces the user owns or is a member of.

| Entity | Purpose | Key fields |
| --- | --- | --- |
| `UserProfile` | Person behind the login | `user_id`, `display_name`, `avatar`, `default_workspace_id`, `role` (owner/editor/viewer), `timezone` |
| `Workspace` | Tenant boundary | `name`, `slug`, `owner_id`, `plan` |
| `Workflow` | The automation | `workspace_id`, `name`, `description`, `status` (draft/active/paused/archived), `graph_json`, `version`, `run_count`, `success_count`, `failure_count`, `last_run_at` |
| `WorkflowVersion` | Immutable snapshot per publish | `workflow_id`, `version`, `graph_json`, `change_summary`, `created_by` |
| `WorkflowNode` | One node on the canvas | `workflow_id`, `node_key`, `type`, `label`, `config_json`, `position_x`, `position_y` |
| `WorkflowConnection` | One edge | `workflow_id`, `source_node_key`, `source_handle`, `target_node_key`, `target_handle` |
| `WorkflowExecution` | One run | `workflow_id`, `workspace_id`, `status`, `trigger_type`, `started_at`, `finished_at`, `duration_ms`, `error_message`, `input_json`, `output_json`, `idempotency_key` |
| `NodeExecution` | One node inside a run | `execution_id`, `node_key`, `node_type`, `status`, `input_json`, `output_json`, `error_message`, `duration_ms`, `attempt` |
| `AIAgent` | Reusable agent definition | `workspace_id`, `name`, `description`, `instructions`, `model`, `tools_json`, `memory_enabled`, `knowledge_base_ids`, `input_schema_json`, `output_schema_json`, `max_steps` |
| `Integration` | A provider connection | `workspace_id`, `provider`, `display_name`, `auth_type`, `status` (disconnected/connected/error), `config_json`, `last_tested_at` |
| `ScheduledWorkflow` | Recurring trigger config | `workflow_id`, `frequency` (once/daily/weekly/monthly/custom), `cron`, `time_of_day`, `timezone`, `days_of_week`, `start_date`, `end_date`, `is_enabled`, `next_run_at`, `notify_on_failure` |
| `ApprovalRequest` | Human gate before a sensitive action | `execution_id`, `node_key`, `action_type`, `payload_json`, `status` (pending/approved/rejected), `requested_by`, `decided_by`, `decided_at`, `note` |
| `WorkflowTemplate` | Marketplace entry | `name`, `category`, `description`, `icon`, `graph_json`, `node_count`, `is_public`, `install_count` |
| `Notification` | User-facing signal | `user_id`, `title`, `body`, `type`, `is_read`, `link` |
| `UsageRecord` | Metering | `workspace_id`, `date`, `executions_count`, `ai_tokens`, `ai_cost` |
| `AuditLog` | Who did what | `workspace_id`, `actor_id`, `action`, `entity_type`, `entity_id`, `metadata_json`, `ip` |

`Workflow.graph_json` is the source of truth for a run. `WorkflowNode` and `WorkflowConnection` are the indexed projection the editor reads and writes per interaction, so a canvas edit never rewrites a large JSON blob. Publish compacts the projection back into `graph_json` and stamps a `WorkflowVersion`.

## 2. Execution engine

A backend function, not the client, executes workflows.

```
validate -> resolve versions -> topological order -> execute -> persist
```

**Validation.** Exactly one enabled trigger. No cycles. No unreachable nodes. Every non-trigger node has an inbound edge. Every required config key present for its node type. A graph that fails validation is rejected with per-node reasons.

**Ordering.** Kahn's algorithm over the edge set produces execution levels. Nodes in the same level with no dependency between them run in parallel, capped per workflow. Everything else is sequential in dependency order.

**Data passing.** Each node writes `output_json` keyed by `node_key`. A node reads upstream output through an explicit mapping expression (`{{ nodes.agent_1.output.summary }}`) resolved before invocation. No implicit global context, so a loop iteration cannot silently overwrite another branch.

**Branching.** `logic.if` and `logic.switch` emit a named handle (`true`, `false`, or a case key). The runtime follows only the handles that were emitted. Nodes behind a dead handle are recorded as `skipped`, never as failed.

**Failures.** Each node carries an error policy. `stop` halts the run and marks it failed. `continue` records the error and moves to the next ready node. `retry` re-invokes with exponential backoff up to `max_attempts`, writing each attempt as its own `NodeExecution` row. Timeouts are per node and abort that node only unless the policy says otherwise.

**Idempotency.** Every run is keyed by `(workflow_id, trigger_type, trigger_payload_hash, window)`. A duplicate delivery, such as a retried webhook, finds the existing execution and returns it instead of running twice.

**Cancellation.** Setting execution status to `cancelled` is checked between node invocations. In-flight node calls finish or time out, then the run stops and records where it stopped.

**Approval gates.** Nodes marked sensitive (send email, publish content, delete records, bulk message, financial action) suspend the run at that node: status becomes `waiting_approval`, an `ApprovalRequest` is created, and the engine resumes only on `approved`, or fails the branch on `rejected`. The gate is enforced in the engine, so a workflow cannot route around it.

## 3. Scheduling

`ScheduledWorkflow` rows are the plan; Base44 scheduled workflows are the executor. A dispatcher runs on a cadence, claims due rows (`next_run_at <= now` with `is_enabled` true), starts a `WorkflowExecution` per workflow, and advances `next_run_at` in the workflow's own timezone. Nothing in the browser schedules anything. Missed windows while the platform is down are backfilled once, not replayed for every missed interval.

## 4. Security

| Concern | Approach |
| --- | --- |
| Isolation | `workspace_id` on every scoped row plus row-level security |
| Roles | `owner` manages members and credentials, `editor` builds and runs, `viewer` reads |
| Credentials | Stored server-side, never returned to the client. The UI shows a connection name and status only |
| Backend-only operations | Provider calls, execution, validation and approval decisions run in backend functions |
| Input validation | Every config form and every function payload validated against the node schema before use |
| Webhooks | Per-endpoint secret, HMAC signature check, replay window, per-endpoint rate limit |
| Prompt injection | User content enters the model as data inside a delimited block. Tool calls are checked against the agent's allowed tool list and the workspace's authorized connections. Nothing in node output can change permissions |
| Audit | Every mutation that matters (publish, run, approve, credential change, member change) writes an `AuditLog` row |
| Limits | Per-workspace execution ceiling, per-run node ceiling, per-node timeout |

## 5. Failure honesty

Three rules the app never breaks:

1. A KPI with no data reads zero, with an empty state, not a plausible sample.
2. An integration reads `Not connected` until a real credential test succeeds against the provider.
3. An execution log exists only if a run produced it. No seeded history, ever.

## 6. Open decisions

- Parallel execution cap per workspace (default 3) before cost, not throughput, becomes the limit.
- Whether agent memory uses a dedicated store or entity rows with an embedding index. Depends on what Base44 exposes at Phase 5.
- Knowledge base ingestion format for Phase 5: plain text and PDF first, URLs later.
