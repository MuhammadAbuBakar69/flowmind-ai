import test from "node:test";
import assert from "node:assert/strict";
import {
  validateGraph,
  errorCount,
  topologicalLevels,
  resolveExpression,
  readPath,
  fromGraphJSON,
  toGraphJSON,
  newKey,
  defaultConfig,
  summarize,
  reachableKeys,
} from "../site/engine/graph.js";

const node = (key, type, config = {}) => ({ key, type, label: key, config, x: 0, y: 0 });
const edge = (from, to, fromHandle = "out") => ({ id: `${from}-${to}`, from, fromHandle, to, toHandle: "in" });
const graph = (nodes, connections) => ({ nodes, connections });

test("empty graph is rejected", () => {
  const findings = validateGraph(graph([], []));
  assert.equal(errorCount(findings), 1);
  assert.equal(findings[0].code, "EMPTY");
});

test("trigger into a configured action passes", () => {
  const g = graph(
    [node("start", "trigger.manual"), node("notify", "comm.notification", { title: "Done" })],
    [edge("start", "notify")]
  );
  const findings = validateGraph(g);
  assert.equal(errorCount(findings), 0, JSON.stringify(findings));
});

test("two triggers are an error", () => {
  const g = graph(
    [node("a", "trigger.manual"), node("b", "trigger.webhook", { path: "/x", method: "POST" })],
    []
  );
  const findings = validateGraph(g);
  assert.ok(findings.some((f) => f.code === "MULTIPLE_TRIGGERS"));
});

test("no trigger is an error", () => {
  const g = graph([node("n", "comm.notification", { title: "x" })], []);
  const findings = validateGraph(g);
  assert.ok(findings.some((f) => f.code === "NO_TRIGGER"));
  assert.ok(findings.some((f) => f.code === "NO_INPUT"));
});

test("missing required config is reported per node", () => {
  const g = graph(
    [node("start", "trigger.manual"), node("hook", "data.http_request", { method: "GET" })],
    [edge("start", "hook")]
  );
  const findings = validateGraph(g);
  const missing = findings.filter((f) => f.code === "MISSING_CONFIG");
  assert.equal(missing.length, 1);
  assert.equal(missing[0].node_key, "hook");
  assert.match(missing[0].message, /URL/);
});

test("cycle is detected and blocks", () => {
  const g = graph(
    [
      node("start", "trigger.manual"),
      node("if", "logic.if", { expression: "1 == 1" }),
      node("notify", "comm.notification", { title: "x" }),
    ],
    [edge("start", "if"), edge("if", "notify", "true"), edge("notify", "if")]
  );
  const findings = validateGraph(g);
  assert.ok(findings.some((f) => f.code === "CYCLE"));
});

test("unreachable node is flagged", () => {
  const g = graph(
    [
      node("start", "trigger.manual"),
      node("a", "comm.notification", { title: "x" }),
      node("island", "logic.delay", { duration: "5", unit: "seconds" }),
    ],
    [edge("start", "a"), edge("island", "a")]
  );
  const findings = validateGraph(g);
  assert.ok(findings.some((f) => f.code === "UNREACHABLE" && f.node_key === "island"));
});

test("trigger cannot have an inbound edge", () => {
  const g = graph(
    [node("start", "trigger.manual"), node("a", "comm.notification", { title: "x" })],
    [edge("start", "a"), edge("a", "start")]
  );
  const findings = validateGraph(g);
  assert.ok(findings.some((f) => f.code === "TRIGGER_HAS_INPUT"));
});

test("dangling edge is reported", () => {
  const g = graph([node("start", "trigger.manual")], [edge("start", "ghost")]);
  const findings = validateGraph(g);
  assert.ok(findings.some((f) => f.code === "DANGLING_EDGE"));
});

test("unknown node type is reported", () => {
  const g = graph([node("start", "trigger.manual"), node("x", "does.not.exist")], [edge("start", "x")]);
  const findings = validateGraph(g);
  assert.ok(findings.some((f) => f.code === "UNKNOWN_TYPE"));
});

test("topological levels order a chain and split a diamond", () => {
  const g = graph(
    [
      node("start", "trigger.manual"),
      node("left", "logic.delay", { duration: "1" }),
      node("right", "logic.delay", { duration: "1" }),
      node("merge", "logic.merge", { mode: "append" }),
    ],
    [edge("start", "left"), edge("start", "right"), edge("left", "merge"), edge("right", "merge")]
  );
  const { levels } = topologicalLevels(g);
  assert.deepEqual(levels[0], ["start"]);
  assert.deepEqual(levels[1], ["left", "right"]);
  assert.deepEqual(levels[2], ["merge"]);
});

test("topological levels report a cycle instead of looping", () => {
  const g = graph(
    [node("a", "logic.delay", { duration: "1" }), node("b", "logic.delay", { duration: "1" })],
    [edge("a", "b"), edge("b", "a")]
  );
  const result = topologicalLevels(g);
  assert.ok(result.error);
  assert.equal(result.error.code, "CYCLE");
});

test("reachableKeys follows the trigger only", () => {
  const g = graph(
    [node("start", "trigger.manual"), node("a", "logic.delay", { duration: "1" }), node("lonely", "logic.delay", { duration: "1" })],
    [edge("start", "a")]
  );
  const reachable = reachableKeys(g);
  assert.ok(reachable.has("a"));
  assert.ok(!reachable.has("lonely"));
});

test("resolveExpression substitutes node output", () => {
  const out = resolveExpression("{{ nodes.fetch.output.status }}", { nodes: { fetch: { output: { status: 200 } } } });
  assert.equal(out, "200");
});

test("resolveExpression throws on an unknown path instead of returning undefined", () => {
  assert.throws(() => resolveExpression("{{ nodes.fetch.output.missing }}", { nodes: { fetch: { output: {} } } }));
});

test("readPath handles array indexes", () => {
  assert.equal(readPath({ a: { b: [10, 20] } }, "a.b[1]"), 20);
});

test("graph JSON round trip preserves nodes, configs and edges", () => {
  const g = graph(
    [node("start", "trigger.manual"), node("if", "logic.if", { expression: "x == 1", on_error: "retry" })],
    [edge("start", "if")]
  );
  const payload = toGraphJSON(g);
  const back = fromGraphJSON(payload);
  assert.equal(back.nodes.length, 2);
  assert.equal(back.connections.length, 1);
  assert.equal(back.nodes[1].config.expression, "x == 1");
  assert.equal(back.nodes[1].config.on_error, "retry");
  assert.equal(back.connections[0].from, "start");
});

test("newKey never collides", () => {
  const a = newKey("ai.agent", []);
  const b = newKey("ai.agent", [a]);
  assert.notEqual(a, b);
  assert.equal(a, "ai_agent_1");
  assert.equal(b, "ai_agent_2");
});

test("defaultConfig carries an error policy on every type", () => {
  const cfg = defaultConfig("data.http_request");
  assert.equal(cfg.on_error, "stop");
  assert.equal(cfg.timeout_ms, 30000);
  assert.equal(cfg.method, "");
});

test("summarize reports the useful bit of a config", () => {
  assert.equal(summarize(node("a", "app.slack", { channel: "#alerts" })), "#alerts");
  assert.equal(summarize(node("b", "ai.agent", { tools: "crm, search, calc" })), "tools: 3");
  assert.match(summarize(node("c", "data.http_request", { method: "GET", url: "https://api.example.com/x" })), /GET api\.example\.com/);
});
