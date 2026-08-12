/**
 * Unit tests — the AGENT.json projection.
 *
 * The round-trip property is the one everything else rests on: the file is
 * derived from the record, so serialise → parse → apply → serialise must
 * produce identical bytes. If it does not, the unsaved dot never clears and
 * every keystroke restamps `updated`.
 */
import { describe, it, expect } from "vitest";

import { AGENTS_V2 } from "@/data/agentsV2";
import { FIELDS } from "@/data/agentJsonSchema";
import {
  serialiseAgentJson,
  parseAgentJson,
  effectiveChanges,
  lineOfPath,
  looksLikeSecret,
  changedPaths,
} from "@/components/agents-v2/utils/agentJson";
import { jsonContextAt, readAt } from "@/components/agents-v2/utils/jsonPath";

/** The store's shape guarantees, applied the way the provider applies them. */
const norm = (a) => ({
  granted: [],
  targets: [],
  knowledge: [],
  collections: [],
  quickPrompts: [],
  releaseNotes: [],
  release: null,
  runtime: null,
  category: "Operations",
  status: "idle",
  visibility: "private",
  temperature: 0.7,
  maxTokens: 4096,
  maxIterations: 10,
  vectorDbId: "",
  ragMode: false,
  vectorSearch: false,
  apiTokenId: "",
  name: "",
  description: "",
  folders: [],
  ...a,
  toolCount: (a.granted ?? []).length,
});

