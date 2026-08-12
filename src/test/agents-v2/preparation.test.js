/**
 * Unit tests — the preparation document.
 *
 * Measured against the real contract corpus, copied byte-for-byte from the
 * Aziron repo's `contracts/preparation/`. That directory is the canonical
 * definition of what the file means, and its own README records why it exists:
 * a previous contract drifted because nothing checked two implementations
 * against one another. Paraphrasing the fixtures here would repeat that.
 *
 * The invalid fixtures are asserted by PATH, never by message wording — the
 * corpus matches messages as substrings precisely so wording can improve
 * without churning fixtures.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { GOOS } from "@/data/preparationSchema";
import { parsePreparation, lineOfPath, pathAt, docPathOf, segmentsOf } from "@/components/agents-v2/utils/preparation/document";
import {
  coverageOf,
  missingPlatforms,
  planFor,
  platformsOf,
  resolveCheck,
  resolvePlatform,
  strategiesOf,
} from "@/components/agents-v2/utils/preparation/resolve";
import { lintPreparation } from "@/components/agents-v2/utils/preparation/lint";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "fixtures", "preparation");
const read = (...p) => readFileSync(join(FIX, ...p), "utf8");
const list = (sub) => readdirSync(join(FIX, sub)).filter((f) => f.endsWith(".yaml"));

const valid = list("valid");
const invalid = list("invalid");
const authored = list("authored");

// ─── Parsing ──────────────────────────────────────────────────────────────────

describe("parsePreparation", () => {
  it.each(valid)("valid/%s parses with no fatal", (f) => {
    const r = parsePreparation(read("valid", f));
    expect(r.fatal).toBeNull();
    expect(r.js.schema).toBe(1);
  });

  it.each(authored)("authored/%s parses with no fatal", (f) => {
    const r = parsePreparation(read("authored", f));
    expect(r.fatal).toBeNull();
    expect(r.js.preparation).toBeTruthy();
  });

  it.each(invalid)("invalid/%s is a SCHEMA failure, not a parse failure", (f) => {
    // Every fixture in the corpus is well-formed YAML. If any of these started
    // failing to parse, the validator below would never get to see them and
    // its rules would be silently untested.
    expect(parsePreparation(read("invalid", f)).fatal).toBeNull();
  });

  it("never throws on half-typed text", () => {
    for (const junk of ["", "schema:", "  bad: [indent", "\t tabs", "preparation:\n  precheck:\n    - id:"]) {
      expect(() => parsePreparation(junk)).not.toThrow();
    }
  });

  it("returns a usable tree even mid-keystroke", () => {
    const r = parsePreparation("schema: 1\npreparation:\n  precheck:\n    - id: aws\n      lab");
    expect(r.js.preparation.precheck[0].id).toBe("aws");
  });
});

// ─── Platform resolution ──────────────────────────────────────────────────────

describe("resolvePlatform", () => {
  it("prefers an exact key", () => {
    expect(resolvePlatform({ all: "A", windows: "W" }, "windows")).toEqual({ entry: "W", key: "windows" });
  });

  it("falls back to all", () => {
    expect(resolvePlatform({ all: "A" }, "windows")).toEqual({ entry: "A", key: "all" });
  });

  it("matches a comma-list, and reports the raw key", () => {
    expect(resolvePlatform({ "darwin,linux": "D", all: "A" }, "linux")).toEqual({
      entry: "D",
      key: "darwin,linux",
    });
  });

  it("tolerates spaces inside a comma-list", () => {
    expect(resolvePlatform({ "darwin, linux": "D" }, "linux").key).toBe("darwin, linux");
  });

  it("treats a present-but-empty key as absent and falls through", () => {
    // The ordinary shape of a half-written document. Matching it would show an
    // empty plan where the machine would actually run the `all` body.
    expect(resolvePlatform({ windows: null, all: "A" }, "windows")).toEqual({ entry: "A", key: "all" });
  });

  it("is deterministic when two comma-lists both match", () => {
    const map = { "darwin,windows": "B", "darwin,linux": "A" };
    expect(resolvePlatform(map, "darwin").key).toBe("darwin,linux");
    expect(resolvePlatform(map, "darwin").key).toBe("darwin,linux");
  });

  it("returns null for an empty or absent map", () => {
    expect(resolvePlatform(null, "linux")).toBeNull();
    expect(resolvePlatform({}, "linux")).toBeNull();
  });

  it("never merges all into a specific platform", () => {
    const map = { all: { check: { kind: "binary", value: "a" } }, windows: { check: { kind: "binary", value: "w" } } };
    expect(resolvePlatform(map, "windows").entry.check.value).toBe("w");
  });
});

describe("resolveCheck", () => {
  it("does not fall back to all when the resolved entry has no check", () => {
    // Only reachable in a document being typed into — which is the editor's
    // normal state — and showing the `all` probe there would invent a plan.
    const p = { platforms: { all: { check: { kind: "binary", value: "a" } }, linux: {} } };
    expect(resolveCheck(p, "linux")).toBeNull();
    expect(resolveCheck(p, "darwin").key).toBe("all");
  });
});

// ─── The comma-list fixture, which is why the tabs exist ──────────────────────

describe("sugar-and-comma-platforms", () => {
  const js = parsePreparation(read("valid", "sugar-and-comma-platforms.yaml")).js;
  const docker = js.preparation.precheck[0];

  it("puts the darwin,linux body on BOTH the macOS and Linux tabs", () => {
    expect(resolveCheck(docker, "darwin").check.argv).toEqual(["docker", "info"]);
    expect(resolveCheck(docker, "linux").check.argv).toEqual(["docker", "info"]);
  });

  it("shows a different command on Windows", () => {
    const w = resolveCheck(docker, "windows");
    expect(w.check.argv).toEqual(["docker", "version"]);
    expect(w.check.timeout_seconds).toBe(30);
  });

  it("expands `actions:` shorthand into one unconditional strategy", () => {
    const step = js.preparation.preconfigure.configure[0];
    const ladder = strategiesOf(step.platforms.all);
    expect(ladder).toHaveLength(1);
    expect(ladder[0].id).toBe("default");
    expect(ladder[0].requires ?? []).toEqual([]);
  });
});

// ─── Coverage: three states, not two ──────────────────────────────────────────

describe("coverageOf", () => {
  const step = (actions) => ({ platforms: { all: { strategies: [{ id: "s", actions }] } } });

  it("calls a step that only prints instructions manual-only", () => {
    expect(coverageOf(step([{ kind: "instructions", message: "do it" }]), "linux")).toBe("manual-only");
  });

  it("calls a step that runs something covered", () => {
    expect(coverageOf(step([{ kind: "command", argv: ["apt-get", "install"] }]), "linux")).toBe("covered");
  });

  it("calls a platform with no body undefined", () => {
    expect(coverageOf({ platforms: { windows: { strategies: [] } } }, "linux")).toBe("undefined");
  });

  it("finds real manual-only steps in the authored corpus", () => {
    // The distinction earns its place only if it fires on real documents.
    const js = parsePreparation(read("authored", "aws-cft-deployment.yaml")).js;
    const all = GOOS.flatMap((g) => planFor(js, g).phases.flatMap((p) => p.steps.map((s) => s.coverage)));
    expect(all).toContain("manual-only");
  });
});

describe("missingPlatforms", () => {
  it("is null for a document that covers every machine", () => {
    expect(missingPlatforms(parsePreparation(read("valid", "aws-multi-os.yaml")).js)).toBeNull();
  });

  it.each(authored)("authored/%s has no gaps", (f) => {
    expect(missingPlatforms(parsePreparation(read("authored", f)).js)).toBeNull();
  });

  it("names the machine and the step when one is missing", () => {
    const js = {
      preparation: { precheck: [{ id: "a", label: "A tool", platforms: { windows: { check: { kind: "binary", value: "a" } } } }] },
    };
    const gaps = missingPlatforms(js);
    expect(gaps.darwin).toEqual(["A tool"]);
    expect(gaps.linux).toEqual(["A tool"]);
    expect(gaps.windows).toBeUndefined();
  });
});

describe("platformsOf", () => {
  it("expands all and comma-lists", () => {
    expect(platformsOf(parsePreparation(read("valid", "sugar-and-comma-platforms.yaml")).js)).toEqual([
      "darwin", "linux", "windows",
    ]);
  });
});

// ─── The plan one tab renders ─────────────────────────────────────────────────

describe("planFor", () => {
  const js = parsePreparation(read("valid", "aws-multi-os.yaml")).js;

  it("resolves the Windows ladder to three strategies, manual last", () => {
    const step = js && planFor(js, "windows").phases.flatMap((p) => p.steps).find((s) => s.id === "install-aws-cli");
    expect(step.from).toBe("windows");
    expect(step.strategies.map((s) => s.id)).toEqual(["winget", "msi", "manual"]);
    expect(step.strategies.at(-1).requires).toEqual([]);
  });

  it("resolves the same step differently on macOS", () => {
    const step = planFor(js, "darwin").phases.flatMap((p) => p.steps).find((s) => s.id === "install-aws-cli");
    expect(step.from).toBe("darwin");
    expect(step.strategies.map((s) => s.id)).not.toEqual(["winget", "msi", "manual"]);
  });

  it("spells out the when status that was never written down", () => {
    const step = planFor(js, "linux").phases.flatMap((p) => p.steps).find((s) => s.when?.precheck);
    expect(WHEN_OK).toContain(step.whenStatus);
  });

  it("reports a verdict per machine", () => {
    for (const g of GOOS) expect(["covered", "manual", "gaps", "empty"]).toContain(planFor(js, g).verdict);
  });

  it("carries the prompt", () => {
    expect(planFor(js, "linux").prompt).toMatch(/AWS toolchain/);
  });

  it("survives a null document", () => {
    expect(planFor(null, "linux").verdict).toBe("empty");
  });
});
const WHEN_OK = ["satisfied", "unsatisfied", "error", "any"];

// ─── Validation, against the corpus's own expectations ────────────────────────

describe("lintPreparation", () => {
  it.each(valid)("valid/%s produces no errors", (f) => {
    const problems = lintPreparation(parsePreparation(read("valid", f)).js);
    expect(problems.filter((p) => p.severity === "error")).toEqual([]);
  });

  it.each(authored)("authored/%s produces no errors", (f) => {
    const problems = lintPreparation(parsePreparation(read("authored", f)).js);
    expect(problems.filter((p) => p.severity === "error")).toEqual([]);
  });

  /**
   * Each line of an `.issues.txt` is "<dotted path> <message substring>". We
   * assert only the path — the corpus deliberately substring-matches messages
   * so wording can be improved, and a test pinned to wording would either be
   * weakened or deleted the first time someone rephrased a sentence.
   */
  describe.each(invalid)("invalid/%s", (f) => {
    const expected = readFileSync(join(FIX, "invalid", f.replace(/\.yaml$/, ".issues.txt")), "utf8")
      .split("\n").map((l) => l.trim()).filter(Boolean)
      .map((l) => l.split(/\s+/)[0])
      .filter((p) => p !== "-");
    const problems = lintPreparation(parsePreparation(read("invalid", f)).js);

    it("is rejected", () => {
      expect(problems.filter((p) => p.severity === "error").length).toBeGreaterThan(0);
    });

    if (expected.length) {
      it.each(expected)("reports something at %s", (path) => {
        // Prefix match: the contract points at the deepest node, and reporting
        // the problem on an ancestor is a difference in precision, not in
        // whether the document was caught.
        const hit = problems.some((p) => p.path === path || path.startsWith(p.path) || p.path.startsWith(path));
        expect(hit).toBe(true);
      });
    }
  });

  it("catches the no-dead-end rule with the consequence spelled out", () => {
    const problems = lintPreparation(parsePreparation(read("invalid", "terminal-strategy-requires.yaml")).js);
    const p = problems.find((x) => x.rule === "terminal-strategy-requires");
    expect(p).toBeTruthy();
    expect(p.message).toMatch(/winget/);
    expect(p.message).toMatch(/no way forward/);
  });

  it("catches a dependency cycle and names the loop", () => {
    const js = {
      schema: 1,
      preparation: {
        precheck: [
          { id: "alpha", depends_on: ["beta"], platforms: { all: { check: { kind: "binary", value: "a" } } } },
          { id: "beta", depends_on: ["alpha"], platforms: { all: { check: { kind: "binary", value: "b" } } } },
        ],
      },
    };
    const p = lintPreparation(js).find((x) => x.rule === "depends-on-cycle");
    expect(p.message).toMatch(/alpha/);
    expect(p.message).toMatch(/→/);
  });

  it("offers a did-you-mean on a near-miss platform key", () => {
    const js = { schema: 1, preparation: { precheck: [{ id: "a", platforms: { windwos: { check: { kind: "binary", value: "a" } } } }] } };
    expect(lintPreparation(js).find((p) => p.rule === "platform-key-unknown").message).toMatch(/windows/);
  });

  it("does not flag a valid document's argv as unsplit", () => {
    const problems = lintPreparation(parsePreparation(read("valid", "aws-multi-os.yaml")).js);
    expect(problems.filter((p) => p.rule === "argv-not-split")).toEqual([]);
  });
});

