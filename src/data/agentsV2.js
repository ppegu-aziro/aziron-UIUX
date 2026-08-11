/**
 * Seed data for the unified Agents (v2) concept.
 *
 * "Agent" and "skill" were never two kinds of thing — they were two HALVES of
 * one thing. An agent had a runtime (model, tools, knowledge) and no way to
 * travel. A skill had a package (files, versions, targets) and no runtime.
 *
 * So every record carries both halves plus the full v1 settings surface, and
 * `origin` records which half it arrived with. Nothing keys off `origin` except
 * the migration explainer — it proves the mapping, it does not preserve the
 * distinction.
 */

/* ── vocabulary ──────────────────────────────────────────────────────────── */

export const TARGETS = [
  { id: "claude", name: "Claude Code", format: "skill", path: "~/.claude/skills/" },
  { id: "codex", name: "Codex", format: "skill", path: "~/.codex/skills/" },
  { id: "copilot", name: "GitHub Copilot", format: "skill", path: "~/.copilot/skills/" },
  { id: "cursor", name: "Cursor", format: "rule", path: "~/.cursor/rules/" },
];

export const TARGET_BY_ID = Object.fromEntries(TARGETS.map((t) => [t.id, t]));

/**
 * Tool posture — the one runtime difference that genuinely existed between the
 * old types, promoted to a first-class, filterable property.
 *
 * `open` is styled as a warning: today an empty allow-list means EVERY tool,
 * and nothing in the product surfaces that.
 */
export const TOOL_POSTURE = {
  open: { id: "open", label: "Open", tone: "warning", blurb: "Can use every tool available to the caller." },
  scoped: { id: "scoped", label: "Scoped", tone: "success", blurb: "Limited to an explicit list of tools." },
  none: { id: "none", label: "No tools", tone: "muted", blurb: "Instructions only — cannot call anything." },
};

/** v1 called these labels. They are the agent's category now. */
export const CATEGORIES = [
  "Engineering",
  "Security",
  "Data",
  "Operations",
  "People",
  "Finance",
  "Marketing",
];

export const STATUS = {
  active: { label: "Active", dot: "var(--success)" },
  idle: { label: "Idle", dot: "var(--muted-foreground)" },
  error: { label: "Error", dot: "var(--destructive)" },
  disabled: { label: "Disabled", dot: "var(--border)" },
};

/* ── runtime configuration ───────────────────────────────────────────────── */

