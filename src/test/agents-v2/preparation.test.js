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
import {
  appendItem,
  removeAt,
  replaceScalar,
  setScalar,
} from "@/components/agents-v2/utils/preparation/yamlSplice";

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

// ─── Writing: byte-range splices only ─────────────────────────────────────────

describe("yamlSplice", () => {
  const parse = (t) => parsePreparation(t).doc;

  describe("replaceScalar", () => {
    it("replaces the value and nothing else", () => {
      const t = "preparation:\n  prompt: Set up now?\n  x: 1\n";
      const r = replaceScalar(t, parse(t), ["preparation", "prompt"], "Ready to configure?");
      expect(r.text).toBe("preparation:\n  prompt: Ready to configure?\n  x: 1\n");
    });

    it("keeps a trailing comment on the same line", () => {
      // range[1] is the end of the VALUE; range[2] would swallow the comment.
      const t = "preparation:\n  prompt: Set up now?   # asked once\n";
      const r = replaceScalar(t, parse(t), ["preparation", "prompt"], "Now?");
      expect(r.text).toContain("# asked once");
      expect(r.text).toContain("prompt: Now?");
    });

    it("keeps single quotes on a regex, so backslashes are not doubled", () => {
      // String.raw throughout: a plain "\d" in a JS literal is just "d", which
      // would make this test pass while exercising no backslash at all.
      const t = String.raw`a:
  version_from: 'aws-cli/(\d+)'
`;
      const next = String.raw`docker/(\d+\.\d+)`;
      const r = replaceScalar(t, parse(t), ["a", "version_from"], next);
      expect(r.text).toBe(String.raw`a:
  version_from: 'docker/(\d+\.\d+)'
`);
      // And it round-trips to the same string, backslashes intact.
      expect(parsePreparation(r.text).js.a.version_from).toBe(next);
    });

    it("keeps a Windows path's backslashes", () => {
      const t = String.raw`a:
  path_hints: ['%ProgramFiles%\Amazon\AWSCLIV2']
`;
      const next = String.raw`%LOCALAPPDATA%\Programs\aws`;
      const r = replaceScalar(t, parse(t), ["a", "path_hints", 0], next);
      expect(parsePreparation(r.text).js.a.path_hints[0]).toBe(next);
    });

    it("quotes a value that would otherwise change meaning", () => {
      // Asserted by ROUND-TRIP, not by which quote character came out. Which
      // one yaml picks is its business; that the value survives is the promise,
      // and pinning the character is how a test starts failing on a correct
      // change.
      const t = "a:\n  label: Plain\n";
      for (const v of ["has: a colon", "true", "# not a comment", "  padded  ", "2.0.0", "-dash", "@reboot", "don't"]) {
        const back = parsePreparation(replaceScalar(t, parse(t), ["a", "label"], v).text);
        expect(back.fatal).toBeNull();
        expect(back.js.a.label).toBe(v);
      }
    });

    it("refuses a block scalar rather than reflowing it", () => {
      // Rewriting a `>-` means re-indenting its lines, which is the one thing
      // this module exists not to do.
      const t = "a:\n  message: >-\n    Long text\n    over lines.\n";
      expect(replaceScalar(t, parse(t), ["a", "message"], "short")).toBeNull();
    });

    it("preserves CRLF", () => {
      const t = "a:\r\n  one: hello\r\n  two: 2\r\n";
      const r = replaceScalar(t, parse(t), ["a", "one"], "goodbye");
      expect(r.text).toBe("a:\r\n  one: goodbye\r\n  two: 2\r\n");
      expect(r.text.split("\r\n")).toHaveLength(4);
    });
  });

  describe("setScalar", () => {
    it("inserts a missing key at the map's own indent", () => {
      const t = "preparation:\n  precheck: []\n";
      const r = setScalar(t, parse(t), ["preparation", "prompt"], "Set up now?");
      expect(r.text).toBe("preparation:\n  precheck: []\n  prompt: Set up now?\n");
    });

    it("replaces when the key is already there", () => {
      const t = "preparation:\n  prompt: old\n";
      expect(setScalar(t, parse(t), ["preparation", "prompt"], "new").text)
        .toBe("preparation:\n  prompt: new\n");
    });
  });

  describe("appendItem", () => {
    it("appends to a block sequence at the right indent", () => {
      const t = "a:\n  strategies:\n    - id: winget\n    - id: choco\n";
      const r = appendItem(t, parse(t), ["a", "strategies"], "id: manual");
      expect(r.text).toBe("a:\n  strategies:\n    - id: winget\n    - id: choco\n    - id: manual\n");
    });

    it("re-parses to one more item", () => {
      const t = "a:\n  strategies:\n    - id: winget\n";
      const r = appendItem(t, parse(t), ["a", "strategies"], "id: manual\nactions:\n  - kind: instructions\n    message: Do it");
      const js = parsePreparation(r.text).js;
      expect(js.a.strategies).toHaveLength(2);
      expect(js.a.strategies[1].id).toBe("manual");
      expect(js.a.strategies[1].actions[0].kind).toBe("instructions");
    });
  });

  describe("removeAt", () => {
    it("takes the whole line, leaving no orphan indent", () => {
      const t = "a:\n  one: 1\n  two: 2\n  three: 3\n";
      expect(removeAt(t, parse(t), ["a", "two"]).text).toBe("a:\n  one: 1\n  three: 3\n");
    });
  });

  /**
   * The test this module exists for. The real documents are dense with
   * hand-written rationale, and the contract's own README records that the
   * PREVIOUS contract died of a tool silently discarding what it did not model.
   */
  describe("the real corpus survives an edit", () => {
    it.each(authored)("authored/%s keeps every comment and its line endings", (f) => {
      const t = read("authored", f);
      const doc = parse(t);
      const r = setScalar(t, doc, ["preparation", "prompt"], "Changed by a test");
      expect(r).toBeTruthy();

      const comments = (s) => s.split(/\r?\n/).filter((l) => l.trim().startsWith("#"));
      expect(comments(r.text)).toEqual(comments(t));

      // Line endings unchanged, and exactly one line differs.
      expect((r.text.match(/\r\n/g) ?? []).length).toBe((t.match(/\r\n/g) ?? []).length);
      const a = t.split(/\r?\n/);
      const b = r.text.split(/\r?\n/);
      expect(Math.abs(a.length - b.length)).toBeLessThanOrEqual(1);

      // And it still parses, with only the prompt different.
      const before = parsePreparation(t).js;
      const after = parsePreparation(r.text).js;
      expect(after.preparation.prompt).toBe("Changed by a test");
      expect({ ...after.preparation, prompt: null }).toEqual({ ...before.preparation, prompt: null });
    });

    it.each(valid)("valid/%s keeps every comment", (f) => {
      const t = read("valid", f);
      const r = setScalar(t, parse(t), ["preparation", "prompt"], "Edited");
      const comments = (s) => s.split(/\r?\n/).filter((l) => l.trim().startsWith("#"));
      expect(comments(r.text)).toEqual(comments(t));
      expect(parsePreparation(r.text).fatal).toBeNull();
    });
  });
});

