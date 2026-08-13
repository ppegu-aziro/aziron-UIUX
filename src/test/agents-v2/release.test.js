/**
 * Unit tests — preflight and the release script.
 *
 * The load-bearing one is "a blocked release compiles no commit event". That is
 * what makes a half-published state impossible: not an ordering promise, not a
 * rollback, but the absence of the only event that writes. It is checked here
 * by walking every truncation of every compiled script, because "nothing was
 * written" has to hold at every point somebody could close the dialog.
 */
import { describe, expect, it } from "vitest";

import { AGENTS_V2 } from "@/data/agentsV2";
import { AGENT_JSON_PATH } from "@/data/agentJsonSchema";
import { PREPARATION_PATH, SEED } from "@/data/preparationSchema";
import { preflight } from "@/components/agents-v2/utils/preflight";
import { compileRelease, manifestOf, reduceRelease, EMPTY_RELEASE } from "@/components/agents-v2/utils/releaseScript";
import { secretsIn, serialiseAgentJson } from "@/components/agents-v2/utils/agentJson";

const base = (a) => ({
  folders: [], granted: [], knowledge: [], targets: [], quickPrompts: [], releaseNotes: [],
  temperature: 0.3, maxTokens: 4096, maxIterations: 10, tools: "none", category: "Operations",
  status: "idle", visibility: "private", description: "Answers questions.", runtime: null,
  apiTokenId: "", slug: "agent", release: null, name: "Agent",
  files: [{ path: "AGENT.md", content: "# Agent\n\nDoes a thing.\n" }],
  ...a,
});

const CLEAN = base({ id: "a-clean", name: "Leave Desk", slug: "leave-desk" });

const PLAN = { kind: "minor", notes: "", targets: ["claude"], version: "1.1.0" };

/* ── the fail-open bug this feature exists for ───────────────────────────── */

describe("secretsIn", () => {
  it("finds a credential on a line even when the file also references the vault", () => {
    // The whole-body test returns false here: looksLikeSecret bails on any
    // value containing "{{", so one reference switched the scan off for the
    // entire file — on exactly the files this product tells you to write.
    const body = "# Notes\n\nUse {{GITHUB_TOKEN}} for the API.\nfallback ghp_abcdefghijklmnopqrstuvwxyz012345\n";
    const hits = secretsIn(body);
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(4);
    expect(hits[0].kind).toMatch(/GitHub/);
  });

  it("does not call a bare vault reference a secret", () => {
    expect(secretsIn("token: {{GITHUB_TOKEN}}\n")).toEqual([]);
  });

  it("reports 1-based lines", () => {
    expect(secretsIn("a\nb\nsk-ant-abcdefghijklmnopqrstuv\n")[0].line).toBe(3);
  });
});

/* ── preflight ───────────────────────────────────────────────────────────── */

describe("preflight", () => {
  it("passes every seeded agent without a single failure", () => {
    for (const seed of AGENTS_V2) {
      const report = preflight(base({ ...seed, files: seed.files ?? [] }));
      expect(report.errors.map((e) => e.label), seed.name).toEqual([]);
    }
  });

  it("is deterministic", () => {
    expect(preflight(CLEAN)).toEqual(preflight(CLEAN));
  });

  it("blocks an unnamed agent, because the slug is the install command", () => {
    const report = preflight(base({ id: "x", name: "  " }));
    expect(report.errors[0].id).toBe("folder");
  });

  it("blocks an empty entrypoint", () => {
    const report = preflight(base({ id: "x", files: [{ path: "AGENT.md", content: "\n\n" }] }));
    expect(report.errors[0].label).toMatch(/AGENT\.md is empty/);
  });

  it("blocks a credential in a file, and names it without printing it", () => {
    const report = preflight(
      base({
        id: "x",
        files: [
          { path: "AGENT.md", content: "# A\n\nBody.\n" },
          { path: "references/n.md", content: "# N\n\nUse {{GITHUB_TOKEN}}.\nghp_abcdefghijklmnopqrstuvwxyz012345\n" },
        ],
      }),
    );
    const fail = report.errors.find((e) => e.id === "secrets");
    expect(fail).toBeTruthy();
    expect(fail.label).toMatch(/references\/n\.md/);
    expect(`${fail.label} ${fail.note}`).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz012345");
  });

  it("scans the generated config file too", () => {
    const report = preflight(base({ id: "x", description: "key ghp_abcdefghijklmnopqrstuvwxyz012345" }));
    const fail = report.errors.find((e) => e.id === "secrets");
    expect(fail.label).toContain(AGENT_JSON_PATH);
  });

  it("warns on a vault reference that resolves to nothing", () => {
    const report = preflight(base({ id: "x", files: [{ path: "AGENT.md", content: "# A\n\n{{NOT_A_REAL_VAR}}\n" }] }));
    expect(report.warnings.find((w) => w.id === "secrets").label).toMatch(/NOT_A_REAL_VAR/);
    expect(report.errors).toEqual([]);
  });

  it("does not warn on a reference that IS in the vault", () => {
    const report = preflight(base({ id: "x", files: [{ path: "AGENT.md", content: "# A\n\n{{GITHUB_TOKEN}}\n" }] }));
    expect(report.warnings.find((w) => w.id === "secrets")).toBeUndefined();
  });

  it("warns rather than blocks on an open tool posture", () => {
    const report = preflight(base({ id: "x", tools: "open" }));
    expect(report.errors).toEqual([]);
    expect(report.warnings.find((w) => w.id === "settings").label).toMatch(/open/);
  });

  it("skips preparation rather than passing it when there is no such file", () => {
    const check = preflight(CLEAN).checks.find((c) => c.id === "preparation");
    expect(check.grade).toBe("skip");
    // A skip is neither an error nor a warning — and it is not a green tick,
    // which is the whole reason it has its own grade.
    expect(preflight(CLEAN).errors).toEqual([]);
    expect(preflight(CLEAN).warnings.find((w) => w.id === "preparation")).toBeUndefined();
  });

  it("reads a real preparation document rather than assuming it is fine", () => {
    const report = preflight(
      base({ id: "x", files: [{ path: "AGENT.md", content: "# A\n\nB.\n" }, { path: PREPARATION_PATH, content: SEED }] }),
    );
    const check = report.checks.find((c) => c.id === "preparation");
    expect(["pass", "warn"]).toContain(check.grade);
    expect(check.note).toBeTruthy();
  });

  it("blocks a preparation document that will not parse", () => {
    const report = preflight(
      base({ id: "x", files: [{ path: "AGENT.md", content: "# A\n\nB.\n" }, { path: PREPARATION_PATH, content: "\tnope: [" }] }),
    );
    expect(report.errors.find((e) => e.id === "preparation")).toBeTruthy();
  });

  it("gives every check evidence, so no row is a delay with a label", () => {
    for (const c of preflight(CLEAN).checks) {
      expect(c.label, c.id).toBeTruthy();
      expect(c.note, c.id).toBeTruthy();
    }
  });
});

