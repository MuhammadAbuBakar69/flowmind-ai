# FlowMind AI: backend contracts and environment reference

The contract between frontend and backend. Every function authenticates from the request, resolves the caller, and checks workspace membership before touching a row.

## Conventions

- All functions are HTTP POST with JSON bodies unless noted.
- Every response is `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
- `error.code` is one of `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `RATE_LIMITED`, `UPSTREAM`, `INTERNAL`. Internal detail is logged, never returned.
- No function accepts `workspace_id` as a trust input on its own. It is checked against membership.
- No function ever returns a credential, token or secret in any field.

## Functions

### `validateWorkflow`

Input `{ workflow_id }` or `{ graph }`. Output `{ valid: boolean, findings: [{ node_key, severity, code, message }] }`.
Checks: exactly one enabled trigger, no cycles, no unreachable nodes, every non-trigger node has an inbound edge, required config present per node type, mappings resolve to declared upstream outputs.

### `publishWorkflow`

Input `{ workflow_id, change_summary }`. Runs validation first and refuses on any `error`. Compacts the node and connection projection into `graph_json`, increments `version`, writes an immutable `WorkflowVersion`, sets workflow status `active`. Output `{ version, published_at }`.

### `executeWorkflow`

Input `{ workflow_id, trigger_type, input, idempotency_key?, test_mode? }`.
Steps: authenticate, check membership role is owner or editor, load the published version, validate, atomically claim, create `WorkflowExecution`, execute to the chunk budget, persist cursor, return `{ execution_id, status }`.
`test_mode` runs the published version with nodes that reach outside the workspace stubbed out and clearly marked `simulated: true` in their output. Production runs never use it.

### `continueExecution`

Input `{ execution_id }`. Same authorization. Resumes from the persisted cursor. Idempotent: resuming a completed run returns its final state.

### `cancelExecution`

Input `{ execution_id }`. Sets the cancellation flag. Output `{ status: "cancelled" | "cancelling" }`.

### `approveAction`

Input `{ approval_request_id, decision, note }`. Owner or editor only. On approve, the suspended execution's cursor is released; on reject the branch terminates and the run records the refusal.

### `dispatchDueSchedules`

Invoked by the platform scheduler. Claims `ScheduledWorkflow` rows where `is_enabled` and `next_run_at <= now`, starts one execution per row, advances `next_run_at` in the schedule's timezone. Single backfill of missed windows.

### `handleWebhook`

Input: raw request with path secret and signature header. Verifies HMAC, checks the replay window, enforces per-endpoint rate limit, then starts an execution. Always returns `202` with no internal identifiers beyond the execution id.

### `testIntegration`

Input `{ integration_id }`. Performs one real provider call with the stored credential. Output `{ ok, latency_ms, scopes?, error? }`. Never returns the token.

### `generateWorkflowFromPrompt`

Input `{ prompt, workspace_id }`. Returns `{ proposed_graph, required_integrations, missing_credentials, explanation, validation }`. It persists nothing and activates nothing. The user must accept and publish separately.

## Node handler interface

One registry, dispatched by `type`. Handler shape:

```ts
type NodeHandler = {
  type: string;
  validate: (config: object) => Finding[];
  run: (ctx: {
    config: object;
    input: object;
    credentials: () => Promise<Secret | null>; // throws if not authorized
    limits: { timeoutMs: number };
    signal: AbortSignal;
  }) => Promise<{ output: object; branch?: string }>;
  sensitive?: boolean; // requires an approval gate
};
```

Adding a node type means adding one registry entry. The engine, validator, and config panel all read from the registry, so no engine change is required.

## Environment reference

Stored as function secrets, never in client code, never in the repository.

| Name | Used by | Purpose |
| --- | --- | --- |
| `BASE44_APP_ID` | all functions | SDK client scope |
| `WORKFLOW_EXEC_LEASE_SECONDS` | `executeWorkflow` | Claim duration, default 300 |
| `WORKFLOW_EXEC_BUDGET_MS` | `executeWorkflow` | Soft budget before chunking, default 240000 |
| `WEBHOOK_SIGNING_SECRET` | `handleWebhook` | HMAC key per endpoint, rotatable |
| `WEBHOOK_REPLAY_WINDOW_SECONDS` | `handleWebhook` | Default 300 |
| `LLM_API_KEY` | AI handlers | Provider key for model calls |
| `LLM_BASE_URL` | AI handlers | Provider base URL |
| `LLM_DEFAULT_MODEL` | AI handlers | Default model id |
| `CREDENTIAL_ENCRYPTION_KEY` | credential writes | Encrypts stored provider tokens at rest |
| `SSRF_ALLOW_PRIVATE` | HTTP node | Must remain `false` in production |

`.env.example` in the repository lists names with empty values. No real secret is ever committed.

## SSRF rules for the HTTP node

Rejected before the request leaves the function: loopback, link-local, private ranges (RFC1918), unique-local IPv6, cloud metadata addresses, non-HTTP(S) schemes, and hosts that resolve into any of those ranges. Redirects are followed at most twice and each hop is re-checked, so a public host cannot redirect into the private network.
