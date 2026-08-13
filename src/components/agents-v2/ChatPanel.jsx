import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Bot, Maximize2, Minimize2, Paperclip, Send, X } from "lucide-react";

import { STATUS } from "@/data/agentsV2";
import { useRunPlayer } from "./utils/useRunPlayer";
import RunTranscript from "./RunTranscript";

/**
 * Agent chat — a port of v1's AgentConversationPanel.
 *
 * Deliberately unchanged from the live product where it can be: same inline
 * side panel rather than an overlay, same 64px header, same bubble geometry,
 * same composer with its control bar. Chat is the one surface in v2 that a
 * returning user should not have to re-learn.
 *
 * What changed is the answer. It used to reply with one canned sentence to
 * every question — the same text whether you asked about parental leave or
 * about its own tools — with "this is a demo" bolted onto a confident-sounding
 * fabrication. A disclaimer sitting in the same bubble as the invention is the
 * weakest possible form of admission.
 *
 * So it answers only from things that exist: the agent's own files, retrieved
 * for real, and the agent's own record. When neither covers the question it
 * refuses. An HR agent streaming plausible parental-leave text under its own
 * name is the one outcome this panel must never produce.
 */

const STATUS_TEXT = {
  active: "var(--success)",
  idle: "var(--muted-foreground)",
  error: "var(--destructive)",
  disabled: "var(--muted-foreground)",
};

export default function ChatPanel({ agent, onClose, isExpanded = false, onToggleExpand }) {
  const statusCfg = STATUS[agent?.status] ?? STATUS.idle;
  const inputRef = useRef(null);

  const bound = Boolean(agent?.runtime);
  const player = useRunPlayer({
    agentId: agent?.id,
    kind: "chat",
    seed: agent
      ? [
          {
            role: "ai",
            text: bound
              ? `Hi! I'm **${agent.name}**.\n${agent.description}\n\nAsk me something and I'll answer from the files in my folder.`
              : `Hi! I'm **${agent.name}**.\n${agent.description}\n\nNo model is bound to me yet, so I can't answer here — I still install and run on my targets, which bring their own. Bind one from Settings and we can talk.`,
            steps: [],
            quotes: [],
            writes: [],
            proposals: [],
            done: null,
          },
        ]
      : [],
  });

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  if (!agent) return null;

  const send = (text) => {
    const q = (text ?? inputRef.current?.value ?? "").trim();
    if (!q || player.busy) return;
    if (inputRef.current) inputRef.current.value = "";
    player.start(q);
  };

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: isExpanded ? "100%" : 400, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: "easeInOut" }}
      className={`${isExpanded ? "flex-1 min-w-0" : "flex-shrink-0"} border-l border-border bg-muted flex flex-col overflow-hidden`}
      style={{ minWidth: 0 }}
    >
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card px-4">
        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-border bg-muted">
          <Bot size={18} className="text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{agent.name}</p>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: statusCfg.dot }} />
            <span
              className="text-xs capitalize"
              style={{ color: STATUS_TEXT[agent.status] ?? "var(--muted-foreground)" }}
            >
              {statusCfg.label}
            </span>
          </div>
        </div>
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
          className="flex size-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted"
        >
          <X size={15} />
        </button>
      </div>

      <RunTranscript
        view={player.view}
        run={player.run}
        busy={player.busy}
        kind="chat"
        onSkip={player.skip}
        onStop={player.stop}
        onCommit={player.commit}
        onUndo={player.undo}
        onReplay={player.replay}
      />

      <div className="shrink-0 px-4 pt-2 pb-4">
        {/* Configured in Settings since the beginning and consumed by nothing
            until now. Each one fires a real run. */}
        {bound && agent.quickPrompts?.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {agent.quickPrompts.map((q, i) => (
              <button
                key={`${q.label}-${i}`}
                type="button"
                disabled={player.busy}
                onClick={() => send(q.prompt)}
                title={q.prompt}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-hidden rounded-[12px] border border-border bg-card shadow-[0_4px_24px_0_rgba(37,99,235,0.10)]">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <input
              ref={inputRef}
              type="text"
              defaultValue=""
              disabled={!bound}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={bound ? `Ask ${agent.name} anything…` : "No model bound — nothing to ask"}
              aria-label={`Ask ${agent.name}`}
              className="flex-1 bg-transparent text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            />
            <button
              onClick={() => send()}
              disabled={!bound || player.busy}
              aria-label="Send message"
              className={`flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
                bound && !player.busy
                  ? "border-border bg-primary text-primary-foreground"
                  : "cursor-not-allowed border-border bg-card text-foreground"
              }`}
            >
              <Send size={14} />
            </button>
          </div>
          <div className="flex items-center gap-1 px-3 py-2">
            <button
              disabled
              title="Not in this prototype"
              className="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-xs text-muted-foreground opacity-60"
            >
              <Paperclip size={12} /> Attach
            </button>
            <div className="mx-1 h-4 w-px bg-border" />
            {/* The binding is real; the call is not. Both halves said at once,
                because either alone is misleading. */}
            <span className="truncate text-xs text-muted-foreground">
              {bound ? `${agent.runtime.model} · bound, not called` : "No model"}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
