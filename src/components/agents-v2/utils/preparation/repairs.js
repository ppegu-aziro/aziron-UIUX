/**
 * One-click fixes for the problems the validator reports.
 *
 * Every repair is a splice, so a fix that would rewrite the file is not offered
 * at all. Every repair is also OPTIONAL: a rule with no safe automatic fix
 * keeps its sentence and its jump link and offers no button, because a wand
 * that sometimes guesses wrong is one people stop trusting, and then the ones
 * that are right go unpressed too.
 *
 * The rules that deliberately have no button are as considered as the ones that
 * do — see the tail of the catalogue.
 */

import { SEED } from "@/data/preparationSchema";
import { segmentsOf } from "./document";
import { appendItem, removeAt, renderFragment, replaceScalar, setScalar } from "./yamlSplice";

/** Pull the suggestion out of a message that already offered one. */
const suggested = (message) => /Did you mean “([^”]+)”/.exec(message ?? "")?.[1] ?? null;
const quoted = (message) => /“([^”]+)”/.exec(message ?? "")?.[1] ?? null;

/**
 * A repair for a problem, or null when none is safe.
 *
 * @param {{path: string, rule: string, message: string}} problem
 * @param {string} text
 * @param {object} doc  the parsed document
 * @param {object} js   the plain tree
 * @returns {{label: string, title?: string, apply: () => {text: string, caret: number}|null}|null}
 */
export function repairFor(problem, text, doc, js) {
  const at = segmentsOf(problem.path);
  const make = (label, fn, title) => ({ label, title, apply: fn });

  switch (problem.rule) {
    /**
     * The flagship, and the reason the rule exists. Appends a strategy that
     * requires nothing and tells the user what to do — so a machine with none
     * of the package managers above has somewhere to land.
     *
     * Deliberately does NOT offer to drop `requires` from the existing last
     * strategy. That would make the editor complicit in running winget on a
     * machine without winget.
     */
    case "terminal-strategy-requires": {
      // The path points at the last strategy's `requires`; the sequence is two up.
      const seq = at.slice(0, -2);
      return make(
        "Add a manual last resort",
        () =>
          appendItem(
            text,
            doc,
            seq,
            renderFragment({
              id: "manual",
              actions: [{ kind: "instructions", message: "Install it by hand, then run preparation again." }],
            }),
          ),
        "Adds an option that needs nothing, so a machine without the others still has somewhere to go",
      );
    }

    case "schema-not-1":
      return make("Set it to 1", () => setScalar(text, doc, ["schema"], 1));

    case "unknown-key": {
      const hit = suggested(problem.message);
      // A rename of a KEY is not a scalar splice, so this removes the wrong key
      // rather than renaming it — honest, and it never invents content.
      return hit
        ? null
        : make("Remove it", () => removeAt(text, doc, at), "Unknown keys are refused on release");
    }

    case "check-kind":
    case "action-kind":
    case "when-status":
    case "select-unknown":
    case "when-precheck":
    case "depends-on-unknown": {
      const hit = suggested(problem.message);
      return hit ? make(`Use “${hit}”`, () => replaceScalar(text, doc, at, hit)) : null;
    }

    case "select-prompt-needs-two":
      return make(
        "Take the first available instead",
        () => replaceScalar(text, doc, at, "auto"),
        "Inventing a second option would be writing something you did not choose",
      );

    case "depends-on-self":
      return make("Remove it", () => removeAt(text, doc, at));

    case "check-dead-fields":
      return make(`Remove ${quoted(problem.message) ?? "it"}`, () => removeAt(text, doc, at));

    case "expect-on-non-command":
      return make("Remove `expect`", () => removeAt(text, doc, at));

    case "expect-sensitive-conflict":
      return make(
        "Remove `expect`",
        () => removeAt(text, doc, at),
        "Keeps `sensitive_output`, which is the stronger promise of the two",
      );

    case "min-version-without-version-from":
      return make(
        "Add `version_from`",
        () => setScalar(text, doc, [...at.slice(0, -1), "version_from"], String.raw`(\d+\.\d+\.\d+)`),
        "A capture group that pulls the version out of the output",
      );

    case "requires-not-bare": {
      const bad = String(readAt(js, at) ?? "");
      const base = bad.split(/[\\/]/).pop()?.replace(/\.exe$/i, "");
      // Only for an absolute path. The basename of `../scripts/setup.sh` is not
      // a thing on PATH, so suggesting it would be wrong rather than merely unhelpful.
      return base && base !== bad && /^([A-Za-z]:)?[\\/]/.test(bad)
        ? make(`Use “${base}”`, () => replaceScalar(text, doc, at, base))
        : null;
    }

    case "secret-with-default":
      return make("Clear the default", () => removeAt(text, doc, [...at, "default"]));

    case "missing-preparation":
      // A whole-file write, so only ever onto an empty file.
      return text.trim()
        ? null
        : make("Start from the example", () => ({ text: SEED, caret: 0 }));

    default:
      return null;
  }
}

function readAt(js, segments) {
  let node = js;
  for (const s of segments) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[s];
  }
  return node;
}

/**
 * Rules that keep their sentence and their jump link and get no button.
 *
 * Written down rather than left as an absence, because "why is there no fix
 * here?" is a fair question and each of these has a specific answer:
 *
 *   argv0-not-bare            the right split cannot be inferred from a path
 *   version-from-no-capture   wrapping the whole regex captures the tool name too
 *   argv-template-in-check    a prompt in a probe is a design error, not a typo
 *   argv-template-undeclared  inventing an id and a label writes content nobody chose
 *   depends-on-cycle          breaking a loop needs to know which edge is wrong
 *   no-work                   a document that does nothing is an opinion
 *   platforms-empty           which machines it should cover is the author's call
 *   argv-not-split            a guess at word boundaries, offered in the add form instead
 */
export const NO_AUTOMATIC_FIX = [
  "argv0-not-bare",
  "version-from-no-capture",
  "argv-template-in-check",
  "argv-template-undeclared",
  "depends-on-cycle",
  "no-work",
  "platforms-empty",
  "argv-not-split",
  "duplicate-precheck-id",
  "duplicate-step-id",
  "precheck-id-missing",
];
