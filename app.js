import {
  GROUPS,
  GROUP_ACCENT,
  NODE_TYPES,
  typeDef,
  defaultConfig,
  newKey,
  newWorkflow,
  connectionId,
  validateGraph,
  errorCount,
  summarize,
  toGraphJSON,
  fromGraphJSON,
} from "./engine/graph.js";
import { TEMPLATES, templateById } from "./engine/templates.js";
import * as store from "./engine/store.js";

const NODE_W = 216;
const MIN_Z = 0.35;
const MAX_Z = 1.8;

const state = {
  workflows: store.loadAll(),
  wf: null,
  selected: new Set(),
  view: { x: 0, y: 0, z: 1 },
  history: [],
  future: [],
  findings: [],
  search: "",
  collapsed: new Set(["apps"]),
  drag: null,
  saveTimer: null,
  fieldSession: null,
};

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/* ------------------------------------------------------------- geometry */

function nodeHeight(node) {
  const def = typeDef(node.type);
  let h = 68;
  if (def && def.credential && !node.config?.credential) h += 16;
  if (def && def.outputs > 2) h += 8;
  return h;
}

function outPorts(node) {
  const def = typeDef(node.type);
  const handles = def?.handles || ["out"];
  const h = nodeHeight(node);
  return handles.map((handle, i) => ({
    handle,
    x: node.x + NODE_W,
    y: node.y + h / 2 + (i - (handles.length - 1) / 2) * 22,
  }));
}

function inPort(node) {
  return { handle: "in", x: node.x, y: node.y + nodeHeight(node) / 2 };
}