// ─── Paths and lines ──────────────────────────────────────────────────────────

describe("paths", () => {
  it("round-trips segments through a dotted path", () => {
    const segs = ["preparation", "precheck", 0, "platforms", "all", "check"];
    expect(docPathOf(segs)).toBe("preparation.precheck[0].platforms.all.check");
    expect(segmentsOf(docPathOf(segs))).toEqual(segs);
  });

  it("keeps a comma-bearing platform key as one segment", () => {
    // A naive split on "." is fine, but the key itself contains a comma — the
    // reason paths are built from arrays and never split on the separator.
    expect(docPathOf(["platforms", "darwin,linux"])).toBe("platforms.darwin,linux");
  });

  it("finds the line a path starts on", () => {
    const text = read("valid", "aws-multi-os.yaml");
    const { doc } = parsePreparation(text);
    const n = lineOfPath(text, doc, "preparation.precheck[0].id");
    expect(n).toBeGreaterThan(0);
    expect(text.split("\n")[n - 1]).toContain("aws-cli");
  });

  it("returns 0 for a path that is not there", () => {
    const text = read("valid", "binary-only.yaml");
    expect(lineOfPath(text, parsePreparation(text).doc, "preparation.nope[3].x")).toBe(0);
  });

  it("maps an offset back to a path", () => {
    const text = read("valid", "aws-multi-os.yaml");
    const { doc } = parsePreparation(text);
    const at = text.indexOf("aws-cli");
    expect(pathAt(doc, at)).toMatch(/^preparation\.precheck\[0\]/);
  });
});

