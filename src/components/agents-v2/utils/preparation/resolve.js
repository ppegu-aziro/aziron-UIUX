/**
 * Which of a document's platform bodies applies to a given machine.
 *
 * This is the whole reason the preview exists. A preparation document says
 * what to do on `all`, and then overrides it for `windows`, and then declares a
 * ladder of strategies of which the first available one wins — and none of that
 * is answerable by reading the file top to bottom. "What happens on Windows?"
 * needs the resolution run.
 *
 * A port of `resolvePlatform` and friends from the server's resolve.go, kept
 * deliberately literal so the preview and the machine agree. Where it departs,
 * it says so.
 *
 * Pure: no React, no schema, no parser. It takes the plain object a YAML parse
 * produced and answers questions about it.
 */

import { GOOS, PHASES } from "@/data/preparationSchema";
import { scopeOf } from "./scope";

/**
 * The body that applies to `goos`, and the raw key it came from.
 *
 *   exact key  →  a comma-list containing it  →  `all`  →  nothing
 *
 * The returned key is the author's own spelling — "all", "windows",
 * "darwin,linux" — because that string is the provenance the preview shows.
 * Being told a step came from `all` is what tells you editing it there would
 * change the other two machines too.
 *
 * @param {Record<string, any>|null|undefined} map a `platforms:` map
 * @param {"darwin"|"linux"|"windows"} goos
 * @returns {{entry: any, key: string}|null}
 */
export function resolvePlatform(map, goos) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return null;

  // Present-but-empty does NOT match. `windows:` with nothing under it is the
  // ordinary shape of a half-written document, and treating it as a match would
  // show an empty plan for Windows instead of falling through to `all` — which
  // is what the machine would actually do.
  if (map[goos] != null) return { entry: map[goos], key: goos };

  // Sorted, so a document naming a platform twice resolves the same way twice.
  // `{"darwin,linux": a, "darwin,windows": b}` both match darwin; the machine
  // takes the first in byte order and so does this.
  for (const key of Object.keys(map).sort()) {
    if (!key.includes(",")) continue;
    if (map[key] == null) continue;
    if (key.split(",").some((part) => part.trim() === goos)) return { entry: map[key], key };
  }

  // `all` is a fallback, never a merge: a step declaring both `all` and
  // `windows` runs the windows body on Windows, and the two are never combined.
  if (map.all != null) return { entry: map.all, key: "all" };

  return null;
}

/**
 * The check that applies to `goos`.
 *
 * A resolved entry carrying no `check` returns nothing rather than falling
 * back to `all`. The published document could never contain that shape — it is
 * dropped before release — but a document being typed into contains it
 * constantly, and showing the `all` probe under a half-written `windows:` key
 * would be inventing a plan the author has not written yet.
 */
export function resolveCheck(precheck, goos) {
  const hit = resolvePlatform(precheck?.platforms, goos);
  if (!hit) return null;
  const check = hit.entry?.check;
  return check == null ? null : { check, key: hit.key };
}

/** The strategies or actions that apply to `goos`. */
export function resolveEntry(step, goos) {
  const hit = resolvePlatform(step?.platforms, goos);
  if (!hit || hit.entry == null) return null;
  return { entry: hit.entry, key: hit.key };
}

/**
 * The strategy ladder for a platform body, with `actions:` shorthand expanded.
 *
 * Writing `actions:` directly is sugar for one strategy that requires nothing.
 * Expanding it here means everything downstream only ever sees a ladder.
 */
export function strategiesOf(entry) {
  if (!entry || typeof entry !== "object") return [];
  if (Array.isArray(entry.strategies)) return entry.strategies.filter(Boolean);
  if (Array.isArray(entry.actions)) return [{ id: "default", actions: entry.actions, sugar: true }];
  return [];
}

const asArray = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

/**
 * How well a node is covered on a machine: three states, not two.
 *
 * "Has a definition" is the wrong question. A step whose only strategy prints
 * instructions is defined, runs, and leaves the machine exactly as it was —
 * the user still has to go and do it. Reporting that as covered is how a
 * platform ends up looking supported when nothing on it is automatic.
 *
 * @returns {"covered"|"manual-only"|"undefined"}
 */
export function coverageOf(node, goos, { precheck = false } = {}) {
  const hit = precheck ? resolveCheck(node, goos) : resolveEntry(node, goos);
  if (!hit) return "undefined";
  if (precheck) return "covered";

  const ladder = strategiesOf(hit.entry);
  if (!ladder.length) return "undefined";
  const every = ladder.every((s) => asArray(s.actions).every((a) => a?.kind === "instructions"));
  return every ? "manual-only" : "covered";
}

/** Every platform the document mentions, comma-lists expanded, sorted. */
export function platformsOf(js) {
  const seen = new Set();
  const visit = (map) => {
    if (!map || typeof map !== "object") return;
    for (const key of Object.keys(map)) {
      if (key === "all") {
        GOOS.forEach((g) => seen.add(g));
        continue;
      }
      key.split(",").forEach((p) => {
        const t = p.trim();
        if (GOOS.includes(t)) seen.add(t);
      });
    }
  };
  asArray(js?.preparation?.precheck).forEach((p) => visit(p?.platforms));
  asArray(js?.preparation?.verify).forEach((p) => visit(p?.platforms));
  for (const phase of PHASES) asArray(js?.preparation?.preconfigure?.[phase.id]).forEach((s) => visit(s?.platforms));
  return [...seen].sort();
}

