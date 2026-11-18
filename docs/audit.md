# FlowMind AI: implementation audit

Audit date: 2026-11-18. Auditor: agent session against the live Base44 account `MuhammadAbuBakar69`.

The specification says to inspect the existing application before changing anything. This is that inspection, and its first finding is decisive.

## 1. Finding: there is no application instance

| Check | Method | Result |
| --- | --- | --- |
| Does a FlowMind AI app exist in the account? | Full app enumeration, 16 apps returned | **No.** No app named FlowMind, Flowmind, Kinetic or MachineCraft. |
| Is there any app containing the required entities? | App list with schemas | No app exposes `Workflow`, `WorkflowExecution`, `AIAgent` or any of the other 16 required entities. |
| Is there anything to preserve? | Same | Nothing. No pages, no functions, no data, no deployed code. |

Two apps named `untitled` exist but are empty scaffolds from earlier sessions and are unrelated to this product. They have not been repurposed.

**Consequence:** the audit cannot report "existing / incomplete / broken" for any category, because no implementation exists to grade. Every row below is therefore `missing`, and the first engineering action is creation, not repair.

## 2. Category assessment

| Category | Assessment | Severity |
| --- | --- | --- |
| Frontend | Missing. No app instance, no pages, no components. | Critical |
| Backend | Missing. Zero deployed functions. | Critical |
| Database | Missing. 0 of 18 required entities exist. | Critical |
| Workflow engine | Missing. No graph contract implemented anywhere except this repo's specification. | Critical |
| AI system | Missing. No model calls, no agent runtime, no tool allowlists. | Critical |
| Integrations | Missing. No OAuth connections, no credential store, no connection testing. | Critical |
| Security | Missing. No RLS configured, no roles enforced, no audit log writes. | Critical |
| Testing | Missing. No test harness exists for this codebase. The specification in `testing.md` is the contract to build against. | High |
| Deployment | Platform capability verified (section 3). No deployment performed. | High |

Every finding is Critical or High for the same reason: there is no code. That is not a judgment on quality, it is a statement of state.

## 3. Verified platform runtime capability

Claims about runtime behaviour are grounded in the Base44 documentation read during this audit, not assumed.

| Capability | Verified detail | Design consequence |
| --- | --- | --- |
| Backend functions | Deno serverless, TypeScript, `createClientFromRequest`, request-scoped auth via `base44.auth.me()` | All authorization decisions live in functions. The browser never holds a credential. |
| Function execution ceiling | **5 minutes maximum execution time**, enforced for direct calls, automations and workflow steps alike. Requests over the limit are terminated. | A workflow run may not exceed 5 minutes inside one function call. This is the single most important constraint on the engine design. |
| Background work | Functions can continue work after responding | Enables continuation: respond immediately, keep executing, persist progress. |
| Scheduling | Scheduled workflows invoke a function as a step; recurring cadence is platform-owned | Satisfies "never a browser timer" without external infrastructure for Phase 6. |
| Function deploy cap | 50 functions per deploying request | Ceiling on node-handler granularity. Rules out one function per node type at scale; handlers must be dispatched from a registry. |
| Function chaining | Documented chain limit applies to function-calls-function | The engine must not implement node execution as nested function calls. |

### What Base44 does not provide, and what that forces

There is no durable distributed queue, no worker pool with at-least-once delivery, and no execution context that survives a 5 minute ceiling. The specification explicitly forbids pretending otherwise, so the engine is designed around the constraint:

**Execution model: lease-based chunked execution.**

1. `POST /executeWorkflow` authenticates, authorizes, validates, creates a `WorkflowExecution` in `queued`, and claims it with an atomic conditional update (`status = queued` -> `running`, `lease_owner`, `lease_expires_at`). This is the duplicate-run guard: the claim either wins or finds an existing owner.
2. The function walks the graph in dependency order and persists a `NodeExecution` row per node as it completes. It tracks elapsed time against a soft budget of 4 minutes.
3. On budget exhaustion, before the ceiling: persist the cursor (next ready set), set `status = waiting`, schedule continuation, respond `202` with the execution id.
4. Continuation resumes from the persisted cursor, not from the start. Nodes already `completed` are skipped by reading `NodeExecution` rows.
5. A run that dies without completing is recovered by lease expiry: the next invocation sees `lease_expires_at` in the past and resumes from the cursor. That is the failure-recovery path, and it is why the cursor is persisted rather than held in memory.
6. `cancel` sets a flag the runner checks between nodes. In-flight node calls finish or hit their own timeout, then the run stops with status `cancelled` and a recorded cursor.

This is honest about the platform: correctness comes from persisted state plus atomic claims, not from a queue that does not exist. If a customer needs sub-second fan-out at high volume, that is an external worker requirement, documented in `production-readiness.md` rather than faked.

## 4. Entity gap

The specification for this audit phase lists **18** entities. The repository's original design had 16. Two are genuinely missing and are added to the architecture:

- `WorkspaceMember`: role per member per workspace. The pre-audit design carried `role` on `UserProfile`, which cannot express one user having different roles in different workspaces. This was a real modelling defect, not a missing table.
- `IntegrationCredential`: separate from `Integration` so that a credential record can be revoked, rotated and never returned to a client, while the integration row stays as stable UI state.

## 5. First engineering milestone

The specification defines the milestone as: a user can build a workflow, save it, publish it, execute it on the backend, and inspect real per-node output and logs.

Decomposed into the smallest honest sequence:

| Step | Deliverable | Exit test |
| --- | --- | --- |
| M0 | App instance exists in the builder | App appears in the account with a working login |
| M1 | Schema for all 18 entities with RLS | A second user cannot read the first user's workspace rows |
| M2 | Persistent editor | Build, move, connect, reload: identical graph |
| M3 | Publish path | Publishing creates a `WorkflowVersion`; editing the draft does not mutate it |
| M4 | Engine, three node types only: manual trigger, HTTP request, IF | Run produces real `NodeExecution` rows with real payloads |
| M5 | Logs UI | The run's per-node input and output are readable in the app after a reload |
| M6 | Failure path | A node that throws records the error, obeys the retry policy, and marks the run failed |
| M7 | Cancellation and idempotency | Two concurrent run requests produce one execution, not two |

M4 deliberately ships three node types, not forty. A registry with three working handlers is a real engine. Forty registered types with fake handlers is the prototype this specification forbids.

## 6. Blockers

| Blocker | Why it blocks | Smallest resolution |
| --- | --- | --- |
| **No app instance exists** | Every phase needs a Base44 app: entities, functions, auth, hosting. New app creation is a builder action and is not available to this agent session. | Create the app in the Base44 builder, then hand it back. From that point the session can drive the builder directly, one metered build per request. |
| No OAuth provider apps registered | Phase 5 needs real Google, Slack, GitHub, Notion and Discord credentials. Platform connectors cover some providers, but provider-side app registration is an owner action. | Deferred to Phase 5. Phase 1 to 4 require no provider credentials. |
| No external worker | Only needed if concurrent-run throughput or runs longer than 5 minutes become a requirement. | Not needed for the milestone. Documented as an integration boundary. |

## 7. What was done in this audit

- Enumerated every app in the account and confirmed no instance exists.
- Read the Base44 backend function documentation and verified the runtime limits the engine design depends on.
- Corrected the data model from 16 to 18 entities and recorded why.
- Designed the execution engine around the verified 5 minute ceiling and the absence of a durable queue.
- Wrote the testing contract, the production readiness checklist and the contract/env reference.
- Committed all of it to the specification repository so the next phase is auditable.

No application code was written, and no feature is claimed as working.
