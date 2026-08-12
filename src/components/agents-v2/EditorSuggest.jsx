import { useCallback, useEffect, useRef, useState } from "react";
import { Braces, File as FileIcon, FolderClosed, KeyRound, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { VAULT_VARIABLES } from "@/data/agentsV2";
import { resolveCandidates, resolveVault, tokenBehindCaret } from "./utils/suggest";
import { suggestJson } from "./utils/agentJsonSuggest";

/**
 * Autocomplete in the file editor, for the two things an agent's files
 * reference but cannot check for themselves.
 *
 *   ./  ../   other files in this agent's folder
 *   {{        vault variables, resolved on the machine that runs the agent
 *
 * Both are typed from memory today and both fail silently when wrong: a bad
 * path is a reference that never resolves, a bad variable name is a
 * placeholder that never expands. Offering what actually exists is the whole
 * feature.
 *
 * Vault entries show a name and a purpose and never a value — the secret is
 * resolved at run time on the machine that holds it, and a picker that could
 * show you the value would defeat the point of the vault.
 */
/**
 * Vertical position for the popup, under the line the token starts on.
 *
 * A textarea exposes no caret geometry, and mirroring it into a hidden div for
 * exact coordinates is a lot of machinery for an affordance that only needs to
 * be near the right place.
 */
function anchor(el, value, start) {
  const line = String(value).slice(0, start).split("\n").length - 1;
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
  return Math.max(8, Math.min(line * lh + lh + 8 - el.scrollTop, el.clientHeight - 8));
}

export default function EditorSuggest({
  textareaRef,
  value,
  currentPath,
  files,
  folders,
  onInsert,
  // "json" adds schema completion — property names valid at the caret and the
  // values legal for the field it is in. One extra kind rather than a parallel
  // widget, which is also what keeps {{VAULT}} working inside a JSON string.
  mode = "markdown",
  agent,
}) {
  // { kind, token, start, items, index, top }
  const [state, setState] = useState(null);

  // A completed token still matches itself, so refresh() would reopen the list
  // on the very thing that was just chosen.
  const dismissed = useRef(null);

  const refresh = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      setState(null);
      return;
    }
    const caret = el.selectionStart ?? 0;
    const found = tokenBehindCaret(value, caret);

    // Vault first, always. A {{NAME}} inside a JSON string value is still a
    // vault reference, and checking the schema first would answer it with a
    // list of tool names.
    if (mode === "json" && found?.kind !== "vault") {
      const hit = agent ? suggestJson(value, caret, agent) : null;
      if (!hit || hit.token === dismissed.current) {
        if (!hit) dismissed.current = null;
        setState(null);
        return;
      }
      dismissed.current = null;
      setState((prev) => ({
        kind: "json",
        token: hit.token,
        start: hit.start,
        end: hit.end,
        quoted: hit.quoted,
        heading: hit.heading,
        items: hit.items,
        top: anchor(el, value, hit.start),
        index: prev?.token === hit.token && prev?.kind === "json" ? (prev.index ?? 0) : 0,
      }));
      return;
    }

    if (!found) {
      dismissed.current = null;
      setState(null);
      return;
    }
    if (found.token === dismissed.current) {
      setState(null);
      return;
    }
    dismissed.current = null;

    const items =
      found.kind === "vault"
        ? resolveVault(found.typed, VAULT_VARIABLES)
        : resolveCandidates(found.token, currentPath, files, folders);

    if (!items || items.length === 0) {
      setState(null);
      return;
    }

    setState((prev) => ({
      ...found,
      items,
      top: anchor(el, value, found.start),
      index: prev?.token === found.token ? (prev.index ?? 0) : 0,
    }));
  }, [textareaRef, value, currentPath, files, folders, mode, agent]);

  const choose = useCallback(
    (item) => {
      if (!state || !item) return;

      if (state.kind === "json") {
        // The scanner reports the span through the closing quote, so replacing
        // it is what stops an accepted mid-word completion leaving the tail of
        // the old value behind.
        const inserted = item.insert ?? (state.quoted ? `${item.value}"` : `"${item.value}"`);
        dismissed.current = inserted;
        onInsert(state.quoted ? state.start : state.start, state.end, inserted);
      } else if (state.kind === "vault") {
        // Closed on insert: a half-written {{NAME is not a reference, and
        // leaving the braces open is the mistake this exists to prevent.
        const inserted = `{{${item.name}}}`;
        dismissed.current = inserted;
        onInsert(state.start, state.start + state.token.length, inserted);
      } else {
        const upToSlash = state.token.slice(0, state.token.lastIndexOf("/") + 1);
        const inserted = `${upToSlash}${item.name}${item.isDir ? "/" : ""}`;
        // Picking a file finishes the path; picking a folder does not.
        dismissed.current = item.isDir ? null : inserted;
        onInsert(state.start, state.start + state.token.length, inserted);
      }
      setState(null);
    },
    [state, onInsert],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return undefined;

    const onKey = (e) => {
      if (!state) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setState((s) =>
          s ? { ...s, index: (s.index + (e.key === "ArrowDown" ? 1 : s.items.length - 1)) % s.items.length } : s,
        );
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(state.items[state.index]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        dismissed.current = state.token;
        setState(null);
      }
    };

    el.addEventListener("keydown", onKey);
    el.addEventListener("click", refresh);
    el.addEventListener("keyup", refresh);
    return () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("click", refresh);
      el.removeEventListener("keyup", refresh);
    };
  }, [textareaRef, state, choose, refresh]);

  if (!state) return null;

  const isVault = state.kind === "vault";
  const isJson = state.kind === "json";
  const LABEL = { vault: "Vault variables", json: state.heading, path: "Path suggestions" };

  return (
    <div
      role="listbox"
      aria-label={LABEL[state.kind] ?? "Suggestions"}
      style={{ top: state.top, left: 12 }}
      className="absolute z-30 max-h-56 w-80 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg"
    >
      {(isVault || isJson) && (
        <p className="px-2.5 pb-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
          {isVault ? "Vault variables" : state.heading}
        </p>
      )}

      {state.items.map((item, i) => {
        // Vault and path entries are keyed by `name`, schema entries by `value`.
        const text = isJson ? item.value : item.name;
        return (
          <button
            key={text}
            type="button"
            role="option"
            aria-selected={i === state.index}
            onMouseDown={(e) => {
              // mousedown, not click — the textarea must not blur first.
              e.preventDefault();
              choose(item);
            }}
            onMouseEnter={() => setState((s) => (s ? { ...s, index: i } : s))}
            className={cn(
              "flex w-full items-center gap-2 px-2.5 py-1 text-left transition-colors",
              i === state.index ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {isVault ? (
              <KeyRound className="size-3 shrink-0" aria-hidden />
            ) : isJson ? (
              <Braces className="size-3 shrink-0 text-primary/70" aria-hidden />
            ) : item.isDir ? (
              <FolderClosed className="size-3 shrink-0 text-primary/70" aria-hidden />
            ) : (
              <FileIcon className="size-3 shrink-0" aria-hidden />
            )}

            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[11px]">
                {isVault || isJson ? text : `${text}${item.isDir ? "/" : ""}`}
              </span>
              {/* The schema's hint, verbatim — the same sentence the form shows
                  under the control, so the two cannot paraphrase apart. */}
              {(isVault || isJson) && item.note && (
                <span className="block truncate text-[10px] text-muted-foreground/80">{item.note}</span>
              )}
            </span>

            {isJson && item.group && (
              <span className="shrink-0 text-[10px] text-muted-foreground/70">{item.group}</span>
            )}

            {/* Marks a secret without ever showing one. */}
            {isVault && item.secret && (
              <Lock className="size-2.5 shrink-0 text-muted-foreground" aria-label="Secret" />
            )}
          </button>
        );
      })}

      <p className="mt-0.5 border-t border-border px-2.5 pt-1 text-[10px] text-muted-foreground">
        ↑↓ move · Tab insert · Esc dismiss
      </p>
    </div>
  );
}
