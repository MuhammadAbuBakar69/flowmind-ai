/**
 * Local persistence. The deployed editor is static, so the browser is the only
 * store: everything lives under one localStorage key and is exported as JSON.
 * When the Base44 backend lands, this module is the single swap point.
 */

const WORKFLOWS_KEY = "flowmind.workflows.v1";
const CURRENT_KEY = "flowmind.current.v1";

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function loadAll() {
  if (typeof localStorage === "undefined") return [];
  const list = safeParse(localStorage.getItem(WORKFLOWS_KEY), []);
  return Array.isArray(list) ? list : [];
}

export function saveAll(list) {
  if (typeof localStorage === "undefined") return { ok: false, error: "no storage" };
  try {
    localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(list));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function upsert(workflow, list) {
  const next = list.map((w) => (w.id === workflow.id ? workflow : w));
  if (!next.some((w) => w.id === workflow.id)) next.unshift(workflow);
  return next;
}

export function remove(id, list) {
  return list.filter((w) => w.id !== id);
}

export function getCurrentId() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(CURRENT_KEY);
}

export function setCurrentId(id) {
  if (typeof localStorage === "undefined") return;
  if (id) localStorage.setItem(CURRENT_KEY, id);
  else localStorage.removeItem(CURRENT_KEY);
}

export function exportPayload(workflow) {
  return JSON.stringify(
    {
      kind: "flowmind.workflow",
      exported_at: new Date().toISOString(),
      name: workflow.name,
      version: workflow.version,
      nodes: workflow.nodes.map((n) => ({ key: n.key, type: n.type, label: n.label, config: n.config, x: n.x, y: n.y })),
      connections: workflow.connections.map((c) => ({ from: c.from, fromHandle: c.fromHandle, to: c.to, toHandle: c.toHandle })),
    },
    null,
    2
  );
}