// ─── The verdict a tab badge shows ────────────────────────────────────────────

describe("plan verdict", () => {
  const withStep = (strategies) => ({
    schema: 1,
    preparation: {
      precheck: [{ id: "a", label: "A", platforms: { all: { check: { kind: "binary", value: "a" } } } }],
      preconfigure: { commands: [{ id: "s", label: "S", platforms: { all: { strategies } } }] },
    },
  });

  it("is manual when every STEP only tells the user what to do", () => {
    // A precheck is a probe and changes nothing, so counting it as automation
    // would make this document read as covered.
    const js = withStep([{ id: "m", actions: [{ kind: "instructions", message: "do it" }] }]);
    expect(planFor(js, "linux").verdict).toBe("manual");
  });

  it("is covered when a step actually runs something", () => {
    const js = withStep([{ id: "m", actions: [{ kind: "command", argv: ["apt-get", "install", "x"] }] }]);
    expect(planFor(js, "linux").verdict).toBe("covered");
  });

  it("is gaps when any machine has nothing declared", () => {
    const js = {
      schema: 1,
      preparation: {
        preconfigure: {
          commands: [{ id: "s", platforms: { windows: { strategies: [{ id: "m", actions: [{ kind: "instructions", message: "x" }] }] } } }],
        },
      },
    };
    expect(planFor(js, "linux").verdict).toBe("gaps");
    expect(planFor(js, "windows").verdict).toBe("manual");
  });

  it("is empty when nothing is declared", () => {
    expect(planFor({ schema: 1, preparation: {} }, "linux").verdict).toBe("empty");
  });
});
