import { AGENT_JSON_PATH } from "@/data/agentJsonSchema";
import { PREPARATION_PATH } from "@/data/preparationSchema";
import { VAULT_VARIABLES } from "@/data/agentsV2";
import { parseAgentJson, secretsIn, serialiseAgentJson } from "./agentJson";
import { parsePreparation } from "./preparation/document";
import { gapSentence, lintPreparation } from "./preparation/lint";
import { missingPlatforms } from "./preparation/resolve";

/**
 * What would stop this release, and what it read to decide.
 *
 * Every check here computes something from the record and reports the evidence
 * it used. That constraint is the whole design: a staged publish is the easiest
 * place in a prototype to put a row of ticks that are really just a delay with
 * a label, and a viewer cannot tell those apart from the real ones — so there
 * are no rows here that only sleep. "Nothing to examine" is its own grade
 * rather than a green tick, because a check that passes for want of anything to
 * look at is the same lie in quieter clothing.
 *
 * Pure and single-arity on purpose. Two overloads, one for the dialog and one
 * for the distribute screen, is two answers about one agent.
 *
 * Deliberately NOT here: a "changed since the last release" check. No seeded
 * record carries a release note, so on every first release it would have no
 * baseline and would grade skip forever — a row that is always grey teaches
 * nothing.
 */

const VAULT = new Set(VAULT_VARIABLES.map((v) => v.name));
const n = (x) => x.toLocaleString();

