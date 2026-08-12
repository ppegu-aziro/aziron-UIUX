/**
 * What is wrong with a preparation document, in sentences someone can act on.
 *
 * The rules come from the contract corpus in the Aziron repo — every one here
 * corresponds to a document under `contracts/preparation/invalid/` that the
 * server refuses. The messages are ours; the rules are not.
 *
 * The one that matters most is the no-dead-end rule. Every other rule stops a
 * document being published. That one stops a document that publishes fine and
 * then leaves somebody's machine with nothing to try and no explanation — which
 * is the failure the whole schema was designed around.
 *
 * Severity is a promise about consequence: an error would be refused on
 * release, a warning ships and is probably not what you meant.
 */

import {
  ACTION_KINDS,
  CHECK_KINDS,
  GOOS,
  PHASES,
  PLATFORM_KEYS,
  SELECT_MODES,
  WHEN_STATUSES,
} from "@/data/preparationSchema";
import { strategiesOf } from "./resolve";
import { docPathOf } from "./document";

const arr = (v) => (Array.isArray(v) ? v : []);
const isBare = (v) => typeof v === "string" && /^[A-Za-z0-9._+-]+$/.test(v) && !v.includes("/") && !v.includes("\\");

const near = (word, list) => {
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
  const q = norm(word);
  return list.find((x) => norm(x) === q) ?? list.find((x) => within(q, norm(x), 2)) ?? null;
};

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
 * @typedef {Object} Problem
 * @property {string} path      dotted path, for the jump link
 * @property {"error"|"warning"} severity
 * @property {string} message
 * @property {string} rule
 */

/**
 * Check a parsed document.
 *
 * @param {object|null} js
 * @returns {Problem[]}
 */
