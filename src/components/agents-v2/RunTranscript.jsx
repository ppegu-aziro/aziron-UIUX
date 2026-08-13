import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Copy,
  Cpu,
  FileCode,
  FilePlus,
  FolderPlus,
  Info,
  PenLine,
  Quote,
  RotateCcw,
  SkipForward,
  Sliders,
  Square,
  Undo2,
  Wrench,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { FILL_COUNTS } from "@/data/agentJsonSchema";

/**
 * One conversation, rendered — and the place the mock admits what it is.
 *
 * The strongest disclosure goes on the most impressive surface. It would be
 * easy to spend two paragraphs on the runtime chat, which barely does anything,
 * and eleven small-caps characters on the panel that streams prose, materialises
 * folders and snaps form controls. That is backwards: the disclosure belongs
 * where the illusion is strongest.
 *
 * Everything the run DOES is real — the files, folders and settings it changes
 * are the ones you keep, editable while it is still going. Only the choosing is
 * scripted, and the ribbon says exactly that.
 */

const STEP_ICON = { file: FileCode, cpu: Cpu, wrench: Wrench, book: BookOpen };

const LEDGER = {
  folder: { icon: FolderPlus, verb: "created" },
  file: { icon: FilePlus, verb: "written" },
  set: { icon: PenLine, verb: "replaced" },
  field: { icon: Sliders, verb: "set" },
};

/** Inline code and bold, escaped first. Deliberately not a markdown parser. */
const rich = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">$1</code>');

/** What a filled value looks like in a one-line ledger row. */
const short = (v) => {
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" ? x.label ?? "…" : x)).join(", ") : "none";
  if (typeof v === "boolean") return v ? "on" : "off";
  if (v === "" || v == null) return "—";
  return String(v);
};

