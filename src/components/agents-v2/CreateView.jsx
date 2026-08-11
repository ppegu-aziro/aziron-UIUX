import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Cpu, Database, FileText, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Creating an agent.
 *
 * The old flow was a 4-step wizard that demanded a provider, a model, a
 * category and a tool policy before the user had written a sentence. The old
 * skill flow demanded knowledge of a folder contract. Both asked for the
 * answers a user has last.
 *
 * Here there is one question, and everything else is offered afterwards
 * against something that already exists. The single most common real job —
 * "answer from OUR document" — is the first offer rather than a setting buried
 * on a later screen, because that is the job, not a refinement of it.
 */

const SOURCES = [
  { id: "handbook", name: "Employee Handbook 2026", meta: "PDF · 84 pages" },
  { id: "runbooks", name: "Runbooks", meta: "Hub · 213 docs" },
  { id: "wiki", name: "Engineering Wiki", meta: "Hub · 1,204 docs" },
];

const EXAMPLES = [
  "Answer HR policy questions from our handbook",
  "Triage static-analysis findings and file the real ones",
  "Provision EKS clusters with eksctl",
];

export default function CreateView({ onBack, onCreated }) {
  const [intent, setIntent] = useState("");
  const [stage, setStage] = useState("ask");
  const [sources, setSources] = useState([]);

  const ready = intent.trim().length > 8;

  const toggleSource = (id) =>
    setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to agents">
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">New agent</h2>
      </div>

      {stage === "ask" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <label htmlFor="intent" className="block text-sm font-medium text-foreground">
            What should this agent do?
          </label>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">
            Plain English. Everything else is optional and can be added later.
          </p>

          <Textarea
            id="intent"
            autoFocus
            rows={3}
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="Answer employee questions from our handbook, and say when it doesn't cover something."
            className="resize-none text-sm"
          />

          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setIntent(e)}
                className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {e}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              A draft agent is created immediately. Nothing is published.
            </p>
            <Button type="button" size="sm" disabled={!ready} onClick={() => setStage("ground")}>
              Create
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {stage === "ground" && (
        <>
          {/*
            The one offer worth interrupting for. Every reviewed design buried
            "use our document" in a detail screen, and it is the actual job in
            the most common request the product receives.
          */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-start gap-2.5">
              <Database className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-foreground">
                  Should it answer from something of yours?
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Attach a document or hub and the agent quotes it instead of guessing.
                </p>

                <div className="mt-3 space-y-1.5">
                  {SOURCES.map((s) => {
                    const on = sources.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSource(s.id)}
                        aria-pressed={on}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                          on
                            ? "border-primary/40 bg-card"
                            : "border-border bg-card/60 hover:border-primary/25",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                          )}
                        >
                          {on && <Check className="size-2.5" aria-hidden />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-foreground">
                            {s.name}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">{s.meta}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button type="button" size="sm" onClick={() => setStage("done")}>
                    Continue
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setStage("done")}>
                    Not now
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {stage === "done" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-success text-success-foreground">
              <Check className="size-3" aria-hidden />
            </span>
            <h3 className="text-sm font-medium text-foreground">Agent created</h3>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <FileText className="size-3" aria-hidden />
              <span className="font-mono">AGENT.md</span>
              <Badge variant="outline" className="ml-auto">
                draft
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-foreground">{intent}</p>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">It already runs here. When you want more:</p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {[
              { icon: Cpu, label: "Change the model", note: "Defaults to Auto" },
              { icon: Plus, label: "Grant tools", note: "None granted yet" },
              { icon: FileText, label: "Add reference files", note: "Split long instructions" },
              { icon: Sparkles, label: "Release it", note: "Install into Claude Code" },
            ].map((o) => (
              <div
                key={o.label}
                className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2"
              >
                <o.icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-foreground">{o.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{o.note}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <Button type="button" size="sm" onClick={onCreated}>
              Open agent
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onBack}>
              Back to agents
            </Button>
          </div>
        </div>
      )}

      {/* Progress, shown only once the flow has begun. */}
      {stage !== "ask" && (
        <div className="flex items-center justify-center gap-1.5">
          {["ask", "ground", "done"].map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-1 rounded-full transition-all",
                ["ask", "ground", "done"].indexOf(stage) >= i ? "w-6 bg-primary" : "w-3 bg-border",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
