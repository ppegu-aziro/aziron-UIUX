/**
 * Unit tests — the scripted runs.
 *
 * The point of most of these is not that today's recipes work. It is that the
 * NEXT person's recipe cannot quietly break: a field renamed in the schema, a
 * value that is no longer legal, a new setting nobody classified. Every one of
 * those is a silent failure at runtime — the transcript claims it applied
 * something and the store no-ops on an empty delta — so they are asserted here
 * against the schema itself rather than against a hand-written list that would
 * go stale in exactly the same way.
 */
import { describe, expect, it } from "vitest";

import { FIELDS, FILL_COUNTS, fieldAt, fillOf } from "@/data/agentJsonSchema";
import { AGENTS_V2, KNOWLEDGE_SOURCES } from "@/data/agentsV2";
import { AUTHORING, RECORD_EXAMPLES, SUGGESTIONS, chatRecipe, pickRecipe, retrieve } from "@/data/agentRuns";
import {
  BEAT,
  EMPTY_RUN,
  compileRun,
  reduceRun,
  say,
  set,
  statedIn,
  write,
} from "@/components/agents-v2/utils/runScript";

/* ── fixtures ────────────────────────────────────────────────────────────── */

const normalise = (a) => ({
  folders: [],
  granted: [],
  knowledge: [],
  targets: [],
  quickPrompts: [],
  releaseNotes: [],
  temperature: 0.3,
  maxTokens: 4096,
  maxIterations: 10,
  tools: "none",
  category: "Operations",
  status: "idle",
  visibility: "private",
  description: "",
  runtime: null,
  apiTokenId: "",
  ...a,
});

const BLANK = normalise({ id: "a-blank", name: "", files: [{ path: "AGENT.md", content: "" }] });

const WRITTEN = normalise({
  id: "a-written",
  name: "Leave Desk",
  description: "Answers leave questions.",
  runtime: { provider: "Anthropic", model: "Claude Sonnet 4.5" },
  apiTokenId: "anthropic-default",
  tools: "scoped",
  granted: ["vector_search", "get_file_content"],
  knowledge: ["Employee Handbook 2026"],
  files: [
    {
      path: "AGENT.md",
      content: [
        "# Leave Desk",
        "",
        "## How to answer",
        "",
        "- Read references/ before answering.",
        "- Quote the clause you relied on.",
        "",
        "## When to ask first",
        "",
        "Ask when the request could mean two different things.",
      ].join("\n"),
    },
    { path: "references/leave.md", content: "# Leave\n\nCarry-over expires in March.\n" },
  ],
});

/** The seeded agents, so the sweep runs against real records too. */
const SEEDED = AGENTS_V2.slice(0, 2).map((a) => normalise({ ...a, files: a.files ?? [] }));

const RECORDS = [BLANK, WRITTEN, ...SEEDED];

const PROMPTS = [
  "answer HR questions about leave and benefits from the handbook",
  'call it "Leave Desk"',
  'describe it as "answers leave questions from the handbook"',
  "set temperature to 0.1 and max iterations to 4",
  "make it public",
  "add a reference file about carry-over",
  "make it shorter",
  "add machine setup",
  "use openai and make it deterministic",
  "add a script that tails the logs",
  "wubble fnord zorp",
];

const PLANNABLE = new Set([
  "think",
  "token",
  "step",
  "quote",
  "folder",
  "file",
  "patch",
  "set",
  "field",
  "propose",
  "done",
]);

/* ── the policy ──────────────────────────────────────────────────────────── */