function edgePath(from, to) {
  const dx = Math.max(46, Math.abs(to.x - from.x) * 0.45);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

function accentFor(type) {
  const def = typeDef(type);
  return GROUP_ACCENT[def?.group] || "#7C5CFF";
}

/* --------------------------------------------------------------- storage */

function persist({ immediate = false } = {}) {
  if (!state.wf) return;
  state.wf.updated_at = new Date().toISOString();
  state.workflows = store.upsert(state.wf, state.workflows);
  store.setCurrentId(state.wf.id);

  const write = () => {
    const res = store.saveAll(state.workflows);
    const label = $("#save-state");
    if (!label) return;
    label.textContent = res.ok ? "Saved" : "Storage full";
    label.style.color = res.ok ? "" : "var(--red)";
  };

  const label = $("#save-state");
  if (label) {
    label.textContent = "Saving…";
    label.style.color = "";
  }
  clearTimeout(state.saveTimer);
  if (immediate) write();
  else state.saveTimer = setTimeout(write, 350);
}

function snapshot() {
  if (!state.wf) return;
  state.history.push(JSON.stringify({ nodes: state.wf.nodes, connections: state.wf.connections }));
  if (state.history.length > 60) state.history.shift();
  state.future.length = 0;
}

function restore(json) {
  const parsed = JSON.parse(json);
  state.wf.nodes = parsed.nodes;
  state.wf.connections = parsed.connections;
  state.selected.clear();
  render();
  persist();
}

function undo() {
  if (!state.history.length) return;
  state.future.push(JSON.stringify({ nodes: state.wf.nodes, connections: state.wf.connections }));
  restore(state.history.pop());
}

function redo() {
  if (!state.future.length) return;
  state.history.push(JSON.stringify({ nodes: state.wf.nodes, connections: state.wf.connections }));
  restore(state.future.pop());
}

/* ------------------------------------------------------------------ nav */

function show(view) {
  $("#view-workflows").hidden = view !== "workflows";
  $("#view-studio").hidden = view !== "studio";
  document.querySelectorAll(".rail-btn").forEach((b) => b.classList.remove("is-active"));
  const btn = document.querySelector(`[data-nav="${view === "studio" ? "workflows" : view}"]`);
  if (btn) btn.classList.add("is-active");
}

function openWorkflow(id) {
  const wf = state.workflows.find((w) => w.id === id);
  if (!wf) return;
  state.wf = wf;
  state.selected.clear();
  state.history.length = 0;
  state.future.length = 0;
  state.findings = [];
  store.setCurrentId(id);
  $("#workflow-name").value = wf.name;
  $("#findings").hidden = true;
  show("studio");
  render();
  fitToScreen();
}

function startNew(name = "Untitled workflow", nodes = [], connections = []) {
  const wf = newWorkflow(name);
  wf.nodes = nodes;
  wf.connections = connections;
  state.workflows = store.upsert(wf, state.workflows);
  store.saveAll(state.workflows);
  state.workflows = store.loadAll();
  openWorkflow(wf.id);
}

/* -------------------------------------------------------------- render */

function render() {
  renderLibrary();
  renderCanvas();
  renderProps();
  renderStatus();
  renderMinimap();
}

function renderStatus() {
  if (!state.wf) return;
  const pill = $("#status-pill");
  const errors = errorCount(state.findings);
  pill.textContent = state.wf.status;
  pill.className = "pill";
  if (state.wf.status === "published") pill.classList.add("pill-ok");
  if (errors > 0) {
    pill.textContent = `${state.wf.status} · ${errors} error${errors === 1 ? "" : "s"}`;
    pill.classList.add("pill-bad");
  }
  $("#btn-run").disabled = state.wf.status !== "published";
}

function renderLibrary() {
  const list = $("#library-list");
  list.textContent = "";
  const term = state.search.trim().toLowerCase();

  for (const group of GROUPS) {
    const types = NODE_TYPES.filter((t) => t.group === group.key && (!term || t.label.toLowerCase().includes(term) || t.desc.toLowerCase().includes(term) || t.key.includes(term)));
    if (!types.length) continue;

    const wrap = el("div", "lib-group");
    const head = el("div", "lib-group-head");
    const dot = el("span", "dot");
    dot.style.background = group.accent;
    head.append(dot, el("span", "", `${group.label} · ${types.length}`));
    head.addEventListener("click", () => {
      if (state.collapsed.has(group.key)) state.collapsed.delete(group.key);
      else state.collapsed.add(group.key);
      renderLibrary();
    });
    wrap.append(head);

    if (!state.collapsed.has(group.key)) {
      const items = el("div", "lib-items");
      for (const type of types) {
        const item = el("button", "lib-item");
        item.type = "button";
        item.draggable = true;
        item.dataset.type = type.key;
        const text = el("span", "lib-text");
        text.append(el("span", "lib-label", type.label), el("span", "lib-desc", type.desc));
        item.append(text);
        item.addEventListener("dragstart", (ev) => {
          ev.dataTransfer.setData("text/flowmind-type", type.key);
          ev.dataTransfer.effectAllowed = "copy";
        });
        item.addEventListener("click", () => addNodeAtCenter(type.key));
        items.append(item);
      }
      wrap.append(items);
    }
    list.append(wrap);
  }

  if (!list.children.length) list.append(el("p", "muted small", "No components match that search."));
}

function renderCanvas() {
  const layer = $("#node-layer");
  const edgeLayer = $("#edge-layer");
  layer.textContent = "";
  edgeLayer.textContent = "";
  if (!state.wf) return;

  const byKey = new Map(state.wf.nodes.map((n) => [n.key, n]));

  for (const conn of state.wf.connections) {
    const from = byKey.get(conn.from);
    const to = byKey.get(conn.to);
    if (!from || !to) continue;
    const ports = outPorts(from);
    const start = ports.find((p) => p.handle === (conn.fromHandle || "out")) || ports[0];
    const end = inPort(to);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", edgePath(start, end));
    path.setAttribute("class", "edge");
    path.setAttribute("stroke", accentFor(from.type));
    path.setAttribute("opacity", "0.75");
    path.setAttribute("filter", "url(#glow)");
    edgeLayer.append(path);

    const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hit.setAttribute("d", edgePath(start, end));
    hit.setAttribute("class", "edge-hit");
    hit.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      snapshot();
      state.wf.connections = state.wf.connections.filter((c) => c.id !== conn.id);
      render();
      persist();
    });
    edgeLayer.append(hit);
  }

  for (const node of state.wf.nodes) {
    const def = typeDef(node.type);
    const h = nodeHeight(node);
    const card = el("div", "node");
    card.dataset.key = node.key;
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.style.height = `${h}px`;
    card.style.setProperty("--accent", accentFor(node.type));
    if (state.selected.has(node.key)) card.classList.add("is-selected");

    const head = el("div", "node-head");
    head.append(el("span", "node-title", node.label));
    if (node.type === "ai.agent") head.append(el("span", "node-badge", "MAIN"));
    card.append(head);
    card.append(el("div", "node-type", def ? def.label : node.type));
    card.append(el("div", "node-summary", summarize(node)));
    if (def?.credential && !node.config?.credential) card.append(el("div", "node-flag", "credential not connected"));

    if (def && def.inputs > 0) {
      const port = el("span", "port port-in");
      port.style.top = `${h / 2 - 5}px`;
      port.dataset.key = node.key;
      port.dataset.dir = "in";
      card.append(port);
    }
    if (def && def.outputs > 0) {
      const ports = outPorts(node);
      for (const p of ports) {
        const port = el("span", "port port-out");
        port.style.top = `${p.y - node.y - 5}px`;
        port.dataset.key = node.key;
        port.dataset.dir = "out";
        port.dataset.handle = p.handle;
        if (ports.length > 1) {
          const label = el("span", "port-label", p.handle);
          label.style.top = `${p.y - node.y - 13}px`;
          card.append(label);
        }
        card.append(port);
      }
    }

    layer.append(card);
  }

  $("#canvas-empty").hidden = state.wf.nodes.length > 0;
  $("#world").style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.z})`;
  $("#zoom-label").textContent = `${Math.round(state.view.z * 100)}%`;
}

function renderProps() {
  const body = $("#props-body");
  const empty = $("#props-empty");
  body.textContent = "";

  const key = [...state.selected][0];
  const node = key ? state.wf?.nodes.find((n) => n.key === key) : null;
  if (!node) {
    body.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  body.hidden = false;

  const def = typeDef(node.type);
  const head = el("div", "props-head");
  const titles = el("div");
  titles.append(el("h2", "", def ? def.label : node.type), el("div", "props-id", node.key));
  const close = el("button", "btn btn-ghost btn-sm", "✕");
  close.addEventListener("click", () => {
    state.selected.clear();
    render();
  });
  head.append(titles, close);
  body.append(head);

  const nameField = field("Node name", node.label, "text", (v) => {
    node.label = v;
    persist();
    renderCanvas();
    renderMinimap();
  });
  body.append(nameField);
  if (def?.desc) body.append(el("p", "hint muted small", def.desc));

  for (const f of def?.fields || []) {
    const value = node.config?.[f.key] ?? "";
    let input;
    if (f.type === "select") {
      input = el("select");
      const blank = el("option", "", "Select…");
      blank.value = "";
      input.append(blank);
      for (const opt of f.options || []) {
        const o = el("option", "", opt);
        o.value = opt;
        if (opt === value) o.selected = true;
        input.append(o);
      }
      input.addEventListener("change", () => setConfig(node, f.key, input.value));
    } else if (f.type === "textarea" || f.type === "list" || f.type === "json") {
      input = el("textarea");
      input.value = value;
      input.placeholder = f.placeholder || "";
      input.addEventListener("focus", () => beginFieldSession());
      input.addEventListener("input", () => setConfig(node, f.key, input.value, { soft: true }));
      input.addEventListener("blur", () => {
        renderCanvas();
        renderMinimap();
      });
    } else {
      input = el("input");
      input.type = f.type === "number" ? "number" : "text";
      input.value = value;
      input.placeholder = f.placeholder || "";
      input.addEventListener("focus", () => beginFieldSession());
      input.addEventListener("input", () => setConfig(node, f.key, input.value, { soft: true }));
      input.addEventListener("blur", () => {
        renderCanvas();
        renderMinimap();
      });
    }
    const wrap = el("div", "field");
    const label = el("label", "", f.label + (f.required ? " *" : ""));
    wrap.append(label, input);
    if (f.type === "list") wrap.append(el("div", "hint", "Comma separated"));
    if (f.type === "json") wrap.append(el("div", "hint", "JSON object"));
    body.append(wrap);
  }

  const errSection = el("div", "props-section");
  errSection.append(el("h4", "", "Error handling"));
  const errField = el("div", "field");
  errField.append(el("label", "", "On node error"));
  const errSel = el("select");
  for (const opt of ["stop", "continue", "retry"]) {
    const o = el("option", "", opt);
    o.value = opt;
    if ((node.config?.on_error || "stop") === opt) o.selected = true;
    errSel.append(o);
  }
  errSel.addEventListener("change", () => setConfig(node, "on_error", errSel.value));
  errField.append(errSel);
  errSection.append(errField);

  const attempts = field("Max attempts", node.config?.max_attempts ?? "", "number", (v) => setConfig(node, "max_attempts", v, { soft: true }));
  const timeout = field("Timeout (ms)", node.config?.timeout_ms ?? 30000, "number", (v) => setConfig(node, "timeout_ms", v, { soft: true }));
  errSection.append(attempts, timeout);
  body.append(errSection);

  if (def?.credential) {
    const credSection = el("div", "props-section");
    credSection.append(el("h4", "", "Credentials"));
    const cred = el("div", "cred");
    cred.append(el("span", "cred-dot"), el("span", "", "No credential connected"));
    credSection.append(cred);
    credSection.append(el("p", "hint", "Connections are created in the Integrations page once the backend phase lands."));
    body.append(credSection);
  }

  const issues = state.findings.filter((x) => x.node_key === node.key);
  if (issues.length) {
    const sec = el("div", "props-section");
    sec.append(el("h4", "", "Validation"));
    const list = el("div", "props-issues");
    for (const issue of issues) {
      list.append(el("div", `props-issue sev-${issue.severity}`, `${issue.code}: ${issue.message}`));
    }
    sec.append(list);
    body.append(sec);
  }

  const actions = el("div", "props-section");
  const del = el("button", "btn btn-sm btn-danger", "Delete node");
  del.addEventListener("click", () => {
    snapshot();
    state.wf.nodes = state.wf.nodes.filter((n) => n.key !== node.key);
    state.wf.connections = state.wf.connections.filter((c) => c.from !== node.key && c.to !== node.key);
    state.selected.clear();
    render();
    persist();
  });
  const dup = el("button", "btn btn-sm", "Duplicate");
  dup.addEventListener("click", () => duplicateNode(node.key));
  actions.append(dup, del);
  body.append(actions);
}

function field(label, value, type, onChange) {
  const wrap = el("div", "field");
  wrap.append(el("label", "", label));
  const input = el("input");
  input.type = type;
  input.value = value ?? "";
  input.addEventListener("focus", () => beginFieldSession());
  input.addEventListener("input", () => onChange(input.value));
  wrap.append(input);
  return wrap;
}

function beginFieldSession() {
  const token = `${Date.now()}`;
  state.fieldSession = token;
  snapshot();
}

function setConfig(node, key, value, { soft = false } = {}) {
  node.config = { ...(node.config || {}), [key]: value };
  persist();
  if (soft) {
    // live-update the card summary without rebuilding the DOM (rebuilding would steal focus)
    const card = document.querySelector(`.node[data-key="${node.key}"] .node-summary`);
    if (card) card.textContent = summarize(node);
  } else {
    renderCanvas();
  }
  renderMinimap();
}

function renderMinimap() {
  const svg = $("#minimap-svg");
  svg.textContent = "";
  if (!state.wf || !state.wf.nodes.length) return;

  const pad = 8;
  const xs = state.wf.nodes.map((n) => n.x);
  const ys = state.wf.nodes.map((n) => n.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + NODE_W + pad;
  const maxY = Math.max(...ys) + 100 + pad;
  const vw = 168;
  const vh = 108;
  const scale = Math.min(vw / (maxX - minX), vh / (maxY - minY));

  for (const node of state.wf.nodes) {
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("x", String((node.x - minX) * scale + (vw - (maxX - minX) * scale) / 2));
    r.setAttribute("y", String((node.y - minY) * scale + (vh - (maxY - minY) * scale) / 2));
    r.setAttribute("width", String(Math.max(3, NODE_W * scale)));
    r.setAttribute("height", String(Math.max(2, 40 * scale)));
    r.setAttribute("rx", "1.5");
    r.setAttribute("fill", accentFor(node.type));
    r.setAttribute("opacity", state.selected.has(node.key) ? "1" : "0.55");
    svg.append(r);
  }
}

/* ------------------------------------------------------------- mutations */

function addNode(type, x, y) {
  const def = typeDef(type);
  if (!def) return;
  snapshot();
  const key = newKey(type, state.wf.nodes.map((n) => n.key));
  const node = { key, type, label: def.label, config: defaultConfig(type), x: Math.round(x), y: Math.round(y) };
  state.wf.nodes.push(node);
  state.selected = new Set([key]);
  render();
  persist();
}

function addNodeAtCenter(type) {
  const rect = $("#canvas").getBoundingClientRect();
  let x = (rect.width / 2 - state.view.x) / state.view.z - NODE_W / 2;
  let y = (rect.height / 2 - state.view.y) / state.view.z - 40;
  let guard = 0;
  while (guard < 40 && state.wf.nodes.some((n) => Math.abs(n.x - x) < NODE_W * 0.7 && Math.abs(n.y - y) < 78)) {
    x += 34;
    y += 44;
    guard += 1;
  }
  addNode(type, x, y);
}

function duplicateNode(key) {
  const node = state.wf.nodes.find((n) => n.key === key);
  if (!node) return;
  snapshot();
  const newK = newKey(node.type, state.wf.nodes.map((n) => n.key));
  state.wf.nodes.push({ ...structuredClone(node), key: newK, x: node.x + 28, y: node.y + 28 });
  state.selected = new Set([newK]);
  render();
  persist();
}

function deleteSelection() {
  if (!state.selected.size) return;
  snapshot();
  const keys = new Set(state.selected);
  state.wf.nodes = state.wf.nodes.filter((n) => !keys.has(n.key));
  state.wf.connections = state.wf.connections.filter((c) => !keys.has(c.from) && !keys.has(c.to));
  state.selected.clear();
  render();
  persist();
}

let clipboard = null;

function copySelection() {
  const nodes = state.wf.nodes.filter((n) => state.selected.has(n.key));
  if (!nodes.length) return;
  const keys = new Set(nodes.map((n) => n.key));
  clipboard = {
    nodes: structuredClone(nodes),
    connections: structuredClone(state.wf.connections.filter((c) => keys.has(c.from) && keys.has(c.to))),
  };
}

function pasteClipboard() {
  if (!clipboard) return;
  snapshot();
  const map = new Map();
  const added = [];
  for (const node of clipboard.nodes) {
    const key = newKey(node.type, [...state.wf.nodes.map((n) => n.key), ...added.map((a) => a.key)]);
    map.set(node.key, key);
    added.push({ ...structuredClone(node), key, x: node.x + 40, y: node.y + 40 });
  }
  state.wf.nodes.push(...added);
  for (const conn of clipboard.connections) {
    state.wf.connections.push({ ...conn, id: connectionId(), from: map.get(conn.from), to: map.get(conn.to) });
  }
  state.selected = new Set(added.map((a) => a.key));
  render();
  persist();
}

/* ------------------------------------------------------------ validation */

function runValidation() {
  if (!state.wf) return;
  state.findings = validateGraph(state.wf);
  const box = $("#findings");
  box.textContent = "";
  const errors = errorCount(state.findings);
  const head = el("h4", "", errors ? `${errors} error${errors === 1 ? "" : "s"} · ${state.findings.length} finding${state.findings.length === 1 ? "" : "s"}` : `Valid · ${state.findings.length} advisory note${state.findings.length === 1 ? "" : "s"}`);
  box.append(head);

  if (!state.findings.length) {
    box.append(el("p", "small muted", "No problems found. Publish is still disabled in this build because the backend that stores versions is not connected."));
  }
  for (const finding of state.findings) {
    const row = el("div", "finding");
    row.append(el("span", `finding-code sev-${finding.severity}`, finding.code));
    if (finding.node_key) row.append(el("span", "finding-key", finding.node_key));
    row.append(el("span", "", finding.message));
    box.append(row);
  }
  box.hidden = false;
  renderCanvas();
  renderStatus();
  renderProps();
  setTimeout(() => {
    box.hidden = true;
  }, 9000);
}

/* ------------------------------------------------------------- viewport */

function fitToScreen() {
  if (!state.wf || !state.wf.nodes.length) {
    state.view = { x: 0, y: 0, z: 1 };
    renderCanvas();
    return;
  }
  const rect = $("#canvas").getBoundingClientRect();
  const pad = 60;
  const xs = state.wf.nodes.map((n) => n.x);
  const ys = state.wf.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs) + NODE_W;
  const maxY = Math.max(...ys) + 100;
  const w = maxX - minX;
  const h = maxY - minY;
  const z = Math.min(1.2, Math.max(MIN_Z, Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / h)));
  state.view = {
    z,
    x: (rect.width - w * z) / 2 - minX * z,
    y: (rect.height - h * z) / 2 - minY * z,
  };
  renderCanvas();
}

function zoomBy(factor, originX, originY) {
  const z = Math.min(MAX_Z, Math.max(MIN_Z, state.view.z * factor));
  const rect = $("#canvas").getBoundingClientRect();
  const ox = originX ?? rect.width / 2;
  const oy = originY ?? rect.height / 2;
  state.view.x = ox - ((ox - state.view.x) / state.view.z) * z;
  state.view.y = oy - ((oy - state.view.y) / state.view.z) * z;
  state.view.z = z;
  renderCanvas();
}

/* ------------------------------------------------------------ interaction */

function worldPoint(clientX, clientY) {
  const rect = $("#canvas").getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.view.x) / state.view.z,
    y: (clientY - rect.top - state.view.y) / state.view.z,
  };
}

function wireCanvas() {
  const canvas = $("#canvas");

  canvas.addEventListener("dragover", (ev) => {
    if (ev.dataTransfer.types.includes("text/flowmind-type")) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
    }
  });

  canvas.addEventListener("drop", (ev) => {
    const type = ev.dataTransfer.getData("text/flowmind-type");
    if (!type) return;
    ev.preventDefault();
    const p = worldPoint(ev.clientX, ev.clientY);
    addNode(type, p.x - NODE_W / 2, p.y - 30);
  });

  canvas.addEventListener("pointerdown", (ev) => {
    const port = ev.target.closest(".port");
    if (port) {
      ev.stopPropagation();
      if (port.dataset.dir === "out") {
        const node = state.wf.nodes.find((n) => n.key === port.dataset.key);
        const start = outPorts(node).find((p) => p.handle === port.dataset.handle);
        state.drag = { mode: "link", from: port.dataset.key, handle: port.dataset.handle, start };
        canvas.classList.add("is-linking");
        try {
          canvas.setPointerCapture(ev.pointerId);
        } catch {
          /* capture is best effort */
        }
      }
      return;
    }

    const card = ev.target.closest(".node");
    if (card) {
      const key = card.dataset.key;
      if (ev.shiftKey) {
        if (state.selected.has(key)) state.selected.delete(key);
        else state.selected.add(key);
      } else if (!state.selected.has(key)) {
        state.selected = new Set([key]);
      }
      renderCanvas();
      renderProps();
      const node = state.wf.nodes.find((n) => n.key === key);
      state.drag = {
        mode: "node",
        key,
        startClient: { x: ev.clientX, y: ev.clientY },
        origin: { x: node.x, y: node.y },
        moved: false,
      };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }

    // background: pan, and clear selection unless shift
    if (!ev.shiftKey) {
      state.selected.clear();
      renderCanvas();
      renderProps();
    }
    state.drag = { mode: "pan", startClient: { x: ev.clientX, y: ev.clientY }, origin: { x: state.view.x, y: state.view.y } };
    canvas.classList.add("is-panning");
    canvas.setPointerCapture(ev.pointerId);
  });

  canvas.addEventListener("pointermove", (ev) => {
    const drag = state.drag;
    if (!drag) return;

    if (drag.mode === "pan") {
      state.view.x = drag.origin.x + (ev.clientX - drag.startClient.x);
      state.view.y = drag.origin.y + (ev.clientY - drag.startClient.y);
      $("#world").style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.z})`;
      return;
    }

    if (drag.mode === "node") {
      const dx = (ev.clientX - drag.startClient.x) / state.view.z;
      const dy = (ev.clientY - drag.startClient.y) / state.view.z;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      if (!drag.moved) {
        snapshot();
        drag.moved = true;
      }
      const node = state.wf.nodes.find((n) => n.key === drag.key);
      node.x = Math.round(drag.origin.x + dx);
      node.y = Math.round(drag.origin.y + dy);
      const card = document.querySelector(`.node[data-key="${drag.key}"]`);
      if (card) {
        card.style.left = `${node.x}px`;
        card.style.top = `${node.y}px`;
        card.classList.add("is-dragging");
      }
      redrawEdgesOnly();
      renderMinimap();
      return;
    }

    if (drag.mode === "link") {
      const p = worldPoint(ev.clientX, ev.clientY);
      const path = $("#pending-edge");
      path.removeAttribute("hidden");
      path.setAttribute("d", edgePath(drag.start, p));
      document.querySelectorAll(".port-in").forEach((port) => {
        const r = port.getBoundingClientRect();
        const near = Math.abs(ev.clientX - (r.left + r.width / 2)) < 26 && Math.abs(ev.clientY - (r.top + r.height / 2)) < 26;
        port.classList.toggle("is-target", near);
      });
    }
  });

  canvas.addEventListener("pointerup", (ev) => {
    const drag = state.drag;
    state.drag = null;
    canvas.classList.remove("is-panning", "is-linking");
    document.querySelectorAll(".port").forEach((p) => p.classList.remove("is-target"));
    $("#pending-edge").setAttribute("hidden", "");
    document.querySelectorAll(".node").forEach((n) => n.classList.remove("is-dragging"));

    if (!drag) return;

    if (drag.mode === "node" && drag.moved) {
      persist();
      return;
    }

    if (drag.mode === "link") {
      let target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".port-in");
      if (!target) {
        let best = null;
        let bestDist = 34;
        for (const port of document.querySelectorAll(".port-in")) {
          const r = port.getBoundingClientRect();
          const d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
          if (d < bestDist) {
            bestDist = d;
            best = port;
          }
        }
        target = best;
      }
      if (target) {
        const toKey = target.dataset.key;
        const exists = state.wf.connections.some(
          (c) => c.from === drag.from && c.to === toKey && (c.fromHandle || "out") === drag.handle
        );
        if (!exists && toKey !== drag.from) {
          snapshot();
          state.wf.connections.push({ id: connectionId(), from: drag.from, fromHandle: drag.handle, to: toKey, toHandle: "in" });
          render();
          persist();
        }
      }
    }
  });

  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomBy(factor, ev.clientX - rect.left, ev.clientY - rect.top);
  }, { passive: false });

  document.querySelectorAll("[data-zoom]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.zoom;
      if (kind === "in") zoomBy(1.15);
      else if (kind === "out") zoomBy(1 / 1.15);
      else fitToScreen();
    });
  });
}

