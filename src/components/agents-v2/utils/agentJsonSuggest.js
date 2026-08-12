/**
 * What belongs where the caret is, in AGENT.json.
 *
 * Joins two things that already exist: jsonPath.js knows the caret's position
 * in the document tree, and agentJsonSchema.js knows what is legal at a path.
 * Neither is useful alone — `"web_` is a tool name inside `tools.granted`, a
 * model id inside `runtime.model` and prose inside a description, and only the
 * position tells them apart.
 *
 * The document is read for cross-field narrowing (the models worth offering
 * depend on the provider already chosen) but the RECORD is the fallback,
 * because a half-typed document does not parse and that is precisely the moment
 * a suggestion is wanted.
 */

import { childKeysOf, fieldAt } from "@/data/agentJsonSchema";
import { jsonContextAt } from "./jsonPath";
import { toDoc } from "./agentJson";

const startsWith = (value, typed) =>
  String(value).toLowerCase().startsWith(String(typed ?? "").toLowerCase());

/**
 * Completions for the caret, or null where nothing sensible belongs.
 *
 * @returns {{kind: "json", items: Array, token: string, start: number, end: number,
 *            quoted: boolean, heading: string}|null}
 */
export function suggestJson(text, caret, agent) {
  const ctx = jsonContextAt(text, caret);
  if (!ctx) return null;

  // Parse when we can, fall back to the record when we cannot. Without the
  // fallback, provider-constrained model completion dies exactly when the
  // string being typed is the thing making the document invalid.
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    doc = toDoc(agent);
  }
  if (doc === null || typeof doc !== "object") doc = toDoc(agent);

  if (ctx.where === "key") {
    const prefix = ctx.path.filter((s) => typeof s === "string").join(".");
    const items = childKeysOf(prefix)
      .filter(({ key }) => startsWith(key, ctx.partial))
      // Offering a key that is already written produces a duplicate the parser
      // silently drops.
      .filter(({ key }) => !ctx.siblings.includes(key) || key === ctx.partial)
      .filter(({ spec }) => !spec || !spec.when || spec.when({ doc, agent }))
      .filter(({ spec }) => !spec?.readOnly)
      .map(({ key, spec }) => ({
        value: key,
        note: spec ? spec.hint : "a group of settings",
        // An object key needs its braces, and the one array-of-objects in the
        // document is the shape a first-time author is guaranteed to get wrong.
        insert: spec?.snippet ? `"${key}": ${spec.snippet}` : spec ? null : `"${key}": {}`,
      }));
    return items.length
      ? { kind: "json", items, ...span(ctx), heading: prefix || "Agent settings" }
      : null;
  }

  // A value position: the field is the path minus its array index.
  const dotted = ctx.path.filter((s) => typeof s === "string").join(".");
  const spec = fieldAt(dotted);
  if (!spec || spec.readOnly || !spec.options) return null;
  // Numbers and booleans are not typed into quotes, and a list of them would be
  // noise rather than help.
  if (spec.type === "number" || spec.type === "boolean") return null;

  const chosen = Array.isArray(readAt(doc, ctx.path.filter((s) => typeof s === "string")))
    ? readAt(doc, ctx.path.filter((s) => typeof s === "string"))
    : [];

  const items = (spec.options({ doc, agent }) ?? [])
    .filter((o) => startsWith(o.value, ctx.partial))
    // In an array, what is already picked elsewhere in that array is not a
    // suggestion — except the token being edited right now.
    .filter((o) => typeof ctx.path.at(-1) !== "number" || !chosen.includes(o.value) || o.value === ctx.partial)
    .map((o) => ({ value: o.value, note: o.note, group: o.group }));

  return items.length ? { kind: "json", items, ...span(ctx), heading: spec.label } : null;
}

/** Where a chosen completion is spliced in, and whether it needs its own quotes. */
function span(ctx) {
  return { token: ctx.partial, start: ctx.start, end: ctx.end, quoted: ctx.inString };
}

function readAt(doc, path) {
  let node = doc;
  for (const s of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[s];
  }
  return node;
}
