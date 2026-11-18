# FlowMind AI: testing contract

What must be proven, and how, before any phase is called done. A test is only counted when it has actually been executed against real data.

## 1. Unit level (pure functions, no network)

These run as Deno tests beside the function code, so they exercise the same modules the engine imports.

| Target | Cases that must exist |
| --- | --- |
| Graph validation | zero triggers rejected; two triggers rejected; cycle rejected; unreachable node flagged; node missing required config flagged; clean graph passes with no findings |
| Topological ordering | linear chain order correct; diamond graph produces parallel-ready levels; disconnected component detected before ordering |
| Expression resolution | `{{ nodes.a.output.x }}` resolves; missing path raises a typed error, not `undefined`; nested array index resolves |
| Branch selection | `if` truthy follows `true` handle and marks the `false` subtree skipped; `switch` default handle fires on no match |
| Retry policy | `retry` with 3 attempts produces 3 `NodeExecution` rows; backoff schedule is monotonic; `stop` produces 1 row |
| Idempotency key | identical payload in the same window hashes equal; different payload hashes differ |
| Permission checks | viewer cannot execute; editor can execute; non-member gets 403 for every entry point |
| Version immutability | publishing twice creates two versions; editing the draft leaves version 1 byte-identical |
| Data mapping | mapping with a transform applies it; mapping to a missing target field fails validation |

## 2. Integration level (real backend, real database)

| Area | Test |
| --- | --- |
| Auth | unauthenticated request to every function returns 401 |
| Workspace isolation | user B requests user A's execution id by direct id: 403 or 404, never data |
| Entity CRUD | create, read, update, delete on each entity with RLS active |
| Execution engine | run the M4 workflow; assert one `WorkflowExecution` and one `NodeExecution` per executed node with non-null `output_json` |
| Failure handling | node configured to throw: run fails, error persisted, retry attempts recorded |
| Cancellation | start a run, cancel mid-graph, assert status `cancelled` and cursor recorded |
| Duplicate prevention | fire two execute calls in parallel for one idempotency key, assert exactly one execution |
| Lease recovery | simulate an abandoned lease, assert the next invocation resumes from cursor rather than restarting |
| Webhook security | bad signature rejected; replayed delivery within window rejected; valid delivery accepted once |

## 3. End-to-end journeys (browser, real user)

Each journey is run manually at minimum, and automated once the app has a test harness.

1. Create an account.
2. Land in a workspace created automatically, with an owner membership.
3. Create a workflow.
4. Add nodes from the library by drag and drop.
5. Connect nodes, including a branch.
6. Configure a node's fields and mappings.
7. Save.
8. Reload the editor and confirm identical graph, positions, configs and ids.
9. Publish and confirm a version row.
10. Execute and confirm the run appears in history.
11. Open the run and read per-node input and output.
12. Force a node failure and confirm the error is visible and specific.
13. Retry the failed run.
14. Cancel a running execution.
15. Sign in as a viewer and confirm execute is refused by the backend, not just hidden.

## 4. The required execution test

The specification names one workflow that must genuinely work end to end:

```
Manual Trigger -> HTTP Request -> AI Analysis -> IF Condition -> (Email | Notification)
```

Acceptance, all of it evidence-based:

- Trigger accepts a real input object supplied by the caller.
- HTTP Request calls a real configured endpoint over the network and returns a real status and body. Use a benign public test endpoint, never a private address.
- AI Analysis makes a real model call with a real API key and returns model text. If no key is configured, the test is **blocked**, not passed.
- IF evaluates the actual AI output, not a placeholder.
- The correct branch executes and the other is recorded `skipped`.
- Every node's input and output is persisted.
- Execution history survives a page reload and a fresh login.
- A deliberately failing endpoint produces a failed run with a specific error, not a silent success.

Recorded as passed only with the execution id, the node payloads and the timestamp attached.

## 5. Performance checks

| Check | Threshold to record |
| --- | --- |
| Editor load with 50 nodes | interactive under 2s on a mid-range laptop |
| Graph save with 50 nodes and 60 edges | under 1s, single write per debounce window |
| Run with 20 sequential HTTP nodes | completes inside the chunking budget without duplicate execution |
| Execution history page, 1,000 rows | paginates, first page under 1s |

No scalability claim is made without a load test behind it.

## 6. Test evidence format

Every phase report includes a table like this, or the phase is not done:

| Test | Command or steps | Result | Evidence |
| --- | --- | --- | --- |
| graph validation rejects cycle | `deno test validate_test.ts` | pass | 6/6 assertions |
| M4 workflow executes | manual run, execution id `...` | pass | node payloads attached |
