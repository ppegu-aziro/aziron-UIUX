import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { FileText, Maximize2, Minimize2, Send, Sparkles, X } from "lucide-react";

import { useAgentsV2 } from "@/context/AgentsV2Context";

/**
 * Authoring assistant.
 *
 * Generation is not a separate screen you leave — it is a conversation beside
 * the editor. You ask for something, the files change in place, you edit them
 * by hand, you ask for the next thing. That loop is the whole point: a
 * one-shot generator produces a draft you then have to fix somewhere else,
 * which is where the old two-path create flow kept sending people.
 *
 * Every turn writes through the same store the editor reads, so what it
 * produces is immediately and equally editable. Nothing it makes is special.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BREAK = /^(from|with|and|or|that|then|using|based|so|but|plus|into|against|across)$/i;

const nameFrom = (intent) => {
  const words = intent.trim().replace(/[.!?,;:].*$/s, "").split(/\s+/).filter(Boolean);
  const cut = words.findIndex((w, i) => i >= 2 && BREAK.test(w));
  const kept = (cut > 0 ? words.slice(0, cut) : words).slice(0, 5);
  return (
    kept.map((w) => w.replace(/(^|-)(\w)/g, (_, s, c) => s + c.toUpperCase())).join(" ").trim() ||
    "New Agent"
  );
};

const body = (name, intent) =>
  [
    `# ${name}`,
    "",
    intent.trim().replace(/\.$/, "") + ".",
    "",
    "## How to answer",
    "",
    "- Read the reference files in this folder before answering.",
    "- Quote the section you relied on rather than paraphrasing it.",
    "- When something is not covered, say so instead of guessing.",
    "",
    "## When to ask first",
    "",
    "Ask a clarifying question when the request could reasonably mean two",
    "different things, rather than picking one and proceeding.",
    "",
  ].join("\n");

/**
 * Decide what a prompt asks for.
 *
 * Keyword matching, openly: this is a prototype standing in for a model, and
 * pretending otherwise would set the wrong expectation about what the demo
 * proves. What it does prove is the loop — prompt, files change, edit, repeat.
 */
function plan(prompt, agent) {
  const p = prompt.toLowerCase();
  const fresh = agent.files.length === 1 && agent.files[0].content.trim().length < 40;

  if (fresh) {
    const name = nameFrom(prompt);
    return {
      kind: "create",
      name,
      description: `${prompt.trim().replace(/\.$/, "")}. Cites the source it used, and says plainly when something is not covered.`,
      files: [{ path: "AGENT.md", content: body(name, prompt) }],
      say: `Drafted **${name}** with an AGENT.md. Ask for reference files, scripts or machine setup and I'll add them — or edit it directly, it's yours now.`,
    };
  }

  if (/\brefer|example|background|context\b/.test(p)) {
    return {
      kind: "add",
      files: [
        {
          path: "references/background.md",
          content: `# Background\n\n${prompt.trim()}\n\nKept out of the entrypoint so the instructions stay short.\n`,
        },
      ],
      say: "Added `references/background.md`. The entrypoint stays short; this is what it reads before answering.",
    };
  }

  if (/\bscript|command|shell|bash\b/.test(p)) {
    return {
      kind: "add",
      files: [
        {
          path: "scripts/run.sh",
          content: `#!/usr/bin/env bash\nset -euo pipefail\n\n# ${prompt.trim()}\necho "ok"\n`,
        },
      ],
      say: "Added `scripts/run.sh`. It ships with the agent and runs on the target machine, not here.",
    };
  }

  if (/\bprepar|setup|install|dependenc|precheck\b/.test(p)) {
    return {
      kind: "add",
      files: [
        {
          path: ".aziron/preparation.yaml",
          content:
            "schema: 1\n\npreparation:\n  precheck:\n    - id: cli\n      label: Required CLI installed\n      platforms:\n        all:\n          check:\n            kind: binary\n            argv: [\"cli\"]\n\n  strategies:\n    - id: install\n      requires: []\n      platforms:\n        all:\n          actions:\n            - kind: instructions\n              message: Install the required CLI, then re-run preparation.\n",
        },
      ],
      say: "Added `.aziron/preparation.yaml`. The last strategy declares no requirements, so preparation can never dead-end.",
    };
  }

  // Otherwise: revise the entrypoint, keeping what is there.
  const entry = agent.files.find((f) => f.path === "AGENT.md");
  const shorter = /\bshort|concise|brief|trim|tighten\b/.test(p);
  const next = shorter
    ? entry.content.split("\n").filter((l) => !l.startsWith("- ")).join("\n").replace(/\n{3,}/g, "\n\n")
    : `${entry.content.replace(/\s+$/, "")}\n\n## ${prompt.trim().replace(/\.$/, "")}\n\nApply this when it is relevant to the request.\n`;

  return {
    kind: "revise",
    files: [{ path: "AGENT.md", content: next }],
    say: shorter
      ? "Tightened AGENT.md. Check it still says what you need — I removed the bulleted guidance."
      : "Updated AGENT.md with that. Edit the wording directly if it is not quite right.",
  };
}

