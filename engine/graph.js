/**
 * FlowMind AI graph engine.
 * Pure functions only: no DOM, no network, no storage. Everything the editor
 * renders and validates is derived from this module, so the canvas, the config
 * panel and (later) the backend runner read one registry.
 */

export const GROUPS = [
  { key: "triggers", label: "Triggers", accent: "#F59E0B" },
  { key: "ai", label: "AI", accent: "#7C5CFF" },
  { key: "logic", label: "Logic", accent: "#3B82F6" },
  { key: "apps", label: "Applications", accent: "#14B8A6" },
  { key: "data", label: "Data", accent: "#8B5CF6" },
  { key: "comm", label: "Communication", accent: "#EC4899" },
];

export const GROUP_ACCENT = Object.fromEntries(GROUPS.map((g) => [g.key, g.accent]));

const f = (key, label, type, extra = {}) => ({ key, label, type, ...extra });

/** Node registry. Adding a node type is one entry here. */
export const NODE_TYPES = [
  // Triggers
  { key: "trigger.manual", group: "triggers", label: "Manual Trigger", desc: "Start a run by hand", inputs: 0, outputs: 1, fields: [] },
  { key: "trigger.schedule", group: "triggers", label: "Schedule Trigger", desc: "Run on a recurring cadence", inputs: 0, outputs: 1,
    fields: [f("frequency", "Frequency", "select", { options: ["daily", "weekly", "monthly", "custom"], required: true }), f("time", "Time of day", "text", { placeholder: "09:00" }), f("timezone", "Timezone", "text", { placeholder: "Asia/Karachi" })] },
  { key: "trigger.webhook", group: "triggers", label: "Webhook Trigger", desc: "Start on an inbound HTTP request", inputs: 0, outputs: 1,
    fields: [f("path", "Path", "text", { required: true, placeholder: "/hooks/lead" }), f("method", "Method", "select", { options: ["POST", "GET"], required: true })] },
  { key: "trigger.form", group: "triggers", label: "Form Trigger", desc: "Start on a form submission", inputs: 0, outputs: 1,
    fields: [f("form_id", "Form", "text", { required: true })] },
  { key: "trigger.app_event", group: "triggers", label: "App Event Trigger", desc: "Start on a connected app event", inputs: 0, outputs: 1,
    fields: [f("provider", "Provider", "select", { options: ["gmail", "google_sheets", "github", "slack", "notion"], required: true }), f("event", "Event", "text", { required: true, placeholder: "message.received" })] },

  // AI
  { key: "ai.agent", group: "ai", label: "AI Agent", desc: "Autonomous agent with tools", inputs: 1, outputs: 1,
    fields: [f("agent", "Agent", "text", { required: true, placeholder: "Support triage" }), f("instructions", "Instructions", "textarea"), f("model", "Model", "text", { placeholder: "platform default" }), f("max_steps", "Max steps", "number", { placeholder: "10" }), f("tools", "Tools", "list", { placeholder: "crm_lookup, web_search" })] },
  { key: "ai.chat_model", group: "ai", label: "Chat Model", desc: "Prompt a chat model", inputs: 1, outputs: 1,
    fields: [f("model", "Model", "text"), f("prompt", "Prompt", "textarea", { required: true }), f("temperature", "Temperature", "number", { placeholder: "0.7" })] },
  { key: "ai.text_generation", group: "ai", label: "Text Generation", desc: "Generate text from a prompt", inputs: 1, outputs: 1,
    fields: [f("prompt", "Prompt", "textarea", { required: true }), f("max_tokens", "Max tokens", "number")] },
  { key: "ai.summarize", group: "ai", label: "Summarize", desc: "Condense an input field", inputs: 1, outputs: 1,
    fields: [f("input_field", "Input field", "text", { required: true, placeholder: "body" }), f("max_words", "Max words", "number", { placeholder: "120" })] },
  { key: "ai.sentiment", group: "ai", label: "Sentiment Analysis", desc: "Score the tone of text", inputs: 1, outputs: 1,
    fields: [f("input_field", "Input field", "text", { required: true, placeholder: "body" })] },
  { key: "ai.classify", group: "ai", label: "Classify", desc: "Assign one of your labels", inputs: 1, outputs: 1,
    fields: [f("input_field", "Input field", "text", { required: true }), f("labels", "Labels", "list", { required: true, placeholder: "billing, technical, other" })] },
  { key: "ai.extract", group: "ai", label: "Information Extraction", desc: "Pull structured fields out of text", inputs: 1, outputs: 1,
    fields: [f("input_field", "Input field", "text", { required: true }), f("schema", "Output schema", "json", { placeholder: '{ "company": "string" }' })] },
  { key: "ai.embeddings", group: "ai", label: "Embeddings", desc: "Vectorize text for retrieval", inputs: 1, outputs: 1,
    fields: [f("input_field", "Input field", "text", { required: true })] },

  // Logic
  { key: "logic.if", group: "logic", label: "IF", desc: "Two-way branch", inputs: 1, outputs: 2,
    fields: [f("expression", "Condition", "text", { required: true, placeholder: "{{ nodes.agent.output.urgency }} == 'high'" })], handles: ["true", "false"] },
  { key: "logic.switch", group: "logic", label: "Switch", desc: "Route by case value", inputs: 1, outputs: 3,
    fields: [f("expression", "Value", "text", { required: true }), f("cases", "Cases", "list", { placeholder: "high, normal" })], handles: ["case_1", "case_2", "default"] },
  { key: "logic.filter", group: "logic", label: "Filter", desc: "Keep items that match", inputs: 1, outputs: 1,
    fields: [f("expression", "Condition", "text", { required: true })] },
  { key: "logic.loop", group: "logic", label: "Loop", desc: "Iterate over a list", inputs: 1, outputs: 1,
    fields: [f("items", "Items", "text", { required: true, placeholder: "{{ nodes.fetch.output.rows }}" }), f("max_iterations", "Max iterations", "number", { placeholder: "50" })] },
  { key: "logic.merge", group: "logic", label: "Merge", desc: "Combine branches", inputs: 2, outputs: 1,
    fields: [f("mode", "Mode", "select", { options: ["append", "zip", "by_key"], required: true })] },
  { key: "logic.delay", group: "logic", label: "Delay", desc: "Wait a fixed time", inputs: 1, outputs: 1,
    fields: [f("duration", "Duration", "number", { required: true, placeholder: "30" }), f("unit", "Unit", "select", { options: ["seconds", "minutes", "hours"] })] },

  // Applications
  { key: "app.gmail", group: "apps", label: "Gmail", desc: "Read or send mail", inputs: 1, outputs: 1, credential: true,
    fields: [f("action", "Action", "select", { options: ["list", "get", "send", "label"], required: true }), f("query", "Query", "text", { placeholder: "is:unread" })] },
  { key: "app.google_sheets", group: "apps", label: "Google Sheets", desc: "Read or write rows", inputs: 1, outputs: 1, credential: true,
    fields: [f("spreadsheet_id", "Spreadsheet ID", "text", { required: true }), f("range", "Range", "text", { placeholder: "Leads!A:D" }), f("action", "Action", "select", { options: ["read", "append", "update"] })] },
  { key: "app.google_drive", group: "apps", label: "Google Drive", desc: "List, upload or fetch files", inputs: 1, outputs: 1, credential: true,
    fields: [f("action", "Action", "select", { options: ["list", "upload", "download"] }), f("folder_id", "Folder ID", "text")] },
  { key: "app.github", group: "apps", label: "GitHub", desc: "Read repos, issues and commits", inputs: 1, outputs: 1, credential: true,
    fields: [f("repo", "Repository", "text", { required: true, placeholder: "owner/repo" }), f("action", "Action", "select", { options: ["issues", "commits", "pulls"] })] },
  { key: "app.slack", group: "apps", label: "Slack", desc: "Post or read messages", inputs: 1, outputs: 1, credential: true,
    fields: [f("channel", "Channel", "text", { required: true, placeholder: "#alerts" }), f("action", "Action", "select", { options: ["post", "read"] })] },
  { key: "app.discord", group: "apps", label: "Discord", desc: "Post to a channel", inputs: 1, outputs: 1, credential: true,
    fields: [f("channel_id", "Channel ID", "text", { required: true })] },
  { key: "app.notion", group: "apps", label: "Notion", desc: "Query or create pages", inputs: 1, outputs: 1, credential: true,
    fields: [f("database_id", "Database ID", "text", { required: true }), f("action", "Action", "select", { options: ["query", "create"] })] },

  // Data
  { key: "data.http_request", group: "data", label: "HTTP Request", desc: "Call any REST endpoint", inputs: 1, outputs: 1,
    fields: [f("method", "Method", "select", { options: ["GET", "POST", "PUT", "PATCH", "DELETE"], required: true }), f("url", "URL", "text", { required: true, placeholder: "https://api.example.com/v1/items" }), f("headers", "Headers", "json"), f("body", "Body", "json")] },
  { key: "data.json_parse", group: "data", label: "JSON Parser", desc: "Parse and pick a path", inputs: 1, outputs: 1,
    fields: [f("source", "Source", "text", { required: true, placeholder: "{{ nodes.http.output.body }}" }), f("path", "Path", "text", { placeholder: "$.data.items" })] },
  { key: "data.map", group: "data", label: "Data Mapper", desc: "Map fields to a new shape", inputs: 1, outputs: 1,
    fields: [f("mappings", "Mappings", "list", { placeholder: "name=first_name, email=contact.email" })] },
  { key: "data.text", group: "data", label: "Text Processor", desc: "Split, replace or regex text", inputs: 1, outputs: 1,
    fields: [f("operation", "Operation", "select", { options: ["concat", "split", "replace", "regex"] }), f("value", "Value", "text")] },
  { key: "data.csv", group: "data", label: "CSV Processor", desc: "Parse or generate CSV", inputs: 1, outputs: 1,
    fields: [f("operation", "Operation", "select", { options: ["parse", "generate"] }), f("delimiter", "Delimiter", "text", { placeholder: "," })] },
  { key: "data.db", group: "data", label: "Database Operation", desc: "Read or write workspace records", inputs: 1, outputs: 1,
    fields: [f("table", "Entity", "text", { required: true }), f("action", "Action", "select", { options: ["select", "insert", "update", "delete"] })] },

  // Communication
  { key: "comm.email", group: "comm", label: "Send Email", desc: "Send mail with approval gate", inputs: 1, outputs: 1, credential: true, sensitive: true,
    fields: [f("to", "To", "text", { required: true }), f("subject", "Subject", "text", { required: true }), f("body", "Body", "textarea")] },
  { key: "comm.notification", group: "comm", label: "Send Notification", desc: "Notify a workspace member", inputs: 1, outputs: 1,
    fields: [f("title", "Title", "text", { required: true }), f("body", "Body", "textarea")] },
  { key: "comm.slack_message", group: "comm", label: "Slack Message", desc: "Post a formatted message", inputs: 1, outputs: 1, credential: true,
    fields: [f("channel", "Channel", "text", { required: true }), f("text", "Text", "textarea", { required: true })] },
  { key: "comm.discord_message", group: "comm", label: "Discord Message", desc: "Post to Discord", inputs: 1, outputs: 1, credential: true,
    fields: [f("channel_id", "Channel ID", "text", { required: true }), f("content", "Content", "textarea", { required: true })] },
];

