import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Info, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fieldAt } from "@/data/agentJsonSchema";
import { parseAgentJson, lineOfPath } from "./utils/agentJson";
import { jsonContextAt } from "./utils/jsonPath";
import AgentJsonForm from "./AgentJsonForm";
import EditorSuggest from "./EditorSuggest";

/**
 * AGENT.json, edited either way.
 *
 * Two renderings of one record, so the question "which one wins?" never arises:
 * the form patches the record and the JSON re-derives from it, and the JSON
 * folds back into a patch on the same record. Split shows both, which is the
 * cheapest way to learn which key a control is — you drag a slider and watch
 * one line move.
 *
 * Called Form rather than Preview. Preview was removed from this editor once
 * already for being read-only, and reusing the word for something editable is
 * worse than the original mistake.
 *
 * The one rule that keeps the modes honest: while the text does not parse, the
 * Form tab is disabled with the reason on it. The form renders from the record
 * and would still work, but reaching it would leave broken text sitting behind
 * a committed edit with no way to tell which the file is. The textarea itself is
 * never blocked — you are always free to keep typing your way out.
 */

const MODES = [
  { id: "form", label: "Form" },
  { id: "split", label: "Split" },
  { id: "json", label: "JSON" },
];

/** Plain sentences, each with its repair. */
function Problems({ problems, onFix, onJump }) {
  if (!problems.length) return null;
  const errors = problems.filter((p) => p.severity === "error");

  return (
    <div
      className={cn(
        "shrink-0 space-y-1 border-b px-3 py-2",
        errors.length ? "border-destructive/25 bg-destructive/5" : "border-warning/25 bg-warning/5",
      )}
    >
      {problems.map((p, i) => (
        <div key={`${p.path}-${i}`} className="flex items-start gap-2 text-[11px] leading-4">
          {p.severity === "error" ? (
            <AlertTriangle className="mt-0.5 size-3 shrink-0 text-destructive" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-3 shrink-0 text-warning" aria-hidden />
          )}
          <span className="min-w-0 flex-1 text-foreground">
            {p.path && (
              <button
                type="button"
                onClick={() => onJump(p.path)}
                className="mr-1 font-mono text-[10px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                {p.path}
              </button>
            )}
            {p.message}
          </span>
          {p.fix?.patch && (
            <Button type="button" size="xs" variant="outline" className="shrink-0" onClick={() => onFix(p.fix)}>
              <Wand2 className="size-3" aria-hidden />
              {p.fix.label}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AgentJsonView({
  agent,
  text,
  files,
  folders,
  textareaRef,
  onChangeText,
  onInsert,
  onEditField,
  onApplyPatch,
  onFlush,
}) {
  const [mode, setMode] = useState("form");
  const [tier, setTier] = useState("common");
  // One dotted path, shared by both panes — the thing that makes them read as
  // one editor rather than two views of a file.
  const [cursorPath, setCursorPath] = useState(null);
  // Settled separately from the text: the editor's autosave lands mid-edit
  // constantly, and a strip that flickers on normal typing is one people learn
  // to ignore.
  const [settled, setSettled] = useState(text);
  const localRef = useRef(null);
  const ref = textareaRef ?? localRef;

  useEffect(() => {
    const t = setTimeout(() => setSettled(text), 800);
    return () => clearTimeout(t);
  }, [text]);

  const live = useMemo(() => parseAgentJson(text, agent), [text, agent]);
  const shown = useMemo(() => parseAgentJson(settled, agent), [settled, agent]);
  const broken = !live.doc;

  // Whatever the last mode click was, a document that will not parse cannot
  // hand the screen to the form.
  const effective = broken && mode === "form" ? "json" : mode;
  const showForm = effective === "form" || effective === "split";
  const showJson = effective === "json" || effective === "split";

  const revealLine = (n) => {
    const el = ref.current;
    if (!el || n < 1) return;
    const rows = el.value.split("\n");
    const start = rows.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
    el.focus();
    el.setSelectionRange(start, start + (rows[n - 1]?.length ?? 0));
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
    el.scrollTop = Math.max(0, (n - 1) * lh - el.clientHeight / 2);
  };

  const jump = (path) => {
    setCursorPath(path);
    if (!showJson) setMode("split");
    requestAnimationFrame(() => revealLine(lineOfPath(text, path)));
  };

  const goToMode = (next) => {
    // Leaving the text behind: commit it now rather than letting the debounce
    // land after the form has already patched the record.
    if (next === "form" && !broken) onFlush?.();
    // Arriving at the form from the text: carry the caret across as a field.
    if (next !== "json" && ref.current) {
      const c = jsonContextAt(ref.current.value, ref.current.selectionStart ?? 0);
      const p = c && [...c.path].filter((s) => typeof s === "string").join(".");
      if (p && fieldAt(p)) setCursorPath(p);
    }
    setMode(next);
  };

  const editField = (spec, value) => {
    onEditField(spec, value);
    setCursorPath(spec.path);
  };

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
          {MODES.map((m) => {
            const blocked = m.id === "form" && broken;
            return (
              <Button
                key={m.id}
                type="button"
                size="xs"
                variant={effective === m.id ? "secondary" : "ghost"}
                aria-pressed={effective === m.id}
                disabled={blocked}
                title={blocked ? "Fix the JSON first — it does not parse" : undefined}
                onClick={() => goToMode(m.id)}
              >
                {m.label}
              </Button>
            );
          })}
        </div>

        {broken && (
          <span className="text-[11px] text-destructive">
            The form is unavailable until this parses. Your settings are untouched.
          </span>
        )}
        {!broken && !live.ok && (
          <span className="text-[11px] text-warning">Not applied — see below.</span>
        )}
      </div>

      {/*
        Repairs patch the record, which drops the buffer and re-derives the
        text — so pressing one rewrites the offending line rather than leaving
        you looking at the thing you just fixed.
      */}
      <Problems problems={shown.problems} onJump={jump} onFix={(fix) => onApplyPatch(fix.patch)} />

      <div className={cn("flex min-h-0 flex-1", showForm && showJson ? "flex-col lg:flex-row" : "flex-col")}>
        {showForm && (
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto p-3",
              showJson && "lg:border-r lg:border-border",
            )}
          >
            <AgentJsonForm
              agent={agent}
              tier={tier}
              onTierChange={setTier}
              onEdit={editField}
              onFocusPath={setCursorPath}
              cursorPath={cursorPath}
            />
          </div>
        )}

        {showJson && (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <Textarea
              ref={ref}
              aria-label="AGENT.json content"
              value={text}
              spellCheck={false}
              onChange={(e) => onChangeText(e.target.value)}
              className="min-h-0 flex-1 resize-none overflow-y-auto rounded-none border-0 bg-transparent font-mono text-[11px] leading-5 focus-visible:ring-0"
            />
            <EditorSuggest
              mode="json"
              agent={agent}
              textareaRef={ref}
              value={text}
              currentPath="AGENT.json"
              files={files}
              folders={folders}
              onInsert={onInsert}
            />
          </div>
        )}
      </div>
    </>
  );
}
