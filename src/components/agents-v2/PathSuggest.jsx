import { useCallback, useEffect, useState } from "react";
import { File as FileIcon, FolderClosed } from "lucide-react";

import { cn } from "@/lib/utils";
import { resolveCandidates, tokenBehindCaret } from "./utils/pathSuggest";

/**
 * Relative-path autocomplete for the file editor.
 *
 * Agents are multi-file, and the entrypoint's whole job is to point at the
 * other files. Typing those paths from memory is where cross-references break:
 * a reference to `references/backround.md` fails silently, because nothing
 * validates prose.
 *
 * So typing `./` or `../` offers what is actually there, resolved against the
 * file being edited. Choosing a folder appends a slash so the next level opens
 * immediately.
 */
export default function PathSuggest({ textareaRef, value, currentPath, files, folders, onInsert }) {
  // { token, start, items, index, top } — position included, because reading
  // the textarea during render is not allowed and not safe.
  const [state, setState] = useState(null);

  const refresh = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      setState(null);
      return;
    }
    const found = tokenBehindCaret(value, el.selectionStart ?? 0);
    if (!found) {
      setState(null);
      return;
    }
    const items = resolveCandidates(found.token, currentPath, files, folders);
    if (!items || items.length === 0) {
      setState(null);
      return;
    }

    // Anchored under the caret's line. A textarea exposes no caret geometry,
    // and mirroring it into a hidden div to get exact coordinates is a lot of
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
      const upToSlash = state.token.slice(0, state.token.lastIndexOf("/") + 1);
      // A folder keeps its trailing slash so the next level opens straight away.
      onInsert(state.start, state.start + state.token.length, `${upToSlash}${item.name}${item.isDir ? "/" : ""}`);
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

  return (
    <div
      role="listbox"
      aria-label="Path suggestions"
      style={{ top: state.top, left: 12 }}
      className="absolute z-30 max-h-52 w-64 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg"
    >
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
            "flex w-full items-center gap-2 px-2.5 py-1 text-left font-mono text-[11px] transition-colors",
            i === state.index ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {item.isDir ? (
            <FolderClosed className="size-3 shrink-0 text-primary/70" aria-hidden />
          ) : (
            <FileIcon className="size-3 shrink-0" aria-hidden />
          )}
          <span className="truncate">
            {item.name}
            {item.isDir ? "/" : ""}
          </span>
        </button>
      ))}
      <p className="mt-0.5 border-t border-border px-2.5 pt-1 text-[10px] text-muted-foreground">
        ↑↓ move · Tab insert · Esc dismiss
      </p>
    </div>
  );
}