export const NODE_TYPE_MAP = Object.fromEntries(NODE_TYPES.map((t) => [t.key, t]));

export function typeDef(type) {
  return NODE_TYPE_MAP[type] || null;
}

export function defaultConfig(type) {
  const def = typeDef(type);
  if (!def) return {};
  const cfg = { on_error: "stop", timeout_ms: 30000 };
  for (const field of def.fields) {
    if (field.type === "select" && field.options) cfg[field.key] = "";
    else cfg[field.key] = "";
  }
  return cfg;
}

let counter = 0;
export function newKey(type, existing = []) {
  const base = String(type).replace(/[^a-z0-9]+/gi, "_");
  let i = 1;
  let key = `${base}_${i}`;
  const taken = new Set(existing);
  while (taken.has(key)) {
    i += 1;
    key = `${base}_${i}`;
  }
  return key;
}

export function newWorkflow(name = "Untitled workflow") {
  const now = new Date().toISOString();
  return {
    id: `wf_${Date.now().toString(36)}${(counter++).toString(36)}`,
    name,
    status: "draft",
    version: 0,
    nodes: [],
    connections: [],
    published: null,
    created_at: now,
    updated_at: now,
  };
}

export function connectionId() {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------------------------------------------------------------- queries */

export function nodeByKey(graph, key) {
  return graph.nodes.find((n) => n.key === key) || null;
}

export function outbound(graph, key, handle = null) {
  return graph.connections.filter((c) => c.from === key && (handle === null || c.fromHandle === handle));
}

export function inbound(graph, key) {
  return graph.connections.filter((c) => c.to === key);
}

export function isTrigger(type) {
  const def = typeDef(type);
  return Boolean(def && def.inputs === 0);
}

/** Kahn's algorithm. Returns { levels } or { error }. */
export function topologicalLevels(graph) {
  const indeg = new Map();
  const adj = new Map();
  for (const n of graph.nodes) {
    indeg.set(n.key, 0);
    adj.set(n.key, []);
  }
  for (const c of graph.connections) {
    if (!indeg.has(c.from) || !indeg.has(c.to)) continue;
    indeg.set(c.to, indeg.get(c.to) + 1);
    adj.get(c.from).push(c.to);
  }
  let frontier = [...indeg.entries()].filter(([, d]) => d === 0).map(([k]) => k);
  const levels = [];
  let seen = 0;
  while (frontier.length) {
    levels.push([...frontier].sort());
    seen += frontier.length;
    const next = [];
    for (const key of frontier) {
      for (const target of adj.get(key) || []) {
        indeg.set(target, indeg.get(target) - 1);
        if (indeg.get(target) === 0) next.push(target);
      }
    }
    frontier = next;
  }
  if (seen !== graph.nodes.length) {
    const stuck = graph.nodes.filter((n) => !levels.flat().includes(n.key)).map((n) => n.key);
    return { error: { code: "CYCLE", nodes: stuck } };
  }
  return { levels };
}

/** Nodes reachable from every trigger. */
export function reachableKeys(graph) {
  const start = graph.nodes.filter((n) => isTrigger(n.type)).map((n) => n.key);
  const seen = new Set(start);
  const stack = [...start];
  while (stack.length) {
    const key = stack.pop();
    for (const c of outbound(graph, key)) {
      if (!seen.has(c.to)) {
        seen.add(c.to);
        stack.push(c.to);
      }
    }
  }
  return seen;
}

/* ------------------------------------------------------------- validation */

/**
 * Returns findings: [{ node_key, severity, code, message }].
 * severity: "error" blocks publish, "warning" is advisory.
 */
export function validateGraph(graph) {
  const findings = [];
  const add = (node_key, severity, code, message) => findings.push({ node_key, severity, code, message });

  if (!graph.nodes.length) {
    add(null, "error", "EMPTY", "Add at least one trigger and one action before publishing.");
    return findings;
  }

  const triggers = graph.nodes.filter((n) => isTrigger(n.type));
  if (triggers.length === 0) add(null, "error", "NO_TRIGGER", "The workflow needs exactly one trigger.");
  if (triggers.length > 1) add(null, "error", "MULTIPLE_TRIGGERS", `Found ${triggers.length} triggers. Keep one.`);

  const keys = new Set();
  for (const n of graph.nodes) {
    if (keys.has(n.key)) add(n.key, "error", "DUPLICATE_KEY", `Node key ${n.key} is used twice.`);
    keys.add(n.key);

    const def = typeDef(n.type);
    if (!def) {
      add(n.key, "error", "UNKNOWN_TYPE", `Unknown node type ${n.type}.`);
      continue;
    }
    for (const field of def.fields) {
      if (field.required && !String(n.config?.[field.key] ?? "").trim()) {
        add(n.key, "error", "MISSING_CONFIG", `${def.label}: "${field.label}" is required.`);
      }
    }
    if (def.credential && !n.config?.credential) {
      add(n.key, "warning", "NO_CREDENTIAL", `${def.label}: no credential connected.`);
    }
    if (def.inputs > 0 && inbound(graph, n.key).length === 0) {
      add(n.key, "error", "NO_INPUT", `${def.label}: nothing is connected into this node.`);
    }
    if (def.inputs === 0 && inbound(graph, n.key).length > 0) {
      add(n.key, "error", "TRIGGER_HAS_INPUT", `${def.label}: a trigger cannot have an inbound connection.`);
    }
    if (def.outputs > 0 && outbound(graph, n.key).length === 0 && graph.nodes.length > 1) {
      add(n.key, "warning", "DEAD_END", `${def.label}: output goes nowhere.`);
    }
  }

  const dangling = graph.connections.filter((c) => !keys.has(c.from) || !keys.has(c.to));
  for (const c of dangling) add(c.from, "error", "DANGLING_EDGE", `Connection ${c.id} points at a node that no longer exists.`);

  const sorted = topologicalLevels(graph);
  if (sorted.error) {
    add(null, "error", "CYCLE", `Cycle detected through: ${sorted.error.nodes.join(", ")}.`);
  }

  const reachable = reachableKeys(graph);
  for (const n of graph.nodes) {
    if (!reachable.has(n.key)) add(n.key, "error", "UNREACHABLE", `${n.label}: not reachable from the trigger.`);
  }

  // Duplicate connections into the same input port
  const seenInputs = new Map();
  for (const c of graph.connections) {
    const k = `${c.to}:${c.toHandle || "in"}`;
    if (seenInputs.has(k)) add(c.to, "warning", "MULTI_INPUT", `More than one connection enters the same input of ${c.to}.`);
    seenInputs.set(k, true);
  }

  return findings;
}

export function errorCount(findings) {
  return findings.filter((x) => x.severity === "error").length;
}

/* ------------------------------------------------------------ expressions */

const EXPR = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Resolve `{{ nodes.KEY.output.PATH }}` against an execution context. */
export function resolveExpression(expression, context = {}) {
  if (typeof expression !== "string") return expression;
  return expression.replace(EXPR, (_, raw) => {
    const path = raw.trim();
    const value = readPath(context, path);
    if (value === undefined) throw new Error(`Cannot resolve ${path}`);
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  });
}

export function readPath(obj, path) {
  const parts = path.replace(/^\$\.?/, "").split(".").filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    const m = part.match(/^(\w+)\[(\d+)\]$/);
    if (m) {
      cur = cur[m[1]];
      if (cur === null || cur === undefined) return undefined;
      cur = cur[Number(m[2])];
    } else {
      cur = cur[part];
    }
  }
  return cur;
}

