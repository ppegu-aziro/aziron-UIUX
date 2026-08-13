/**
 * A run: what the assistant does, as data.
 *
 * Every mocked turn — authoring and runtime chat alike — is an ordered array of
 * typed, plain-data events. No closures, no promises, no timestamps: a run is
 * deep-equal comparable, snapshot-testable and replayable, which is what makes
 * the whole thing assertable without a DOM or a fake clock.
 *
 * The split that matters: a recipe decides WHAT happens, this module decides
 * what is LEGAL, and the player decides WHEN. A recipe naming a field that does
 * not exist is a bug, and it throws here at compile time rather than landing as
 * a TypeError inside a setAgents updater and taking the page down.
 */

import { fieldAt } from "@/data/agentJsonSchema";
import { effectiveChanges, toDoc } from "./agentJson";

/* ── event constructors ──────────────────────────────────────────────────── */

export const think = (label) => ({ t: "think", label });
export const step = (icon, label, note) => ({ t: "step", icon, label, note });
export const folder = (path) => ({ t: "folder", path });
export const quote = (text, from) => ({ t: "quote", text, from });
export const done = (text) => ({ t: "done", text });

/**
 * A field the run sets. `into` names the proposal it joins if the policy or the
 * record demotes it — see compileRun.
 *
 * `stated: true` claims the value came out of the prompt rather than out of the
 * recipe's judgement. compileRun checks that claim against the prompt text, so
 * it is a verifiable property rather than a recipe's assertion about itself.
 */
export const field = (path, value, opts = {}) => ({ t: "field", path, value, ...opts });

/**
 * Did the user actually say this, word for word?
 *
 * The whole weight of `stated` rests here, so it is deliberately strict: every
 * part of the value has to appear in what was typed. Punctuation and case are
 * ignored, because "call it the Leave Desk." should match `Leave Desk`, and
 * nothing else is. A recipe that infers a value cannot pass this by claiming it
 * did not.
 */
const flat = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function statedIn(prompt, value) {
  const hay = ` ${flat(prompt)} `;
  const parts = Array.isArray(value) ? value : [value];
  if (!parts.length) return false;
  return parts.every((p) => {
    const needle = flat(typeof p === "object" && p ? (p.label ?? p.prompt ?? "") : p);
    return needle.length > 0 && hay.includes(` ${needle} `);
  });
}

export const propose = (id, title, note, pairs) => ({ t: "propose", id, title, note, pairs });

/** Words per token event, and characters per file chunk. */
export const GROUP = 3;
export const CHUNK = 160;

/**
 * Prose, as token events.
 *
 * Grouped into words rather than characters. Per-character streaming looks like
 * a typewriter rather than like a model, costs 40x the events for the same
 * wall-clock, and puts a store-free re-render on every frame.
 */
export function say(text) {
  const words = String(text).split(" ");
  const out = [];
  for (let i = 0; i < words.length; i += GROUP) {
    const group = words.slice(i, i + GROUP).join(" ");
    out.push({ t: "token", text: i + GROUP >= words.length ? group : `${group} ` });
  }
  return out;
}

/**
 * A file, as an arrival plus a series of appends.
 *
 * Each chunk carries the exact text the previous chunk left behind. That is not
 * bookkeeping — it is the whole concurrency story: the player refuses to write
 * a chunk whose `prev` no longer matches what is in the store, so a user typing
 * into a file mid-stream takes ownership of it rather than fighting the run for
 * the caret.
 *
 * Chunks break on the next line boundary so a paragraph never rewraps twice.
 */
export function write(path, body, { from = "" } = {}) {
  const out = [{ t: "file", path, fresh: from === "" }];
  let prev = from;
  let at = 0;
  while (at < body.length) {
    let end = Math.min(at + CHUNK, body.length);
    if (end < body.length) {
      const nl = body.indexOf("\n", end);
      if (nl > -1 && nl - end < CHUNK) end = nl + 1;
    }
    const text = body.slice(at, end);
    out.push({ t: "patch", path, prev, text });
    prev += text;
    at = end;
  }
  return out;
}

/** A wholesale replacement — one commit, and the only write that is undoable in full. */
export const set = (path, prev, next) => ({ t: "set", path, prev, next });

/* ── timing ──────────────────────────────────────────────────────────────── */

/**
 * How long each kind of event sits on screen before the next one fires.
 *
 * Tuned so a thing that CHANGES something reads as one visual event: below
 * roughly 250ms a folder arriving and a file arriving inside it read as a
 * single flicker, and a select snapping to a new value is missed entirely.
 * Prose is the opposite problem — 40ms per three words is about 62 words a
 * second, fast enough to feel like a model and slow enough that the caret is
 * visible. Faster than that and the text simply appears, which is a paste.
 */
export const BEAT = {
  think: 600,
  token: 40,
  step: 360,
  folder: 260,
  file: 280,
  patch: 70,
  set: 320,
  field: 320,
  propose: 220,
  quote: 420,
  done: 0,
};

/* ── the compiler ────────────────────────────────────────────────────────── */

