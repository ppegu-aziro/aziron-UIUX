import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Columns2, FileCode, Info, ListChecks, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PREPARATION_PATH, OS_TABS } from "@/data/preparationSchema";
import { lineOfPath, parsePreparation, pathAt } from "./utils/preparation/document";
import { lintPreparation } from "./utils/preparation/lint";
import { repairFor } from "./utils/preparation/repairs";
import { applyEdit, applyRepair, editableAt } from "./utils/preparation/edit";
import { appendItem, renderFragment } from "./utils/preparation/yamlSplice";
import PreparationSetup from "./PreparationSetup";
import EditorSuggest from "./EditorSuggest";

/**
 * `.aziron/preparation.yaml`, read two ways.
 *
 * Setup resolves the document for one machine at a time; YAML is where it is
 * written. Unlike agent.json's Settings pane this one commits nothing — see
 * PreparationSetup for why a resolved row has no unambiguous place to write
 * back to — so the two are not peers in the way Settings and JSON are, and
 * Both is the default because the pairing is what makes the left pane legible.
 *
 * Called Setup rather than Preview, Plan or Readiness. Preview is burned in
 * this editor. Plan and Readiness both promise something computed against a
 * real machine, and the honest thing about this pane is that it has not
 * touched one.
 */

const MODES = [
  { id: "setup", label: "Setup", icon: ListChecks, hint: "What runs on each machine" },
  { id: "split", label: "Both", icon: Columns2, hint: "The setup beside the file" },
  { id: "yaml", label: "YAML", icon: FileCode, hint: "Edit the file directly" },
];

const OS_KEY = "aziron_prep_os";

/** Which machine to open on: the reader's own, when the browser will say. */
function defaultGoos() {
  try {
    const saved = localStorage.getItem(OS_KEY);
    if (saved && OS_TABS.some((t) => t.goos === saved)) return saved;
  } catch {
    /* storage blocked */
  }
  const ua = `${navigator.userAgent} ${navigator.platform ?? ""}`.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "darwin";
  return "linux";
}

