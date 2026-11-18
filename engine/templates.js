/**
 * Template library. Every entry is a real graph that loads into the editor as
 * an editable copy. Required integrations are listed honestly; nothing here
 * claims to be connected or to have run.
 */

const n = (key, type, label, x, y, config = {}) => ({ key, type, label, x, y, config });
const e = (from, fromHandle, to) => ({ from, fromHandle, to });

export const TEMPLATES = [
  {
    id: "daily-email-summary",
    name: "Daily Email Summary",
    category: "Productivity",
    description: "Every morning, pull unread mail, classify what matters, and send one digest instead of reading forty messages.",
    integrations: ["Gmail", "AI model", "Email"],
    nodes: [
      n("schedule", "trigger.schedule", "Every morning", 80, 120, { frequency: "daily", time: "08:00" }),
      n("fetch", "app.gmail", "Fetch unread", 380, 120, { action: "list", query: "is:unread newer_than:1d" }),
      n("classify", "ai.classify", "Classify", 680, 60, { input_field: "body", labels: "urgent, reply, fyi, ignore" }),
      n("if", "logic.if", "Worth reporting?", 980, 60, { expression: "{{ nodes.classify.output.label }} != 'ignore'" }),
      n("digest", "ai.summarize", "Build digest", 1280, 20, { input_field: "items", max_words: "150" }),
      n("notify", "comm.notification", "Deliver digest", 1580, 20, { title: "Your morning digest" }),
    ],
    connections: [e("schedule", "out", "fetch"), e("fetch", "out", "classify"), e("classify", "out", "if"), e("if", "true", "digest"), e("digest", "out", "notify")],
  },
  {
    id: "meeting-prep",
    name: "Automated Meeting Preparation",
    category: "Productivity",
    description: "When a calendar event is created, brief yourself before it starts: attendees, last contact, and open items.",
    integrations: ["Google Calendar", "AI model", "Slack"],
    nodes: [
      n("event", "trigger.app_event", "New calendar event", 80, 140, { provider: "google_sheets", event: "event.created" }),
      n("lookup", "data.http_request", "Look up attendees", 380, 140, { method: "POST", url: "https://api.example.com/contacts/lookup" }),
      n("brief", "ai.chat_model", "Draft briefing", 680, 140, { prompt: "Summarize who is in this meeting and what we owe them." }),
      n("post", "app.slack", "Post to me", 980, 140, { channel: "#meetings", action: "post" }),
    ],
    connections: [e("event", "out", "lookup"), e("lookup", "out", "brief"), e("brief", "out", "post")],
  },
  {
    id: "github-activity",
    name: "GitHub Activity Reporter",
    category: "Development",
    description: "A weekly digest of commits, open pulls and stale issues across the repositories you care about.",
    integrations: ["GitHub", "Slack"],
    nodes: [
      n("week", "trigger.schedule", "Weekly", 80, 140, { frequency: "weekly", time: "17:00" }),
      n("commits", "app.github", "Commits", 380, 80, { repo: "owner/repo", action: "commits" }),
      n("pulls", "app.github", "Open pulls", 380, 240, { repo: "owner/repo", action: "pulls" }),
      n("merge", "logic.merge", "Merge", 680, 160, { mode: "append" }),
      n("report", "ai.summarize", "Summarize week", 980, 160, { input_field: "items", max_words: "120" }),
      n("post", "app.slack", "Post report", 1280, 160, { channel: "#engineering", action: "post" }),
    ],
    connections: [e("week", "out", "commits"), e("week", "out", "pulls"), e("commits", "out", "merge"), e("pulls", "out", "merge"), e("merge", "out", "report"), e("report", "out", "post")],
  },
  {
    id: "support-triage",
    name: "Customer Support Automation",
    category: "Customer Support",
    description: "Webhook receives a ticket, an agent classifies it and either auto-answers or escalates to a human.",
    integrations: ["Webhook", "AI Agent", "Slack", "Notification"],
    nodes: [
      n("hook", "trigger.webhook", "Ticket webhook", 80, 160, { path: "/hooks/ticket", method: "POST" }),
      n("agent", "ai.agent", "Triage agent", 380, 160, { agent: "Support triage", max_steps: "6", tools: "kb_search, order_lookup" }),
      n("route", "logic.switch", "Route", 680, 160, { expression: "{{ nodes.agent.output.intent }}", cases: "billing, technical" }),
      n("answer", "comm.email", "Auto reply", 980, 20, { to: "{{ nodes.hook.output.body.email }}", subject: "Re: your request" }),
      n("escalate", "app.slack", "Escalate", 980, 260, { channel: "#support", action: "post" }),
    ],
    connections: [e("hook", "out", "agent"), e("agent", "out", "route"), e("route", "case_1", "answer"), e("route", "case_2", "escalate")],
  },
  {
    id: "lead-pipeline",
    name: "Lead Generation Pipeline",
    category: "Sales",
    description: "Form submission, AI qualification scoring, then qualified leads land in the sheet and unqualified ones wait for review.",
    integrations: ["Form", "AI model", "Google Sheets"],
    nodes: [
      n("form", "trigger.form", "Lead form", 80, 140, { form_id: "website-demo-request" }),
      n("score", "ai.classify", "Qualify", 380, 140, { input_field: "fields", labels: "hot, warm, cold" }),
      n("if", "logic.if", "Qualified?", 680, 100, { expression: "{{ nodes.score.output.label }} != 'cold'" }),
      n("sheet", "app.google_sheets", "Append lead", 980, 40, { spreadsheet_id: "SHEET_ID", range: "Leads!A:F", action: "append" }),
      n("hold", "comm.notification", "Needs review", 980, 220, { title: "Cold lead held" }),
    ],
    connections: [e("form", "out", "score"), e("score", "out", "if"), e("if", "true", "sheet"), e("if", "false", "hold")],
  },
  {
    id: "research-monitor",
    name: "AI Research Monitor",
    category: "AI Automation",
    description: "Poll a feed for new items, extract the essentials with AI, and keep a running research log in Notion.",
    integrations: ["HTTP API", "AI model", "Notion"],
    nodes: [
      n("cron", "trigger.schedule", "Every 6 hours", 80, 140, { frequency: "custom", time: "06:00" }),
      n("feed", "data.http_request", "Fetch feed", 380, 140, { method: "GET", url: "https://hnrss.org/newest?points=100" }),
      n("parse", "data.json_parse", "Parse items", 680, 140, { source: "{{ nodes.feed.output.body }}", path: "$.items" }),
      n("extract", "ai.extract", "Extract essentials", 980, 140, { input_field: "title", schema: '{ "topic": "string", "why_it_matters": "string" }' }),
      n("store", "app.notion", "Log to Notion", 1280, 140, { database_id: "DB_ID", action: "create" }),
    ],
    connections: [e("cron", "out", "feed"), e("feed", "out", "parse"), e("parse", "out", "extract"), e("extract", "out", "store")],
  },
];

export function templateById(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}
