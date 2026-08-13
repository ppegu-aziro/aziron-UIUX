import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAgentsV2 } from "@/context/AgentsV2Context";
import { preflight } from "./preflight";
import {
  EMPTY_RELEASE,
  beatOfRelease,
  compileRelease,
  reduceRelease,
} from "./releaseScript";

/**
 * Walks a compiled release.
 *
 * Cancellation is the same structural property the authoring player relies on:
 * the only setTimeout is created inside an effect body and its handle never
 * leaves that closure, so closing the dialog, unmounting, or navigating away
 * are all already handled and none of them needs its own code.
 *
 * `apply` touches the store for exactly one event kind. Everything else —
 * think, check, target, done — is inert, which is why stopping partway through
 * cannot leave a half-published state: before the commit nothing has been
 * written, and after it there is nothing left to write.
 */
export function useReleasePlayer({ agent }) {
  const { release, agentFiles } = useAgentsV2();
  const [run, setRun] = useState(null);
  const [view, setView] = useState(EMPTY_RELEASE);
  const [cursor, setCursor] = useState(0);

  // Fresh reads for the re-check only, never for the write.
  const live = useRef(agent);
  useEffect(() => {
    live.current = agent;
  });

  const apply = useCallback(
    (ev) => {
      if (ev.t !== "commit") {
        setView((v) => reduceRelease(v, ev));
        return;
      }

      /*
       * Read the record again at the tick that writes.
       *
       * Compile time decided whether a commit is allowed; several seconds have
       * passed since, and the assistant or the editor may have written into the
       * folder in the meantime. Releasing on a verdict computed against a
       * record that no longer exists is exactly the failure the whole staged
       * check is meant to prevent, so the last thing before the only write is
       * to ask again.
       */
      const now = live.current;
      if (!now || preflight(now).errors.length) {
        setView((v) =>
          reduceRelease(v, {
            t: "refused",
            text: "The folder changed while these checks were running, and the new version does not pass. Nothing was released — run it again to see what moved.",
          }),
        );
        setCursor(Number.MAX_SAFE_INTEGER);
        return;
      }

      release(now.id, { kind: ev.kind, notes: ev.notes, targets: ev.targets });
      setView((v) => reduceRelease(v, ev));
    },
    [release],
  );

  useEffect(() => {
    if (!run || cursor >= run.length) return undefined;
    const ev = run[cursor];
    const timer = setTimeout(() => {
      apply(ev);
      setCursor((c) => c + 1);
    }, beatOfRelease(ev));
    return () => clearTimeout(timer);
  }, [run, cursor, apply]);

  const start = useCallback(
    (plan) => {
      const record = live.current;
      if (!record) return;
      setView(EMPTY_RELEASE);
      setCursor(0);
      setRun(compileRelease(record, plan));
    },
    [],
  );

  const busy = Boolean(run) && cursor < run.length;

  return useMemo(
    () => ({
      view,
      busy,
      started: Boolean(run),
      start,
      /** The files the release recorded, read after the commit. */
      manifest: () => agentFiles(agent?.id) ?? [],
    }),
    [view, busy, run, start, agentFiles, agent?.id],
  );
}
