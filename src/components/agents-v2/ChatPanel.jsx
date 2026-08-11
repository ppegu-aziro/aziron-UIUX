import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Bot,
  Copy,
  Maximize2,
  Minimize2,
  Paperclip,
  RotateCcw,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

import { STATUS } from "@/data/agentsV2";

/**
 * Agent chat — a direct port of v1's AgentConversationPanel.
 *
 * Deliberately unchanged from the live product: same inline side panel rather
 * than an overlay, same 64px header, same greeting on open, same bubble
 * geometry, same per-message actions, same bouncing-dot loader, same composer
 * with its control bar. Chat is the one surface in v2 that a returning user
 * should not have to re-learn.
 *
 * Two things differ, and only because v2's data model has more to say:
 *   - the control bar names the model actually bound to this agent rather than
 *     a hardcoded string;
 *   - the greeting says so when no model is bound, since a v2 agent can exist
 *     without a runtime and would otherwise appear to be ignoring the user.
 */

const STATUS_TEXT = {
  active: "var(--success)",
  idle: "var(--muted-foreground)",
  error: "var(--destructive)",
  disabled: "var(--muted-foreground)",
};

export default function ChatPanel({ agent, onClose, isExpanded = false, onToggleExpand }) {
  const statusCfg = STATUS[agent?.status] ?? STATUS.idle;

  // v1 seeds the greeting from an effect keyed on agent.id. The page mounts
  // this panel with key={agent.id}, so it already remounts per agent — which
  // makes initial state the same thing without the cascading render.
  const [messages, setMessages] = useState(() => {
    if (!agent) return [];
    const greeting = agent.runtime
      ? `Hi! I'm **${agent.name}**.\n${agent.description}\n\nHow can I help you today?`
      : `Hi! I'm **${agent.name}**.\n${agent.description}\n\nNo model is bound to me yet, so I can't answer here — I still install and run on my targets. Bind a model from the agent's Settings and we can talk.`;
    return [{ role: "ai", text: greeting }];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Focus and scroll are DOM synchronisation, which is what effects are for.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  if (!agent) return null;

  const send = () => {
    const q = input.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "ai",
          text: agent.knowledge.length
            ? `Looking at ${agent.knowledge.join(" and ")}: this is a demo — in production I'd retrieve the relevant section and quote it back with a citation.`
            : `Thanks for your message! As **${agent.name}** I'm processing your request. This is a demo — in production I'd connect to the live agent backend.`,
        },
      ]);
      setLoading(false);
    }, 900);
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
      {/* Header */}
      <div className="flex h-16 flex-shrink-0 items-center gap-2 border-b border-border bg-card px-4">
        <div className="bg-muted border border-border rounded-[4px] size-9 flex items-center justify-center overflow-hidden flex-shrink-0">
          <Bot size={18} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{agent.name}</p>
          <div className="flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: statusCfg.dot }}
            />
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
            className="flex size-7 items-center justify-center rounded-[6px] text-muted-foreground hover:bg-muted transition-colors"
          >
            {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        )}
        <button
          aria-label="Close"
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-[6px] text-muted-foreground hover:bg-muted transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 px-4 py-4">
        <div className="flex-1" />

        {messages.map((msg, i) => {
          if (msg.role === "user")
            return (
              <div key={i} className="flex justify-end w-full flex-shrink-0">
                <div className="max-w-[80%] rounded-[12px] rounded-tr-[4px] border border-primary/30 bg-primary/10 px-4 py-3">
                  <p className="text-sm leading-5 text-foreground whitespace-pre-line">{msg.text}</p>
                </div>
              </div>
            );
          return (
            <div key={i} className="flex flex-col items-start w-full flex-shrink-0">
              <div className="w-full rounded-[12px] rounded-tl-[4px] bg-card border border-border px-4 py-3">
                <p className="text-sm leading-6 text-foreground whitespace-pre-line">
                  {msg.text.replace(/\*\*(.*?)\*\*/g, "$1")}
                </p>
              </div>
              <div className="flex items-center mt-1">
                {[
                  { icon: <Copy size={14} />, label: "Copy" },
                  { icon: <ThumbsUp size={14} />, label: "Good response" },
                  { icon: <ThumbsDown size={14} />, label: "Bad response" },
                  { icon: <RotateCcw size={14} />, label: "Regenerate" },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    aria-label={btn.label}
                    title={btn.label}
                    className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-muted-foreground transition-colors"
                  >
                    {btn.icon}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex gap-1 px-4 py-3 rounded-[12px] rounded-tl-[4px] bg-card border border-border">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 rounded-full bg-muted animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Prompt box */}
      <div className="px-4 pb-4 pt-2 flex-shrink-0">
        <div className="rounded-[12px] bg-card shadow-[0_4px_24px_0_rgba(37,99,235,0.10)] border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Ask ${agent.name} anything…`}
              className="flex-1 bg-transparent text-sm leading-5 text-foreground placeholder:text-muted-foreground outline-none"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              aria-label="Send message"
              className={`flex items-center justify-center size-8 rounded-full border flex-shrink-0 transition-colors ${
                input.trim() && !loading
                  ? "bg-primary border-border text-primary-foreground hover:bg-primary"
                  : "bg-card border-border text-foreground cursor-not-allowed"
              }`}
            >
              <Send size={14} />
            </button>
          </div>
          <div className="flex items-center gap-1 px-3 py-2">
            <button className="flex items-center gap-1.5 h-7 rounded-[6px] px-2 text-xs text-muted-foreground hover:bg-muted transition-colors">
              <Paperclip size={12} /> Attach
            </button>
            <div className="h-4 w-px bg-border mx-1" />
            <span className="text-xs text-muted-foreground">
              {agent.runtime?.model ?? "No model"}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
