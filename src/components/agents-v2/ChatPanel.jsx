import { useEffect, useRef, useState } from "react";
import { Cpu, Database, Send, Wrench, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Mock chat with an agent.
 *
 * Its job in the prototype is to make the "runs here" half concrete. The
 * replies are canned, but they are composed from the agent's ACTUAL config —
 * the knowledge attached, the tools granted, the model bound — so changing the
 * configuration visibly changes the conversation. An agent with no knowledge
 * says so; one with tools says which it used.
 *
 * That link is the point. A chat that answered identically regardless of
 * configuration would quietly teach reviewers that the configuration is
 * decorative.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Compose a reply that depends on how this agent is actually set up. */
function replyFor(agent, prompt) {
  const lines = [];

  if (agent.knowledge.length > 0) {
    lines.push(
      `Looking at ${agent.knowledge.join(" and ")}, here is what applies to “${prompt.slice(0, 60)}”:`,
      "",
      "The relevant section says requests should go through your manager first, and that anything over two weeks needs a second approval.",
      "",
      `— cited from ${agent.knowledge[0]}`,
    );
  } else {
    lines.push(
      `I can answer from what I know generally, but nothing of yours is attached to me — so treat this as a starting point rather than your policy.`,
      "",
      "Attach a source and I will quote it instead.",
    );
  }

  if (agent.tools === "scoped" && agent.granted.length > 0) {
    lines.push("", `_Used ${agent.granted.slice(0, 2).join(", ")}._`);
  } else if (agent.tools === "open") {
    lines.push("", "_No tool needed for this one._");
  }

  return lines.join("\n");
}

export default function ChatPanel({ agent, onClose, onSetupRuntime }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  if (!agent) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);

    // Streamed a word at a time so the panel reads like the real thing.
    await wait(420);
    const full = replyFor(agent, text);
    const words = full.split(" ");
    setMessages((m) => [...m, { role: "agent", text: "" }]);
    for (let i = 0; i < words.length; i += 3) {
      await wait(28);
      const chunk = words.slice(0, i + 3).join(" ");
      setMessages((m) => [...m.slice(0, -1), { role: "agent", text: chunk }]);
    }
    setBusy(false);
  };

  const starters = agent.knowledge.length
    ? [`What does ${agent.knowledge[0]} say about time off?`, "Summarise the approval process"]
    : ["What can you help with?", "What do you need from me to be useful?"];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label={`Chat with ${agent.name}`}>
      <button
        type="button"
        aria-label="Close chat"
        onClick={onClose}
        className="flex-1 bg-overlay backdrop-blur-[1px]"
      />

      <aside className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">{agent.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {agent.runtime && (
                <span className="inline-flex items-center gap-1">
                  <Cpu className="size-3" aria-hidden />
                  {agent.runtime.model}
                </span>
              )}
              {agent.knowledge.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Database className="size-3" aria-hidden />
                  {agent.knowledge.length}
                </span>
              )}
              {agent.tools !== "none" && (
                <span className="inline-flex items-center gap-1">
                  <Wrench className="size-3" aria-hidden />
                  {agent.tools === "open" ? "all" : agent.granted.length}
                </span>
              )}
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X className="size-4" aria-hidden />
          </Button>
        </header>

        {/* The half that has to exist before a chat can happen at all. */}
        {!agent.runtime ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <Cpu className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">No model bound</p>
            <p className="text-xs leading-5 text-muted-foreground">
              This agent installs and runs on its targets, but there is nothing to chat with here until
              a model is bound.
            </p>
            <Button type="button" size="sm" onClick={onSetupRuntime}>
              Set up a runtime
            </Button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Try:</p>
                  {starters.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setInput(s)}
                      className="block w-full rounded-lg border border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-5 whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-muted/40 text-foreground",
                    )}
                  >
                    {m.text}
                    {m.role === "agent" && busy && i === messages.length - 1 && (
                      <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-foreground align-middle" />
                    )}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={`Ask ${agent.name}…`}
                  className="max-h-28 min-h-9 resize-none text-sm"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  onClick={send}
                  disabled={!input.trim() || busy}
                  aria-label="Send"
                >
                  <Send className="size-3.5" aria-hidden />
                </Button>
              </div>
              {agent.knowledge.length === 0 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Nothing attached — answers come from the model alone.
                </p>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
