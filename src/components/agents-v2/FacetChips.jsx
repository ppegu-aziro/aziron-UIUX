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
 * Named for their contents rather than for a vantage point: "runs here" and
 * "runs anywhere" made the reader work out what "here" was before either
 * label meant anything.
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

/** What it thinks with. Empty until a model is picked. */
export function ModelChip({ agent, className }) {
  const on = Boolean(agent.runtime);
  return (
    <Chip
      icon={on ? Cpu : Minus}
      tone={on ? "on" : "off"}
      className={className}
      title={
        on
          ? `Set up with ${agent.runtime.provider} ${agent.runtime.model}`
          : "No model picked yet, so it cannot be tried inside Aziron"
      }
    >
      {on ? agent.runtime.model : "No model"}
    </Chip>
  );
}

/** What has shipped. Empty until it is released. */
export function ReleaseChip({ agent, className }) {
  const on = Boolean(agent.release);
  const n = agent.targets.length;
  return (
    <Chip
      icon={on ? Boxes : Minus}
      tone={on ? "on" : "off"}
      className={className}
      title={
        on
          ? `Released ${agent.release.version} — installs into ${n} target${n === 1 ? "" : "s"}`
          : "Never released, so it cannot be installed anywhere yet"
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
  // Falls back rather than indexing blind: with the config editable as JSON,
  // `"tools": "Open"` is one keystroke away, and an unguarded lookup here takes
  // down the catalog card, the settings panel and the agent header at once.
  // Unrecognised reads as "no tools", which is the safe direction to guess.
  const posture = TOOL_POSTURE[agent.tools] ?? TOOL_POSTURE.none;
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
      <ModelChip agent={agent} />
      <ReleaseChip agent={agent} />
      <ToolsChip agent={agent} />
    </div>
  );
}
