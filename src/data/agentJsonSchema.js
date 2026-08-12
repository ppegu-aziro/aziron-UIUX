/**
 * What AGENT.json contains, described once.
 *
 * One ordered array, five consumers: the form controls, the JSON
 * autocomplete, the validator, the helper text under each field, and the
 * release manifest. A key described twice is a key that will eventually
 * disagree with itself — the form offering a model the validator rejects — and
 * that is the failure mode of every form-and-code config editor that hand-wrote
 * both halves.
 *
 * So a field is a single object carrying everything anyone needs to know about
 * it, including how to read it off a record and how to write it back.
 *
 * `write` returns a RECORD PATCH rather than a value, which is what lets one
 * control carry its own consequences. Changing the provider has to reset the
 * model and the API token, because a token is keyed by provider and a model
 * belongs to one — that rule lives here, next to the field that triggers it,
 * instead of inside whichever event handler happened to remember it.
 */

import {
  ALL_TOOLS,
  API_TOKENS,
  CATEGORIES,
  KNOWLEDGE_SOURCES,
  PROVIDERS,
  STATUS,
  TARGETS,
  TOOL_CATALOG,
  TOOL_POSTURE,
  VECTOR_DBS,
} from "@/data/agentsV2";

/**
 * Under `.aziron/`, not at the root.
 *
 * AGENT.md is the agent as every host reads it — Claude Code, Codex and Cursor
 * all open it and none of them has ever heard of this file. The configuration
 * here is Aziron's, so it belongs in Aziron's folder, beside the preparation
 * document that is already there. Lowercase to match that neighbour.
 */
export const AGENT_JSON_PATH = ".aziron/agent.json";
export const SCHEMA_ID = "aziron://schemas/agent.v1.json";

/**
 * @typedef {{doc: object, agent: object}} Ctx
 * @typedef {{value: string, label?: string, note?: string, group?: string}} Option
 * @typedef {{path: string, severity: "error"|"warning", message: string,
 *            fix?: {label: string, patch: object}}} Problem
 */

/**
 * @typedef {Object} FieldSpec
 * @property {string} path      Dotted path in the document. Also the React key,
 *   the diagnostic key, and the shared cursor between Form and JSON.
 * @property {string} label
 * @property {string} hint      The form's helper text AND the completion list's
 *   detail row — written once so the two cannot paraphrase apart.
 * @property {"string"|"number"|"boolean"|"enum"|"enumArray"|"objectArray"} type
 * @property {"text"|"textarea"|"select"|"slider"|"number"|"toggle"|"chips"|"prompt-list"} control
 * @property {"package"|"runtime"|"knowledge"|"chat"|"workspace"} section
 * @property {"common"|"advanced"} tier
 * @property {*} fallback       The value when the key is absent. Never undefined:
 *   this is what a deleted line resets to, and what "changed from default" compares against.
 * @property {boolean} [readOnly] Emitted so the file is complete, ignored coming back in.
 * @property {boolean} [open]   Suggestions rather than validation — an off-list value is legal.
 * @property {(agent: object) => *} read
 * @property {(value: *, agent: object) => object} write  A record patch; `{}` when unusable.
 * @property {(ctx: Ctx) => Option[]} [options]
 * @property {(ctx: Ctx) => boolean} [when]  Hidden in the form means absent from the document.
 * @property {(ctx: Ctx) => Problem|null} [check]
 */

/** Sections are the emit unit, and the thing the "does it travel?" badge reads. */
export const SECTIONS = [
  {
    id: "package",
    label: "Package",
    note: "Ships with a release. Every install gets exactly this.",
    travels: true,
  },
  {
    id: "runtime",
    label: "Model",
    note: "Aziron only. A released copy uses whatever model its host provides.",
    travels: false,
  },
  {
    id: "knowledge",
    label: "Knowledge",
    note: "Aziron-side retrieval. A released copy answers from its files alone.",
    travels: false,
  },
  { id: "chat", label: "Chat", note: "How this agent is offered in the composer.", travels: false },
  { id: "workspace", label: "Workspace", note: "Where it shows up for your team.", travels: false },
];

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : null);

