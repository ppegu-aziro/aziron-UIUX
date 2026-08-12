/**
 * What belongs where the caret is, in preparation.yaml.
 *
 * The same split agent.json uses: a scanner says where the caret is, this says
 * what is legal there. The document is read for the answers that depend on it —
 * which precheck ids exist, which prompts this action declared — and the schema
 * for the rest.
 *
 * Every item sets `insert` explicitly. The shared popup's default is JSON
 * quoting, and emitting `"apt-get"` where the contract wants the bare scalar
 * `apt-get` is a correctness bug, not a cosmetic one: `argv[0]` must be a bare
 * binary name and a quoted one is a different value.
 */

import {
  ENUM_AT,
  KEYS_AT,
  PHASES,
  PLATFORM_KEYS,
} from "@/data/preparationSchema";
import { yamlContextAt } from "./yamlPath";

const starts = (v, typed) => String(v).toLowerCase().startsWith(String(typed ?? "").toLowerCase());
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Which catalogue of keys applies to a container path.
 *
 * Paths are matched by SHAPE, not literally: one entry covers every precheck
 * rather than one per index, and a platform key is whatever the author wrote —
 * including a comma-list, which is why the segment is never split.
 */
function keysFor(segments) {
  const s = segments.filter((x) => typeof x === "string");
  const last = s[s.length - 1];
  const prev = s[s.length - 2];

  if (segments.length === 0) return KEYS_AT[""];
  if (s.length === 1 && last === "preparation") return KEYS_AT.preparation;
  if (last === "preconfigure") return KEYS_AT.preconfigure;
  if (last === "when") return KEYS_AT.when;
  if (last === "expect") return KEYS_AT["preparation.precheck.*.platforms.<platform>.check.expect"];
  if (last === "check") return KEYS_AT["preparation.precheck.*.platforms.<platform>.check"];
  if (last === "platforms") return null; // platform KEYS are an enum, not a catalogue

  // Inside a platform body: the parent is the platforms map.
  if (prev === "platforms") {
    const inPrecheck = s.includes("precheck") || s.includes("verify");
    return inPrecheck
      ? KEYS_AT["preparation.precheck.*.platforms.<platform>"]
      : KEYS_AT.platformBody;
  }
  if (last === "strategies") return KEYS_AT.strategy;
  if (last === "actions") return KEYS_AT.action;

  // A list item: which list decides the shape.
  if (typeof segments[segments.length - 1] === "number") {
    const owner = s[s.length - 1];
    if (owner === "precheck" || owner === "verify") return KEYS_AT["preparation.precheck.*"];
    if (PHASES.some((p) => p.id === owner)) return KEYS_AT.step;
    if (owner === "strategies") return KEYS_AT.strategy;
    if (owner === "actions") return KEYS_AT.action;
  }
  return null;
}

/** Which closed value set applies to the key being filled in. */
function enumFor(segments, js) {
  const s = segments.filter((x) => typeof x === "string");
  const key = s[s.length - 1];
  const parent = s[s.length - 2];

  if (key === "kind") return parent === "check" ? ENUM_AT["check.kind"] : ENUM_AT["action.kind"];
  if (key === "status") return ENUM_AT.status;
  if (key === "select") return ENUM_AT.select;
  if (key === "elevation") return ENUM_AT.elevation;
  if (key === "interactive" || key === "sensitive_output") return ENUM_AT.interactive;
  if (key === "providers") return ENUM_AT.providers;

  // Document-aware: which prechecks exist.
  if (key === "precheck" && parent === "when") {
    return arr(js?.preparation?.precheck).map((p) => p?.id).filter(Boolean);
  }
  if (key === "depends_on") {
    return arr(js?.preparation?.precheck).map((p) => p?.id).filter(Boolean);
  }
  return null;
}

/**
 * Completions for the caret, or null where nothing belongs.
 *
 * @returns {{kind:"yaml", items: Array, token: string, start: number,
 *            end: number, quoted: boolean, heading: string}|null}
 */
export function suggestYaml(text, caret, { js } = {}) {
  const ctx = yamlContextAt(text, caret);
  if (!ctx) return null;

  const span = { token: ctx.partial, start: ctx.start, end: ctx.end, quoted: false };

  // A platforms map's own keys are the machine names.
  const strings = ctx.segments.filter((x) => typeof x === "string");
  if (ctx.where === "key" && strings[strings.length - 1] === "platforms") {
    const items = PLATFORM_KEYS.filter((k) => starts(k, ctx.partial) && !ctx.siblings.includes(k)).map((k) => ({
      value: k,
      note: k === "all" ? "every machine, unless one below overrides it" : "just this machine",
      insert: `${k}:`,
      keepOpen: true,
    }));
    return items.length ? { kind: "yaml", items, ...span, heading: "Machine" } : null;
  }

  if (ctx.where === "key" || ctx.where === "item") {
    const catalogue = keysFor(ctx.segments);
    if (!catalogue) return null;
    const items = catalogue
      .filter((k) => starts(k.key, ctx.partial))
      .filter((k) => !ctx.siblings.includes(k.key) || k.key === ctx.partial)
      .map((k) => ({
        value: k.key,
        note: k.hint,
        // A block or sequence key wants its colon and nothing else; a scalar
        // key wants the space too, so the value can be typed straight away.
        insert: k.block || k.seq ? `${k.key}:` : `${k.key}: `,
        keepOpen: true,
      }));
    return items.length
      ? { kind: "yaml", items, ...span, heading: strings[strings.length - 1] ?? "Document" }
      : null;
  }

  const values = enumFor(ctx.segments, js);
  if (!values?.length) return null;
  const items = values
    .filter((v) => starts(v, ctx.partial))
    .map((v) => ({ value: v, insert: String(v) }));
  return items.length
    ? { kind: "yaml", items, ...span, heading: strings[strings.length - 1] ?? "Value" }
    : null;
}