export function preflight(agent) {
  const a = agent;
  if (!a) return { checks: [], errors: [], warnings: [] };
  const checks = [];
  const at = (path, line) => ({ path, line });

  /* 1 — the folder itself. */
  const entry = a.files.find((f) => f.path === "AGENT.md");
  const empties = a.files.filter((f) => !f.content.trim());
  const chars = a.files.reduce((s, f) => s + f.content.length, 0);

  if (!a.name.trim()) {
    checks.push({
      id: "folder",
      grade: "fail",
      label: "This agent has no name",
      note: "The install command is the slug, and the slug comes from the name.",
    });
  } else if (!entry?.content.trim()) {
    checks.push({
      id: "folder",
      grade: "fail",
      label: "AGENT.md is empty",
      note: "The entrypoint is the one file a target actually reads.",
      at: at("AGENT.md", 1),
    });
  } else if (empties.length) {
    checks.push({
      id: "folder",
      grade: "warn",
      label: `${empties.length} file${empties.length === 1 ? "" : "s"} in the folder ${empties.length === 1 ? "is" : "are"} empty`,
      note: empties.map((f) => f.path).join(", "),
      at: at(empties[0].path, 1),
    });
  } else {
    checks.push({
      id: "folder",
      grade: "pass",
      label: "The folder is complete",
      note: `${a.files.length} files · ${n(chars)} characters · AGENT.md ${n(entry.content.length)}`,
    });
  }

  /* 2 — credentials, and vault references that resolve to nothing.
     Scanned over the projected config file too, which nothing else looks at. */
  const bodies = [...a.files, { path: AGENT_JSON_PATH, content: serialiseAgentJson(a) }];
  const found = bodies.flatMap((f) => secretsIn(f.content).map((s) => ({ ...s, path: f.path })));
  const refs = bodies.flatMap((f) =>
    [...f.content.matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g)].map((m) => ({ name: m[1], path: f.path })),
  );
  const unknown = refs.filter((r) => !VAULT.has(r.name));

  if (found.length) {
    checks.push({
      id: "secrets",
      grade: "fail",
      label: `${found[0].kind} in ${found[0].path}`,
      // Named, never printed. A check that quotes the credential back has put
      // it on screen, in a screenshot, and in the demo recording.
      note: `Line ${found[0].line}. Put it in the vault and reference it as {{NAME}} — this file travels with a release.`,
      at: at(found[0].path, found[0].line),
    });
  } else if (unknown.length) {
    checks.push({
      id: "secrets",
      grade: "warn",
      label: `{{${unknown[0].name}}} is not in the vault`,
      note: `Referenced from ${unknown[0].path}. It resolves to nothing on the machine that installs this.`,
      at: at(unknown[0].path, 1),
    });
  } else {
    checks.push({
      id: "secrets",
      grade: "pass",
      label: "No credentials in the files",
      note:
        `${bodies.length} files scanned line by line` +
        (refs.length ? ` · ${refs.length} vault reference${refs.length === 1 ? "" : "s"}, all resolved` : " · no vault references"),
    });
  }

  /* 3 — the package section.
     Not "agent.json is valid": it is generated from the record, so a
     serialise-then-parse round trip cannot fail by construction. What survives
     that is the MEANING of values that are individually legal. */
  const doc = serialiseAgentJson(a);
  const problems = parseAgentJson(doc, a).problems;
  const err = problems.find((p) => p.severity === "error");
  const warn = problems.find((p) => p.severity === "warning");
  const posture =
    a.tools === "scoped" ? `scoped, ${a.granted.length} tools` : a.tools === "open" ? "open" : "no tools";

  if (err) {
    checks.push({ id: "settings", grade: "fail", label: err.message, note: err.path || AGENT_JSON_PATH, at: at(AGENT_JSON_PATH, 1) });
  } else if (a.tools === "open") {
    checks.push({
      id: "settings",
      grade: "warn",
      label: "Tool posture is open",
      note: "That ships in the package section, and open means every tool available to whoever installs it.",
      at: at(AGENT_JSON_PATH, 1),
    });
  } else if (warn) {
    checks.push({ id: "settings", grade: "warn", label: warn.message, note: warn.path || AGENT_JSON_PATH, at: at(AGENT_JSON_PATH, 1) });
  } else {
    checks.push({
      id: "settings",
      grade: "pass",
      label: "The package settings hold together",
      note: `${doc.split("\n").length} lines · category ${a.category} · ${posture}`,
    });
  }

  /* 4 — preparation.yaml, when there is one.
     lint.js's own header says an error here "would be refused on release".
     This is the first thing in the product that makes that sentence true. */
  const prep = a.files.find((f) => f.path === PREPARATION_PATH);
  if (!prep) {
    checks.push({
      id: "preparation",
      grade: "skip",
      label: "No preparation document in this folder",
      note: "Nothing to check — this agent declares no machine setup.",
    });
  } else {
    const p = parsePreparation(prep.content);
    const lint = p.js ? lintPreparation(p.js) : [];
    const bad = lint.find((x) => x.severity === "error");
    const gaps = p.js ? missingPlatforms(p.js) : null;

    if (p.fatal) {
      checks.push({ id: "preparation", grade: "fail", label: p.fatal, note: PREPARATION_PATH, at: at(PREPARATION_PATH, 1) });
    } else if (bad) {
      checks.push({ id: "preparation", grade: "fail", label: bad.message, note: bad.path ?? PREPARATION_PATH, at: at(PREPARATION_PATH, 1) });
    } else if (gaps) {
      checks.push({ id: "preparation", grade: "warn", label: "Not every machine is covered", note: gapSentence(gaps), at: at(PREPARATION_PATH, 1) });
    } else {
      checks.push({
        id: "preparation",
        grade: "pass",
        label: "Preparation is clean",
        note: `${prep.content.split("\n").length} lines · ${(p.js?.preparation?.precheck ?? []).length} prechecks · ${lint.length} advisories`,
      });
    }
  }

  /* 5 — what would ship. The config file is regenerated BY the release, so it
     is counted at the commit rather than predicted here. */
  checks.push({
    id: "manifest",
    grade: "pass",
    label: "What would ship",
    note: `${a.files.length} files · ${n(chars)} characters, plus ${AGENT_JSON_PATH} regenerated at the new version`,
  });

  return {
    checks,
    errors: checks.filter((c) => c.grade === "fail"),
    warnings: checks.filter((c) => c.grade === "warn"),
  };
}
