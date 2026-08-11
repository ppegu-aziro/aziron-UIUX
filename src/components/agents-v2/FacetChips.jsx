import { AlertTriangle, Boxes, Check, Cpu, Minus, ShieldCheck, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import { TOOL_POSTURE } from "@/data/agentsV2";

/**
 * The three chips carried by every agent, everywhere it appears.
 *
 * This is the load-bearing device of the whole design. "Agent" and "skill"
 * stop being types and become two capabilities an agent either has or lacks —
 * so the difference a user used to memorise is now just read off the card.
 *
 * Present state is stated in colour; absent state stays grey and says what is
 * missing rather than disappearing. A chip that vanishes when empty would hide
 * exactly the gap the migration is meant to make visible.
 */

const TONE = {
  on: "border-primary/25 bg-primary/8 text-primary",
  off: "border-border bg-muted/40 text-muted-foreground",
  warning: "border-warning/30 bg-warning/10 text-warning",
  success: "border-success/25 bg-success/10 text-success",
  muted: "border-border bg-muted/40 text-muted-foreground",
};

export function Chip({ icon: Icon, children, tone = "off", title, className }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border px-2 text-xs font-medium",
        TONE[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Half one: does it run inside Aziron? */
export function RunsHereChip({ agent, className }) {
  const on = Boolean(agent.runtime);
  return (
    <Chip
      icon={on ? Cpu : Minus}
      tone={on ? "on" : "off"}
      className={className}
      title={
        on
          ? `Runs in Aziron on ${agent.runtime.provider} ${agent.runtime.model}`
          : "No model bound — cannot be chatted with inside Aziron yet"
      }
    >
      {on ? agent.runtime.model : "No model"}
    </Chip>
  );
}

/** Half two: has it been released so it can be installed elsewhere? */
export function RunsAnywhereChip({ agent, className }) {
  const on = Boolean(agent.release);
  const n = agent.targets.length;
  return (
    <Chip
      icon={on ? Boxes : Minus}
      tone={on ? "on" : "off"}
      className={className}
      title={
        on
          ? `Released ${agent.release.version} — installable into ${n} target${n === 1 ? "" : "s"}`
          : "Never released — exists only inside Aziron"
      }
    >
      {on ? `v${agent.release.version} · ${n} target${n === 1 ? "" : "s"}` : "Not released"}
    </Chip>
  );
}

/**
 * Tool posture.
 *
 * Deliberately always shown, and amber when open. An "open" agent can reach
 * every tool the caller can, and today that state is invisible in the product —
 * an admin has no way to ask "which of these can touch everything?". Making it
 * a chip is the cheapest possible answer, and making it filterable is the rest.
 */
export function ToolsChip({ agent, className }) {
  const posture = TOOL_POSTURE[agent.tools];
  const Icon = agent.tools === "open" ? AlertTriangle : agent.tools === "scoped" ? ShieldCheck : Wrench;
  return (
    <Chip icon={Icon} tone={posture.tone} className={className} title={posture.blurb}>
      {agent.tools === "scoped" ? `Scoped · ${agent.toolCount}` : posture.label}
    </Chip>
  );
}

export function FacetChips({ agent, className }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <RunsHereChip agent={agent} />
      <RunsAnywhereChip agent={agent} />
      <ToolsChip agent={agent} />
    </div>
  );
}

/**
 * The same two halves rendered as a checklist, for the detail screen.
 * Absent halves get the action that would fill them, so "incomplete" always
 * reads as an invitation rather than an error.
 */
export function HalvesSummary({ agent, onFill }) {
  const rows = [
    {
      id: "here",
      label: "Runs here",
      on: Boolean(agent.runtime),
      onText: agent.runtime ? `${agent.runtime.provider} · ${agent.runtime.model}` : "",
      offText: "Pick a model to chat with it inside Aziron",
      cta: "Set up runtime",
    },
    {
      id: "anywhere",
      label: "Runs anywhere",
      on: Boolean(agent.release),
      onText: agent.release ? `v${agent.release.version} · ${agent.targets.length} targets` : "",
      offText: "Release it to install into Claude Code, Codex or Cursor",
      cta: "Release",
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map((r) => (
        <div
          key={r.id}
          className={cn(
            "rounded-lg border p-3",
            r.on ? "border-primary/25 bg-primary/5" : "border-dashed border-border bg-muted/30",
          )}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded-full",
                r.on ? "bg-primary text-primary-foreground" : "bg-muted-foreground/25 text-muted-foreground",
              )}
            >
              {r.on ? <Check className="size-2.5" aria-hidden /> : <Minus className="size-2.5" aria-hidden />}
            </span>
            <span className="text-sm font-medium text-foreground">{r.label}</span>
          </div>
          <p className="mt-1.5 pl-6 text-xs text-muted-foreground">{r.on ? r.onText : r.offText}</p>
          {!r.on && (
            <button
              type="button"
              onClick={() => onFill?.(r.id)}
              className="mt-2 ml-6 text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              {r.cta}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