const norm = (x) => String(x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Edit distance, capped — anything further apart than a typo is not a suggestion. */
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    if (Math.min(...row) > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

/**
 * The catalogue entry someone probably meant.
 *
 * Case and punctuation first — "Open" for "open" is the commonest mistake once
 * the values are typed by hand rather than clicked — then a one or two
 * character typo, which is what turns "not a known tool" into a repair button.
 */
const near = (v, list) => {
  const q = norm(v);
  if (!q) return null;
  return (
    list.find((x) => norm(x) === q) ??
    list.find((x) => within(q, norm(x), q.length > 6 ? 2 : 1)) ??
    null
  );
};

/** @type {FieldSpec[]} */
export const FIELDS = [
  /* ── package ───────────────────────────────────────────────────────────── */
  {
    path: "package.name",
    label: "Name",
    hint: "What this agent is called, in the catalog and in the install command.",
    type: "string",
    control: "text",
    section: "package",
    tier: "common",
    fallback: "",
    read: (a) => a.name ?? "",
    // Must arrive as a real record key: `patch` re-derives the slug by comparing
    // name against the previous one, and a slug that never updates leaves a
    // stale identifier in every install path.
    write: (v) => (typeof v === "string" ? { name: v } : {}),
  },
  {
    path: "package.description",
    label: "Description",
    hint: "What it does. Read by the catalog and used to decide when it is relevant.",
    type: "string",
    control: "textarea",
    section: "package",
    tier: "common",
    fallback: "",
    read: (a) => a.description ?? "",
    write: (v) => (typeof v === "string" ? { description: v } : {}),
  },
  {
    path: "package.category",
    label: "Category",
    hint: "Groups it in the catalog. What v1 called a label.",
    type: "enum",
    control: "select",
    section: "package",
    tier: "common",
    fallback: "Operations",
    read: (a) => a.category ?? "Operations",
    write: (v) => (CATEGORIES.includes(v) ? { category: v } : {}),
    options: () => CATEGORIES.map((c) => ({ value: c })),
    check: ({ doc }) => {
      const v = doc?.package?.category;
      if (!v || CATEGORIES.includes(v)) return null;
      const hit = near(v, CATEGORIES);
      return {
        path: "package.category",
        severity: "error",
        message: `“${v}” is not a category.`,
        fix: hit ? { label: `Use ${hit}`, patch: { category: hit } } : undefined,
      };
    },
  },
  {
    path: "package.targets",
    label: "Installs into",
    hint: "Which tools a release can be installed into. Empty means all of them.",
    type: "enumArray",
    control: "chips",
    section: "package",
    tier: "common",
    fallback: [],
    read: (a) => a.targets ?? [],
    write: (v) => {
      const list = strArray(v);
      return list ? { targets: list.filter((t) => TARGETS.some((x) => x.id === t)) } : {};
    },
    options: () => TARGETS.map((t) => ({ value: t.id, label: t.id, note: t.name })),
    check: ({ doc }) => {
      const bad = (strArray(doc?.package?.targets) ?? []).filter(
        (t) => !TARGETS.some((x) => x.id === t),
      );
      if (!bad.length) return null;
      return {
        path: "package.targets",
        severity: "error",
        message: `${bad.map((b) => `“${b}”`).join(", ")} ${bad.length === 1 ? "is not a" : "are not"} target${bad.length === 1 ? "" : "s"}. Known: ${TARGETS.map((t) => t.id).join(", ")}.`,
        fix: {
          label: "Drop the unknown ones",
          patch: {
            targets: (strArray(doc?.package?.targets) ?? []).filter((t) =>
              TARGETS.some((x) => x.id === t),
            ),
          },
        },
      };
    },
  },
  {
    path: "package.tools.posture",
    label: "Tool access",
    hint: "none · scoped · open. Open means every tool available to whoever runs it.",
    type: "enum",
    control: "select",
    section: "package",
    tier: "common",
    fallback: "none",
    read: (a) => a.tools ?? "none",
    write: (v, a) =>
      TOOL_POSTURE[v] ? { tools: v, granted: v === "scoped" ? (a.granted ?? []) : [] } : {},
    options: () =>
      Object.values(TOOL_POSTURE).map((p) => ({ value: p.id, label: p.id, note: p.blurb })),
    check: ({ doc }) => {
      const v = doc?.package?.tools?.posture;
      if (v && !TOOL_POSTURE[v]) {
        const hit = near(v, Object.keys(TOOL_POSTURE));
        return {
          path: "package.tools.posture",
          severity: "error",
          message: `“${v}” is not a tool posture. Use none, scoped or open.`,
          fix: hit ? { label: `Use ${hit}`, patch: { tools: hit } } : undefined,
        };
      }
      // A warning, not an error: the revoke-X control in the settings panel can
      // already reach this state, so failing it would call shipped agents broken.
      if (v === "scoped" && (doc?.package?.tools?.granted ?? []).length === 0) {
        return {
          path: "package.tools.posture",
          severity: "warning",
          message: "Scoped with nothing granted behaves exactly like no tools.",
          fix: { label: "Switch to none", patch: { tools: "none", granted: [] } },
        };
      }
      return null;
    },
  },
  {
    path: "package.tools.granted",
    label: "Granted tools",
    hint: "The explicit allow-list. Only these can be called.",
    type: "enumArray",
    control: "chips",
    section: "package",
    tier: "common",
    fallback: [],
    // Hidden unless scoped, which is also the assertion that the key must be
    // absent from the document otherwise.
    when: ({ doc, agent }) => (doc?.package?.tools?.posture ?? agent.tools) === "scoped",
    read: (a) => a.granted ?? [],
    write: (v) => {
      const list = strArray(v);
      return list ? { granted: list.filter((t) => ALL_TOOLS.includes(t)) } : {};
    },
    options: () =>
      TOOL_CATALOG.flatMap((c) => c.tools.map((t) => ({ value: t, group: c.category }))),
    check: ({ doc }) => {
      const list = strArray(doc?.package?.tools?.granted) ?? [];
      const bad = list.filter((t) => !ALL_TOOLS.includes(t));
      if (!bad.length) return null;
      const hit = near(bad[0], ALL_TOOLS);
      return {
        path: "package.tools.granted",
        severity: "error",
        message: `${bad.map((b) => `“${b}”`).join(", ")} ${bad.length === 1 ? "is not a known tool" : "are not known tools"}.`,
        // Always a real patch: a repair that has to splice text would be the one
        // place the form writes into the document, which is the thing this
        // design exists to avoid.
        fix: hit
          ? {
              label: `Use ${hit}`,
              patch: { granted: list.map((t) => (t === bad[0] ? hit : t)).filter((t) => ALL_TOOLS.includes(t)) },
            }
          : {
              label: "Drop the unknown ones",
              patch: { granted: list.filter((t) => ALL_TOOLS.includes(t)) },
            },
      };
    },
  },
  {
    path: "package.version",
    label: "Version",
    hint: "Set by releasing. A version you can type is a version that means nothing.",
    type: "string",
    control: "text",
    section: "package",
    tier: "common",
    fallback: "",
    readOnly: true,
    read: (a) => a.release?.version ?? "",
    write: () => ({}),
  },

  /* ── runtime ───────────────────────────────────────────────────────────── */
  {
    path: "runtime.provider",
    label: "Provider",
    // The trap, stated where both surfaces read it: the record stores the
    // display name, and API_TOKENS is keyed by that same name.
    hint: "The vendor name as shown — “Anthropic”, never “anthropic”.",
    type: "enum",
    control: "select",
    section: "runtime",
    tier: "common",
    fallback: "",
    read: (a) => a.runtime?.provider ?? "",
    write: (v, a) => {
      // Absent means unbound, which is the honest reading of deleting the block.
      if (!v) return { runtime: null, apiTokenId: "" };
      const p = PROVIDERS.find((x) => x.name === v);
      if (!p) return {};
      // Keeping a model the new provider does not serve renders an empty Select
      // that explains nothing, so it resets here rather than in one handler.
      const keep = p.models.some((m) => m.id === a.runtime?.model);
      return {
        runtime: { provider: v, model: keep ? a.runtime.model : p.models[0].id },
        apiTokenId: (API_TOKENS[v] ?? [])[0]?.id ?? "",
      };
    },
    options: () => PROVIDERS.map((p) => ({ value: p.name })),
    check: ({ doc }) => {
      const v = doc?.runtime?.provider;
      if (!v || PROVIDERS.some((p) => p.name === v)) return null;
      const byId = PROVIDERS.find((p) => p.id === String(v).toLowerCase());
      return {
        path: "runtime.provider",
        severity: "error",
        message: byId
          ? `“${v}” is the provider's id. This field takes the name.`
          : `“${v}” is not a provider.`,
        fix: byId
          ? {
              label: `Use ${byId.name}`,
              patch: {
                runtime: { provider: byId.name, model: byId.models[0].id },
                apiTokenId: (API_TOKENS[byId.name] ?? [])[0]?.id ?? "",
              },
            }
          : undefined,
      };
    },
  },
  {
    path: "runtime.model",
    label: "Model",
    hint: "Only models the chosen provider serves.",
    type: "enum",
    control: "select",
    section: "runtime",
    tier: "common",
    fallback: "",
    when: ({ doc, agent }) => Boolean(doc?.runtime?.provider ?? agent.runtime?.provider),
    read: (a) => a.runtime?.model ?? "",
    // An empty model is not a decision, it is a deleted line — and the provider
    // write immediately above has already chosen a valid one. Writing "" here
    // would overwrite that with nothing and leave a bound runtime with no model.
    write: (v, a) => (a.runtime && typeof v === "string" && v ? { runtime: { ...a.runtime, model: v } } : {}),
    // Resolved at edit time from the live catalogue, and falling back to the
    // record: the document does not parse while you are mid-string, which is
    // exactly when the suggestion is wanted.
    options: ({ doc, agent }) => {
      const name = doc?.runtime?.provider ?? agent.runtime?.provider;
      return (PROVIDERS.find((p) => p.name === name)?.models ?? []).map((m) => ({
        value: m.id,
        note: m.note,
      }));
    },
    check: ({ doc }) => {
      const name = doc?.runtime?.provider;
      const id = doc?.runtime?.model;
      const p = PROVIDERS.find((x) => x.name === name);
      if (!p || !id || p.models.some((m) => m.id === id)) return null;
      return {
        path: "runtime.model",
        severity: "error",
        message: `${p.name} does not serve “${id}”.`,
        fix: {
          label: `Use ${p.models[0].id}`,
          patch: { runtime: { provider: p.name, model: p.models[0].id } },
        },
      };
    },
  },
  {
    path: "runtime.apiToken",
    label: "API token",
    hint: "The id of a saved credential — never the secret itself. Stays on the runtime.",
    type: "enum",
    control: "select",
    section: "runtime",
    tier: "advanced",
    fallback: "",
    when: ({ doc, agent }) => Boolean(doc?.runtime?.provider ?? agent.runtime?.provider),
    read: (a) => a.apiTokenId ?? "",
    // Same reasoning as the model: absent means "whatever the provider chose",
    // not "no credential".
    write: (v) => (typeof v === "string" && v ? { apiTokenId: v } : {}),
    options: ({ doc, agent }) => {
      const name = doc?.runtime?.provider ?? agent.runtime?.provider;
      return (API_TOKENS[name] ?? []).map((t) => ({ value: t.id, note: `${t.label} · ${t.masked}` }));
    },
    check: ({ doc }) => {
      const name = doc?.runtime?.provider;
      const id = doc?.runtime?.apiToken;
      const list = API_TOKENS[name];
      if (!list || !id || list.some((t) => t.id === id)) return null;
      return {
        path: "runtime.apiToken",
        severity: "error",
        message: `“${id}” is not a saved credential for ${name}.`,
        fix: list[0] ? { label: `Use ${list[0].label}`, patch: { apiTokenId: list[0].id } } : undefined,
      };
    },
  },
  {
    path: "runtime.temperature",
    label: "Temperature",
    hint: "0 is repeatable, 1 is varied. Between 0 and 1.",
    type: "number",
    control: "slider",
    section: "runtime",
    tier: "advanced",
    fallback: 0.7,
    when: ({ doc, agent }) => Boolean(doc?.runtime?.provider ?? agent.runtime?.provider),
    read: (a) => a.temperature ?? 0.7,
    write: (v) => {
      const n = num(v);
      return n !== null && n >= 0 && n <= 1 ? { temperature: n } : {};
    },
    check: ({ doc }) => {
      const v = doc?.runtime?.temperature;
      if (v === undefined || (num(v) !== null && v >= 0 && v <= 1)) return null;
      return {
        path: "runtime.temperature",
        severity: "error",
        message: `Temperature is a number between 0 and 1, not ${JSON.stringify(v)}.`,
        fix: { label: "Reset to 0.7", patch: { temperature: 0.7 } },
      };
    },
  },
  {
    path: "runtime.maxTokens",
    label: "Max tokens",
    hint: "The longest answer it may produce in one turn.",
    type: "number",
    control: "number",
    section: "runtime",
    tier: "advanced",
    fallback: 4096,
    when: ({ doc, agent }) => Boolean(doc?.runtime?.provider ?? agent.runtime?.provider),
    read: (a) => a.maxTokens ?? 4096,
    write: (v) => {
      const n = num(v);
      return n !== null && n > 0 ? { maxTokens: Math.round(n) } : {};
    },
  },
  {
    path: "runtime.maxIterations",
    label: "Max iterations",
    hint: "How many tool round-trips it may take before it must answer.",
    type: "number",
    control: "number",
    section: "runtime",
    tier: "advanced",
    fallback: 10,
    when: ({ doc, agent }) => Boolean(doc?.runtime?.provider ?? agent.runtime?.provider),
    read: (a) => a.maxIterations ?? 10,
    write: (v) => {
      const n = num(v);
      return n !== null && n > 0 ? { maxIterations: Math.round(n) } : {};
    },
  },

  /* ── knowledge ─────────────────────────────────────────────────────────── */
  {
    path: "knowledge.sources",
    label: "Sources",
    hint: "What it answers from, by name. Anything not in the catalogue is kept as typed.",
    type: "enumArray",
    control: "chips",
    section: "knowledge",
    tier: "common",
    // Open on purpose: two shipped agents carry sources absent from the
    // catalogue, and validating this field would delete them.
    open: true,
    fallback: [],
    read: (a) => a.knowledge ?? [],
    write: (v) => (strArray(v) ? { knowledge: strArray(v) } : {}),
    options: () => KNOWLEDGE_SOURCES.map((s) => ({ value: s.name, note: s.meta })),
  },
  {
    path: "knowledge.vectorDb",
    label: "Vector database",
    hint: "Which database retrieval searches. Empty means none.",
    type: "enum",
    control: "select",
    section: "knowledge",
    tier: "common",
    fallback: "",
    read: (a) => a.vectorDbId ?? "",
    // Collections belong to one database, so switching clears them rather than
    // leaving names that match nothing.
    write: (v) =>
      v === "" || VECTOR_DBS.some((d) => d.id === v) ? { vectorDbId: v, collections: [] } : {},
    options: () => VECTOR_DBS.map((d) => ({ value: d.id, note: d.name })),
    check: ({ doc }) => {
      const v = doc?.knowledge?.vectorDb;
      if (!v || VECTOR_DBS.some((d) => d.id === v)) return null;
      const hit = near(v, VECTOR_DBS.map((d) => d.id));
      return {
        path: "knowledge.vectorDb",
        severity: "error",
        message: `“${v}” is not a vector database.`,
        fix: hit ? { label: `Use ${hit}`, patch: { vectorDbId: hit, collections: [] } } : undefined,
      };
    },
  },
  {
    path: "knowledge.collections",
    label: "Collections",
    hint: "Narrows retrieval to part of the database.",
    type: "enumArray",
    control: "chips",
    section: "knowledge",
    tier: "common",
    fallback: [],
    when: ({ doc, agent }) => Boolean(doc?.knowledge?.vectorDb ?? agent.vectorDbId),
    read: (a) => a.collections ?? [],
    write: (v, a) => {
      const list = strArray(v);
      if (!list) return {};
      const db = VECTOR_DBS.find((d) => d.id === a.vectorDbId);
      return { collections: db ? list.filter((c) => db.collections.includes(c)) : [] };
    },
    options: ({ doc, agent }) => {
      const id = doc?.knowledge?.vectorDb ?? agent.vectorDbId;
      return (VECTOR_DBS.find((d) => d.id === id)?.collections ?? []).map((c) => ({ value: c }));
    },
    check: ({ doc }) => {
      const id = doc?.knowledge?.vectorDb;
      const db = VECTOR_DBS.find((d) => d.id === id);
      if (!db) return null;
      const bad = (strArray(doc?.knowledge?.collections) ?? []).filter(
        (c) => !db.collections.includes(c),
      );
      if (!bad.length) return null;
      return {
        path: "knowledge.collections",
        severity: "error",
        message: `${bad.map((b) => `“${b}”`).join(", ")} ${bad.length === 1 ? "is" : "are"} not in ${db.name}. It has ${db.collections.join(", ")}.`,
        fix: {
          label: "Drop them",
          patch: {
            collections: (strArray(doc?.knowledge?.collections) ?? []).filter((c) =>
              db.collections.includes(c),
            ),
          },
        },
      };
    },
  },
  {
    path: "knowledge.ragMode",
    label: "RAG mode",
    hint: "Retrieve before answering, and cite what was retrieved.",
    type: "boolean",
    control: "toggle",
    section: "knowledge",
    tier: "common",
    fallback: false,
    read: (a) => Boolean(a.ragMode),
    write: (v) => (typeof v === "boolean" ? { ragMode: v } : {}),
    check: ({ doc }) =>
      doc?.knowledge?.ragMode && !doc?.knowledge?.vectorDb
        ? {
            path: "knowledge.ragMode",
            severity: "warning",
            message: "RAG is on with no vector database, so there is nothing to retrieve from.",
          }
        : null,
  },
  {
    path: "knowledge.vectorSearch",
    label: "Vector search",
    hint: "Semantic search across the selected collections.",
    type: "boolean",
    control: "toggle",
    section: "knowledge",
    tier: "common",
    fallback: false,
    read: (a) => Boolean(a.vectorSearch),
    write: (v) => (typeof v === "boolean" ? { vectorSearch: v } : {}),
  },

  /* ── chat ──────────────────────────────────────────────────────────────── */
  {
    path: "chat.quickPrompts",
    label: "Quick prompts",
    hint: "Starter buttons above the composer. Each needs a label and a prompt.",
    type: "objectArray",
    control: "prompt-list",
    section: "chat",
    tier: "common",
    fallback: [],
    read: (a) => a.quickPrompts ?? [],
    write: (v) => {
      if (!Array.isArray(v)) return {};
      const clean = v
        .filter((q) => q && typeof q.label === "string" && typeof q.prompt === "string")
        .map((q) => ({ label: q.label, prompt: q.prompt }));
      return { quickPrompts: clean };
    },
    // The one array-of-objects in the document, so the one shape a first-time
    // JSON author is guaranteed to get wrong. Completion inserts it filled in.
    snippet: '[{ "label": "", "prompt": "" }]',
    check: ({ doc }) => {
      const v = doc?.chat?.quickPrompts;
      if (!Array.isArray(v)) return null;
      const bad = v.findIndex((q) => !q || typeof q.label !== "string" || typeof q.prompt !== "string");
      if (bad === -1) return null;
      return {
        path: "chat.quickPrompts",
        severity: "error",
        message: `Quick prompt ${bad + 1} needs a "label" and a "prompt", both text.`,
      };
    },
  },

  /* ── workspace ─────────────────────────────────────────────────────────── */
  {
    path: "workspace.status",
    label: "Status",
    hint: "The dot in the catalog. active · idle · error · disabled.",
    type: "enum",
    control: "select",
    section: "workspace",
    tier: "common",
    fallback: "idle",
    read: (a) => a.status ?? "idle",
    write: (v) => (STATUS[v] ? { status: v } : {}),
    options: () => Object.entries(STATUS).map(([id, s]) => ({ value: id, note: s.label })),
    check: ({ doc }) => {
      const v = doc?.workspace?.status;
      if (!v || STATUS[v]) return null;
      const hit = near(v, Object.keys(STATUS));
      return {
        path: "workspace.status",
        severity: "error",
        message: `“${v}” is not a status. Use ${Object.keys(STATUS).join(", ")}.`,
        fix: hit ? { label: `Use ${hit}`, patch: { status: hit } } : undefined,
      };
    },
  },
  {
    path: "workspace.visibility",
    label: "Visibility",
    hint: "Public agents are installable by anyone in the org.",
    type: "enum",
    control: "select",
    section: "workspace",
    tier: "common",
    fallback: "private",
    read: (a) => a.visibility ?? "private",
    write: (v) => (v === "public" || v === "private" ? { visibility: v } : {}),
    options: () => [
      { value: "private", note: "Only you" },
      { value: "public", note: "Anyone in the org" },
    ],
    check: ({ doc }) => {
      const v = doc?.workspace?.visibility;
      return !v || v === "public" || v === "private"
        ? null
        : {
            path: "workspace.visibility",
            severity: "error",
            message: `“${v}” is not a visibility. Use public or private.`,
          };
    },
  },
];

/* ── lookups ─────────────────────────────────────────────────────────────── */

const BY_PATH = new Map(FIELDS.map((f) => [f.path, f]));

/** @returns {FieldSpec|null} */
export const fieldAt = (path) => BY_PATH.get(path) ?? null;

/** Fields belonging to a section, in document order. */
export const fieldsIn = (section) => FIELDS.filter((f) => f.section === section);

/**
 * Property names legal directly under a dotted prefix.
 *
 * "" gives the top-level sections; "package" gives name, description, …, tools;
 * "package.tools" gives posture and granted. Derived from the field paths so a
 * new field is completable the moment it is described.
 */
export function childKeysOf(prefix) {
  const head = prefix ? `${prefix}.` : "";
  const seen = new Map();
  for (const f of FIELDS) {
    if (!f.path.startsWith(head)) continue;
    const rest = f.path.slice(head.length);
    if (!rest) continue;
    const [key, ...tail] = rest.split(".");
    // A key with more path behind it is an object, not a leaf.
    if (!seen.has(key)) seen.set(key, tail.length ? null : f);
  }
  return [...seen.entries()].map(([key, spec]) => ({ key, spec }));
}

/** The document keys this schema owns, so anything else can be reported as unknown. */
export const TOP_LEVEL_KEYS = ["$schema", ...SECTIONS.map((s) => s.id), "metadata"];