export default function AuthorPanel({ agent, onClose, isExpanded = false, onToggleExpand }) {
  const { patch, addFile, saveFiles } = useAgentsV2();
  const [messages, setMessages] = useState(() => [
    {
      role: "ai",
      text:
        agent?.files.length === 1 && agent.files[0].content.trim().length < 40
          ? "Tell me what this agent should do and I'll draft it. You can edit anything I write, and keep asking for changes."
          : "Ask for changes to this agent — new reference files, a script, machine setup, or a rewrite. Everything I write stays editable.",
      files: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  if (!agent) return null;

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    await sleep(900);

    const result = plan(q, agent);

    if (result.kind === "create") {
      patch(agent.id, { name: result.name, description: result.description });
      saveFiles(agent.id, Object.fromEntries(result.files.map((f) => [f.path, f.content])));
    } else if (result.kind === "add") {
      result.files.forEach((f) => addFile(agent.id, f.path, f.content));
    } else {
      saveFiles(agent.id, Object.fromEntries(result.files.map((f) => [f.path, f.content])));
    }

    setMessages((m) => [...m, { role: "ai", text: result.say, files: result.files.map((f) => f.path) }]);
    setBusy(false);
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
      <div className="flex h-16 flex-shrink-0 items-center gap-2 border-b border-border bg-card px-4">
        <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-[4px] border border-primary/30 bg-primary/10">
          <Sparkles size={16} className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">Author</p>
          <p className="truncate text-xs text-muted-foreground">Writes into this agent's files</p>
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

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <div className="flex-1" />

        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex w-full flex-shrink-0 justify-end">
              <div className="max-w-[80%] rounded-[12px] rounded-tr-[4px] border border-primary/30 bg-primary/10 px-4 py-3">
                <p className="text-sm leading-5 whitespace-pre-line text-foreground">{msg.text}</p>
              </div>
            </div>
          ) : (
            <div key={i} className="flex w-full flex-shrink-0 flex-col items-start">
              <div className="w-full rounded-[12px] rounded-tl-[4px] border border-border bg-card px-4 py-3">
                <p
                  className="text-sm leading-6 text-foreground"
                  dangerouslySetInnerHTML={{
                    __html: msg.text
                      .replace(/&/g, "&amp;")
                      .replace(/</g, "&lt;")
                      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
                      .replace(
                        /`([^`]+)`/g,
                        '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">$1</code>',
                      ),
                  }}
                />
                {msg.files?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {msg.files.map((f) => (
                      <span
                        key={f}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        <FileText size={10} />
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}

        {busy && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <div className="flex gap-1 rounded-[12px] rounded-tl-[4px] border border-border bg-card px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-muted"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-4 pt-2 pb-4">
        <div className="overflow-hidden rounded-[12px] border border-border bg-card shadow-[0_4px_24px_0_rgba(37,99,235,0.10)]">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
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
              placeholder="Describe what to build or change…"
              className="flex-1 bg-transparent text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={send}
              disabled={!input.trim() || busy}
              aria-label="Send"
              className={`flex size-8 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                input.trim() && !busy
                  ? "border-border bg-primary text-primary-foreground"
                  : "cursor-not-allowed border-border bg-card text-foreground"
              }`}
            >
              <Send size={14} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1 px-3 py-2">
            {["Add a reference file", "Add machine setup", "Make it shorter"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInput(s)}
                className="rounded-[6px] px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
