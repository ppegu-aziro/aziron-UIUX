import { useCallback, useEffect, useRef, useState } from "react";
import { File as FileIcon, FolderClosed, KeyRound, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { VAULT_VARIABLES } from "@/data/agentsV2";
import { resolveCandidates, resolveVault, tokenBehindCaret } from "./utils/suggest";

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
export default function EditorSuggest({ textareaRef, value, currentPath, files, folders, onInsert }) {
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
    const found = tokenBehindCaret(value, el.selectionStart ?? 0);
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

    // Anchored under the caret's line. A textarea exposes no caret geometry,
    // and mirroring it into a hidden div for exact coordinates is a lot of
    // machinery for an affordance that only needs to be near the right place.
    const line = value.slice(0, found.start).split("\n").length - 1;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
    const top = Math.max(8, Math.min(line * lh + lh + 8 - el.scrollTop, el.clientHeight - 8));

    setState((prev) => ({
      ...found,
      items,
      top,
      index: prev?.token === found.token ? (prev.index ?? 0) : 0,
    }));
  }, [textareaRef, value, currentPath, files, folders]);

  const choose = useCallback(
    (item) => {
      if (!state || !item) return;

      if (state.kind === "vault") {
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

  return (
    <div
      role="listbox"
      aria-label={isVault ? "Vault variables" : "Path suggestions"}
      style={{ top: state.top, left: 12 }}
      className="absolute z-30 max-h-56 w-72 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg"
    >
      {isVault && (
        <p className="px-2.5 pb-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
          Vault variables
        </p>
      )}

      {state.items.map((item, i) => (
        <button
          key={item.name}
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
          ) : item.isDir ? (
            <FolderClosed className="size-3 shrink-0 text-primary/70" aria-hidden />
          ) : (
            <FileIcon className="size-3 shrink-0" aria-hidden />
          )}

          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[11px]">
              {isVault ? item.name : `${item.name}${item.isDir ? "/" : ""}`}
            </span>
            {isVault && item.note && (
              <span className="block truncate text-[10px] text-muted-foreground/80">{item.note}</span>
            )}
          </span>

          {/* Marks a secret without ever showing one. */}
          {isVault && item.secret && (
            <Lock className="size-2.5 shrink-0 text-muted-foreground" aria-label="Secret" />
          )}
        </button>
      ))}

      <p className="mt-0.5 border-t border-border px-2.5 pt-1 text-[10px] text-muted-foreground">
        ↑↓ move · Tab insert · Esc dismiss
      </p>
    </div>
  );
}