/**
 * Nodes with no definition at all on some machine.
 *
 * The banner this drives is the one thing in the preview that has to be seen
 * from a tab the reader is not on: a Windows user finding out on the Windows
 * tab that Windows is unsupported is too late, and a Linux author never finds
 * out at all.
 *
 * @returns {Record<string, string[]>|null} goos → labels, or null when whole.
 */
export function missingPlatforms(js) {
  const gaps = {};
  const note = (goos, label) => {
    (gaps[goos] ??= []).push(label);
  };

  for (const p of asArray(js?.preparation?.precheck)) {
    for (const g of GOOS) if (coverageOf(p, g, { precheck: true }) === "undefined") note(g, p.label || p.id || "a precheck");
  }
  for (const phase of PHASES) {
    for (const s of asArray(js?.preparation?.preconfigure?.[phase.id])) {
      for (const g of GOOS) if (coverageOf(s, g) === "undefined") note(g, s.label || s.id || `a ${phase.id} step`);
    }
  }
  return Object.keys(gaps).length ? gaps : null;
}

/**
 * A command rendered the way a shell would show it — for reading, not running.
 *
 * argv is already split, so this is only ever a display join. Nothing here is
 * ever executed and nothing is ever copied back into the document from it.
 */
export const previewArgv = (argv) =>
  asArray(argv)
    .map((a) => (/[\s"']/.test(String(a)) ? JSON.stringify(String(a)) : String(a)))
    .join(" ");

/**
 * Everything one OS tab renders, resolved.
 *
 * @param {object} js the parsed document
 * @param {"darwin"|"linux"|"windows"} goos
 */
export function planFor(js, goos) {
  const prep = js?.preparation ?? {};

  const prechecks = asArray(prep.precheck).map((p, i) => {
    const hit = resolveCheck(p, goos);
    return {
      index: i,
      id: p?.id ?? "",
      label: p?.label ?? p?.id ?? "",
      dedupKey: p?.dedup_key ?? null,
      dependsOn: asArray(p?.depends_on),
      coverage: coverageOf(p, goos, { precheck: true }),
      from: hit?.key ?? null,
      check: hit?.check ?? null,
      path: `preparation.precheck[${i}]`,
      // Segments, never a dotted string: a platform key can contain a comma
      // ("darwin,linux"), so a path that gets split apart loses it.
      segments: ["preparation", "precheck", i],
      checkSegments: hit ? ["preparation", "precheck", i, "platforms", hit.key, "check"] : null,
      // Which machines a write here would reach. The card renders it; the
      // field component refuses to render a control without it.
      scope: scopeOf(p, hit?.key ?? null, goos),
    };
  });

  const phases = PHASES.map((phase) => ({
    ...phase,
    steps: asArray(prep.preconfigure?.[phase.id]).map((s, i) => {
      const hit = resolveEntry(s, goos);
      const ladder = strategiesOf(hit?.entry);
      return {
        index: i,
        id: s?.id ?? "",
        label: s?.label ?? s?.id ?? "",
        when: s?.when ?? null,
        // Spelled out because it is a default nobody wrote down, and a plan
        // that shows only what was typed hides half of what will happen.
        whenStatus: s?.when?.status ?? "unsatisfied",
        coverage: coverageOf(s, goos),
        from: hit?.key ?? null,
        select: hit?.entry?.select ?? "auto",
        sugar: ladder.some((x) => x.sugar),
        segments: ["preparation", "preconfigure", phase.id, i],
        entrySegments: hit ? ["preparation", "preconfigure", phase.id, i, "platforms", hit.key] : null,
        scope: scopeOf(s, hit?.key ?? null, goos),
        strategies: ladder.map((st, j) => {
          const base = hit ? ["preparation", "preconfigure", phase.id, i, "platforms", hit.key] : null;
          return {
            index: j,
            id: st?.id ?? `strategy-${j + 1}`,
            label: st?.label ?? null,
            requires: asArray(st?.requires),
            pathHints: asArray(st?.path_hints),
            actions: asArray(st?.actions),
            // `actions:` shorthand has no `strategies` key in the file, so a
            // write has to target the authored shape, not the expanded one.
            segments: base ? (st?.sugar ? base : [...base, "strategies", j]) : null,
            sugar: Boolean(st?.sugar),
            path: `preparation.preconfigure.${phase.id}[${i}].platforms.${hit?.key}.strategies[${j}]`,
          };
        }),
        path: `preparation.preconfigure.${phase.id}[${i}]`,
      };
    }),
  }));

  const verify = asArray(prep.verify).map((v, i) => {
    const hit = resolveCheck(v, goos);
    return {
      index: i,
      id: v?.id ?? "",
      label: v?.label ?? v?.id ?? "",
      coverage: coverageOf(v, goos, { precheck: true }),
      from: hit?.key ?? null,
      check: hit?.check ?? null,
      path: `preparation.verify[${i}]`,
    };
  });

  // Empty phases are KEPT. They were filtered out here, which left "add the
  // first step to Configure" with nowhere to hang; whether to draw an empty
  // heading is the view's call, not the resolver's.
  const steps = phases.flatMap((p) => p.steps);
  const all = [...prechecks, ...steps, ...verify];

  // "Manual only" is a claim about the steps, not about everything. A precheck
  // is a probe: it never changes the machine, so counting it as automation
  // makes a document whose every step is a note to the user read as covered.
  const verdict = all.length === 0
    ? "empty"
    : all.some((n) => n.coverage === "undefined")
      ? "gaps"
      : steps.length && steps.every((n) => n.coverage === "manual-only")
        ? "manual"
        : "covered";

  return { goos, prompt: prep.prompt ?? null, prechecks, phases, verify, verdict };
}