function Problems({ problems, onJump, onFix }) {
  if (!problems.length) return null;
  const errors = problems.filter((p) => p.severity === "error");
  return (
    <div
      className={cn(
        "max-h-32 shrink-0 space-y-1 overflow-y-auto border-b px-3 py-2",
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
          {/* A fix is offered only where one is unambiguously right. A wand
              that sometimes guesses wrong is one people stop pressing, and then
              the ones that are right go unpressed too. */}
          {p.fix && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="shrink-0"
              title={p.fix.title}
              onClick={() => onFix(p.fix)}
            >
              <Wand2 className="size-3" aria-hidden />
              {p.fix.label}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function PreparationView({
  agent,
  text,
  files,
  folders,
  textareaRef,
  onChangeText,
  onInsert,
}) {
  const [mode, setMode] = useState("split");
  const [goos, setGoos] = useState(defaultGoos);
  const [cursorPath, setCursorPath] = useState(null);
  // Settled separately from the text. YAML is invalid far more often mid-edit
  // than JSON — every partially typed indented line — so a strip that redrew on
  // every keystroke would be noise for most of the time you were typing.
  const [settled, setSettled] = useState(text);
  const localRef = useRef(null);
  const ref = textareaRef ?? localRef;

  useEffect(() => {
    const t = setTimeout(() => setSettled(text), 800);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    try {
      localStorage.setItem(OS_KEY, goos);
    } catch {
      /* storage blocked */
    }
  }, [goos]);

  const live = useMemo(() => parsePreparation(text), [text]);
  const shown = useMemo(() => parsePreparation(settled), [settled]);
  const problems = useMemo(() => {
    if (!shown.js) return [];
    return lintPreparation(shown.js).map((p) => ({
      ...p,
      fix: repairFor(p, settled, shown.doc, shown.js),
    }));
  }, [shown, settled]);

  /**
   * The Setup pane renders the SETTLED parse, not the live one.
   *
   * It is read-only and commits nothing, so there is no reason to blank it on
   * every half-typed line — and YAML is invalid for most of the time anyone is
   * typing into it, so a pane driven by the live text would spend that time
   * empty. Settling also means "the last document that made sense" needs no
   * tracking of its own: it is simply the one the strip is already using.
   */
  const js = shown.js;
  const stale = !live.js && Boolean(js);

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
    if (mode === "setup") setMode("split");
    requestAnimationFrame(() => revealLine(lineOfPath(text, live.doc ?? shown.doc, path)));
  };

  /** The other direction: put the caret in the file, light up the row it makes. */
  const syncCursor = () => {
    const el = ref.current;
    if (!el || !live.doc) return;
    setCursorPath(pathAt(live.doc, el.selectionStart ?? 0));
  };

  /**
   * Write, then say what happened.
   *
   * Every write goes through the same gate, which refuses anything that would
   * leave the file unparseable — a splice bug must never be saved over what the
   * user had. Undo is exact rather than approximate: a splice is a range and
   * two strings, so putting the old text back is the same operation reversed.
   */
  const commit = (result, describe) => {
    if (!result.ok) {
      toast.error(result.why);
      return;
    }
    onChangeText(result.text);
    toast.success(describe, {
      description: "Saved into the file.",
      action: { label: "Undo", onClick: () => onChangeText(result.before) },
    });
  };

  const editValue = (path, value) =>
    commit(applyEdit(text, live.doc ?? shown.doc, path, value), "Updated");

  /** Whether a path can be edited in place, so a field can refuse with a reason. */
  const canEdit = (path) => editableAt(text, live.doc ?? shown.doc, path);

  const fix = (repair) => commit(applyRepair(repair, settled), repair.label);

  /** Add a precheck or a step, from the inline form. */
  const add = (where, item) => {
    const doc = live.doc ?? shown.doc;
    const segments = ["preparation", ...where.split(".")];
    const result = appendItem(text, doc, segments, renderFragment(item));
    if (!result) {
      toast.error("There is nowhere to put that yet.");
      return;
    }
    const check = parsePreparation(result.text);
    if (check.fatal || check.errors.length) {
      toast.error("That would break the file, so it was not added.");
      return;
    }
    commit({ ok: true, text: result.text, before: text }, `Added ${item.label || item.id}`);
  };

  const showSetup = mode === "setup" || mode === "split";
  const showYaml = mode === "yaml" || mode === "split";
  const errors = problems.filter((p) => p.severity === "error").length;

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
          {MODES.map((m) => (
            <Button
              key={m.id}
              type="button"
              size="xs"
              variant={mode === m.id ? "secondary" : "ghost"}
              aria-pressed={mode === m.id}
              title={m.hint}
              onClick={() => setMode(m.id)}
            >
              <m.icon className="size-3" aria-hidden />
              {m.label}
            </Button>
          ))}
        </div>

        {live.fatal ? (
          <span className="text-[11px] text-destructive">
            {live.fatal} — the setup below is the last version that parsed.
          </span>
        ) : errors ? (
          <span className="text-[11px] text-destructive">
            {errors} {errors === 1 ? "problem" : "problems"} would stop a release.
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Checked against the schema. Nothing has been run on any machine.
          </span>
        )}

        {live.hasAnchors && (
          <span className="text-[11px] text-warning">
            Uses YAML anchors — edit those in the file, not here.
          </span>
        )}
      </div>

      <Problems problems={problems} onJump={jump} onFix={fix} />

      <div className={cn("flex min-h-0 flex-1", showSetup && showYaml ? "flex-col lg:flex-row" : "flex-col")}>
        {showSetup && (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              showYaml && "lg:border-r lg:border-border",
            )}
          >
            <PreparationSetup
              js={js}
              goos={goos}
              onGoos={setGoos}
              stale={stale}
              cursorPath={cursorPath}
              onJump={jump}
              {...(live.js
                ? { onEdit: editValue, onAdd: add, editableAt: canEdit }
                : // Nothing is editable while the text does not parse: the
                  // splice targets are found in the tree, and the tree is the
                  // one that was last valid, not the one on screen.
                  {})}
            />
          </div>
        )}

        {showYaml && (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <Textarea
              ref={ref}
              aria-label={`${PREPARATION_PATH} content`}
              value={text}
              spellCheck={false}
              onChange={(e) => onChangeText(e.target.value)}
              onKeyUp={syncCursor}
              onClick={syncCursor}
              className="min-h-0 flex-1 resize-none overflow-y-auto rounded-none border-0 bg-transparent font-mono text-[11px] leading-5 focus-visible:ring-0 md:text-[11px]"
            />
            <EditorSuggest
              mode="yaml"
              agent={agent}
              textareaRef={ref}
              value={text}
              currentPath={PREPARATION_PATH}
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
