# FlowMind AI: node catalog

The contract each node type must satisfy. `key` is the `WorkflowNode.type` value. Config keys are what the Properties panel renders. Output shape is what lands in `NodeExecution.output_json`.

Status legend: **spec** means designed and documented, **wired** will be applied as phases land. No node is marked working until a real run produces its output row.

## Triggers

| key | Config | Output |
| --- | --- | --- |
| `trigger.manual` | none | `{ "started_by": string, "timestamp": iso }` |
| `trigger.schedule` | `cron`, `timezone`, `start_date`, `end_date` | `{ "scheduled_for": iso, "triggered_at": iso }` |
| `trigger.webhook` | `path`, `method`, `secret_name` | `{ "body": object, "headers": object, "query": object }` |
| `trigger.form` | `form_id`, `field_map` | `{ "submission_id": string, "fields": object }` |
| `trigger.app_event` | `integration_id`, `event`, `filters` | `{ "event": string, "payload": object }` |

## AI

| key | Config | Output |
| --- | --- | --- |
| `ai.agent` | `agent_id`, `max_steps`, `tools_json`, `memory_enabled` | `{ "answer": string, "steps": array, "tools_used": string[] }` |
| `ai.chat_model` | `model`, `temperature`, `max_tokens`, `system_prompt` | `{ "text": string }` |
| `ai.text_generation` | `model`, `prompt`, `max_tokens` | `{ "text": string }` |
| `ai.summarize` | `model`, `input_field`, `max_words` | `{ "summary": string, "word_count": number }` |
| `ai.sentiment` | `model`, `input_field` | `{ "sentiment": "positive"\|"neutral"\|"negative", "score": number }` |
| `ai.classify` | `model`, `input_field`, `labels[]` | `{ "label": string, "confidence": number }` |
| `ai.extract` | `model`, `input_field`, `schema_json` | `{ "data": object }` |
| `ai.embeddings` | `model`, `input_field` | `{ "vector": number[], "dimensions": number }` |

## Logic

| key | Config | Output |
| --- | --- | --- |
| `logic.if` | `expression`, handles `true` / `false` | `{ "result": boolean, "branch": "true"\|"false" }` |
| `logic.switch` | `expression`, `cases[]`, `default_handle` | `{ "matched": string }` |
| `logic.filter` | `expression` | `{ "items": array, "kept": number }` |
| `logic.loop` | `items_expression`, `max_iterations`, `batch_size` | `{ "iterations": number, "results": array }` |
| `logic.merge` | `mode`: append / zip / by_key, `key_field` | `{ "items": array }` |
| `logic.delay` | `duration`, `unit` | `{ "waited_ms": number }` |
| `logic.wait` | `condition_expression`, `timeout`, `poll_interval` | `{ "satisfied": boolean, "waited_ms": number }` |

## Applications

| key | Config | Output |
| --- | --- | --- |
| `app.gmail` | `integration_id`, `action` (list/get/send/label), `query`, fields | action dependent |
| `app.google_sheets` | `integration_id`, `spreadsheet_id`, `range`, `action` | `{ "rows": array }` |
| `app.google_drive` | `integration_id`, `action` (list/upload/download) | `{ "files": array }` |
| `app.github` | `integration_id`, `repo`, `action` | `{ "result": object }` |
| `app.slack` | `integration_id`, `channel`, `action` (post/read) | `{ "ts": string }` |
| `app.discord` | `integration_id`, `channel_id`, `action` | `{ "message_id": string }` |
| `app.notion` | `integration_id`, `database_id`, `action`, `properties` | `{ "page_id": string }` |

## Data

| key | Config | Output |
| --- | --- | --- |
| `data.http_request` | `method`, `url`, `headers`, `body`, `auth_integration_id` | `{ "status": number, "body": any }` |
| `data.json_parse` | `source_expression`, `json_path` | `{ "value": any }` |
| `data.map` | `mappings[]` (`from`, `to`, `transform`) | `{ "mapped": object }` |
| `data.text` | `operation` (concat/split/replace/regex), params | `{ "result": string }` |
| `data.csv` | `operation` (parse/generate), `delimiter` | `{ "rows": array }` |
| `data.db` | `workspace_table`, `action` (select/insert/update/delete), `where`, `values` | `{ "affected": number, "rows": array }` |

## Communication

| key | Config | Output |
| --- | --- | --- |
| `comm.email` | `integration_id`, `to`, `subject`, `body`, `requires_approval` | `{ "message_id": string }` |
| `comm.notification` | `user_id`, `title`, `body`, `link` | `{ "notification_id": string }` |
| `comm.slack_message` | `integration_id`, `channel`, `text`, `blocks` | `{ "ts": string }` |
| `comm.discord_message` | `integration_id`, `channel_id`, `content` | `{ "message_id": string }` |

## Error policy, every node

`on_error`: `stop` (default) | `continue` | `retry`. With `retry`: `max_attempts` (1 to 5), `backoff`: fixed | exponential, `timeout_ms` (default 30000). Each attempt writes its own `NodeExecution` row with `attempt` set.

## Sensitive actions

Nodes that reach outside the workspace set `requires_approval`. While true, the execution suspends as `waiting_approval`, an `ApprovalRequest` is created, and the engine resumes only on approval. This flag is enforced by the execution function, not by the UI.
