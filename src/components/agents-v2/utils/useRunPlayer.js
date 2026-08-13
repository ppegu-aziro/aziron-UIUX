import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAgentsV2 } from "@/context/AgentsV2Context";
import { fieldAt } from "@/data/agentJsonSchema";
import { pickRecipe } from "@/data/agentRuns";
import { BEAT, EMPTY_RUN, applyPairs, compileRun, reduceRun } from "./runScript";

/**
 * Plays a run: one event per tick, each dispatched into the real store.
 *
 * CANCELLATION IS STRUCTURAL, not handled. The only setTimeout in the system is
 * created inside an effect body and its handle never leaves that effect
 * instance's closure. React guarantees an instance's cleanup runs before the
 * next instance and on unmount, so Stop, closing the panel, switching agent and
 * navigating away are all already covered and none of them needs its own code.
 *
 * Contrast with what this replaces: an async function holding `await sleep(900)`.
 * Nothing cancels a resolved promise, so closing the panel mid-turn still landed
 * the writes.
 */
export function useRunPlayer({ agentId, kind, seed = [], onOpenFile, onFocusField, claims }) {
  const { patch, addFile, addFolder, get } = useAgentsV2();
  const [run, setRun] = useState(null);
  const [view, setView] = useState(() => ({ ...EMPTY_RUN, messages: seed }));
  // Skip pressed, or the reader asked for reduced motion. Same events either
  // way — see the drain below.
  const [drain, setDrain] = useState(false);

  /*
   * Fresh reads for the GUARD only, never for the write.
   *
   * `get` closes over the provider's current agent list and is rebuilt on every
   * commit, so a ref refreshed each render is what a timer callback can safely
   * read. Reading `.current` inside a timer is fine; reading it during render is
   * what the hooks rules reject.
   */
  const live = useRef(null);
  useEffect(() => {
    live.current = get(agentId);
  });
  const claimed = useRef(claims);
  useEffect(() => {
    claimed.current = claims;
  });

  const yielded = useRef(new Set());

  /**
   * Would this chunk land on exactly the text the previous chunk left?
   *
   * Optimistic concurrency rather than a heuristic. Two things can invalidate
   * it, and only one of them is in the store: the user's committed keystrokes,
   * and an editor buffer that has not been flushed yet. `claims` carries the
   * path being typed into right now, which the store cannot tell us — without
   * it, streaming into a file with an open buffer writes to the store and
   * renders nothing, because the editor draws its buffer over the record.
   */
  const guard = useCallback((path, prev) => {
    if (yielded.current.has(path)) return false;
    if (claimed.current === path) return false;
    const now = live.current?.files.find((f) => f.path === path);
    return Boolean(now) && now.content === prev;
  }, []);

  const apply = useCallback(
    (ev, checked) => {
      switch (ev.t) {
        case "folder":
          addFolder(agentId, ev.path);
          break;

        case "file":
          addFile(agentId, ev.path, "");
          onOpenFile?.(ev.path);
          break;

        case "patch":
        case "set": {
          if (checked && !guard(ev.path, ev.prev)) {
            yielded.current.add(ev.path);
            setView((v) => reduceRun(v, { t: "yield", path: ev.path }));
            return;
          }
          if (yielded.current.has(ev.path)) return;
          const next = ev.t === "set" ? ev.next : ev.prev + ev.text;
          // Functional, and it re-checks inside the updater. This is what makes
          // the drain correct: React chains queued updaters, so chunk N sees
          // chunk N-1's result even when a whole run lands inside one tick.
          patch(agentId, (a) => {
            const now = a.files.find((f) => f.path === ev.path);
            if (!now || now.content !== ev.prev) return {};
            return { files: a.files.map((f) => (f.path === ev.path ? { ...f, content: next } : f)) };
          });
          break;
        }

        case "field":
          onFocusField?.(ev.path);
          patch(agentId, (a) => fieldAt(ev.path)?.write(ev.value, a) ?? {});
          break;

        default:
          // think / token / step / quote / propose / done change nothing.
          break;
      }
      setView((v) => reduceRun(v, ev));
    },
    [agentId, addFile, addFolder, patch, guard, onOpenFile, onFocusField],
  );

  useEffect(() => {
    if (!run || view.cursor >= run.events.length) return undefined;
    const quiet = drain || (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    const ev = run.events[view.cursor];

    const timer = setTimeout(
      () => {
        if (quiet) {
          /*
           * One pass, same events, same reducer, same store calls — it just
           * lands now.
           *
           * Guarded ONCE per path before the fold rather than per chunk. Nobody
           * can type during a synchronous loop, and `live.current` is refreshed
           * by an effect that cannot run mid-loop — so a per-chunk read would
           * see the record from before the first addFile, fail every guard, and
           * abandon every file while blaming the user for edits they never made.
           */
          const rest = run.events.slice(view.cursor);
          const first = new Map();
          for (const e of rest) {
            if ((e.t === "patch" || e.t === "set") && !first.has(e.path)) first.set(e.path, e.prev);
          }
          for (const [path, prev] of first) {
            // A path that has not arrived yet cannot be guarded against the
            // store — it is this run that is about to create it.
            const arriving = rest.some((e) => e.t === "file" && e.path === path);
            if (!arriving && !guard(path, prev)) yielded.current.add(path);
          }
          rest.forEach((e) => apply(e, false));
          setView((v) => ({ ...v, cursor: run.events.length }));
          return;
        }
        apply(ev, true);
        setView((v) => ({ ...v, cursor: v.cursor + 1 }));
      },
      quiet ? 0 : (BEAT[ev.t] ?? 40),
    );

    return () => clearTimeout(timer);
  }, [run, view.cursor, drain, apply, guard]);

  const start = useCallback(
    (prompt, intent) => {
      const record = live.current;
      if (!record) return;
      const recipe = pickRecipe(kind, prompt, record, intent);
      yielded.current = new Set();
      setDrain(false);
      setView((v) => ({
        ...v,
        cursor: 0,
        stopped: false,
        skipped: false,
        messages: [...v.messages, { role: "user", text: prompt }],
      }));
      setRun({ recipe, events: compileRun(recipe, prompt, record) });
    },
    [kind],
  );

  const busy = Boolean(run) && view.cursor < run.events.length;

  return useMemo(
    () => ({
      view,
      run,
      busy,
      start,
      /** Land the rest now. The primary control during a run — see the drain. */
      skip: () => {
        setView((v) => ({ ...v, skipped: true }));
        setDrain(true);
      },
      /** Keep what landed, write no more. There is no rollback here, by design. */
      stop: () => setView((v) => ({ ...v, cursor: Number.MAX_SAFE_INTEGER, stopped: true })),
      commit: (proposal) => patch(agentId, applyPairs(proposal.pairs)),
      /**
       * Put one row back. Exact, or not offered: a field re-writes its previous
       * value, and a wholesale replacement restores the body it replaced. A
       * file the user may have edited since is neither, so it has no undo — see
       * RunTranscript.
       */
      undo: (row) =>
        patch(agentId, (a) =>
          row.kind === "set"
            ? { files: a.files.map((f) => (f.path === row.path ? { ...f, content: row.was } : f)) }
            : (fieldAt(row.path)?.write(row.was, a) ?? {}),
        ),
      replay: () => {
        if (!run) return;
        yielded.current = new Set();
        setDrain(false);
        setView((v) => ({ ...v, cursor: 0, stopped: false, skipped: false }));
        setRun({ ...run });
      },
    }),
    [view, run, busy, start, patch, agentId],
  );
}