export function referencedKeys(expression) {
  const out = [];
  if (typeof expression !== "string") return out;
  for (const m of expression.matchAll(EXPR)) {
    const parts = m[1].trim().split(".");
    if (parts[0] === "nodes" && parts[1]) out.push(parts[1]);
  }
  return out;
}

/* --------------------------------------------------------------- topology */

/** Compact projection used for export and for the future publish step. */
export function toGraphJSON(graph) {
  return {
    name: graph.name,
    version: graph.version,
    nodes: graph.nodes.map((n) => ({ key: n.key, type: n.type, label: n.label, config: n.config, x: n.x, y: n.y })),
    connections: graph.connections.map((c) => ({ from: c.from, fromHandle: c.fromHandle || "out", to: c.to, toHandle: c.toHandle || "in" })),
  };
}

export function fromGraphJSON(payload, meta = {}) {
  const nodes = (payload.nodes || []).map((n) => ({
    key: n.key,
    type: n.type,
    label: n.label || typeDef(n.type)?.label || n.type,
    config: { ...defaultConfig(n.type), ...(n.config || {}) },
    x: Number(n.x) || 0,
    y: Number(n.y) || 0,
  }));
  const connections = (payload.connections || []).map((c) => ({
    id: c.id || connectionId(),
    from: c.from,
    fromHandle: c.fromHandle || "out",
    to: c.to,
    toHandle: c.toHandle || "in",
  }));
  const now = new Date().toISOString();
  return {
    id: meta.id || `wf_${Date.now().toString(36)}`,
    name: payload.name || meta.name || "Imported workflow",
    status: meta.status || "draft",
    version: Number(payload.version) || 0,
    nodes,
    connections,
    created_at: meta.created_at || now,
    updated_at: now,
  };
}