export const PROVIDERS = [
  { id: "auto", name: "Automatic", models: [{ id: "Auto", note: "Picks a model per request by complexity" }] },
  {
    id: "anthropic",
    name: "Anthropic",
    models: [
      { id: "Claude Opus 4.5", note: "Most capable" },
      { id: "Claude Sonnet 4.5", note: "Balanced — a good default" },
      { id: "Claude Haiku 4.5", note: "Fastest, cheapest" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    models: [
      { id: "GPT-5", note: "Most capable" },
      { id: "GPT-5 mini", note: "Faster, cheaper" },
    ],
  },
];

/** Saved credentials, masked. Runtime-only — they never travel in a release. */
export const API_TOKENS = {
  Automatic: [{ id: "auto", label: "Routed automatically", masked: "—" }],
  Anthropic: [
    { id: "anthropic-default", label: "Anthropic Default", masked: "sk-ant-api03-cg2…aqAA" },
    { id: "anthropic-rnd", label: "Anthropic R&D", masked: "sk-ant-api03-Mz4…jwAA" },
  ],
  OpenAI: [{ id: "openai-default", label: "OpenAI Default", masked: "sk-••••••••••3d7f" }],
};

export const TOOL_CATALOG = [
  { category: "Knowledge", tools: ["vector_search", "storage_browse", "storage_read", "get_file_content"] },
  { category: "Web", tools: ["web_search", "web_fetch"] },
  { category: "Code", tools: ["github_issue", "github_pr", "run_command"] },
  { category: "Cloud", tools: ["aws_ec2", "aws_s3", "k8s_describe"] },
  { category: "Comms", tools: ["send_email", "slack_post"] },
];

export const ALL_TOOLS = TOOL_CATALOG.flatMap((c) => c.tools);

/** Vector databases and their collections, for RAG configuration. */
export const VECTOR_DBS = [
  { id: "vdb-hr", name: "People & Policy", collections: ["handbook", "benefits", "onboarding"] },
  { id: "vdb-eng", name: "Engineering", collections: ["runbooks", "adr", "postmortems"] },
  { id: "vdb-fin", name: "Finance", collections: ["billing", "contracts"] },
];

export const KNOWLEDGE_SOURCES = [
  { id: "handbook", name: "Employee Handbook 2026", meta: "PDF · 84 pages" },
  { id: "benefits", name: "Benefits FAQ", meta: "Doc · 12 pages" },
  { id: "runbooks", name: "Runbooks", meta: "Hub · 213 docs" },
  { id: "catalog", name: "Service Catalog", meta: "Hub · 48 services" },
  { id: "wiki", name: "Engineering Wiki", meta: "Hub · 1,204 docs" },
  { id: "warehouse", name: "Warehouse: analytics", meta: "Database · 96 tables" },
  { id: "billing", name: "Billing Exports", meta: "Database · 8 tables" },
  { id: "supportkb", name: "Support KB", meta: "Hub · 640 articles" },
];

/* ── records ─────────────────────────────────────────────────────────────── */

const f = (path, content) => ({ path, content });

const agent = (a) => ({
  slug: a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  runtime: null,
  release: null,
  targets: [],
  toolCount: 0,
  granted: [],
  knowledge: [],
  vectorDbId: "",
  collections: [],
  ragMode: false,
  vectorSearch: false,
  quickPrompts: [],
  apiTokenId: "",
  temperature: 0.7,
  maxTokens: 4096,
  maxIterations: 10,
  status: "idle",
  visibility: "private",
  successRate: 90,
  lastRun: "—",
  installs: 0,
  owner: "Platform",
  releaseNotes: [],
  ...a,
});

const INSTR = (name, body) => `# ${name}\n\n${body}\n`;

export const AGENTS_V2 = [
  agent({
    id: "a-eks",
    name: "EKS Provisioning",
    description:
      "Provisions and tears down EKS clusters with eksctl, including IAM roles and node group sizing.",
    category: "Engineering",
    origin: "skill",
    release: { version: "2.4.0", published: "6 days ago" },
    targets: ["claude", "codex", "cursor"],
    tools: "none",
    status: "idle",
    visibility: "public",
    successRate: 94,
    lastRun: "6 days ago",
    installs: 1284,
    files: [
      f("AGENT.md", INSTR("EKS Provisioning", "Provision and tear down EKS clusters with eksctl.\n\nAlways confirm the target account before creating anything.")),
      f("references/eksctl.md", "# eksctl\n\nCommon flags and cluster config examples.\n"),
      f("references/iam.md", "# IAM\n\nRoles and trust policies required for node groups.\n"),
      f("scripts/preflight.sh", "#!/usr/bin/env bash\nset -euo pipefail\naws sts get-caller-identity\n"),
      f(".aziron/preparation.yaml", "schema: 1\npreparation:\n  precheck:\n    - id: eksctl\n      label: eksctl installed\n"),
    ],
    updated: "6 days ago",
  }),
  agent({
    id: "a-hr",
    name: "HR Policy Desk",
    description:
      "Answers employee questions from the current handbook, and says plainly when the handbook does not cover something.",
    category: "People",
    origin: "agent",
    runtime: { provider: "Anthropic", model: "Claude Sonnet 4.5" },
    apiTokenId: "anthropic-default",
    tools: "scoped",
    granted: ["vector_search", "storage_read", "get_file_content"],
    knowledge: ["Employee Handbook 2026", "Benefits FAQ"],
    vectorDbId: "vdb-hr",
    collections: ["handbook", "benefits"],
    ragMode: true,
    vectorSearch: true,
    quickPrompts: [
      { label: "Time off", prompt: "How much annual leave do I get?" },
      { label: "Expenses", prompt: "What is the expense claim process?" },
    ],
    status: "active",
    successRate: 98,
    lastRun: "2 hours ago",
    owner: "People Ops",
    files: [f("AGENT.md", INSTR("HR Policy Desk", "Answer employee questions from the handbook.\n\nQuote the relevant section. When the handbook does not cover something, say so rather than guessing."))],
    updated: "2 hours ago",
  }),
  agent({
    id: "a-incident",
    name: "Incident Commander",
    description:
      "Runs the incident bridge: triages severity, opens the ticket, drafts the status page update, and keeps the timeline.",
    category: "Operations",
    origin: "both",
    runtime: { provider: "Anthropic", model: "Claude Opus 4.5" },
    apiTokenId: "anthropic-rnd",
    release: { version: "1.2.0", published: "3 weeks ago" },
    targets: ["claude", "codex"],
    tools: "scoped",
    granted: ["github_issue", "slack_post", "send_email", "web_fetch", "vector_search"],
    knowledge: ["Runbooks", "Service Catalog"],
    vectorDbId: "vdb-eng",
    collections: ["runbooks"],
    ragMode: true,
    status: "active",
    visibility: "public",
    successRate: 96,
    lastRun: "3 days ago",
    installs: 412,
    owner: "SRE",
    files: [
      f("AGENT.md", INSTR("Incident Commander", "Run the incident bridge end to end.")),
      f("references/severity.md", "# Severity matrix\n\nSEV1 through SEV4 with examples.\n"),
      f("workflows/bridge.md", "# Bridge workflow\n\n1. Triage\n2. Open ticket\n3. Status page\n"),
      f(".aziron/preparation.yaml", "schema: 1\npreparation:\n  precheck:\n    - id: gh\n      label: gh CLI installed\n"),
    ],
    updated: "3 days ago",
  }),
  agent({
    id: "a-sast",
    name: "SAST Finding Triage",
    description:
      "Reads static-analysis output, drops the false positives with a reason, and files what is left with a reproduction.",
    category: "Security",
    origin: "skill",
    release: { version: "3.1.1", published: "yesterday" },
    targets: ["claude", "codex", "copilot", "cursor"],
    tools: "none",
    status: "idle",
    visibility: "public",
    successRate: 91,
    lastRun: "yesterday",
    installs: 2140,
    owner: "AppSec",
    files: [
      f("AGENT.md", INSTR("SAST Finding Triage", "Triage static-analysis findings.")),
      f("references/rulesets.md", "# Rulesets\n\nWhich rules matter and which are noise.\n"),
      f("references/triage-matrix.md", "# Triage matrix\n\nSeverity against exploitability.\n"),
    ],
    updated: "yesterday",
  }),
  agent({
    id: "a-revenue",
    name: "Revenue Analyst",
    description: "Answers questions about ARR, churn and pipeline against the warehouse, and shows the query it ran.",
    category: "Finance",
    origin: "agent",
    runtime: { provider: "OpenAI", model: "GPT-5" },
    apiTokenId: "openai-default",
    tools: "open",
    knowledge: ["Warehouse: analytics", "Finance Wiki"],
    vectorDbId: "vdb-fin",
    collections: ["billing"],
    ragMode: true,
    vectorSearch: true,
    status: "active",
    successRate: 89,
    lastRun: "5 hours ago",
    owner: "Finance",
    files: [f("AGENT.md", INSTR("Revenue Analyst", "Answer revenue questions from the warehouse. Always show the query."))],
    updated: "5 hours ago",
  }),
  agent({
    id: "a-migration",
    name: "DB Migration Author",
    description:
      "Writes reversible goose migrations, checks them against the current schema, and flags anything that locks a table.",
    category: "Engineering",
    origin: "skill",
    release: { version: "1.8.0", published: "2 weeks ago" },
    targets: ["claude", "cursor"],
    tools: "none",
    successRate: 93,
    lastRun: "2 weeks ago",
    installs: 733,
    files: [
      f("AGENT.md", INSTR("DB Migration Author", "Write reversible goose migrations.")),
      f("references/goose.md", "# goose\n\nUp/Down conventions.\n"),
      f("references/locking.md", "# Locking\n\nOperations that take an ACCESS EXCLUSIVE lock.\n"),
    ],
    updated: "2 weeks ago",
  }),
  agent({
    id: "a-onboard",
    name: "Onboarding Buddy",
    description: "Walks a new joiner through their first week: accounts, reading, and who to meet.",
    category: "People",
    origin: "agent",
    runtime: { provider: "Anthropic", model: "Claude Haiku 4.5" },
    apiTokenId: "anthropic-default",
    tools: "none",
    knowledge: ["Onboarding Hub"],
    quickPrompts: [{ label: "Week one", prompt: "What should I do in my first week?" }],
    successRate: 85,
    lastRun: "1 month ago",
    owner: "People Ops",
    files: [f("AGENT.md", INSTR("Onboarding Buddy", "Guide a new joiner through week one."))],
    updated: "1 month ago",
  }),
  agent({
    id: "a-costs",
    name: "Cloud Cost Optimiser",
    description: "Finds idle and oversized resources across accounts, and estimates what each change would actually save.",
    category: "Data",
    origin: "both",
    runtime: { provider: "Automatic", model: "Auto" },
    apiTokenId: "auto",
    release: { version: "0.9.0", published: "4 days ago" },
    targets: ["claude"],
    tools: "scoped",
    granted: ["aws_ec2", "aws_s3", "vector_search", "web_search"],
    knowledge: ["Billing Exports"],
    vectorDbId: "vdb-fin",
    collections: ["billing"],
    ragMode: true,
    status: "active",
    successRate: 88,
    lastRun: "4 days ago",
    installs: 96,
    files: [
      f("AGENT.md", INSTR("Cloud Cost Optimiser", "Find idle and oversized resources.")),
      f("references/rightsizing.md", "# Rightsizing\n\nInstance families and when to downshift.\n"),
      f(".aziron/preparation.yaml", "schema: 1\npreparation:\n  precheck:\n    - id: aws\n      label: AWS CLI installed\n"),
    ],
    updated: "4 days ago",
  }),
  agent({
    id: "a-a11y",
    name: "Accessibility Audit",
    description: "Audits a page against WCAG 2.2 AA, and opens one pull request per fix rather than one giant one.",
    category: "Engineering",
    origin: "skill",
    release: { version: "2.0.0", published: "1 week ago" },
    targets: ["claude", "codex", "copilot"],
    tools: "none",
    visibility: "public",
    successRate: 97,
    lastRun: "1 week ago",
    installs: 1567,
    files: [
      f("AGENT.md", INSTR("Accessibility Audit", "Audit against WCAG 2.2 AA.")),
      f("references/wcag.md", "# WCAG 2.2 AA\n\nThe criteria that actually get failed.\n"),
      f("workflows/audit-to-pr.md", "# Audit to PR\n\nOne PR per fix.\n"),
    ],
    updated: "1 week ago",
  }),
  agent({
    id: "a-support",
    name: "Support Escalation",
    description: "Reads a ticket thread, decides whether it clears the escalation bar, and drafts the handoff if it does.",
    category: "Operations",
    origin: "agent",
    runtime: { provider: "Anthropic", model: "Claude Sonnet 4.5" },
    apiTokenId: "anthropic-default",
    tools: "open",
    knowledge: ["Support KB"],
    ragMode: true,
    status: "error",
    successRate: 62,
    lastRun: "8 hours ago",
    owner: "Support",
    files: [f("AGENT.md", INSTR("Support Escalation", "Decide whether a ticket clears the escalation bar."))],
    updated: "8 hours ago",
  }),
];

/* ── derived helpers ─────────────────────────────────────────────────────── */

export const runsHere = (a) => Boolean(a.runtime);
export const runsAnywhere = (a) => Boolean(a.release);

export const VISIBILITY_FILTERS = [
  { id: "all", label: "All" },
  { id: "public", label: "Public" },
  { id: "private", label: "Private" },
];

/**
 * Filter by where an agent actually runs.
 *
 * "Runs here / runs anywhere" was the right idea stated abstractly — a user
 * scanning a list wants the concrete place, not the category of place. Aziron
 * is simply the first entry: it is where the agent runs when it has a bound
 * runtime, and the other four are where it lands once released.
 *
 * Multi-select with OR, because an agent genuinely runs in several at once and
 * the interesting question is usually "what do I have for Claude Code?".
 */
export const RUNS_IN_FILTERS = [
  { id: "aziron", label: "Aziron", test: runsHere },
  ...TARGETS.map((t) => ({
    id: t.id,
    label: t.name,
    test: (a) => a.targets.includes(t.id),
  })),
];

export function originCounts(list = AGENTS_V2) {
  return list.reduce((acc, a) => ({ ...acc, [a.origin]: (acc[a.origin] ?? 0) + 1 }), {
    agent: 0,
    skill: 0,
    both: 0,
  });
}

export function openToolCount(list = AGENTS_V2) {
  return list.filter((a) => a.tools === "open").length;
}

export function bumpVersion(current, kind) {
  const [maj, min, patch] = (current ?? "0.0.0").split(".").map((n) => parseInt(n, 10) || 0);
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${patch + 1}`;
}

/** The frontmatter block AGENT.md carries, derived from the record. */
export function frontmatterFor(a) {
  const fm = ["---", `name: ${a.name}`, "description: >-", `  ${a.description}`, `category: ${a.category}`];
  if (a.targets?.length) fm.push(`targets: [${a.targets.join(", ")}]`);
  if (a.tools === "scoped") fm.push(`tools: [${a.granted.join(", ")}]`);
  if (a.tools === "open") fm.push("tools: open");
  if (a.release) fm.push(`version: ${a.release.version}`);
  fm.push("---");
  return fm.join("\n");
}