/* ── the release script ──────────────────────────────────────────────────── */

describe("compileRelease", () => {
  const commits = (evs) => evs.filter((e) => e.t === "commit");

  it("is deterministic", () => {
    expect(compileRelease(CLEAN, PLAN)).toEqual(compileRelease(CLEAN, PLAN));
  });

  it("compiles exactly one commit for a record that passes", () => {
    expect(commits(compileRelease(CLEAN, PLAN))).toHaveLength(1);
  });

  it("compiles NO commit at all for a record that fails, and halts instead", () => {
    const blocked = base({ id: "x", name: "" });
    const evs = compileRelease(blocked, PLAN);
    expect(commits(evs)).toHaveLength(0);
    expect(evs.at(-1).t).toBe("halt");
  });

  it("carries every check as an event, in order", () => {
    const report = preflight(CLEAN);
    const evs = compileRelease(CLEAN, PLAN).filter((e) => e.t === "check");
    expect(evs.map((e) => e.id)).toEqual(report.checks.map((c) => c.id));
  });

  it("never writes at any truncation of a blocked script", () => {
    // The property that makes a half-published state impossible: whatever
    // point you cut it at, there is no commit in the prefix.
    const blocked = base({ id: "x", files: [{ path: "AGENT.md", content: "" }] });
    const evs = compileRelease(blocked, PLAN);
    for (let k = 0; k <= evs.length; k += 1) {
      expect(commits(evs.slice(0, k))).toHaveLength(0);
    }
  });

  it("puts the commit before the targets, because they describe what it recorded", () => {
    const evs = compileRelease(CLEAN, { ...PLAN, targets: ["claude", "cursor"] });
    const ci = evs.findIndex((e) => e.t === "commit");
    const ti = evs.findIndex((e) => e.t === "target");
    expect(ci).toBeGreaterThan(-1);
    expect(ti).toBeGreaterThan(ci);
  });

  it("names a real install path per target without claiming to have installed", () => {
    const evs = compileRelease(CLEAN, { ...PLAN, targets: ["claude"] });
    const t = evs.find((e) => e.t === "target");
    expect(t.path).toBe("~/.claude/skills/leave-desk/");
  });

  it("survives being reduced at every cut point", () => {
    const evs = compileRelease(CLEAN, PLAN);
    for (let k = 0; k <= evs.length; k += 1) {
      const view = evs.slice(0, k).reduce(reduceRelease, EMPTY_RELEASE);
      expect(Array.isArray(view.checks)).toBe(true);
      expect(Array.isArray(view.targets)).toBe(true);
    }
  });
});

describe("the manifest", () => {
  it("lists every file with its size, sorted", () => {
    const m = manifestOf([
      { path: "b.md", content: "xx" },
      { path: "a.md", content: "y" },
    ]);
    expect(m).toEqual([
      { path: "a.md", chars: 1 },
      { path: "b.md", chars: 2 },
    ]);
  });

  it("counts the config file at the version it ships, not the one before", () => {
    // The config file carries the version and the target list, so serialising
    // it before the release describes a package that was never released.
    const before = serialiseAgentJson(CLEAN).length;
    const after = serialiseAgentJson({
      ...CLEAN,
      release: { version: "1.1.0", published: "just now" },
      targets: ["claude"],
    }).length;
    expect(after).not.toBe(before);
  });
});