export function summarize(node) {
  const def = typeDef(node.type);
  if (!def) return node.type;
  const c = node.config || {};
  switch (node.type) {
    case "trigger.schedule":
      return [c.frequency, c.time].filter(Boolean).join(" ") || "cadence not set";
    case "trigger.webhook":
      return `${c.method || "POST"} ${c.path || "path not set"}`;
    case "ai.agent": {
      const tools = String(c.tools || "").split(",").map((s) => s.trim()).filter(Boolean);
      return tools.length ? `tools: ${tools.length}` : "no tools";
    }
    case "logic.if":
    case "logic.filter":
      return c.expression ? truncate(c.expression, 34) : "condition not set";
    case "app.slack":
    case "comm.slack_message":
      return c.channel || "channel not set";
    case "app.gmail":
      return c.action ? `action: ${c.action}` : "action not set";
    case "data.http_request":
      return c.method && c.url ? `${c.method} ${hostOf(c.url)}` : "endpoint not set";
    case "comm.email":
      return c.to ? `to: ${truncate(c.to, 24)}` : "recipient not set";
    case "logic.loop":
      return c.max_iterations ? `max ${c.max_iterations} iterations` : "loop";
    default: {
      const first = def.fields.find((x) => c[x.key]);
      return first ? truncate(String(c[first.key]), 30) : "not configured";
    }
  }
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return truncate(String(url), 26);
  }
}
