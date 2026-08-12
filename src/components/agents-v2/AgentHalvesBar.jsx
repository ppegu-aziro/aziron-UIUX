import { Boxes, Cpu, Database, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TARGET_BY_ID, TOOL_POSTURE } from "@/data/agentsV2";

/**
 * The two halves, as a bar under the header.
 *
 * They were a right rail competing with the editor for width, and the settings
 * that fill them were a third tab presented as a peer of "write the thing".
 * Neither placement matched what they are: the answer to "where does this run",
 * which is a property of the agent rather than a place you go.
 *
 * Unset halves stay visible and dashed. The gap is the invitation.
 */

function Half({ icon: Icon, title, on, children, action, actionLabel }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-xl border p-3",
        on ? "border-border bg-card" : "border-dashed border-border bg-muted/20",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-foreground uppercase">
          <Icon className="size-3.5 text-muted-foreground" aria-hidden />
          {title}
        </h3>
        <Button type="button" variant="outline" size="xs" onClick={action}>
          {actionLabel}
        </Button>
      </div>
      <div className="mt-2 min-w-0">{children}</div>
    </div>
  );
}

export default function AgentHalvesBar({ agent, onSetup, onRelease, onSettings }) {
  const posture = TOOL_POSTURE[agent.tools];
  const here = Boolean(agent.runtime);
  const anywhere = Boolean(agent.release);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Half
        icon={Cpu}
        title="Runs here"
        on={here}
        action={here ? onSettings : onSetup}
        actionLabel={here ? "Settings" : "Set up"}
      >
        {here ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{agent.runtime.model}</Badge>
            <Badge variant="outline" className="gap-1">
              <Wrench className="size-2.5" aria-hidden />
              {agent.tools === "scoped" ? `${agent.granted.length} tools` : posture.label}
            </Badge>
            {agent.knowledge.length > 0 && (
              <Badge variant="outline" className="gap-1">
                <Database className="size-2.5" aria-hidden />
                {agent.knowledge.length}
              </Badge>
            )}
          </div>
        ) : (
          <p className="text-[11px] leading-4 text-muted-foreground">
            No model, no tools, no knowledge. Set one up to chat with it here.
          </p>
        )}
      </Half>

      <Half
        icon={Boxes}
        title="Runs anywhere"
        on={anywhere}
        action={onRelease}
        actionLabel={anywhere ? "New release" : "Release"}
      >
        {anywhere ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="font-mono">
              v{agent.release.version}
            </Badge>
            {agent.targets.map((t) => (
              <Badge key={t} variant="secondary">
                {TARGET_BY_ID[t]?.name ?? t}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {/* The real install path, filling in live as the name is typed —
                the first lesson that a name becomes a directory. */}
            ~/.claude/skills/{agent.slug || "—"}/
          </p>
        )}
      </Half>
    </div>
  );
}