describe("fill policy", () => {
  it("classifies every field, so a new one fails this suite until someone decides", () => {
    for (const f of FIELDS) {
      expect(["auto", "propose", "never"], `${f.path} is unclassified`).toContain(f.fill);
    }
    expect(FILL_COUNTS.auto + FILL_COUNTS.propose + FILL_COUNTS.never).toBe(FIELDS.length);
  });

  it("never auto-fills anything that names, permits, publishes or binds a credential", () => {
    // Asserted by consequence rather than by listing today's dangerous keys: a
    // deny-list defaults tomorrow's field to fillable and says nothing.
    expect(fillOf("package.name")).toBe("propose");
    expect(fillOf("package.tools.posture")).toBe("propose");
    expect(fillOf("package.tools.granted")).toBe("propose");
    expect(fillOf("runtime.provider")).toBe("propose");
    expect(fillOf("workspace.visibility")).toBe("never");
    expect(fillOf("runtime.apiToken")).toBe("never");
    expect(fillOf("package.version")).toBe("never");
  });

  it("has no field that is auto and also read-only", () => {
    for (const f of FIELDS) if (f.readOnly) expect(f.fill).toBe("never");
  });
});

/* ── the corpus ──────────────────────────────────────────────────────────── */

describe("every recipe against every record", () => {
  for (const recipe of AUTHORING) {
    for (const record of RECORDS) {
      for (const prompt of PROMPTS) {
        it(`${recipe.id} · ${record.id} · “${prompt.slice(0, 24)}…”`, () => {
          const events = compileRun(recipe, prompt, record);

          for (const ev of events) {
            expect(PLANNABLE, `unplannable event ${ev.t}`).toContain(ev.t);
          }

          for (const ev of events) {
            if (ev.t === "field") {
              const spec = fieldAt(ev.path);
              expect(spec, `no such field ${ev.path}`).toBeTruthy();
              // Either the policy allows it outright, or the user dictated it
              // and compileRun checked that claim against the prompt itself.
              expect(spec.fill === "auto" || ev.stated === true, `${ev.path} survived as neither`).toBe(true);
              // An auto fill must actually change something. A write returning
              // an empty delta is the silent failure: the ledger says applied
              // and patch() drops it on the floor.
              expect(Object.keys(spec.write(ev.value, record)).length, `${ev.path} writes nothing`).toBeGreaterThan(0);
              // And it must be visible. A field whose `when` is false is dropped
              // by the form and omitted by the serialiser, so writing it is a
              // change nobody can see that the next save reverts.
              if (spec.when) expect(spec.when({ doc: {}, agent: record })).toBe(true);
            }
            if (ev.t === "propose") {
              expect(ev.pairs.length).toBeGreaterThan(0);
              // Chained, exactly as applyPairs applies them. Checking each pair
              // against the untouched record would be the wrong test AND would
              // fail honestly: `runtime.model` writes nothing until
              // `runtime.provider` has built the runtime for it to land in.
              let acc = record;
              for (const [path, value] of ev.pairs) {
                const spec = fieldAt(path);
                expect(spec, `no such field ${path}`).toBeTruthy();
                expect(spec.fill, `${path} is never-fill and must not be proposed`).not.toBe("never");
                const delta = spec.write(value, acc);
                expect(Object.keys(delta).length, `${path} writes nothing`).toBeGreaterThan(0);
                acc = { ...acc, ...delta };
              }
            }
          }
        });
      }
    }
  }

  it("never proposes an API token on its own — the provider write is what binds it", () => {
    for (const recipe of AUTHORING) {
      for (const record of RECORDS) {
        for (const ev of compileRun(recipe, PROMPTS[0], record)) {
          if (ev.t !== "propose") continue;
          expect(ev.pairs.map(([p]) => p)).not.toContain("runtime.apiToken");
        }
      }
    }
  });

  it("throws on a field that is not in the schema, rather than at run time", () => {
    const broken = { id: "broken", build: () => [{ t: "field", path: "package.quickPrompts", value: [] }] };
    expect(() => compileRun(broken, "x", BLANK)).toThrow(/no such field/);
  });

  it("throws when a recipe tries to fill something marked never", () => {
    const broken = { id: "broken", build: () => [{ t: "field", path: "workspace.visibility", value: "public" }] };
    expect(() => compileRun(broken, "x", BLANK)).toThrow(/fill:never/);
  });

  it("demotes an invisible field into the proposal that would make it visible", () => {
    // Temperature is gated on a bound runtime, and BLANK has none.
    const events = compileRun(AUTHORING[0], PROMPTS[0], BLANK);
    const fills = events.filter((e) => e.t === "field").map((e) => e.path);
    expect(fills).not.toContain("runtime.temperature");
    const runtime = events.find((e) => e.t === "propose" && e.id === "runtime");
    expect(runtime.pairs.map(([p]) => p)).toContain("runtime.temperature");
    expect(runtime.note).toMatch(/ride along/);
  });

  it("writes nothing into the generated settings file", () => {
    for (const recipe of AUTHORING) {
      for (const record of RECORDS) {
        for (const ev of compileRun(recipe, PROMPTS[3], record)) {
          if (["file", "patch", "set", "folder"].includes(ev.t)) {
            expect(ev.path).not.toBe(".aziron/agent.json");
            if (ev.t === "folder") expect(ev.path).not.toBe(".aziron");
          }
        }
      }
    }
  });

  it("is deterministic — the same input compiles to the same run", () => {
    for (const recipe of AUTHORING) {
      expect(compileRun(recipe, PROMPTS[0], WRITTEN)).toEqual(compileRun(recipe, PROMPTS[0], WRITTEN));
    }
  });

  it("gives every suggestion chip a recipe it cannot miss", () => {
    for (const s of SUGGESTIONS) {
      expect(pickRecipe("authoring", s.label, WRITTEN, s.id).id).toBe(s.id);
    }
  });

  it("only builds from scratch on a genuinely blank agent", () => {
    expect(pickRecipe("authoring", PROMPTS[0], BLANK).id).toBe("create-from-intent");
    expect(pickRecipe("authoring", PROMPTS[0], WRITTEN).id).not.toBe("create-from-intent");
  });

  it("falls back rather than failing, and the fallback says which it is", () => {
    const recipe = pickRecipe("authoring", "wubble fnord zorp", WRITTEN);
    expect(recipe.id).toBe("revise");
    const text = compileRun(recipe, "wubble fnord zorp", WRITTEN)
      .filter((e) => e.t === "token")
      .map((e) => e.text)
      .join("");
    expect(text).toMatch(/didn't match anything/);
  });
});

/* ── prose and file chunking ─────────────────────────────────────────────── */

describe("say and write", () => {
  it("round-trips the prose, so wording can change without churning fixtures", () => {
    const s = "One two three four five six seven.";
    expect(say(s).map((e) => e.text).join("")).toBe(s);
  });

  it("builds each chunk on exactly what the previous one left", () => {
    const body = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const events = write("a.md", body);
    expect(events[0]).toEqual({ t: "file", path: "a.md", fresh: true });

    let acc = "";
    for (const ev of events.slice(1)) {
      expect(ev.prev).toBe(acc);
      acc += ev.text;
    }
    expect(acc).toBe(body);
  });

  it("carries the existing body as the starting point when rewriting a file", () => {
    const events = write("a.md", "old and new", { from: "old" });
    expect(events[0].fresh).toBe(false);
    expect(events[1].prev).toBe("old");
  });

  it("gives every event a beat", () => {
    for (const t of PLANNABLE) expect(BEAT[t], `no beat for ${t}`).toBeTypeOf("number");
  });
});

/* ── the reducer ─────────────────────────────────────────────────────────── */

describe("reduceRun", () => {
  const runOf = (events) => events.reduce(reduceRun, EMPTY_RUN);

  it("survives being cut at every point — the Stop invariant", () => {
    const events = compileRun(AUTHORING[0], PROMPTS[0], BLANK);
    for (let k = 0; k <= events.length; k += 1) {
      const state = runOf(events.slice(0, k));
      for (const m of state.messages) {
        expect(m.text).toBeTypeOf("string");
        expect(Array.isArray(m.writes)).toBe(true);
      }
    }
  });

  it("appends tokens into one string rather than one message per token", () => {
    const state = runOf(say("one two three four five six"));
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].text).toBe("one two three four five six");
  });

  it("gives a file one ledger row however many chunks it took", () => {
    const body = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const state = runOf(write("a.md", body));
    expect(state.messages[0].writes.filter((w) => w.kind === "file")).toHaveLength(1);
  });

  it("records a yielded path as its own row", () => {
    const state = runOf([...write("a.md", "x"), { t: "yield", path: "a.md" }]);
    expect(state.messages[0].writes.at(-1)).toEqual({ kind: "yield", path: "a.md" });
  });

  it("keeps the replaced body on a set row, which is what makes its undo exact", () => {
    const state = runOf([set("AGENT.md", "before", "after")]);
    expect(state.messages[0].writes[0]).toEqual({ kind: "set", path: "AGENT.md", was: "before" });
  });
});

