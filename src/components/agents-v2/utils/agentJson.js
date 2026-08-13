/**
 * AGENT.json, in both directions.
 *
 * The file is a projection: it is serialised from the record on the way out and
 * folded back into a record patch on the way in, and it is never stored. That
 * is what makes the form and the JSON incapable of disagreeing — they are two
 * renderings of one object rather than two copies of one document.
 *
 * It also makes "invalid JSON must never destroy the configuration" a property
 * rather than a promise. The configuration does not live in the text, so a
 * parse failure patches nothing by default; there is no error path to get wrong.
 *
 * Pure functions, no React. The round-trip has to be byte-stable — serialise,
 * parse, serialise again must produce the same bytes — because the unsaved dot
 * and the "did anything actually change?" gate both compare against it.
 */

import { FIELDS, SCHEMA_ID, SECTIONS, TOP_LEVEL_KEYS, fieldsIn } from "@/data/agentJsonSchema";

/* ── record → text ───────────────────────────────────────────────────────── */

const setAt = (root, path, value) => {
  const segs = path.split(".");
  const leaf = segs.pop();
  let node = root;
  for (const s of segs) {
    if (!node[s] || typeof node[s] !== "object") node[s] = {};
    node = node[s];
  }
  node[leaf] = value;
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Build the document object for an agent.
 *
 * Emission is decided per SECTION, not per field: a section appears when any of
 * its fields differs from its fallback, and then all of that section's fields
 * appear. Per-field would give a file full of half-stated blocks — a runtime
 * with a model and no temperature reads as though temperature were unset rather
 * than default — while all-fields-always buries the four decisions someone
 * actually made under twenty they never touched.
 *
 * So an instructions-only agent gets a six-line file, and one with a model gets
 * a complete runtime block.
 */
export function toDoc(agent) {
  const doc = { $schema: SCHEMA_ID };
  const ctx = { doc: {}, agent };

  for (const section of SECTIONS) {
    const specs = fieldsIn(section.id).filter((f) => !f.when || f.when(ctx));
    const touched = specs.some((f) => !same(f.read(agent), f.fallback));
    if (!touched) continue;
    for (const f of specs) {
      // A read-only field at its fallback is noise: `"version": ""` on an
      // unreleased agent states nothing and invites someone to fill it in.
      if (f.readOnly && same(f.read(agent), f.fallback)) continue;
      setAt(doc, f.path, f.read(agent));
    }
  }

  // Anything the user added that the schema does not own, kept verbatim. A
  // config file that silently drops what you wrote into it is worse than one
  // that refuses it.
  if (agent.metadata && Object.keys(agent.metadata).length) doc.metadata = agent.metadata;
  return doc;
}

/**
 * Format a document the way the file is stored.
 *
 * Hand-rolled rather than `JSON.stringify(x, null, 2)` for one reason: arrays of
 * short primitives stay on one line. It matters because the side-by-side view's
 * whole claim is that a form edit moves one visible line, and an expanded array
 * turns toggling a target into a three-line structural change.
 */
function format(value, indent = 0) {
  const pad = "  ".repeat(indent);
  const padIn = "  ".repeat(indent + 1);

  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const flat = value.every((v) => v === null || typeof v !== "object");
    if (flat) {
      const inline = `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
      if (pad.length + inline.length <= 72) return inline;
    }
    return `[\n${value.map((v) => padIn + format(v, indent + 1)).join(",\n")}\n${pad}]`;
  }

  const keys = Object.keys(value);
  if (!keys.length) return "{}";
  const body = keys
    .map((k) => `${padIn}${JSON.stringify(k)}: ${format(value[k], indent + 1)}`)
    .join(",\n");
  return `{\n${body}\n${pad}}`;
}

/** The canonical text for an agent. Stable: same record in, same bytes out. */
export function serialiseAgentJson(agent) {
  return `${format(toDoc(agent))}\n`;
}

/* ── text → record ───────────────────────────────────────────────────────── */

const readAtPath = (doc, path) => {
  let node = doc;
  for (const s of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[s];
  }
  return node;
};

const nearest = (word, list) => {
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
  const q = norm(word);
  return (
    list.find((x) => norm(x) === q) ??
    list.find((x) => norm(x).startsWith(q) || q.startsWith(norm(x))) ??
    null
  );
};

/**
 * Values that look like a live credential rather than a reference.
 *
 * The common case is safe by construction — the token field holds an id and the
 * serialiser never emits a secret — so this exists for the freeform fields,
 * where someone pastes a key into a description because it was to hand.
 */
export function looksLikeSecret(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v || v.includes("{{") || /[•…]/.test(v)) return false; // a reference or a mask
  return (
    /\bsk-ant-[A-Za-z0-9_-]{16,}/.test(v) ||
    /\bsk-[A-Za-z0-9]{20,}/.test(v) ||
    /\bghp_[A-Za-z0-9]{20,}/.test(v) ||
    /\bgithub_pat_[A-Za-z0-9_]{20,}/.test(v) ||
    /\bxox[baprs]-[A-Za-z0-9-]{10,}/.test(v) ||
    /\bAKIA[0-9A-Z]{16}\b/.test(v) ||
    /\bAIza[0-9A-Za-z_-]{30,}/.test(v)
  );
}

/** What kind of credential it looks like, so copy can name it without printing it. */
const KIND_OF = (v) =>
  /\bsk-ant-/.test(v) ? "An Anthropic key"
  : /\bsk-[A-Za-z0-9]{20,}/.test(v) ? "An OpenAI key"
  : /\b(ghp_|github_pat_)/.test(v) ? "A GitHub token"
  : /\bxox[baprs]-/.test(v) ? "A Slack token"
  : /\bAKIA[0-9A-Z]{16}\b/.test(v) ? "An AWS key"
  : /\bAIza/.test(v) ? "A Google key"
  : "A credential";

/**
 * Credentials in a body of text, line by line.
 *
 * `looksLikeSecret` answers about ONE value and skips anything containing a
 * vault reference, because a reference is not a secret. That is right for a
 * scalar and fails open on a whole file: a single {{NAME}} anywhere would
 * switch the scan off for the entire body — on precisely the files that use
 * the vault, which is the idiom this product recommends. Measured on a file
 * holding both a reference and a live token, the whole-body test returns false
 * and this returns the token's line.
 *
 * So the references come out first and every line is judged on its own.
 *
 * @returns {Array<{line: number, kind: string}>} 1-based lines
 */
export function secretsIn(text) {
  const out = [];
  String(text ?? "")
    .split("\n")
    .forEach((line, i) => {
      const bare = line.replace(/\{\{[^}]*\}\}/g, "");
      if (looksLikeSecret(bare)) out.push({ line: i + 1, kind: KIND_OF(bare) });
    });
  return out;
}

const walkStrings = (node, path, out) => {
  if (typeof node === "string") {
    // Through the same primitive as the release gate, so the two cannot drift:
    // a value the config editor flags must be one a release refuses, and the
    // multi-line case is exactly where they used to disagree.
    if (secretsIn(node).length) out.push(path);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => walkStrings(v, `${path}[${i}]`, out));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walkStrings(v, path ? `${path}.${k}` : k, out);
  }
};

/**
 * Fold a document back into a record patch, and report what is wrong with it.
 *
 * @param {string} text
 * @param {object} agent  The record the document is being applied to.
 * @returns {{ok: boolean, doc: object|null, patch: object|null, problems: Array}}
 *   `ok` is false when the text does not parse OR carries an error-severity
 *   problem. `patch` is null in both cases: a document that is wrong applies
 *   nothing at all, rather than applying the half of it that happened to parse.
 */
export function parseAgentJson(text, agent) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      doc: null,
      patch: null,
      problems: [{ path: "", severity: "error", message: friendlyParseError(e, text) }],
    };
  }

  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return {
      ok: false,
      doc: null,
      patch: null,
      problems: [{ path: "", severity: "error", message: "This file has to be a JSON object — it starts with { and ends with }." }],
    };
  }

  const problems = [];

  // Each write sees the record as the previous writes left it, because the
  // cross-field rules depend on it: the model spec reads the runtime the
  // provider spec just rebuilt, and the collection spec reads the database.
  let working = agent;
  for (const spec of FIELDS) {
    if (spec.readOnly) continue;
    const raw = readAtPath(doc, spec.path);
    // Absent resets to the fallback. Treating it as "leave alone" would make
    // deleting a line a silent no-op, which is the one behaviour nobody expects
    // from a config file.
    const value = raw === undefined ? spec.fallback : raw;
    working = { ...working, ...spec.write(value, working) };
  }

  for (const spec of FIELDS) {
    const p = spec.check?.({ doc, agent: working });
    if (p) problems.push(p);
  }

  for (const key of Object.keys(doc)) {
    if (TOP_LEVEL_KEYS.includes(key)) continue;
    const hit = nearest(key, TOP_LEVEL_KEYS);
    problems.push({
      path: key,
      severity: "warning",
      message: hit
        ? `“${key}” is not part of an agent. Did you mean “${hit}”? It will be dropped.`
        : `“${key}” is not part of an agent and will be dropped. Put anything custom under “metadata”.`,
    });
  }

  const secrets = [];
  walkStrings(doc, "", secrets);
  for (const at of secrets) {
    problems.push({
      path: at,
      severity: "error",
      message: `That looks like a live credential. Put it in the vault and reference it as {{NAME}} — this file travels with a release.`,
    });
  }

  const patch = effectiveChanges(agent, working);
  const ok = !problems.some((p) => p.severity === "error");
  return { ok, doc, patch: ok ? patch : null, problems };
}

/**
 * The subset of `next` that genuinely differs from `agent`.
 *
 * `patch` stamps `updated: "just now"` on every write, so committing an
 * unchanged fold would churn the timestamp and mean the file could never equal
 * itself — the unsaved dot would never go out.
 */
export function effectiveChanges(agent, next) {
  const out = {};
  for (const [k, v] of Object.entries(next)) {
    if (!same(agent[k], v)) out[k] = v;
  }
  return out;
}

/** Node's parse errors name a character offset; a line and a hint are usable. */
function friendlyParseError(err, text) {
  const at = Number(/position (\d+)/.exec(err.message)?.[1] ?? -1);
  const where = at >= 0 ? ` on line ${text.slice(0, at).split("\n").length}` : "";
  if (/Unexpected token .* in JSON|Expected .* after/.test(err.message) && /,\s*[}\]]/.test(text)) {
    return `There is a comma before a closing bracket${where}.`;
  }
  if (/Unexpected end/.test(err.message)) return "The file ends before a bracket or quote was closed.";
  return `This is not valid JSON${where}.`;
}

/* ── locating a key in the text ──────────────────────────────────────────── */

/**
 * Line number (1-based) of each dotted path present in the text.
 *
 * Powers the shared cursor: clicking a form control and switching to JSON
 * should land on that key's line, which is the thing that teaches which key the
 * slider was. Scanned rather than derived from the canonical layout, because
 * the text on screen may be the user's own formatting.
 */
export function pathLines(text) {
  const src = String(text ?? "");
  const lines = new Map();
  /** @type {{kind: "object"|"array", key: string|null, index: number, via: string|number|null}[]} */
  const stack = [];
  let inString = false;
  let start = -1;
  let escaped = false;
  let last = null;
  let line = 1;
  // The line the opening quote sits on, not the one the scanner has reached: a
  // key is named where it starts.
  let startLine = 1;

  const pathOf = () => stack.map((f) => f.via).filter((v) => v !== null && v !== undefined);

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === "\n") line += 1;

    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') {
        inString = false;
        last = { text: src.slice(start + 1, i), line: startLine };
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      start = i;
      startLine = line;
      continue;
    }
    if (c === "{" || c === "[") {
      const parent = stack[stack.length - 1];
      const via = parent ? (parent.kind === "object" ? parent.key : parent.index) : null;
      stack.push({ kind: c === "{" ? "object" : "array", key: null, index: 0, via });
      last = null;
      continue;
    }
    if (c === "}" || c === "]") {
      stack.pop();
      last = null;
      continue;
    }
    if (c === ":") {
      const top = stack[stack.length - 1];
      if (top && last) {
        top.key = last.text;
        const full = [...pathOf(), last.text].join(".");
        if (!lines.has(full)) lines.set(full, last.line);
      }
      continue;
    }
    if (c === ",") {
      const top = stack[stack.length - 1];
      if (top) {
        if (top.kind === "array") top.index += 1;
        top.key = null;
      }
      last = null;
    }
  }
  return lines;
}

/** @returns {number} 1-based line, or 0 when the key is not in the text. */
export const lineOfPath = (text, path) => pathLines(text).get(path) ?? 0;

/* ── what the user actually changed ──────────────────────────────────────── */

/**
 * Paths whose value differs from the schema's fallback.
 *
 * "What did I actually change?" is the first question anyone asks of a config
 * file, and it is also what keeps the file short — a field at its default is a
 * decision nobody made.
 */
export function changedPaths(agent) {
  const out = new Set();
  const ctx = { doc: toDoc(agent), agent };
  for (const f of FIELDS) {
    if (f.readOnly) continue;
    if (f.when && !f.when(ctx)) continue;
    if (!same(f.read(agent), f.fallback)) out.add(f.path);
  }
  return out;
}