/**
 * The test that matters, and the one whose absence let three bugs ship.
 *
 * Every hand-written case above uses a top-level, single-line map — the shape
 * where a wrong indent and a wrong newline are both invisible. This walks EVERY
 * scalar and EVERY map in the real corpus instead, because half the maps in
 * these files are sequence items and that is exactly where the arithmetic
 * differs.
 */
describe("splice fuzz over the whole corpus", () => {
  const corpus = [
    ...valid.map((f) => [`valid/${f}`, read("valid", f)]),
    ...authored.map((f) => [`authored/${f}`, read("authored", f)]),
  ];

  /** Every path in a document that points at a plain scalar, and at a map. */
  const survey = (text) => {
    const { doc } = parsePreparation(text);
    const scalars = [];
    const maps = [];
    const walk = (node, path) => {
      if (!node) return;
      if (node.items) {
        if (node.items[0]?.key !== undefined) {
          maps.push(path);
          for (const pair of node.items) {
            if (pair?.key?.value === undefined) continue;
            walk(pair.value, [...path, pair.key.value]);
          }
        } else {
          node.items.forEach((item, i) => walk(item, [...path, i]));
        }
        return;
      }
      if (node.range && node.type && !/BLOCK/.test(node.type) && !node.anchor) scalars.push(path);
    };
    walk(doc.contents, []);
    return { doc, scalars, maps };
  };

  it.each(corpus)("%s: replacing any scalar leaves a parseable document", (_name, text) => {
    const { doc, scalars } = survey(text);
    expect(scalars.length).toBeGreaterThan(4);
    const broke = [];
    for (const path of scalars) {
      const r = replaceScalar(text, doc, path, "spliced-value");
      if (!r) continue;
      const after = parsePreparation(r.text);
      if (after.fatal || after.errors.length) broke.push(docPathOf(path));
    }
    expect(broke).toEqual([]);
  });

  it.each(corpus)("%s: replacing any scalar changes exactly that one value", (_name, text) => {
    const { doc, scalars } = survey(text);
    const before = parsePreparation(text).js;
    const wrong = [];
    for (const path of scalars) {
      const r = replaceScalar(text, doc, path, "spliced-value");
      if (!r) continue;
      const after = parsePreparation(r.text).js;
      let node = after;
      for (const seg of path.slice(0, -1)) node = node?.[seg];
      if (node?.[path.at(-1)] !== "spliced-value") wrong.push(`${docPathOf(path)} not applied`);
      // and nothing else moved
      const strip = (o, p) => {
        const c = structuredClone(o);
        let n = c;
        for (const seg of p.slice(0, -1)) n = n?.[seg];
        if (n) n[p.at(-1)] = "•";
        return c;
      };
      if (JSON.stringify(strip(after, path)) !== JSON.stringify(strip(before, path))) {
        wrong.push(`${docPathOf(path)} changed something else`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it.each(corpus)("%s: inserting a key into any map leaves a parseable document", (_name, text) => {
    // The 51% case. `- id: aws-cli` indents four but keys at six.
    const { doc, maps } = survey(text);
    expect(maps.length).toBeGreaterThan(5);
    const broke = [];
    for (const path of maps) {
      const r = setScalar(text, doc, [...path, "spliced_key"], "v");
      if (!r) { broke.push(`${docPathOf(path)} refused`); continue; }
      const after = parsePreparation(r.text);
      if (after.fatal || after.errors.length) broke.push(`${docPathOf(path)} → ${after.errors[0]?.message ?? after.fatal}`);
    }
    expect(broke).toEqual([]);
  });

  it.each(corpus)("%s: every splice preserves comments and line endings", (_name, text) => {
    const { doc, scalars } = survey(text);
    const comments = (s) => s.split(/\r?\n/).filter((l) => l.trim().startsWith("#"));
    const crlf = (s) => (s.match(/\r\n/g) ?? []).length;
    const damaged = [];
    for (const path of scalars.slice(0, 40)) {
      const r = replaceScalar(text, doc, path, "x");
      if (!r) continue;
      if (comments(r.text).length !== comments(text).length) damaged.push(`${docPathOf(path)} lost a comment`);
      if (crlf(r.text) !== crlf(text)) damaged.push(`${docPathOf(path)} changed line endings`);
    }
    expect(damaged).toEqual([]);
  });

  it("preserves the author's quote style rather than normalising it", () => {
    const text = read("valid", "sugar-and-comma-platforms.yaml");
    const { doc } = parsePreparation(text);
    const path = ["preparation", "precheck", 0, "platforms", "darwin,linux", "check", "argv", 1];
    const r = replaceScalar(text, doc, path, "system info");
    expect(r.text).toContain('"system info"');
    expect(r.text).not.toContain("'system info'");
  });

  it("refuses an anchored scalar rather than rewriting every alias of it", () => {
    const t = "a: &shared hello\nb: *shared\n";
    expect(replaceScalar(t, parsePreparation(t).doc, ["a"], "other")).toBeNull();
  });
});
