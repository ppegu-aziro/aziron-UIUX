import { Boxes, Cpu, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import { TOOL_POSTURE } from "@/data/agentsV2";

/**
 * The two halves, as one compact strip.
 *
 * They used to be labelled "Runs here" and "Runs anywhere". Both asked the
 * reader to infer a vantage point — here relative to what? — and "anywhere"
 * overclaimed something that is in fact four named targets. Neither told you
 * which settings lived behind which.
 *
 * So they are named for their contents: what the agent thinks with, and what
 * gets shipped.
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
      title={`${label} — ${summary}`}
      aria-label={`${label}: ${summary}`}
      className={cn(
        "group flex h-8 min-w-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] transition-colors",
        on
          ? "border-border bg-card text-foreground hover:border-primary/40"
          : "border-dashed border-border bg-muted/20 text-muted-foreground hover:border-primary/30",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", on ? "text-primary" : "text-muted-foreground")} aria-hidden />
      {/*
        No uppercase label above the value any more. Inline, the summary is
        already self-describing — "Claude Sonnet 4.5 · 3 tools" is obviously
        the model, "Not released" obviously the release — and the label rows
        were doubling the height of the whole header to say it twice.
      */}
      <span className={cn("truncate", !on && "italic")}>{summary}</span>
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
          : // Guarded: the posture is user-editable text now, not just a button.
            (TOOL_POSTURE[agent.tools] ?? TOOL_POSTURE.none).label.toLowerCase(),
        agent.knowledge.length ? `${agent.knowledge.length} sources` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "No model yet";

  const anywhereSummary = anywhere
    ? `v${agent.release.version} · ${agent.targets.length} target${agent.targets.length === 1 ? "" : "s"}`
    : "Not released";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Half
        icon={Cpu}
        label="Model & tools"
        on={here}
        summary={hereSummary}
        onClick={here ? onSettings : onSetup}
      />
      <Half
        icon={Boxes}
        label="Release"
        on={anywhere}
        summary={anywhereSummary}
        onClick={onRelease}
      />
      {/*
        One extra chip, and only for the state an admin would want to catch at
        a glance. RAG and the rest live in the settings sheet; a header is not
        a place to list configuration.
      */}
      {here && agent.tools === "open" && (
        <span
          className="flex h-8 items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2.5 text-[11px] text-foreground"
          title="This agent can use every tool available to the caller"
        >
          <Wrench className="size-3 text-warning" aria-hidden />
          Open tools
        </span>
      )}
    </div>
  );
}
