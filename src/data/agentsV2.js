/**
 * Seed data for the unified Agents (v2) concept.
 *
 * The whole point of the model is that "agent" and "skill" were never two
 * kinds of thing — they were two HALVES of one thing. An agent had a runtime
 * (model, tools, knowledge) and no way to travel. A skill had a package
 * (files, versions, targets) and no runtime at all.
 *
 * So every record here carries both halves, and `origin` records which half it
 * arrived with. Nothing in the UI keys off `origin` except the migration
 * explainer — it exists to prove the mapping, not to preserve the distinction.
 */

/** Where an agent can run besides Aziron. Mirrors the CLI's provider tags. */
export const TARGETS = [
  { id: "claude", name: "Claude Code", format: "skill", path: "~/.claude/skills/" },
  { id: "codex", name: "Codex", format: "skill", path: "~/.codex/skills/" },
  { id: "copilot", name: "GitHub Copilot", format: "skill", path: "~/.copilot/skills/" },
  { id: "cursor", name: "Cursor", format: "rule", path: "~/.cursor/rules/" },
];

export const TARGET_BY_ID = Object.fromEntries(TARGETS.map((t) => [t.id, t]));

/**
 * Tool posture — the one runtime difference that actually existed between the
 * two old types, promoted to a first-class, filterable property.
 *
 * `open` is deliberately styled as a warning. Today an empty allow-list means
 * *every* tool, and nothing in the product surfaces that. An admin cannot
 * currently answer "which agents can reach everything?" at all.
 */
export const TOOL_POSTURE = {
  open: {
    id: "open",
    label: "Open",
    tone: "warning",
    blurb: "Can use every tool available to the caller.",
  },
  scoped: {
    id: "scoped",
    label: "Scoped",
    tone: "success",
    blurb: "Limited to an explicit list of tools.",
  },
  none: {
    id: "none",
    label: "No tools",
    tone: "muted",
    blurb: "Instructions only — cannot call anything.",
  },
};

export const CATEGORIES = [
  "Engineering",
  "Security",
  "Data",
  "Operations",
  "People",
  "Finance",
];

/**
 * Models offered when binding a runtime.
 *
 * "Auto" is listed first and deliberately framed as a real choice rather than
 * a fallback — for most agents it is the correct answer, and making a user
 * pick a specific model before they know what the agent does is the mistake
 * the old 4-step wizard made.
 */
