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
 * One rendered row, measured rather than derived from the padding — the mono
 * face sets its own line box. Used to decide above-or-below before paint, so
 * the list never appears in one place and jumps to another.
 */
const ROW_H = 26;
const MAX_ROWS = 8;
const MAX_W = 260;

/**
 * Width of one character in the editor's font.
 *
 * The editor is monospaced, so a column number times this is an exact x — no
 * hidden mirror div, no per-keystroke DOM measurement. Cached because the font
 * only changes if the theme does.
 */
let fontKey = null;
let charW = 0;
function charWidth(cs) {
  const font = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
  if (font !== fontKey) {
    const canvas = (charWidth.canvas ??= document.createElement("canvas"));
    const ctx = canvas.getContext("2d");
    ctx.font = font;
    // Ten characters, so rounding lands in the third decimal rather than the first.
    charW = ctx.measureText("0000000000").width / 10 || 6.6;
    fontKey = font;
  }
  return charW;
}

/**
 * Where the popup goes: at the caret, and inside the pane.
 *
 * It used to sit at a fixed left edge one line below the caret, which put it
 * under the wrong column on every line and let it run off the bottom of a short
 * pane. Now it tracks the caret's column, and flips above the line when there
 * is no room below — the behaviour every code editor has, and the reason you
 * can keep reading the code you are completing against.
 */
function place(el, value, start, count) {
  const upto = String(value).slice(0, start);
  const rows = upto.split("\n");
  const line = rows.length - 1;
  const col = rows[rows.length - 1].length;

  const cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight) || 16;
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padT = parseFloat(cs.paddingTop) || 0;

  const lineTop = el.offsetTop + padT + line * lh - el.scrollTop;
  const height = Math.min(count, MAX_ROWS) * ROW_H + 6;

  // Below by default; above when that would run past the bottom and there is
  // room up there. Never both, and never off the top.
  const below = lineTop + lh + 2;
  const above = lineTop - height - 2;
  const overflows = below + height > el.clientHeight;
  const top = overflows && above >= 0 ? above : Math.min(below, Math.max(0, el.clientHeight - height));

  const x = el.offsetLeft + padL + col * charWidth(cs) - el.scrollLeft;
  const left = Math.max(4, Math.min(x, el.clientWidth - MAX_W - 8));

  return { top, left };
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
        pos: place(el, value, hit.start, hit.items.length),
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
      pos: place(el, value, found.start, items.length),
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

  /*
    Deliberately small and see-through.

    It had a heading row and a keyboard-hint footer, which for a single
    suggestion meant two rows of furniture around one row of content, over a
    solid background, three hundred pixels wide. What it covered was the code
    you were completing against.

    So: no heading — the icon says which kind of list this is and the line above
    the caret already says which key you are filling in. No footer — ↑↓, Tab and
    Esc are the same in every editor anyone has used, and a permanent legend is
    a thing you read once and then look past. The note moves onto the item's own
    line, greyed and right-aligned, the way VS Code shows detail.
  */
  return (
    <div
      role="listbox"
      aria-label={LABEL[state.kind] ?? "Suggestions"}
      style={{
        top: state.pos.top,
        left: state.pos.left,
        maxWidth: MAX_W,
        maxHeight: MAX_ROWS * ROW_H + 6,
      }}
      className="absolute z-30 w-max min-w-[150px] overflow-x-hidden overflow-y-auto rounded-md border border-border/70 bg-popover/85 py-[3px] shadow-md ring-1 ring-black/5 backdrop-blur-sm"
    >
      {state.items.map((item, i) => {
        // Vault and path entries are keyed by `name`, schema entries by `value`.
        const text = isJson ? item.value : item.name;
        const detail = isJson ? (item.group ?? item.note) : item.note;
        const on = i === state.index;
        return (
          <button
            key={text}
            type="button"
            role="option"
            aria-selected={on}
            onMouseDown={(e) => {
              // mousedown, not click — the textarea must not blur first.
              e.preventDefault();
              choose(item);
            }}
            onMouseEnter={() => setState((s) => (s ? { ...s, index: i } : s))}
            className={cn(
              "flex w-full items-center gap-1.5 py-[3px] pr-2 pl-1.5 text-left leading-4 transition-colors",
              on ? "bg-primary/15 text-primary" : "text-foreground/80 hover:bg-muted/60",
            )}
          >
            {isVault ? (
              <KeyRound className="size-2.5 shrink-0 opacity-70" aria-hidden />
            ) : isJson ? (
              <Braces className="size-2.5 shrink-0 opacity-60" aria-hidden />
            ) : item.isDir ? (
              <FolderClosed className="size-2.5 shrink-0 text-primary/70" aria-hidden />
            ) : (
              <FileIcon className="size-2.5 shrink-0 opacity-70" aria-hidden />
            )}

            <span className="truncate font-mono text-[11px]">
              {isVault || isJson ? text : `${text}${item.isDir ? "/" : ""}`}
            </span>

            {/* The schema's hint, verbatim — the same sentence the form shows
                under the control, so the two cannot paraphrase apart. */}
            {detail && (
              <span className="ml-auto max-w-[45%] shrink-0 truncate pl-2 text-[10px] text-muted-foreground/60">
                {detail}
              </span>
            )}

            {/* Marks a secret without ever showing one. */}
            {isVault && item.secret && (
              <Lock className="size-2.5 shrink-0 text-muted-foreground/70" aria-label="Secret" />
            )}
          </button>
        );
      })}
    </div>
  );
}