function Ledger({ rows, onUndo, onOpenFile }) {
  if (!rows.length) return null;
  return (
    <ul className="mt-2 space-y-0.5">
      {rows.map((row, i) => {
        if (row.kind === "yield") {
          return (
            <li key={`${row.path}-${i}`} className="flex items-start gap-1.5 text-[10px] leading-4 text-warning">
              <Info className="mt-0.5 size-2.5 shrink-0" aria-hidden />
              <span>
                stopped writing <span className="font-mono">{row.path}</span> — you edited it while I was going.
                What I wrote is still there.
              </span>
            </li>
          );
        }
        const meta = LEDGER[row.kind];
        if (!meta) return null;
        const Icon = meta.icon;
        return (
          <li key={`${row.path}-${i}`} className="flex items-center gap-1.5 text-[10px] leading-4">
            <Icon className="size-2.5 shrink-0 text-muted-foreground" aria-hidden />
            {row.kind === "field" ? (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                <span className="text-foreground">{row.label}</span>
                {" · "}
                <span className="line-through decoration-muted-foreground/50">{short(row.was)}</span>
                {" → "}
                <span className="text-foreground">{short(row.value)}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onOpenFile?.(row.path)}
                className="min-w-0 flex-1 truncate text-left font-mono text-muted-foreground hover:text-foreground hover:underline"
              >
                {row.path} <span className="font-sans">{meta.verb}</span>
              </button>
            )}
            {/* Undoable only where undoing is exact. A file the user may already
                have edited is not — putting the old bytes back would discard
                their typing, which is the one thing an editor must never do. */}
            {(row.kind === "field" || row.kind === "set") && (
              <button
                type="button"
                onClick={() => onUndo(row)}
                title="Put it back"
                aria-label={`Undo ${row.kind === "field" ? row.label : row.path}`}
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Undo2 className="size-2.5" aria-hidden />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A proposal: the work is done, the value is complete, the commit is one click.
 *
 * Declining is a full-weight button rather than a dismissal X, because the
 * chip is a question and "no" is a real answer to it — not a way of getting
 * the question off the screen.
 */
function Proposals({ items, taken, onCommit, onDecline }) {
  const open = items.filter((p) => !taken[p.id]);
  if (!open.length) return null;
  return (
    <div className="mt-2.5 space-y-1.5">
      {open.map((p) => (
        <div key={p.id} className="rounded-[8px] border border-primary/30 bg-primary/[0.06] px-2.5 py-2">
          <p className="text-[11px] font-medium text-foreground">{p.title}</p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{p.note}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onCommit(p)}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
            >
              <Check className="size-2.5" aria-hidden />
              Apply
            </button>
            <button
              type="button"
              onClick={() => onDecline(p)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-2.5" aria-hidden />
              No thanks
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RunTranscript({
  view,
  run,
  busy,
  kind = "authoring",
  onSkip,
  onStop,
  onCommit,
  onUndo,
  onOpenFile,
  onReplay,
  recipeCount,
}) {
  const [taken, setTaken] = useState({});
  const [why, setWhy] = useState(false);
  const scrollRef = useRef(null);

  // Pinned to the bottom only when already near it, so a reader who scrolled up
  // to look at something is not yanked back on the next token.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 96) el.scrollTop = el.scrollHeight;
  }, [view]);

  const accept = (p) => {
    setTaken((t) => ({ ...t, [p.id]: true }));
    onCommit(p);
  };

  return (
    <>
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <div className="flex-1" />

        {view.messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex w-full shrink-0 justify-end">
              <div className="max-w-[80%] rounded-[12px] rounded-tr-[4px] border border-primary/30 bg-primary/10 px-4 py-3">
                <p className="text-sm leading-5 whitespace-pre-line text-foreground">{msg.text}</p>
              </div>
            </div>
          ) : (
            <div key={i} className="flex w-full shrink-0 flex-col items-start">
              <div className="w-full rounded-[12px] rounded-tl-[4px] border border-border bg-card px-4 py-3">
                {/* The ribbon. Always visible, never collapsed — it names the
                    recipe, which is also the most useful debugging affordance
                    in the whole panel. */}
                {i === view.messages.length - 1 && run && kind === "authoring" && (
                  <p className="mb-1.5 font-mono text-[10px] text-muted-foreground/80">
                    scripted · recipe “{run.recipe.id}” · 1 of {recipeCount} · no model was called
                  </p>
                )}

                {msg.think && (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground italic">
                    <span className="flex gap-0.5" aria-hidden>
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="size-1 animate-bounce rounded-full bg-muted-foreground/50 motion-reduce:animate-none"
                          style={{ animationDelay: `${d * 150}ms` }}
                        />
                      ))}
                    </span>
                    {msg.think}
                  </p>
                )}

                {msg.text && (
                  <p
                    aria-live="polite"
                    aria-busy={busy && i === view.messages.length - 1}
                    className={cn(
                      "text-sm leading-6 text-foreground",
                      // The caret is a pseudo-element on the paragraph, so a
                      // token arriving adds characters to one text node instead
                      // of inserting a node beside a blinking one.
                      busy &&
                        i === view.messages.length - 1 &&
                        "after:ml-0.5 after:inline-block after:h-3.5 after:w-px after:animate-pulse after:bg-primary after:align-middle after:content-[''] motion-reduce:after:animate-none",
                    )}
                    dangerouslySetInnerHTML={{ __html: rich(msg.text) }}
                  />
                )}

                {msg.quotes?.map((q, n) => (
                  <blockquote
                    key={n}
                    className="mt-2 border-l-2 border-primary/40 bg-muted/40 py-1.5 pr-2 pl-2.5"
                  >
                    <p className="flex gap-1.5 text-[12px] leading-5 text-foreground">
                      <Quote className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />
                      {q.text}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">{q.from} · no model called</p>
                  </blockquote>
                ))}

                {msg.steps?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {msg.steps.map((s, n) => {
                      const Icon = STEP_ICON[s.icon] ?? Info;
                      return (
                        <li key={n} className="flex items-start gap-1.5 rounded-md bg-muted/40 px-2 py-1">
                          <Icon className="mt-0.5 size-3 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] text-foreground">{s.label}</span>
                            {s.note && <span className="block text-[10px] text-muted-foreground">{s.note}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <Ledger rows={msg.writes ?? []} onUndo={onUndo} onOpenFile={onOpenFile} />

                <Proposals
                  items={msg.proposals ?? []}
                  taken={taken}
                  onCommit={accept}
                  onDecline={(p) => setTaken((t) => ({ ...t, [p.id]: true }))}
                />

                {msg.done && <p className="mt-2.5 text-[11px] leading-5 text-muted-foreground">{msg.done}</p>}

                {/* Said once, where the run just finished being impressive. */}
                {msg.done && kind === "authoring" && i === view.messages.length - 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setWhy((w) => !w)}
                      aria-expanded={why}
                      className="mt-2 text-[10px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                    >
                      {why ? "hide" : "how does this work?"}
                    </button>
                    {why && (
                      <p className="mt-1.5 rounded-md bg-muted/40 px-2 py-1.5 text-[10px] leading-4 text-muted-foreground">
                        Nothing here called a model. The steps come from matching keywords in what you typed
                        against {recipeCount} hand-written recipes, and then they run against this workspace for
                        real — the files, folders and settings they change are the ones you keep. Of the{" "}
                        {FILL_COUNTS.auto + FILL_COUNTS.propose + FILL_COUNTS.never} settings this agent has, I
                        fill {FILL_COUNTS.auto} outright, propose {FILL_COUNTS.propose} for you to accept, and
                        never touch {FILL_COUNTS.never}. What this proves is the loop, not the reasoning.
                      </p>
                    )}
                  </>
                )}

                {view.stopped && i === view.messages.length - 1 && (
                  <p className="mt-2 text-[11px] text-warning">
                    Stopped. Everything that landed is kept, and editable. Nothing rolls back here.
                  </p>
                )}
                {view.skipped && !busy && i === view.messages.length - 1 && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Skipped ahead. Same events, same result — it just landed at once.
                  </p>
                )}
              </div>

              {/* v1's per-message actions, minus the two that lie. A thumbs-up
                  on a scripted answer trains nothing and is read as feedback
                  reaching somewhere, and Regenerate says outright that it will
                  not produce anything different. */}
              {kind === "chat" && msg.text && !busy && (
                <div className="mt-1 flex items-center">
                  <button
                    type="button"
                    aria-label="Copy"
                    title="Copy"
                    onClick={() => navigator.clipboard?.writeText(msg.text)}
                    className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <Copy size={14} />
                  </button>
                  {onReplay && i === view.messages.length - 1 && run && (
                    <button
                      type="button"
                      aria-label="Replay"
                      title="Replay — it's a script, so it replays the same."
                      onClick={onReplay}
                      className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      {busy && (
        <div className="flex shrink-0 items-center gap-1.5 border-t border-border px-4 py-1.5">
          {/* Skip is primary. A run that is charming the first time is
              infuriating the fifth, and the fold it uses is the same one
              reduced motion takes — so it costs a boolean and is already
              asserted to produce an identical result. */}
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center gap-1 rounded-[6px] border border-border bg-card px-2 py-1 text-[11px] text-foreground transition-colors hover:border-primary/40"
          >
            <SkipForward className="size-3" aria-hidden />
            Skip to the end
          </button>
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Square className="size-3" aria-hidden />
            Stop
          </button>
        </div>
      )}
    </>
  );
}
