/**
 * Which machines an edit would reach.
 *
 * The preview shows one machine at a time, but a row on the macOS tab may have
 * been written under `all` — in which case changing it changes Linux and
 * Windows too. That is the whole hazard of editing a resolved view, and this is
 * the one place it is answered.
 *
 * The rule for WHERE to write is one line and has no exceptions: the target is
 * the key the resolver matched, never the machine whose tab you are on.
 * `resolvePlatform` already returns that key, so there is exactly one byte
 * range and no guessing.
 *
 * What this does NOT do is decide whether to warn. That belongs to the field
 * component, which takes a scope as a required prop and renders its own
 * sentence — so there is no code path to an editable shared value without the
 * sentence that explains it.
 */

import { GOOS, OS_TABS } from "@/data/preparationSchema";

const LABEL = Object.fromEntries(OS_TABS.map((t) => [t.goos, t.label]));

/** Machines this node names under some key other than `key`. */
const namedElsewhere = (platforms, key) =>
  Object.keys(platforms ?? {})
    .filter((k) => k !== key && k !== "all")
    .flatMap((k) => k.split(",").map((s) => s.trim()));

/**
 * @typedef {Object} Scope
 * @property {"exact"|"comma"|"all"|"none"} kind
 * @property {boolean} shared     true when a write here reaches another machine
 * @property {string[]} covers    every machine this body governs
 * @property {string[]} others    the ones that are not the tab you are on
 * @property {string|null} key    the author's own spelling — the write target
 */

/**
 * @param {object} node  a precheck or step, carrying `platforms`
 * @param {string|null} key  the key `resolvePlatform` matched
 * @param {"darwin"|"linux"|"windows"} goos
 * @returns {Scope}
 */
export function scopeOf(node, key, goos) {
  if (!key) return { kind: "none", shared: false, covers: [], others: [], key: null };

  // `all` governs every machine EXCEPT ones with a key of their own, because a
  // specific key overrides rather than merges.
  const covers =
    key === "all"
      ? GOOS.filter((g) => !namedElsewhere(node?.platforms, "all").includes(g))
      : key.split(",").map((s) => s.trim()).filter((g) => GOOS.includes(g));

  const others = covers.filter((g) => g !== goos);
  return {
    kind: key === goos ? "exact" : key === "all" ? "all" : "comma",
    shared: others.length > 0,
    covers,
    others,
    key,
  };
}

/**
 * The sentence shown above an editable value.
 *
 * Machine names first, always. The YAML key is a detail; "Linux and Windows run
 * this too" is the consequence, and the consequence is what someone needs
 * before they start typing rather than after.
 */
export function scopeSentence(scope, goos) {
  if (scope.kind === "none") return `Nothing written for ${LABEL[goos]}.`;
  if (!scope.shared) return `Written for ${LABEL[goos]} only.`;
  const names = scope.others.map((g) => LABEL[g]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `Shared — ${list} ${names.length === 1 ? "runs" : "run"} this too.`;
}

/** Past tense, for the toast that follows a shared write. */
export function scopeToast(scope) {
  const names = scope.covers.map((g) => LABEL[g]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `Changed on ${list}.`;
}

export const machineLabel = (goos) => LABEL[goos] ?? goos;