export const PROVIDERS = [
  {
    id: "auto",
    name: "Automatic",
    models: [{ id: "Auto", note: "Picks a model per request by complexity" }],
  },
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

/** Tools an agent can be granted, grouped the way the picker shows them. */
export const TOOL_CATALOG = [
  {
    category: "Knowledge",
    tools: ["vector_search", "storage_browse", "storage_read", "get_file_content"],
  },
  { category: "Web", tools: ["web_search", "web_fetch"] },
  { category: "Code", tools: ["github_issue", "github_pr", "run_command"] },
  { category: "Cloud", tools: ["aws_ec2", "aws_s3", "k8s_describe"] },
  { category: "Comms", tools: ["send_email", "slack_post"] },
];

export const ALL_TOOLS = TOOL_CATALOG.flatMap((c) => c.tools);

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

/** semver bump used by the release dialog. */
export function bumpVersion(current, kind) {
  const [maj, min, patch] = (current ?? "0.0.0").split(".").map((n) => parseInt(n, 10) || 0);
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${patch + 1}`;
}

/** One agent record. Both halves always present; either may be null. */
const agent = ({
  id,
  name,
  description,
  category,
  origin,
  runtime = null,
  release = null,
  targets = [],
  tools,
  toolCount = 0,
  knowledge = [],
  files,
  updated,
  installs = 0,
  owner = "Platform",
}) => ({
  id,
  slug: name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, ""),
  name,
  description,
  category,
  origin,
  runtime,
  release,
  targets,
  tools,
  toolCount,
  knowledge,
  files,
  updated,
  installs,
  owner,
});

/**
 * `origin: "agent"`   — had a runtime, never travelled. Gains the package half.
 * `origin: "skill"`   — travelled, never ran here. Gains the runtime half.
 * `origin: "both"`    — authored after unification, or filled in since.
 */
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
    files: ["AGENT.md", "references/eksctl.md", "references/iam.md", ".aziron/preparation.yaml"],
    updated: "6 days ago",
    installs: 1284,
  }),
  agent({
    id: "a-hr",
    name: "HR Policy Desk",
    description:
      "Answers employee questions from the current handbook, and says plainly when the handbook does not cover something.",
    category: "People",
    origin: "agent",
    runtime: { provider: "Anthropic", model: "Claude Sonnet 4.5" },
    tools: "scoped",
    toolCount: 3,
    knowledge: ["Employee Handbook 2026", "Benefits FAQ"],
    files: ["AGENT.md"],
    updated: "2 hours ago",
    owner: "People Ops",
  }),
  agent({
    id: "a-incident",
    name: "Incident Commander",
    description:
      "Runs the incident bridge: triages severity, opens the ticket, drafts the status page update, and keeps the timeline.",
    category: "Operations",
    origin: "both",
    runtime: { provider: "Anthropic", model: "Claude Opus 4.5" },
    release: { version: "1.2.0", published: "3 weeks ago" },
    targets: ["claude", "codex"],
    tools: "scoped",
    toolCount: 11,
    knowledge: ["Runbooks", "Service Catalog"],
    files: ["AGENT.md", "references/severity.md", "workflows/bridge.md", ".aziron/preparation.yaml"],
    updated: "3 days ago",
    installs: 412,
    owner: "SRE",
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
    files: ["AGENT.md", "references/rulesets.md", "references/triage-matrix.md"],
    updated: "yesterday",
    installs: 2140,
    owner: "AppSec",
  }),
  agent({
    id: "a-revenue",
    name: "Revenue Analyst",
    description:
      "Answers questions about ARR, churn and pipeline against the warehouse, and shows the query it ran.",
    category: "Finance",
    origin: "agent",
    runtime: { provider: "OpenAI", model: "GPT-5" },
    tools: "open",
    knowledge: ["Warehouse: analytics", "Finance Wiki"],
    files: ["AGENT.md"],
    updated: "5 hours ago",
    owner: "Finance",
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
    files: ["AGENT.md", "references/goose.md", "references/locking.md"],
    updated: "2 weeks ago",
    installs: 733,
  }),
  agent({
    id: "a-onboard",
    name: "Onboarding Buddy",
    description:
      "Walks a new joiner through their first week: accounts, reading, and who to meet.",
    category: "People",
    origin: "agent",
    runtime: { provider: "Anthropic", model: "Claude Haiku 4.5" },
    tools: "none",
    knowledge: ["Onboarding Hub"],
    files: ["AGENT.md"],
    updated: "1 month ago",
    owner: "People Ops",
  }),
  agent({
    id: "a-costs",
    name: "Cloud Cost Optimiser",
    description:
      "Finds idle and oversized resources across accounts, and estimates what each change would actually save.",
    category: "Data",
    origin: "both",
    runtime: { provider: "OpenAI", model: "Auto" },
    release: { version: "0.9.0", published: "4 days ago" },
    targets: ["claude"],
    tools: "scoped",
    toolCount: 7,
    knowledge: ["Billing Exports"],
    files: ["AGENT.md", "references/rightsizing.md", ".aziron/preparation.yaml"],
    updated: "4 days ago",
    installs: 96,
    owner: "Platform",
  }),
  agent({
    id: "a-a11y",
    name: "Accessibility Audit",
    description:
      "Audits a page against WCAG 2.2 AA, and opens one pull request per fix rather than one giant one.",
    category: "Engineering",
    origin: "skill",
    release: { version: "2.0.0", published: "1 week ago" },
    targets: ["claude", "codex", "copilot"],
    tools: "none",
    files: ["AGENT.md", "references/wcag.md", "workflows/audit-to-pr.md"],
    updated: "1 week ago",
    installs: 1567,
  }),
  agent({
    id: "a-support",
    name: "Support Escalation",
    description:
      "Reads a ticket thread, decides whether it clears the escalation bar, and drafts the handoff if it does.",
    category: "Operations",
    origin: "agent",
    runtime: { provider: "Anthropic", model: "Claude Sonnet 4.5" },
    tools: "open",
    knowledge: ["Support KB"],
    files: ["AGENT.md"],
    updated: "8 hours ago",
    owner: "Support",
  }),
];

/* ── derived helpers ─────────────────────────────────────────────────────── */

export const runsHere = (a) => Boolean(a.runtime);
export const runsAnywhere = (a) => Boolean(a.release);

/** The three facet filters the catalog offers, plus their predicates. */
export const FACET_FILTERS = [
  { id: "all", label: "All agents", test: () => true },
  { id: "here", label: "Runs here", test: runsHere },
  { id: "anywhere", label: "Runs anywhere", test: runsAnywhere },
  { id: "both", label: "Both", test: (a) => runsHere(a) && runsAnywhere(a) },
  { id: "incomplete", label: "Missing a half", test: (a) => !runsHere(a) || !runsAnywhere(a) },
];

/** Counts for the migration explainer — computed, never hand-written. */
export function originCounts(list = AGENTS_V2) {
  return list.reduce(
    (acc, a) => {
      acc[a.origin] = (acc[a.origin] ?? 0) + 1;
      return acc;
    },
    { agent: 0, skill: 0, both: 0 },
  );
}

/** How many agents can reach every tool. The number an admin actually wants. */
export function openToolCount(list = AGENTS_V2) {
  return list.filter((a) => a.tools === "open").length;
}

/**
 * The AGENT.md a given record would have. Rendered in the editor to show that
 * the form and the file are the same bytes, not two stores that must be synced.
 */
export function toAgentMd(a) {
  const fm = ["---", `name: ${a.name}`, `description: >-`, `  ${a.description}`];
  if (a.targets.length) fm.push(`targets: [${a.targets.join(", ")}]`);
  if (a.tools === "scoped") fm.push(`tools: scoped   # ${a.toolCount} granted`);
  if (a.tools === "open") fm.push(`tools: open     # every tool the caller has`);
  if (a.release) fm.push(`version: ${a.release.version}`);
  fm.push("---", "");
  return [...fm, `# ${a.name}`, "", a.description, ""].join("\n");
}