function redrawEdgesOnly() {
  const edgeLayer = $("#edge-layer");
  edgeLayer.textContent = "";
  const byKey = new Map(state.wf.nodes.map((n) => [n.key, n]));
  for (const conn of state.wf.connections) {
    const from = byKey.get(conn.from);
    const to = byKey.get(conn.to);
    if (!from || !to) continue;
    const start = outPorts(from).find((p) => p.handle === (conn.fromHandle || "out")) || outPorts(from)[0];
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", edgePath(start, inPort(to)));
    path.setAttribute("class", "edge");
    path.setAttribute("stroke", accentFor(from.type));
    path.setAttribute("opacity", "0.75");
    path.setAttribute("filter", "url(#glow)");
    edgeLayer.append(path);
  }
}

/* ------------------------------------------------------------------ home */

function relative(iso) {
  const then = new Date(iso).getTime();
  if (!then) return "unknown";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function renderHome() {
  state.workflows = store.loadAll();

  const stats = $("#stats");
  stats.textContent = "";
  const totalNodes = state.workflows.reduce((sum, w) => sum + w.nodes.length, 0);
  const validCount = state.workflows.filter((w) => w.nodes.length > 0 && errorCount(validateGraph(w)) === 0).length;
  const cards = [
    { label: "Workflows", value: state.workflows.length, note: "saved in this browser" },
    { label: "Nodes", value: totalNodes, note: "across all workflows" },
    { label: "Passing validation", value: validCount, note: "zero errors" },
    { label: "Executions", value: 0, note: "engine not connected" },
    { label: "Templates", value: TEMPLATES.length, note: "real editable graphs" },
  ];
  for (const card of cards) {
    const box = el("div", "stat");
    box.append(el("div", "stat-label", card.label));
    const value = el("div", `stat-value${card.value === 0 ? " is-zero" : ""}`, String(card.value));
    box.append(value, el("div", "stat-note", card.note));
    stats.append(box);
  }

  const list = $("#workflow-list");
  list.textContent = "";
  $("#workflow-count").textContent = state.workflows.length ? `${state.workflows.length} saved` : "";

  if (!state.workflows.length) {
    const empty = el("div", "empty");
    empty.append(el("p", "empty-title", "No workflows yet"), el("p", "", "Create a blank workflow or start from a template below."));
    list.append(empty);
  }

  for (const wf of [...state.workflows].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))) {
    const row = el("div", "wf-row");
    const main = el("div", "wf-main");
    main.append(el("div", "wf-name", wf.name));
    const findings = wf.nodes.length ? validateGraph(wf) : [];
    const errors = errorCount(findings);
    const meta = el("div", "wf-meta");
    meta.append(el("span", "", `${wf.nodes.length} nodes`), el("span", "", `${wf.connections.length} connections`));
    if (!wf.nodes.length) meta.append(el("span", "", "empty"));
    else if (errors) meta.append(el("span", "sev-error", `${errors} validation error${errors === 1 ? "" : "s"}`));
    else meta.append(el("span", "", "passes validation"));
    meta.append(el("span", "", `updated ${relative(wf.updated_at)}`));
    main.append(meta);

    const actions = el("div", "wf-actions");
    const open = el("button", "btn btn-sm", "Open");
    open.addEventListener("click", () => openWorkflow(wf.id));
    const copy = el("button", "btn btn-sm", "Duplicate");
    copy.addEventListener("click", () => {
      const clone = structuredClone(wf);
      clone.id = `wf_${Date.now().toString(36)}`;
      clone.name = `${wf.name} (copy)`;
      clone.created_at = new Date().toISOString();
      clone.updated_at = clone.created_at;
      state.workflows = store.upsert(clone, store.loadAll());
      store.saveAll(state.workflows);
      renderHome();
    });
    const del = el("button", "btn btn-sm btn-danger", "Delete");
    del.addEventListener("click", () => {
      if (!confirm(`Delete "${wf.name}"? This cannot be undone.`)) return;
      state.workflows = store.remove(wf.id, store.loadAll());
      store.saveAll(state.workflows);
      renderHome();
    });
    actions.append(open, copy, del);
    row.append(main, actions);
    list.append(row);
  }

  const grid = $("#template-grid");
  grid.textContent = "";
  for (const tpl of TEMPLATES) {
    const card = el("button", "tpl-card");
    card.type = "button";
    const top = el("div", "tpl-top");
    top.append(el("span", "tpl-cat", tpl.category), el("span", "tpl-cat", `${tpl.nodes.length} nodes`));
    card.append(top, el("div", "tpl-name", tpl.name), el("div", "tpl-desc", tpl.description));
    card.append(el("div", "tpl-needs", `Needs: ${tpl.integrations.join(", ")}`));
    card.addEventListener("click", () => useTemplate(tpl.id));
    grid.append(card);
  }
  grid.append(el("p", "muted small", `${TEMPLATES.length} of 12 planned templates are shipped as real graphs. The rest arrive with the backend phases.`));
}

