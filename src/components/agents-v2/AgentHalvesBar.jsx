import { Boxes, ChevronRight, Cpu, Database, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import { TOOL_POSTURE } from "@/data/agentsV2";

/**
 * The two halves, as one compact strip.
 *
 * They were two bordered cards with their own headings and badge rows, which
 * cost roughly two hundred pixels of chrome above the file — on an authoring
 * screen, where the file is the thing. Worse, a card that large reads as a
 * section you are meant to work in, and neither is: they are summaries you
 * click through to.
 *
 * So: one line, two summaries, each a button to the sheet that owns it. Unset
 * halves stay visible and dashed, because the gap is still the invitation.
 */

function Half({ icon: Icon, label, on, summary, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
        on
          ? "border-border bg-card hover:border-primary/40"
          : "border-dashed border-border bg-muted/20 hover:border-primary/30",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", on ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
          {label}
        </span>
        <span
          className={cn(
            "block truncate text-[11px]",
            on ? "text-foreground" : "text-muted-foreground italic",
          )}
        >
          {summary}
        </span>
      </span>
      <ChevronRight
        className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </button>
  );
}

export default function AgentHalvesBar({ agent, onSetup, onRelease, onSettings }) {
  const here = Boolean(agent.runtime);
  const anywhere = Boolean(agent.release);

  const hereSummary = here
    ? [
        agent.runtime.model,
        agent.tools === "scoped"
          ? `${agent.granted.length} tools`
          : TOOL_POSTURE[agent.tools].label.toLowerCase(),
        agent.knowledge.length ? `${agent.knowledge.length} sources` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "No model — set one up to try it";

  const anywhereSummary = anywhere
    ? `v${agent.release.version} · ${agent.targets.length} target${agent.targets.length === 1 ? "" : "s"}`
    : "Not released";

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <Half
        icon={Cpu}
        label="Runs here"
        on={here}
        summary={hereSummary}
        onClick={here ? onSettings : onSetup}
      />
      <Half
        icon={Boxes}
        label="Runs anywhere"
        on={anywhere}
        summary={anywhereSummary}
        onClick={onRelease}
      />
      {/* Icons only, and only when they carry a number worth glancing at. */}
      {here && agent.tools === "open" && (
        <span
          className="flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2.5 text-[11px] text-foreground"
          title="This agent can use every tool available to the caller"
        >
          <Wrench className="size-3 text-warning" aria-hidden />
          Open tools
        </span>
      )}
      {here && agent.ragMode && (
        <span
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] text-muted-foreground"
          title="Retrieves before answering"
        >
          <Database className="size-3" aria-hidden />
          RAG
        </span>
      )}
    </div>
  );
}
