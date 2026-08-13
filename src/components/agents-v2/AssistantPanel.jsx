import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Maximize2, Minimize2, Send, Sparkles, X } from "lucide-react";

import { AUTHORING, SUGGESTIONS } from "@/data/agentRuns";
import { useRunPlayer } from "./utils/useRunPlayer";
import RunTranscript from "./RunTranscript";

/**
 * Assistant.
 *
 * Opt-in, never automatic. The editor is what opens; this arrives only when
 * asked for. Writing by hand is the baseline and generating is the assist —
 * a panel that opens itself reverses that and makes typing feel like the
 * fallback.
 *
 * Once open it is a conversation beside the editor, not a screen you leave:
 * ask for something, the files change in place, edit them by hand, ask for
 * the next thing. Every turn writes through the same store the editor reads,
 * so what it produces is immediately and equally editable — including while it
 * is still writing, which is the point of the guard in useRunPlayer.
 *
 * The turn itself lives in useRunPlayer and the recipes in agentRuns. What is
 * left here is the panel: its chrome, its composer, and the two layout modes.
 */

export default function AssistantPanel({
  agent,
  onClose,
  embedded = false,
  focused = false,
  onToggleFocus,
  isExpanded = false,
  onToggleExpand,
  onOpenFile,
  onFocusField,
  claims,
}) {
  const inputRef = useRef(null);
  const blank = agent?.files.length === 1 && agent.files[0].content.trim().length < 40;

  const player = useRunPlayer({
    agentId: agent?.id,
    kind: "authoring",
    seed: [
      {
        role: "ai",
        text: blank
          ? "Tell me what this agent should do and I'll write the folder. You can edit anything I write, including while I'm writing it."
          : "Ask for changes to this agent — a reference file, a script, machine setup, or a rewrite. Everything I write stays editable.",
        steps: [],
        quotes: [],
        writes: [],
        proposals: [],
        done: null,
      },
    ],
    onOpenFile,
    onFocusField,
    claims,
  });

  const send = (text, intent) => {
    const q = (text ?? inputRef.current?.value ?? "").trim();
    if (!q || player.busy || !agent) return;
    if (inputRef.current) inputRef.current.value = "";
    player.start(q, intent);
  };

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  if (!agent) return null;

  // Embedded: it is a column inside the editor card, so it fills its slot and
  // brings no border or animation of its own.
  const Shell = embedded ? "div" : motion.div;
  const shellProps = embedded
    ? { className: "flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30" }
    : {
        initial: { width: 0, opacity: 0 },
        animate: { width: isExpanded ? "100%" : 400, opacity: 1 },
        exit: { width: 0, opacity: 0 },
        transition: { duration: 0.22, ease: "easeInOut" },
        className: `${isExpanded ? "flex-1 min-w-0" : "flex-shrink-0"} border-l border-border bg-muted flex flex-col overflow-hidden`,
        style: { minWidth: 0 },
      };

  return (
    <Shell {...shellProps}>
      <div
        className={
          embedded
            ? "flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3"
            : "flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card px-4"
        }
      >
        {/* Embedded: a bar matching the file toolbar, so the two columns start
            on the same line rather than the conversation appearing to hang off
            the file. */}
        {embedded ? (
          <>
            <Sparkles size={13} className="shrink-0 text-primary" aria-hidden />
            <span className="truncate text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              Assistant
            </span>
          </>
        ) : (
          <>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[4px] border border-primary/30 bg-primary/10">
              <Sparkles size={16} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">Assistant</p>
              <p className="truncate text-xs text-muted-foreground">Writes into this agent&apos;s folder</p>
            </div>
          </>
        )}

        {onToggleFocus && (
          <button
            aria-label={focused ? "Restore layout" : "Focus the assistant"}
            aria-pressed={focused}
            onClick={onToggleFocus}
            className="ml-auto flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted"
          >
            {focused ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        )}
        {onToggleExpand && (
          <button
            aria-label={isExpanded ? "Restore panel size" : "Maximize"}
            onClick={onToggleExpand}
            className="flex size-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted"
          >
            {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        )}
        <button
          aria-label="Close"
          onClick={onClose}
          className={
            embedded
              ? "flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted"
              : "ml-auto flex size-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted"
          }
        >
          <X size={embedded ? 13 : 15} />
        </button>
      </div>

      <RunTranscript
        view={player.view}
        run={player.run}
        busy={player.busy}
        kind="authoring"
        recipeCount={AUTHORING.length}
        onSkip={player.skip}
        onStop={player.stop}
        onCommit={player.commit}
        onUndo={player.undo}
        onOpenFile={onOpenFile}
      />

      <div className="shrink-0 px-4 pt-2 pb-4">
        <div className="overflow-hidden rounded-[12px] border border-border bg-card shadow-[0_4px_24px_0_rgba(37,99,235,0.10)]">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <input
              ref={inputRef}
              type="text"
              defaultValue=""
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Describe what to build or change…"
              aria-label="Describe what to build or change"
              className="flex-1 bg-transparent text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={() => send()}
              disabled={player.busy}
              aria-label="Send"
              className={`flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
                player.busy
                  ? "cursor-not-allowed border-border bg-card text-foreground"
                  : "border-border bg-primary text-primary-foreground"
              }`}
            >
              <Send size={14} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1 px-3 py-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={player.busy}
                onClick={() => send(s.label, s.id)}
                className="rounded-[6px] px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {/* Permanent, under the thing it describes. */}
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/70">
          reads what you type, writes into this folder. no model is called.
        </p>
      </div>
    </Shell>
  );
}