function useTemplate(id) {
  const tpl = templateById(id);
  if (!tpl) return;
  const graph = fromGraphJSON({ name: tpl.name, nodes: tpl.nodes, connections: tpl.connections });
  startNew(tpl.name, graph.nodes, graph.connections);
}

/* ------------------------------------------------------------------- io */

function exportCurrent() {
  const text = store.exportPayload(state.wf);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.wf.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.flowmind.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const graph = fromGraphJSON(parsed);
      startNew(parsed.name || "Imported workflow", graph.nodes, graph.connections);
    } catch (error) {
      alert(`That file is not a FlowMind workflow: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

/* ------------------------------------------------------------ wiring ui */

function wireUi() {
  $("#new-workflow").addEventListener("click", () => startNew());
  $("#back-home").addEventListener("click", () => {
    renderHome();
    show("workflows");
  });
  $("#btn-validate").addEventListener("click", runValidation);
  $("#btn-export").addEventListener("click", exportCurrent);
  $("#btn-fit").addEventListener("click", fitToScreen);
  $("#node-search").addEventListener("input", (ev) => {
    state.search = ev.target.value;
    renderLibrary();
  });
  $("#workflow-name").addEventListener("input", (ev) => {
    state.wf.name = ev.target.value;
    persist();
  });
  $("#import-file").addEventListener("change", (ev) => {
    const file = ev.target.files?.[0];
    if (file) importFile(file);
    ev.target.value = "";
  });
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nav = btn.dataset.nav;
      if (nav === "workflows") {
        renderHome();
        show("workflows");
      } else {
        alert("That section arrives with the Base44 backend phases. The studio and the graph engine are what this build ships.");
      }
    });
  });

  document.addEventListener("keydown", (ev) => {
    if ($("#view-studio").hidden) return;
    const tag = (ev.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    const meta = ev.metaKey || ev.ctrlKey;

    if (meta && ev.key.toLowerCase() === "z") {
      ev.preventDefault();
      if (ev.shiftKey) redo();
      else undo();
      return;
    }
    if (meta && ev.key.toLowerCase() === "c") {
      copySelection();
      return;
    }
    if (meta && ev.key.toLowerCase() === "v") {
      ev.preventDefault();
      pasteClipboard();
      return;
    }
    if (meta && ev.key.toLowerCase() === "d") {
      ev.preventDefault();
      const key = [...state.selected][0];
      if (key) duplicateNode(key);
      return;
    }
    if (ev.key === "Delete" || ev.key === "Backspace") {
      if (state.selected.size) {
        ev.preventDefault();
        deleteSelection();
      }
      return;
    }
    if (ev.key === "Escape") {
      state.selected.clear();
      render();
    }
  });

  window.addEventListener("resize", () => {
    if (!$("#view-studio").hidden) renderCanvas();
  });
}

load();
function load() {
  wireUi();
  wireCanvas();
  renderHome();
  show("workflows");
  const currentId = store.getCurrentId();
  if (currentId && state.workflows.some((w) => w.id === currentId)) {
    // keep the user on the list; opening is one click
  }
}
