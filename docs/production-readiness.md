# FlowMind AI: production readiness checklist

Nothing here is checked because a screen exists. Each item needs evidence: a test, a query result, or a recorded execution.

## Gate 1: identity and isolation

- [ ] Login works for email/password and Google
- [ ] `UserProfile` and default `Workspace` created on first login, no manual step
- [ ] `WorkspaceMember` row created with role `owner` for the creator
- [ ] RLS enabled on every workspace-owned entity, verified by a second account receiving no rows
- [ ] Direct-id request for another workspace's record returns 403 or 404
- [ ] Viewer role refused by the backend for execute, publish and mutate paths

## Gate 2: graph integrity

- [ ] Build, move, connect, reload returns a byte-identical graph
- [ ] Node keys are stable across save and reload
- [ ] Publishing creates an immutable `WorkflowVersion`
- [ ] Editing a draft does not mutate a published version
- [ ] Restoring an older version produces a working draft
- [ ] Validation blocks publish on any error, with per-node reasons
- [ ] One authoritative graph representation, with projections rebuildable from it

## Gate 3: execution

- [ ] Manual run executes on the backend, not in the browser
- [ ] One `NodeExecution` per executed node, with input and output persisted
- [ ] Skipped branch nodes recorded as `skipped`, not failed
- [ ] IF follows the real evaluated branch
- [ ] Retry policy writes one row per attempt with backoff
- [ ] Per-node timeout terminates only that node under `continue`
- [ ] Cancellation stops the run between nodes and records the cursor
- [ ] Duplicate execute requests with one idempotency key produce one execution
- [ ] Lease expiry resumes from cursor instead of restarting
- [ ] Runs exceeding the chunk budget continue without double-executing a node

## Gate 4: AI system

- [ ] Agents call a real model API with a real key
- [ ] Tool calls are checked against the agent's allowlist and the workspace's authorized connections
- [ ] Node output cannot widen permissions; injected instructions in data are ignored
- [ ] Model errors surface as node errors, not as fabricated text
- [ ] Token usage recorded in `UsageRecord`

## Gate 5: integrations

- [ ] Every connected integration passes a real `testIntegration` call
- [ ] Status reads `disconnected` until that call succeeds
- [ ] Credentials stored server-side, encrypted at rest, never returned to a client
- [ ] Revocation and rotation both work
- [ ] Provider rate limits and errors handled per integration

## Gate 6: automation infrastructure

- [ ] Scheduled runs fire with no browser open, verified across a real interval
- [ ] Timezone handling correct for a non-UTC workspace
- [ ] Enable, disable, start and end dates honoured
- [ ] Missed window backfilled once, not replayed
- [ ] Webhook signature verification rejects tampered payloads
- [ ] Replay window rejects duplicate deliveries
- [ ] Approval gate suspends a sensitive node and resumes only on approval
- [ ] Rejection terminates the branch and records it

## Gate 7: observability and honest reporting

- [ ] Every dashboard metric traced to a query; zero data shows an empty state
- [ ] No seeded execution history in production
- [ ] Structured backend logs with execution id and node key
- [ ] Error rates and durations queryable
- [ ] Audit log written for publish, run, approve, credential change, member change

## Gate 8: quality

- [ ] Unit suite green: validation, ordering, expressions, branches, retries, permissions, versioning, idempotency
- [ ] Integration suite green: auth, isolation, execution, failure, cancel, duplicate, lease recovery
- [ ] All 15 end-to-end journeys completed by hand on desktop and mobile
- [ ] Required execution test passed with recorded execution id and payloads
- [ ] Known limitations documented and linked below

## Known limitations (current, honest)

1. **No durable queue.** Concurrency safety comes from atomic claim plus a lease. Throughput is bounded by function invocations, not by a worker fleet.
2. **Five minute function ceiling.** Runs are chunked. A single node whose work exceeds the budget needs its own continuation or an external service.
3. **No background worker.** Sub-second fan-out at volume requires external infrastructure. The integration boundary is specified, not implemented.
4. **Provider OAuth requires owner action.** Some integrations cannot be completed without registering apps with each provider.
5. **No load test data.** No scalability figure is claimed.
6. **No production deployment performed.** Readiness is a checklist, not a status.

## Deployment notes

The app deploys as a Base44 app: entities, functions and the frontend are deployed from the project. Provider secrets are set as function secrets, never bundled. Publishing to a custom domain and plan changes are owner actions in the Base44 editor. Rollback is a Base44-side redeploy of the previous project state, plus restoring the database snapshot taken before a schema migration.