const seeds = AGENTS_V2.map(norm);
const ic = seeds.find((a) => a.id === "a-incident");

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe("round-trip", () => {
  it.each(seeds.map((a) => [a.name, a]))("%s: its own file parses clean", (_name, a) => {
    const r = parseAgentJson(serialiseAgentJson(a), a);
    expect(r.problems.filter((p) => p.severity === "error")).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it.each(seeds.map((a) => [a.name, a]))("%s: its own file changes nothing", (_name, a) => {
    expect(parseAgentJson(serialiseAgentJson(a), a).patch).toEqual({});
  });

  it.each(seeds.map((a) => [a.name, a]))("%s: is byte-stable", (_name, a) => {
    const text = serialiseAgentJson(a);
    const applied = norm({ ...a, ...parseAgentJson(text, a).patch });
    expect(serialiseAgentJson(applied)).toBe(text);
  });
});

// ─── Emission ─────────────────────────────────────────────────────────────────

describe("section emission", () => {
  const bare = norm({ id: "x", name: "Bare", description: "d", files: [] });

  it("omits sections nothing was decided in", () => {
    const text = serialiseAgentJson(bare);
    expect(text).not.toContain('"runtime"');
    expect(text).not.toContain('"knowledge"');
    expect(text).not.toContain('"chat"');
    expect(text).not.toContain('"workspace"');
  });

  it("omits an empty version rather than inviting someone to type one", () => {
    expect(serialiseAgentJson(bare)).not.toContain('"version"');
  });

  it("emits a whole section once any field in it differs", () => {
    const text = serialiseAgentJson(ic);
    expect(text).toContain('"temperature": 0.7'); // a default, carried by a touched section
    expect(text).toContain('"provider": "Anthropic"');
  });

  it("keeps short arrays on one line so a form edit moves one line", () => {
    expect(serialiseAgentJson(ic)).toContain('"targets": ["claude", "codex"]');
  });
});

// ─── Writes never corrupt the record ──────────────────────────────────────────

describe("field writes", () => {
  const junk = [undefined, null, {}, [], 42, "nonsense-value", true, Number.NaN];

  it.each(FIELDS.map((f) => [f.path, f]))("%s returns a patch object for any input", (_p, spec) => {
    for (const j of junk) {
      const out = spec.write(j, ic);
      expect(out && typeof out === "object" && !Array.isArray(out)).toBe(true);
    }
  });

  it.each(FIELDS.map((f) => [f.path, f]))("%s never writes undefined onto a key", (_p, spec) => {
    for (const j of junk) {
      for (const v of Object.values(spec.write(j, ic))) expect(v).not.toBeUndefined();
    }
  });

  it.each(FIELDS.map((f) => [f.path, f]))("%s has a defined fallback", (_p, spec) => {
    expect(spec.fallback).toBeDefined();
  });
});

// ─── Invalid input ────────────────────────────────────────────────────────────

describe("invalid documents commit nothing", () => {
  it.each([["{"], ['{"package":{,}}'], ["not json"], ["[]"], ["null"], ['{"package":{"name":"x",}}']])(
    "rejects %s",
    (bad) => {
      const r = parseAgentJson(bad, ic);
      expect(r.ok).toBe(false);
      expect(r.patch).toBeNull();
      expect(r.problems[0].message).toBeTruthy();
    },
  );

  it("explains a trailing comma in words", () => {
    expect(parseAgentJson('{"package":{"name":"x",}}', ic).problems[0].message).toMatch(/JSON|comma/i);
  });
});

// ─── Cross-field rules ────────────────────────────────────────────────────────

describe("cross-field validation", () => {
  const doc = (frag) => JSON.stringify({ ...JSON.parse(serialiseAgentJson(ic)), ...frag });

  it("catches the provider id written where the name belongs", () => {
    const r = parseAgentJson(doc({ runtime: { provider: "anthropic", model: "Claude Opus 4.5" } }), ic);
    const p = r.problems.find((x) => x.path === "runtime.provider");
    expect(p.message).toMatch(/id/);
    expect(p.fix.label).toBe("Use Anthropic");
  });

  it("catches a model the provider does not serve, and offers one it does", () => {
    const r = parseAgentJson(doc({ runtime: { provider: "Anthropic", model: "GPT-5" } }), ic);
    expect(r.problems.find((x) => x.path === "runtime.model").fix.label).toMatch(/Claude/);
  });

  it("catches a collection that is not in the selected database", () => {
    const r = parseAgentJson(doc({ knowledge: { vectorDb: "vdb-hr", collections: ["runbooks"] } }), ic);
    expect(r.problems.find((x) => x.path === "knowledge.collections").message).toMatch(/People & Policy/);
  });

  it("catches an unknown tool", () => {
    const r = parseAgentJson(doc({ package: { tools: { posture: "scoped", granted: ["web_serch"] } } }), ic);
    expect(r.problems.some((x) => x.path === "package.tools.granted")).toBe(true);
  });

  it("warns rather than errors on scoped-with-nothing, which the UI can already reach", () => {
    const d = JSON.parse(serialiseAgentJson(ic));
    d.package.tools.granted = [];
    const r = parseAgentJson(JSON.stringify(d), ic);
    expect(r.ok).toBe(true);
    expect(r.problems.some((p) => p.severity === "warning")).toBe(true);
  });

  it("warns on RAG with no database", () => {
    const d = JSON.parse(serialiseAgentJson(ic));
    d.knowledge.vectorDb = "";
    const r = parseAgentJson(JSON.stringify(d), ic);
    expect(r.problems.some((p) => p.path === "knowledge.ragMode")).toBe(true);
  });

  it("reports an unknown top-level key instead of silently dropping it", () => {
    const r = parseAgentJson(doc({ agnet: {} }), ic);
    expect(r.problems.find((p) => p.path === "agnet").message).toMatch(/dropped/);
  });
});

// ─── Deletion semantics ───────────────────────────────────────────────────────

describe("an absent key means its default", () => {
  it("unbinds the agent when the runtime block is deleted", () => {
    const d = JSON.parse(serialiseAgentJson(ic));
    delete d.runtime;
    const r = parseAgentJson(JSON.stringify(d), ic);
    expect(r.ok).toBe(true);
    expect(r.patch.runtime).toBeNull();
  });

  it("leaves the model alone when only its line is deleted", () => {
    const d = JSON.parse(serialiseAgentJson(ic));
    delete d.runtime.model;
    const r = parseAgentJson(JSON.stringify(d), ic);
    expect(r.ok).toBe(true);
    expect(r.patch).toEqual({});
  });
});

// ─── Editing ──────────────────────────────────────────────────────────────────

describe("editing", () => {
  it("produces a minimal patch", () => {
    const d = JSON.parse(serialiseAgentJson(ic));
    d.runtime.temperature = 0.2;
    expect(parseAgentJson(JSON.stringify(d), ic).patch).toEqual({ temperature: 0.2 });
  });

  it("reports a half-finished vendor switch rather than rewriting it", () => {
    const d = JSON.parse(serialiseAgentJson(ic));
    d.runtime.provider = "OpenAI";
    const r = parseAgentJson(JSON.stringify(d), ic);
    expect(r.ok).toBe(false);
    expect(r.patch).toBeNull();
    expect(r.problems.filter((p) => p.fix).length).toBeGreaterThan(0);
  });

  it("applies a coherent vendor switch", () => {
    const d = JSON.parse(serialiseAgentJson(ic));
    Object.assign(d.runtime, { provider: "OpenAI", model: "GPT-5 mini", apiToken: "openai-default" });
    const r = parseAgentJson(JSON.stringify(d), ic);
    expect(r.ok).toBe(true);
    expect(r.patch.runtime.model).toBe("GPT-5 mini");
    expect(r.patch.apiTokenId).toBe("openai-default");
  });

  it("re-derives the slug because name arrives as a real record key", () => {
    const d = JSON.parse(serialiseAgentJson(ic));
    d.package.name = "Bridge Commander";
    expect(parseAgentJson(JSON.stringify(d), ic).patch).toHaveProperty("name", "Bridge Commander");
  });
});

// ─── effectiveChanges ─────────────────────────────────────────────────────────

describe("effectiveChanges", () => {
  it("is empty for an identical record, so `updated` cannot churn", () => {
    expect(effectiveChanges(ic, { ...ic })).toEqual({});
  });

  it("reports only what moved", () => {
    expect(effectiveChanges(ic, { ...ic, temperature: 0.1 })).toEqual({ temperature: 0.1 });
  });
});

// ─── Secrets ──────────────────────────────────────────────────────────────────

describe("looksLikeSecret", () => {
  it.each([
    ["sk-ant-api03-cg2xxxxxxxxxxxxxxxxaqAA", true],
    ["ghp_abcdefghijklmnopqrstuvwxyz0123", true],
    ["AKIAIOSFODNN7EXAMPLE", true],
    ["{{JENKINS_API_TOKEN}}", false],
    ["sk-ant-api03-cg2…aqAA", false],
    ["a normal description mentioning sk- prefixes", false],
    ["anthropic-rnd", false],
  ])("%s -> %s", (v, want) => expect(looksLikeSecret(v)).toBe(want));

  it("blocks a pasted credential from committing", () => {
    const d = JSON.parse(serialiseAgentJson(ic));
    d.package.description = "call it with sk-ant-api03-cg2aqAAxxxxxxxxxxxxxxxx";
    const r = parseAgentJson(JSON.stringify(d), ic);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => /vault/.test(p.message))).toBe(true);
  });
});