/* ── the runtime chat ────────────────────────────────────────────────────── */

describe("chat", () => {
  it("refuses when the agent has no model bound, instead of answering anyway", () => {
    const recipe = chatRecipe("how much leave do I get?", BLANK);
    expect(recipe.id).toBe("unbound");
  });

  it("quotes only text that is actually in one of the agent's files", () => {
    const recipe = chatRecipe("what do you do about carry-over leave", WRITTEN);
    expect(recipe.id).toBe("quote");
    const quotes = compileRun(recipe, "what do you do about carry-over leave", WRITTEN).filter(
      (e) => e.t === "quote",
    );
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) {
      expect(WRITTEN.files.some((f) => f.content.includes(q.text)), `invented: ${q.text}`).toBe(true);
    }
  });

  it("answers about its own tools from the record, so the answer changes when the record does", () => {
    const ask = "can you use github_issue?";
    const before = compileRun(chatRecipe(ask, WRITTEN), ask, WRITTEN);
    expect(before.some((e) => e.t === "step" && e.label.includes("vector_search"))).toBe(true);

    const after = { ...WRITTEN, granted: [...WRITTEN.granted, "github_issue"] };
    const events = compileRun(chatRecipe(ask, after), ask, after);
    expect(events.some((e) => e.t === "step" && e.label.includes("github_issue"))).toBe(true);
  });

  it("refuses rather than inventing when nothing in the files matches", () => {
    const ask = "what is the airspeed velocity of an unladen swallow";
    const recipe = chatRecipe(ask, WRITTEN);
    expect(recipe.id).toBe("refuse");
    const events = compileRun(recipe, ask, WRITTEN);
    expect(events.some((e) => e.t === "field" || e.t === "file" || e.t === "patch")).toBe(false);
    expect(events.filter((e) => e.t === "token").map((e) => e.text).join("")).toMatch(/making it up/);
  });

  it("needs two matched terms before it calls something a match", () => {
    // One incidental word in common is a coincidence, and a coincidence quoted
    // back confidently is the failure this whole panel exists to avoid.
    expect(retrieve(WRITTEN, "leave")?.hits ?? 0).toBeLessThan(2);
    expect(retrieve(WRITTEN, "carry-over leave expires")?.hits ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("changes nothing in the store — a chat run has no writing events", () => {
    for (const ask of ["what tools do you have", "carry-over leave", "zzz nothing"]) {
      for (const ev of compileRun(chatRecipe(ask, WRITTEN), ask, WRITTEN)) {
        expect(["file", "patch", "set", "folder", "field"]).not.toContain(ev.t);
      }
    }
  });
});

/* ── against the real store ──────────────────────────────────────────────── */

/**
 * The test that has to touch the store.
 *
 * Everything above asserts over pure functions, and a run can be entirely
 * correct there while writing nothing at all — the events are right, the
 * reducer is right, and every store call silently no-ops. That is not
 * hypothetical: it is exactly what a per-chunk guard does during a synchronous
 * drain, because the ref it reads cannot refresh mid-loop, so every chunk after
 * the first sees a stale record and abandons its file while the transcript
 * blames the user for edits they never made.
 *
 * So: apply a whole run through the real provider and assert the bytes.
 */
describe("a run, applied through the store", () => {
  const applyThrough = (events, agent) => {
    // The same three primitives useRunPlayer calls, against a real record.
    let rec = agent;
    const patch = (fn) => {
      const delta = fn(rec);
      if (delta && Object.keys(delta).length) rec = { ...rec, ...delta };
    };
    for (const ev of events) {
      if (ev.t === "folder") {
        patch((a) => (a.folders.includes(ev.path) ? {} : { folders: [...a.folders, ev.path] }));
      } else if (ev.t === "file") {
        patch((a) =>
          a.files.some((f) => f.path === ev.path) ? {} : { files: [...a.files, { path: ev.path, content: "" }] },
        );
      } else if (ev.t === "patch" || ev.t === "set") {
        const next = ev.t === "set" ? ev.next : ev.prev + ev.text;
        patch((a) => {
          const now = a.files.find((f) => f.path === ev.path);
          if (!now || now.content !== ev.prev) return {};
          return { files: a.files.map((f) => (f.path === ev.path ? { ...f, content: next } : f)) };
        });
      } else if (ev.t === "field") {
        patch((a) => fieldAt(ev.path).write(ev.value, a));
      }
    }
    return rec;
  };

  it("lands every byte of every file it planned", () => {
    const events = compileRun(AUTHORING[0], PROMPTS[0], BLANK);
    const after = applyThrough(events, BLANK);

    // What the run intended, reassembled from its own chunks.
    const intended = new Map();
    for (const ev of events) {
      if (ev.t === "patch") intended.set(ev.path, (intended.get(ev.path) ?? ev.prev) + ev.text);
      if (ev.t === "set") intended.set(ev.path, ev.next);
    }
    expect(intended.size).toBeGreaterThan(1);
    for (const [path, body] of intended) {
      const file = after.files.find((f) => f.path === path);
      expect(file, `${path} never arrived`).toBeTruthy();
      expect(file.content, `${path} is short`).toBe(body);
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  it("lands the same bytes whether it was walked or drained in one pass", () => {
    // Drained is not a different code path with the same intent — it is the
    // same events folded without waiting. If the two ever disagree, the
    // reduced-motion reader is being shown a different product.
    const events = compileRun(AUTHORING[0], PROMPTS[0], BLANK);
    const walked = events.reduce((rec, ev) => applyThrough([ev], rec), BLANK);
    const drained = applyThrough(events, BLANK);
    expect(drained.files).toEqual(walked.files);
    expect(drained.folders).toEqual(walked.folders);
    expect(drained.category).toBe(walked.category);
    expect(drained.description).toBe(walked.description);
  });

  it("abandons only the path that was edited underneath it, and keeps the rest", () => {
    const events = compileRun(AUTHORING[0], PROMPTS[0], BLANK);
    const target = events.find((e) => e.t === "patch" && e.path.startsWith("references/")).path;

    let rec = BLANK;
    let touched = false;
    for (const ev of events) {
      // Somebody types into the reference file halfway through writing it.
      if (!touched && ev.t === "patch" && ev.path === target && ev.prev !== "") {
        rec = { ...rec, files: rec.files.map((f) => (f.path === target ? { ...f, content: "mine" } : f)) };
        touched = true;
      }
      rec = applyThrough([ev], rec);
    }

    expect(touched).toBe(true);
    // Their text survives — the run does not fight them for the file.
    expect(rec.files.find((f) => f.path === target).content).toBe("mine");
    // And the entrypoint, which they did not touch, is complete.
    expect(rec.files.find((f) => f.path === "AGENT.md").content).toMatch(/## When to ask first/);
  });
});

/* ── values the user dictated ────────────────────────────────────────────── */

/**
 * A proposal is for a value the assistant CHOSE. Asking "shall I call it Leave
 * Desk?" of somebody who just typed `call it "Leave Desk"` is asking a question
 * they already answered — so a stated value is filled instead.
 *
 * The whole safety of that rests on `stated` being verifiable rather than
 * claimed, which is what these assert.
 */
describe("stated values", () => {
  it("recognises the value only when it is really in the prompt", () => {
    expect(statedIn('call it "Leave Desk"', "Leave Desk")).toBe(true);
    expect(statedIn("call it the leave desk.", "Leave Desk")).toBe(true);
    expect(statedIn("call it something good", "Leave Desk")).toBe(false);
    expect(statedIn("set temperature to 0.1", 0.1)).toBe(true);
    expect(statedIn("set temperature to 0.9", 0.1)).toBe(false);
    expect(statedIn("", "anything")).toBe(false);
  });

  it("needs every part of a multi-part value, not just one", () => {
    expect(statedIn("grant vector_search and web_search", ["vector_search", "web_search"])).toBe(true);
    expect(statedIn("grant vector_search", ["vector_search", "web_search"])).toBe(false);
  });

  it("refuses a recipe that labels its own guess as stated", () => {
    const liar = {
      id: "liar",
      build: () => [{ t: "field", path: "package.name", value: "Something I Invented", stated: true }],
    };
    expect(() => compileRun(liar, "call it whatever you like", BLANK)).toThrow(/claims to be stated/);
  });

  it("still refuses a stated value for a field that is never fillable", () => {
    const liar = {
      id: "liar",
      build: () => [{ t: "field", path: "workspace.visibility", value: "public", stated: true }],
    };
    expect(() => compileRun(liar, "make it public", BLANK)).toThrow(/fill:never/);
  });

  it("sets a dictated name outright instead of proposing it", () => {
    const prompt = 'call it "Leave Desk"';
    const events = compileRun(pickRecipe("authoring", prompt, WRITTEN), prompt, WRITTEN);
    const fill = events.find((e) => e.t === "field" && e.path === "package.name");
    expect(fill.value).toBe("Leave Desk");
    expect(events.some((e) => e.t === "propose")).toBe(false);
  });

  it("still only proposes a name it made up itself", () => {
    const events = compileRun(AUTHORING[0], PROMPTS[0], BLANK);
    expect(events.some((e) => e.t === "field" && e.path === "package.name")).toBe(false);
    expect(events.find((e) => e.t === "propose" && e.pairs.some(([p]) => p === "package.name"))).toBeTruthy();
  });

  it("moves the heading with the name, so the file cannot contradict the record", () => {
    // Deliberately not the name it already has: that rewrite is a no-op, and
    // would let this pass without the replacement working at all.
    const prompt = 'call it "Benefits Desk"';
    const events = compileRun(pickRecipe("authoring", prompt, WRITTEN), prompt, WRITTEN);
    const rewrite = events.find((e) => e.t === "set" && e.path === "AGENT.md");
    expect(rewrite, "no heading rewrite was planned").toBeTruthy();
    expect(rewrite.next).toMatch(/^# Benefits Desk$/m);
    expect(rewrite.next).not.toMatch(/^# Leave Desk$/m);
    // Everything below the heading is untouched.
    expect(rewrite.next).toContain("## When to ask first");
  });

  it("replaces the description with the words that were dictated", () => {
    const prompt = 'describe it as "answers leave questions from the handbook"';
    const events = compileRun(pickRecipe("authoring", prompt, WRITTEN), prompt, WRITTEN);
    const fill = events.find((e) => e.t === "field" && e.path === "package.description");
    expect(fill.value).toBe("answers leave questions from the handbook");
  });

  it("reads numbers out of the prompt rather than picking its own", () => {
    const prompt = "set temperature to 0.1 and max iterations to 4";
    const events = compileRun(pickRecipe("authoring", prompt, WRITTEN), prompt, WRITTEN);
    const at = (p) => events.find((e) => e.t === "field" && e.path === p)?.value;
    expect(at("runtime.temperature")).toBe(0.1);
    expect(at("runtime.maxIterations")).toBe(4);
  });

  it("asks for the value rather than inventing one when none was given", () => {
    const events = compileRun(pickRecipe("authoring", "rename it", WRITTEN), "rename it", WRITTEN);
    expect(events.some((e) => e.t === "field")).toBe(false);
    expect(events.filter((e) => e.t === "token").map((e) => e.text).join("")).toMatch(/could not find a name/);
  });

  it("refuses to publish however plainly it is asked, and says why", () => {
    const prompt = "make it public";
    const events = compileRun(pickRecipe("authoring", prompt, WRITTEN), prompt, WRITTEN);
    for (const ev of events) {
      if (ev.t === "field") expect(ev.path).not.toBe("workspace.visibility");
      if (ev.t === "propose") expect(ev.pairs.map(([p]) => p)).not.toContain("workspace.visibility");
    }
    expect(events.find((e) => e.t === "done").text).toMatch(/did not make it public/);
  });

  it("routes each worked example to the recipe it is an example of", () => {
    // Matched on content, not position — the examples are a list somebody will
    // add to, and an index-based assertion silently tests the wrong pair when
    // they do.
    const expected = [
      [/^call it/, "rename"],
      [/^describe it/, "describe"],
      [/^grant /, "grant-tools"],
      [/^attach /, "attach-knowledge"],
      [/^set temperature/, "configure"],
    ];
    expect(RECORD_EXAMPLES).toHaveLength(expected.length);
    for (const prompt of RECORD_EXAMPLES) {
      const want = expected.find(([re]) => re.test(prompt));
      expect(want, `no expectation written for “${prompt}”`).toBeTruthy();
      expect(pickRecipe("authoring", prompt, WRITTEN).id, prompt).toBe(want[1]);
    }
  });

  it("every worked example really does state its value, or it teaches the wrong lesson", () => {
    for (const prompt of RECORD_EXAMPLES) {
      const events = compileRun(pickRecipe("authoring", prompt, WRITTEN), prompt, WRITTEN);
      const fills = events.filter((e) => e.t === "field");
      expect(fills.length, `${prompt} filled nothing`).toBeGreaterThan(0);
    }
  });
});

/* ── tools and knowledge ─────────────────────────────────────────────────── */

describe("granting tools", () => {
  const run = (prompt, rec = WRITTEN) => compileRun(pickRecipe("authoring", prompt, rec), prompt, rec);

  it("grants exactly the tools that were named", () => {
    const events = run("grant web_fetch and slack_post");
    const fill = events.find((e) => e.t === "field" && e.path === "package.tools.granted");
    expect(fill.value).toContain("web_fetch");
    expect(fill.value).toContain("slack_post");
    expect(fill.stated).toBe(true);
  });

  it("keeps what it already held rather than replacing the list", () => {
    const events = run("grant web_fetch");
    const fill = events.find((e) => e.t === "field" && e.path === "package.tools.granted");
    for (const had of WRITTEN.granted) expect(fill.value).toContain(had);
  });

  it("verifies the claim against what was named, not the merged list", () => {
    // The merged value contains tools the sentence never mentioned. If the
    // check ran against the value it would reject a perfectly explicit request.
    const events = run("grant web_fetch");
    const fill = events.find((e) => e.t === "field" && e.path === "package.tools.granted");
    expect(fill.value.length).toBeGreaterThan(fill.statedBy.length);
    expect(fill.statedBy).toEqual(["web_fetch"]);
  });

  it("says which named tools are not real, instead of silently dropping them", () => {
    const events = run("grant web_fetch and launch_missiles");
    const note = events.find((e) => e.t === "step" && /launch_missiles/.test(e.label));
    expect(note).toBeTruthy();
    const fill = events.find((e) => e.t === "field" && e.path === "package.tools.granted");
    expect(fill.value).not.toContain("launch_missiles");
  });

  it("asks rather than choosing when no tool is named", () => {
    const events = run("give it some tools");
    expect(events.some((e) => e.t === "field" && e.path === "package.tools.granted" && e.stated)).toBe(false);
    const chip = events.find((e) => e.t === "propose" && e.id === "package.tools");
    expect(chip).toBeTruthy();
    expect(chip.pairs.map(([p]) => p)).toContain("package.tools.posture");
  });

  it("folds the grant into one chip on an agent that is not scoped yet", () => {
    // `granted` is hidden until the posture is scoped, so writing it alone
    // would be a change nobody could see. One click has to do both.
    //
    // NOT against BLANK: a blank agent routes to create-from-intent, which has
    // a tools chip of its own — so this passed while grant-tools was dropping
    // the grant entirely.
    const unscoped = { ...WRITTEN, tools: "none", granted: [] };
    const recipe = pickRecipe("authoring", "grant web_fetch", unscoped);
    expect(recipe.id).toBe("grant-tools");

    const events = compileRun(recipe, "grant web_fetch", unscoped);
    expect(events.some((e) => e.t === "field" && e.path === "package.tools.granted")).toBe(false);
    const chip = events.find((e) => e.t === "propose" && e.id === "package.tools");
    expect(chip, "the grant had nowhere to land").toBeTruthy();
    const paths = chip.pairs.map(([p]) => p);
    expect(paths).toContain("package.tools.posture");
    expect(paths).toContain("package.tools.granted");
    expect(chip.pairs.find(([p]) => p === "package.tools.granted")[1]).toContain("web_fetch");
  });

  it("refuses to compile a recipe whose demoted field has no chip to land in", () => {
    // The failure this replaces was silent: the run said "Granting web_fetch"
    // and then granted nothing at all.
    const orphan = {
      id: "orphan",
      build: () => [{ t: "field", path: "package.name", value: "X", into: "nowhere" }],
    };
    expect(() => compileRun(orphan, "x", WRITTEN)).toThrow(/never emits/);
  });
});

describe("attaching knowledge", () => {
  const run = (prompt, rec = WRITTEN) => compileRun(pickRecipe("authoring", prompt, rec), prompt, rec);

  it("attaches the sources it was given, spelled as the catalogue spells them", () => {
    const events = run("attach Benefits FAQ");
    const fill = events.find((e) => e.t === "field" && e.path === "knowledge.sources");
    expect(fill.value).toContain("Benefits FAQ");
    // And keeps what was already attached.
    expect(fill.value).toContain("Employee Handbook 2026");
  });

  it("attaches a database by the name people say, not the id it resolves to", () => {
    const events = run("attach the Engineering vector database");
    const fill = events.find((e) => e.t === "field" && e.path === "knowledge.vectorDb");
    expect(fill.value).toBe("vdb-eng");
    // The id is nowhere in that sentence — what was verified is the name.
    expect(fill.statedBy).toBe("Engineering");
  });

  it("fills the collections alongside the database that gates them", () => {
    const events = run("attach the Engineering vector database", { ...WRITTEN, vectorDbId: "vdb-eng" });
    const cols = events.find((e) => e.t === "field" && e.path === "knowledge.collections");
    expect(cols.value).toEqual(["runbooks", "adr", "postmortems"]);
  });

  it("lists what is available rather than picking, when nothing is named", () => {
    const events = run("give it some knowledge");
    expect(events.some((e) => e.t === "field")).toBe(false);
    expect(events.filter((e) => e.t === "step").length).toBeGreaterThan(0);
  });

  it("never invents a source that is not in the catalogue", () => {
    for (const prompt of ["attach the Employee Handbook 2026", "attach Nonexistent Corpus"]) {
      const events = run(prompt);
      const fill = events.find((e) => e.t === "field" && e.path === "knowledge.sources");
      if (!fill) continue;
      for (const name of fill.value) {
        expect(KNOWLEDGE_SOURCES.some((s) => s.name === name), `invented ${name}`).toBe(true);
      }
    }
  });
});