export function lintPreparation(js) {
  const out = [];
  const add = (path, severity, rule, message) => out.push({ path, severity, rule, message });

  if (js == null || typeof js !== "object") return out;

  if (js.schema !== 1) {
    add("schema", "error", "schema-not-1",
      js.schema === undefined
        ? "There is no `schema:` line. It has to say 1."
        : `Preparation schema must be 1, not ${JSON.stringify(js.schema)}. This would be refused on release.`);
  }

  for (const key of Object.keys(js)) {
    if (key === "schema" || key === "preparation") continue;
    const hit = near(key, ["schema", "preparation"]);
    add(key, "error", "unknown-key",
      `“${key}” is not part of a preparation document${hit ? `. Did you mean “${hit}”?` : ""} Unknown keys are refused, not ignored.`);
  }

  const prep = js.preparation;
  if (prep == null) {
    add("preparation", "error", "missing-preparation", "There is no `preparation:` block, so nothing is declared.");
    return out;
  }

  for (const key of Object.keys(prep)) {
    if (["prompt", "precheck", "preconfigure", "verify"].includes(key)) continue;
    const hit = near(key, ["prompt", "precheck", "preconfigure", "verify"]);
    add(docPathOf(["preparation", key]), "error", "unknown-key",
      `“${key}” is not part of a preparation document${hit ? `. Did you mean “${hit}”?` : ""}`);
  }

  const prechecks = arr(prep.precheck);
  const ids = new Set();

  const checkPlatformMap = (node, path, { needsCheck }) => {
    const map = node?.platforms;
    if (map == null || typeof map !== "object" || !Object.keys(map).length) {
      add(docPathOf([...path, "platforms"]), "error", "platforms-empty",
        "No platforms declared, so this never runs anywhere. Add an `all:` block if it is the same everywhere.");
      return;
    }
    for (const raw of Object.keys(map)) {
      const parts = raw.split(",").map((p) => p.trim());
      const bad = parts.filter((p) => !PLATFORM_KEYS.includes(p));
      if (bad.length) {
        const hit = near(bad[0], PLATFORM_KEYS);
        add(docPathOf([...path, "platforms", raw]), "error", "platform-key-unknown",
          `“${bad[0]}” is not a platform${hit ? `. Did you mean “${hit}”?` : ""} Use ${PLATFORM_KEYS.join(", ")}, or a comma-list.`);
      }
      if (new Set(parts).size !== parts.length) {
        add(docPathOf([...path, "platforms", raw]), "error", "platform-key-repeats",
          `“${raw}” names the same platform twice.`);
      }
      const body = map[raw];
      if (body == null) continue;
      if (needsCheck && body.check == null) {
        add(docPathOf([...path, "platforms", raw, "check"]), "error", "check-missing",
          "A precheck platform needs a `check:` — it is the probe that decides whether setup is needed.");
      }
      if (needsCheck && body.check) checkTheCheck(body.check, [...path, "platforms", raw, "check"]);
      if (!needsCheck) checkPlatformBody(body, [...path, "platforms", raw]);
    }
  };

  const checkTheCheck = (check, path) => {
    if (!CHECK_KINDS.includes(check.kind)) {
      const hit = near(check.kind, CHECK_KINDS);
      add(docPathOf([...path, "kind"]), "error", "check-kind",
        `Unknown check kind ${JSON.stringify(check.kind ?? null)}${hit ? `. Did you mean “${hit}”?` : ""} Use ${CHECK_KINDS.join(", ")}.`);
    }
    if (check.kind === "binary" && check.value == null) {
      add(docPathOf([...path, "value"]), "error", "check-fields-by-kind",
        "kind: binary needs `value:` — a bare executable name looked up on PATH.");
    }
    if (check.kind === "command" && !arr(check.argv).length) {
      add(docPathOf([...path, "argv"]), "error", "argv-empty",
        "kind: command needs a non-empty `argv:`. There is no shell here — each element is one argument.");
    }
    if (check.kind === "binary" && check.argv != null) {
      add(docPathOf([...path, "argv"]), "warning", "check-dead-fields",
        "`argv` does nothing on a binary check — it uses `value`. This ships as dead data.");
    }
    checkArgv(check.argv, path, { isCheck: true });
    if (check.expect) {
      if (check.kind !== "command") {
        add(docPathOf([...path, "expect"]), "error", "expect-on-non-command",
          "`expect` only applies to kind: command — there is no output to match on any other probe.");
      }
      if (check.sensitive_output) {
        add(docPathOf([...path, "expect"]), "error", "expect-sensitive-conflict",
          "`sensitive_output` means the output is never read, so `expect` can never match. This check could never pass.");
      }
      if (check.expect.min_version && !check.expect.version_from) {
        add(docPathOf([...path, "expect", "min_version"]), "error", "min-version-without-version-from",
          "`min_version` needs `version_from` — a regex with a capture group that pulls the version out of the output.");
      }
      if (check.expect.version_from && !/\((?!\?)/.test(String(check.expect.version_from))) {
        add(docPathOf([...path, "expect", "version_from"]), "error", "version-from-no-capture",
          "`version_from` needs a capture group, like aws-cli/(\\d+\\.\\d+\\.\\d+).");
      }
    }
  };

  const checkArgv = (argv, path, { isCheck = false, prompts = [] } = {}) => {
    const list = arr(argv);
    if (!list.length) return;
    if (!isBare(list[0])) {
      add(docPathOf([...path, "argv", 0]), "error", "argv0-not-bare",
        `The first element must be a bare binary name found on PATH, not ${JSON.stringify(list[0])}. There is no shell: nothing is word-split or expanded.`);
    }
    list.forEach((a, i) => {
      if (typeof a === "string" && i > 0 && /\s/.test(a) && !/^-{1,2}\S+=/.test(a)) {
        add(docPathOf([...path, "argv", i]), "warning", "argv-not-split",
          `${JSON.stringify(a)} is one argument containing spaces. Did you mean several?`);
      }
      for (const m of String(a ?? "").matchAll(/\{\{\s*prompt\.([A-Za-z0-9_-]+)\s*\}\}/g)) {
        if (isCheck) {
          add(docPathOf([...path, "argv", i]), "error", "argv-template-in-check",
            "Placeholders are not allowed in a check. A probe never asks the user anything.");
        } else if (!prompts.includes(m[1])) {
          add(docPathOf([...path, "argv", i]), "error", "argv-template-undeclared",
            `{{prompt.${m[1]}}} is not declared in this action's \`prompts\`. A prompt on a sibling action does not count.`);
        }
      }
    });
  };

  const checkPlatformBody = (body, path) => {
    const hasActions = Array.isArray(body?.actions);
    const hasStrategies = Array.isArray(body?.strategies);
    if (hasActions && hasStrategies) {
      add(docPathOf(path), "error", "entry-actions-xor-strategies",
        "Declare either `actions:` or `strategies:`, not both. `actions:` is shorthand for a single strategy.");
    }
    const ladder = strategiesOf(body);
    if (!ladder.length) {
      add(docPathOf(path), "error", "entry-actions-xor-strategies",
        "This platform declares neither `actions:` nor `strategies:`, so nothing happens here.");
      return;
    }

    if (body.select != null && !SELECT_MODES.includes(body.select)) {
      add(docPathOf([...path, "select"]), "error", "select-unknown",
        `\`select\` is ${SELECT_MODES.join(" or ")}. auto runs the first strategy whose requirements are on PATH; prompt asks.`);
    }
    if (body.select === "prompt") {
      if (ladder.length < 2) {
        add(docPathOf([...path, "select"]), "error", "select-prompt-needs-two",
          "`select: prompt` needs at least two strategies to choose between.");
      }
      ladder.forEach((s, i) => {
        if (!s.label) {
          add(docPathOf(s.sugar ? [...path] : [...path, "strategies", i, "label"]), "error", "select-prompt-needs-label",
            "Under `select: prompt` the label is the only thing the user sees when picking, so every strategy needs one.");
        }
      });
    }

    // The rule the schema exists for.
    const last = ladder[ladder.length - 1];
    if (arr(last?.requires).length) {
      const names = ladder.flatMap((s) => arr(s.requires));
      add(docPathOf([...path, "strategies", ladder.length - 1, "requires"]), "error", "terminal-strategy-requires",
        `Every strategy here is conditional. If ${[...new Set(names)].join(" and ")} are all missing, nothing runs and the user is told the agent is not ready with no way forward. The last strategy must be runnable unconditionally.`);
    }

    ladder.forEach((s, i) => {
      // Report against the path the author WROTE. `actions:` shorthand expands
      // to a strategy for resolution, but there is no `strategies` key in the
      // file, so pointing a diagnostic at one gives a jump link that resolves
      // to nothing and a line number of zero.
      const at = s.sugar ? [...path] : [...path, "strategies", i];

      arr(s.requires).forEach((r, j) => {
        if (!isBare(r)) {
          add(docPathOf([...at, "requires", j]), "error", "requires-not-bare",
            "`requires` lists bare binary names looked up on PATH, not paths.");
        }
      });
      const actions = arr(s.actions);
      if (!actions.length) {
        add(docPathOf([...at, "actions"]), "error", "action-fields-by-kind",
          "A strategy with no actions does nothing.");
      }
      actions.forEach((a, j) => {
        const ap = [...at, "actions", j];
        if (!ACTION_KINDS.includes(a?.kind)) {
          const hit = near(a?.kind, ACTION_KINDS);
          add(docPathOf([...ap, "kind"]), "error", "action-kind",
            `Unknown action kind ${JSON.stringify(a?.kind ?? null)}${hit ? `. Did you mean “${hit}”?` : ""} Use ${ACTION_KINDS.join(", ")}. A probe that changes nothing belongs in a precheck.`);
        }
        if (a?.kind === "instructions" && !a.message) {
          add(docPathOf([...ap, "message"]), "error", "action-fields-by-kind",
            "kind: instructions needs a `message:` — it is the whole thing the user is told.");
        }
        if (a?.kind === "command") checkArgv(a.argv, ap, { prompts: arr(a.prompts).map((p) => p?.id) });
        for (const v of arr(a?.vars).concat(arr(a?.prompts))) {
          if (v?.secret && v?.default != null) {
            add(docPathOf([...ap, "vars"]), "error", "secret-with-default",
              `“${v.name ?? v.id}” is secret and ships a default, which would publish the value in the clear.`);
          }
        }
      });
    });
  };

  prechecks.forEach((p, i) => {
    const path = ["preparation", "precheck", i];
    if (!p?.id) {
      add(docPathOf([...path, "id"]), "error", "precheck-id-missing",
        "This precheck has no `id:`. Steps refer to prechecks by id, so it needs one.");
    } else if (ids.has(p.id)) {
      add(docPathOf([...path, "id"]), "error", "duplicate-precheck-id",
        `Two prechecks share the id “${p.id}”. The first wins every reference, so this one is dead weight.`);
    } else {
      ids.add(p.id);
    }
    arr(p?.depends_on).forEach((d, j) => {
      if (d === p?.id) {
        add(docPathOf([...path, "depends_on", j]), "error", "depends-on-self", "A precheck cannot depend on itself.");
      } else if (!prechecks.some((x) => x?.id === d)) {
        const hit = near(d, prechecks.map((x) => x?.id).filter(Boolean));
        add(docPathOf([...path, "depends_on", j]), "error", "depends-on-unknown",
          `There is no precheck called “${d}”${hit ? `. Did you mean “${hit}”?` : ""}`);
      }
    });
    checkPlatformMap(p, path, { needsCheck: true });
  });

  const cycle = findCycle(prechecks);
  if (cycle) {
    add("preparation.precheck", "error", "depends-on-cycle",
      `These prechecks depend on each other in a loop: ${cycle.join(" → ")}. None of them would ever run.`);
  }

  const stepIds = new Set();
  for (const phase of PHASES) {
    arr(prep.preconfigure?.[phase.id]).forEach((s, i) => {
      const path = ["preparation", "preconfigure", phase.id, i];
      if (s?.id) {
        if (stepIds.has(s.id)) {
          add(docPathOf([...path, "id"]), "error", "duplicate-step-id",
            `Step id “${s.id}” is used twice. Ids must be unique across all three phases together.`);
        }
        stepIds.add(s.id);
      }
      if (s?.when?.precheck != null && !prechecks.some((x) => x?.id === s.when.precheck)) {
        const hit = near(s.when.precheck, prechecks.map((x) => x?.id).filter(Boolean));
        add(docPathOf([...path, "when", "precheck"]), "error", "when-precheck",
          `There is no precheck called “${s.when.precheck}”${hit ? `. Did you mean “${hit}”?` : ""}`);
      }
      if (s?.when?.status != null && !WHEN_STATUSES.includes(s.when.status)) {
        add(docPathOf([...path, "when", "status"]), "error", "when-status",
          `Unknown status “${s.when.status}”. Use ${WHEN_STATUSES.join(", ")}.`);
      }
      checkPlatformMap(s, path, { needsCheck: false });
    });
  }

  arr(prep.verify).forEach((v, i) => checkPlatformMap(v, ["preparation", "verify", i], { needsCheck: true }));

  if (!prechecks.length && !PHASES.some((p) => arr(prep.preconfigure?.[p.id]).length)) {
    add("preparation", "warning", "no-work",
      "This declares no prechecks and no steps, so preparation does nothing.");
  }

  return out;
}

/** The first dependency loop among prechecks, as a readable chain. */
function findCycle(prechecks) {
  const edges = new Map(prechecks.filter((p) => p?.id).map((p) => [p.id, arr(p.depends_on)]));
  const state = new Map();
  const stack = [];
  let found = null;

  const walk = (id) => {
    if (found) return;
    if (state.get(id) === "done") return;
    if (state.get(id) === "open") {
      found = [...stack.slice(stack.indexOf(id)), id];
      return;
    }
    state.set(id, "open");
    stack.push(id);
    for (const next of edges.get(id) ?? []) if (edges.has(next)) walk(next);
    stack.pop();
    state.set(id, "done");
  };

  for (const id of edges.keys()) walk(id);
  return found;
}

/** Gaps by machine, phrased for the banner. */
export const gapSentence = (gaps) => {
  const names = GOOS.filter((g) => gaps?.[g]?.length);
  if (!names.length) return null;
  const label = { darwin: "macOS", linux: "Linux", windows: "Windows" };
  return names
    .map((g) => `${label[g]} has no definition for ${gaps[g].length === 1 ? gaps[g][0] : `${gaps[g].length} steps`}`)
    .join(" · ");
};