// ─── Locating keys ────────────────────────────────────────────────────────────

describe("lineOfPath", () => {
  const text = serialiseAgentJson(ic);

  it.each([["package.name"], ["runtime.model"], ["package.tools.granted"], ["knowledge.collections"]])(
    "finds %s on the line that declares it",
    (path) => {
      const n = lineOfPath(text, path);
      expect(n).toBeGreaterThan(0);
      expect(text.split("\n")[n - 1]).toContain(`"${path.split(".").pop()}"`);
    },
  );

  it("returns 0 for a path that is not in the text", () => {
    expect(lineOfPath(text, "nope.nope")).toBe(0);
  });
});

describe("changedPaths", () => {
  it("counts a decision and ignores a default", () => {
    const c = changedPaths(ic);
    expect(c.has("runtime.provider")).toBe(true);
    expect(c.has("runtime.temperature")).toBe(false);
  });
});

// ─── Caret resolution ─────────────────────────────────────────────────────────

describe("jsonContextAt", () => {
  const at = (tpl) => jsonContextAt(tpl.replace("|", ""), tpl.indexOf("|"));

  it("tells a property name from a value", () => {
    expect(at('{\n  "na|"\n}').where).toBe("key");
    expect(at('{\n  "name": "In|"\n}').where).toBe("value");
  });

  it("resolves nested and array positions", () => {
    expect(at('{"runtime": {"provider": "Anth|"}}').path).toEqual(["runtime", "provider"]);
    expect(at('{"granted": ["web_search", "git|"]}').path).toEqual(["granted", 1]);
  });

  it("replaces through the closing quote so a mid-word accept is clean", () => {
    const tpl = '{"provider": "Ant|hropic"}';
    const text = tpl.replace("|", "");
    const c = at(tpl);
    expect(text.slice(c.start, c.end)).toBe('Anthropic"');
  });

  it("never throws on the malformed text that exists mid-keystroke", () => {
    for (const j of ["", "{", "[", "}", '{"a":', '{"a":"', "null", '{"a":[{"b":', "\\", "{}}"]) {
      expect(() => jsonContextAt(j, j.length)).not.toThrow();
      expect(() => readAt(j, ["a"])).not.toThrow();
    }
  });
});