/**
 * Turn a recipe's events into a legal run against one specific record.
 *
 * Three things happen here that a recipe must not be trusted to get right:
 *
 *  1. A field path that is not in the schema THROWS. It is a bug in the recipe,
 *     not a runtime condition, and the test sweep is where it should surface.
 *
 *  2. A field the policy marks `propose` becomes part of a proposal instead of
 *     a fill, whatever the recipe asked for. The policy lives on the field spec,
 *     so a field added to the schema next year cannot quietly become fillable
 *     by an old recipe that never heard of it.
 *
 *     UNLESS the user said the value themselves. A proposal exists for a value
 *     the assistant CHOSE — "I picked this name, is it right?" — and asking
 *     that about a name somebody just typed is asking a question they already
 *     answered. So a `stated` field is filled, and the claim is checked against
 *     the prompt rather than trusted: a recipe cannot promote its own guess by
 *     labelling it. `never` stays never either way, because a version, a
 *     credential and a visibility are not the assistant's to write no matter
 *     who asked.
 *
 *  3. A field whose `when()` is currently false is INVISIBLE — the form drops it
 *     and the serialiser omits its whole section. Writing it anyway is a change
 *     nobody can see, and the next save of AGENT.json reverts it to the
 *     fallback. So it is folded into the proposal that would ungate it, and
 *     that chip says so rather than pretending nothing was dropped.
 */
export function compileRun(recipe, prompt, agent) {
  const raw = recipe.build(prompt, agent) ?? [];
  const ctx = { doc: toDoc(agent), agent };
  const out = [];
  const deferred = new Map();

  for (const ev of raw) {
    if (!ev) continue;
    if (ev.t !== "field") {
      out.push(ev);
      continue;
    }
    const spec = fieldAt(ev.path);
    if (!spec) throw new Error(`recipe "${recipe.id}": no such field "${ev.path}"`);
    if (spec.fill === "never") throw new Error(`recipe "${recipe.id}": "${ev.path}" is fill:never`);

    if (ev.stated && !statedIn(prompt, ev.value)) {
      throw new Error(`recipe "${recipe.id}": "${ev.path}" claims to be stated but is not in the prompt`);
    }

    const visible = !spec.when || spec.when(ctx);
    if ((spec.fill === "auto" || ev.stated) && visible) {
      out.push({ ...ev, was: spec.read(agent), label: spec.label });
      continue;
    }
    const into = ev.into ?? spec.section;
    deferred.set(into, [...(deferred.get(into) ?? []), [ev.path, ev.value]]);
  }

  return out.map((ev) => {
    if (ev.t !== "propose" || !deferred.has(ev.id)) return ev;
    const extra = deferred.get(ev.id);
    const names = extra.map(([p]) => fieldAt(p).label.toLowerCase()).join(", ");
    return { ...ev, pairs: [...ev.pairs, ...extra], note: `${ev.note} · ${names} ride along` };
  });
}

/**
 * A proposal commits as ONE patch, its pairs applied in order.
 *
 * Chained rather than merged, because the second pair usually depends on what
 * the first one wrote: binding a provider rebuilds `runtime` and picks a
 * credential, so a model written from a render-time capture of the record would
 * rebuild that runtime from the OLD provider and silently unbind the model the
 * same click just chose.
 */
export function applyPairs(pairs) {
  return (a) => {
    let next = a;
    for (const [path, value] of pairs) {
      const spec = fieldAt(path);
      if (!spec) continue;
      next = { ...next, ...spec.write(value, next) };
    }
    return effectiveChanges(a, next);
  };
}

/* ── the transcript reducer ──────────────────────────────────────────────── */

export const EMPTY_RUN = { messages: [], cursor: 0, stopped: false, skipped: false };

const blank = () => ({
  role: "ai",
  think: null,
  text: "",
  steps: [],
  quotes: [],
  writes: [],
  proposals: [],
  done: null,
});

/**
 * Fold one event into the transcript. Pure, total, and the only place transcript
 * state is decided — the player owns time, this owns meaning.
 */
export function reduceRun(state, ev) {
  const msgs = state.messages;
  const last = msgs[msgs.length - 1];

  if (ev.t === "user") {
    return { ...state, messages: [...msgs, { role: "user", text: ev.text }] };
  }

  // Every AI event lands in the current AI message, and the first one opens it.
  // Opening on `think` alone would drop a run that starts with prose.
  const open = last && last.role === "ai" ? last : null;
  const head = open ? msgs.slice(0, -1) : msgs;
  const cur = open ?? blank();
  const on = (patch) => ({ ...state, messages: [...head, { ...cur, ...patch }] });

  switch (ev.t) {
    case "think":
      return on({ think: ev.label });

    case "token":
      // Appended to the SAME string so React updates one text node. A span per
      // token reflows the whole bubble on every tick, and the scroll pin then
      // fights the caret for the last line.
      return on({ think: null, text: cur.text + ev.text });

    case "step":
      return on({ think: null, steps: [...cur.steps, ev] });

    case "quote":
      return on({ think: null, quotes: [...cur.quotes, ev] });

    case "folder":
      return on({ think: null, writes: [...cur.writes, { kind: "folder", path: ev.path }] });

    case "file":
      return on({ think: null, writes: [...cur.writes, { kind: "file", path: ev.path }] });

    case "patch":
      // Chunks do not each get a row — the file's row is already there and the
      // ledger is a list of things that happened, not of packets.
      return state;

    case "set":
      return on({
        think: null,
        writes: [...cur.writes, { kind: "set", path: ev.path, was: ev.prev }],
      });

    case "field":
      return on({
        think: null,
        writes: [
          ...cur.writes,
          { kind: "field", path: ev.path, label: ev.label, value: ev.value, was: ev.was },
        ],
      });

    case "propose":
      return on({ think: null, proposals: [...cur.proposals, ev] });

    case "yield":
      // Player-emitted, never planned: the run gave a path back to the user.
      return on({ writes: [...cur.writes, { kind: "yield", path: ev.path }] });

    case "done":
      return on({ think: null, done: ev.text });

    default:
      return state;
  }
}
