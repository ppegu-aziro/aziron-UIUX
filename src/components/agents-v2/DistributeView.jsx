import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, HardDrive, Package, Terminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TARGETS } from "@/data/agentsV2";
import { useAgentsV2 } from "@/context/AgentsV2Context";

/**
 * Distribution — the CLI half of the story.
 *
 * The stated workflow is: install an agent, then make it a skill or plugin for
 * whichever providers need it. That is exactly what the CLI already does; the
 * only thing changing is the noun on the install line.
 *
 * The screen's real job is to answer the question the whole rename provokes:
 * "if it is one agent everywhere, why does it look different in each tool?"
 * The answer is that each host has its own format, and Aziron compiles into it.
 * Saying that out loud is cheaper than letting people discover it.
 */

export default function DistributeView({ agentId, onBack }) {
  const { get, setTargets } = useAgentsV2();
  const agent = get(agentId);
  const [copied, setCopied] = useState(false);

  const selected = agent?.targets ?? [];
  const slug = agent?.slug ?? "my-agent";
  const command = `aziron agent install ${slug}`;

  // Persisted, not local: a target picked here is the same fact the release
  // rail and the catalog chip read, so they can never disagree.
  const toggle = (id) =>
    setTargets(agent.id, selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const copy = () => {
    navigator.clipboard?.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back">
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">
            Where {agent?.name ?? "this agent"} runs
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One agent, compiled into whatever each tool expects.
          </p>
        </div>
      </div>

      {/* The pipeline, stated once */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[
            { icon: Package, label: "Agent", note: "authored once" },
            { icon: Terminal, label: "Install", note: "aziron agent install" },
            { icon: HardDrive, label: "Projection", note: "the host's own format" },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
                <s.icon className="size-3.5 text-primary" aria-hidden />
                <span className="font-medium text-foreground">{s.label}</span>
                <span className="text-muted-foreground">{s.note}</span>
              </div>
              {i < arr.length - 1 && (
                <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* A release is what makes any of this real; say so rather than showing
          an install line that would fail. */}
      {!agent?.release && (
        <div className="rounded-lg border border-warning/35 bg-warning/10 px-3 py-2.5 text-xs leading-5 text-foreground">
          <strong>Not released yet.</strong> Targets can be chosen now, but nothing is installable until
          this agent has a release — that is what pins the files to a version.
        </div>
      )}

      {/* Targets */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground">Targets</h3>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          Each target receives the same instructions in its own format. Nothing is rewritten by hand.
        </p>

        <div className="space-y-1.5">
          {TARGETS.map((t) => {
            const on = selected.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                aria-pressed={on}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  on ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/25",
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
                  <span className="block truncate text-sm font-medium text-foreground">{t.name}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {t.path}
                    {slug}/
                  </span>
                </span>

                <Badge variant={on ? "default" : "outline"} className="shrink-0">
                  {t.format}
                </Badge>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
          Claude Code, Codex and Copilot each call their format a <strong>skill</strong>; Cursor calls it
          a <strong>rule</strong>. Those names belong to those tools — inside Aziron it stays one agent.
        </p>
      </div>

      {/* Install */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground">Install</h3>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          Installs once, then deploys to whichever targets are present on the machine.
        </p>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <Terminal className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{command}</code>
          <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label="Copy command">
            {copied ? (
              <Check className="size-3.5 text-success" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
          </Button>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
          <pre className="overflow-x-auto font-mono text-[11px] leading-5 text-muted-foreground">
{agent?.release
  ? `✓ Installed ${slug} v${agent.release.version}
${
  selected.length
    ? selected
        .map((id) => {
          const t = TARGETS.find((x) => x.id === id);
          return `✓ Deployed to ${t.name} as a ${t.format}`;
        })
        .join("\n")
    : "○ No targets selected — installed but not deployed"
}

Preparation precheck:
  ✓ Ready`
  : `✗ ${slug} has no release
  Release it first, then this command installs that version.`}
          </pre>
        </div>
      </div>
    </div>
  );
}
