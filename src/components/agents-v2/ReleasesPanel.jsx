import { Boxes, Check, Copy, Download, Rocket, Terminal } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { TARGET_BY_ID } from "@/data/agentsV2";

/**
 * Release history.
 *
 * Versions existed in the data from the day releasing worked, and were visible
 * only as three truncated lines in a rail. They deserve a home: a release is
 * the moment an agent's files stop being yours to change quietly, so the list
 * of those moments is the record of what other people are actually running.
 *
 * Opened from the "Runs anywhere" half, mirroring Settings opening from "Runs
 * here" — each half owns its own configuration surface.
 */

function InstallLine({ slug, version, latest }) {
  const [copied, setCopied] = useState(false);
  // Only the latest install line is bare; older ones must pin, or the command
  // silently installs something other than the version it sits under.
  const command = latest
    ? `aziron agent install ${slug}`
    : `aziron agent install ${slug}@${version}`;

  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
      <Terminal className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{command}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Copy install command for v${version}`}
        onClick={() => {
          navigator.clipboard?.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? (
          <Check className="size-3 text-success" aria-hidden />
        ) : (
          <Copy className="size-3" aria-hidden />
        )}
      </Button>
    </div>
  );
}

export default function ReleasesPanel({ agent, onRelease }) {
  const history = agent.releaseNotes ?? [];
  const current = agent.release?.version;

  if (!agent.release) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
        <Boxes className="mx-auto size-5 text-muted-foreground" aria-hidden />
        <p className="mt-2 text-sm font-medium text-foreground">No releases yet</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
          A release pins this folder at a version so it can be installed into Claude Code, Codex,
          Copilot or Cursor. Until then it exists only in Aziron.
        </p>
        <Button type="button" size="sm" className="mt-3" onClick={onRelease}>
          <Rocket className="size-3.5" aria-hidden />
          Release this agent
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">
            v{current}
          </Badge>
          <span className="text-xs text-muted-foreground">current · {agent.release.published}</span>
        </div>
        <Button type="button" size="sm" onClick={onRelease}>
          <Rocket className="size-3.5" aria-hidden />
          New release
        </Button>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-foreground">Installs into</p>
        <div className="flex flex-wrap gap-1.5">
          {agent.targets.map((t) => {
            const target = TARGET_BY_ID[t];
            if (!target) return null;
            return (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px]"
              >
                <span className="text-foreground">{target.name}</span>
                <Badge variant="secondary">{target.format}</Badge>
              </span>
            );
          })}
          {agent.targets.length === 0 && (
            <span className="text-[11px] text-muted-foreground">
              No targets selected — released but not installable anywhere.
            </span>
          )}
        </div>
      </div>

      <Separator />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">History</p>
          {agent.installs > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
              <Download className="size-3" aria-hidden />
              {agent.installs.toLocaleString()} installs
            </span>
          )}
        </div>

        {history.length === 0 ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            This agent was released before history was kept, so only v{current} is on record.
          </p>
        ) : (
          <ol className="relative space-y-3 border-l border-border pl-4">
            {history.map((r) => {
              const latest = r.version === current;
              return (
                <li key={r.version} className="relative">
                  <span
                    className={cn(
                      "absolute top-1.5 -left-[21px] size-2 rounded-full ring-2 ring-background",
                      latest ? "bg-primary" : "bg-border",
                    )}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium text-foreground">v{r.version}</span>
                    {latest && <Badge variant="outline">current</Badge>}
                    <span className="text-[11px] text-muted-foreground">{r.at}</span>
                  </div>
                  {r.notes ? (
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{r.notes}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground/70 italic">No notes</p>
                  )}
                  <InstallLine slug={agent.slug} version={r.version} latest={latest} />
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="text-[11px] leading-4 text-muted-foreground">
        Released versions are immutable. Installed copies stay on the version they were installed at
        until someone updates them.
      </p>
    </div>
  );
}
