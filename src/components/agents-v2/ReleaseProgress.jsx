import { AlertTriangle, Check, FileCode, Info, Minus, Package, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TARGET_BY_ID } from "@/data/agentsV2";
import { manifestChars, manifestOf } from "./utils/releaseScript";

/**
 * A release, while it happens.
 *
 * The disclosure is pinned above the first tick rather than added at the end.
 * A staged publish is the most convincing thing in this prototype, and a
 * caption that arrives after four green ticks has already let the audience
 * believe something untrue for four seconds.
 *
 * Every row shows the evidence its check actually read, because the difference
 * between a check and a delay with a label is invisible otherwise — and once
 * one row is theatre, none of them can be trusted.
 */

const GRADE = {
  pass: { icon: Check, cls: "text-success", ring: "border-success/30 bg-success/5" },
  warn: { icon: AlertTriangle, cls: "text-warning", ring: "border-warning/30 bg-warning/5" },
  fail: { icon: AlertTriangle, cls: "text-destructive", ring: "border-destructive/35 bg-destructive/5" },
  // Grey, and its own grade. A check that passes because it found nothing to
  // look at is a tick that means nothing.
  skip: { icon: Minus, cls: "text-muted-foreground/60", ring: "border-border bg-muted/20" },
};

function CheckRow({ check, onOpen }) {
  const g = GRADE[check.grade] ?? GRADE.skip;
  const Icon = g.icon;
  return (
    <li className={cn("flex items-start gap-2 rounded-md border px-2.5 py-1.5", g.ring)}>
      <Icon className={cn("mt-0.5 size-3 shrink-0", g.cls)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-4 text-foreground">{check.label}</p>
        {check.note && <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{check.note}</p>}
      </div>
      {check.at && onOpen && (
        <button
          type="button"
          onClick={() => onOpen(check.at)}
          className="shrink-0 text-[10px] text-primary hover:underline"
        >
          Open
        </button>
      )}
    </li>
  );
}

export default function ReleaseProgress({ agent, view, busy, plan, onOpen, onClose, onBack }) {
  const files = agent ? [...(agent.files ?? [])] : [];
  const manifest = manifestOf(files);

  return (
    <div className="space-y-3">
      {/* Pinned from tick zero. */}
      <p className="font-mono text-[10px] text-muted-foreground/80">
        simulated release · {view.checks.length || "…"} checks read from this workspace · nothing leaves this browser
      </p>

      {view.think && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground italic">
          <span className="flex gap-0.5" aria-hidden>
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="size-1 animate-bounce rounded-full bg-muted-foreground/50 motion-reduce:animate-none"
                style={{ animationDelay: `${d * 150}ms` }}
              />
            ))}
          </span>
          {view.think}
        </p>
      )}

      {view.checks.length > 0 && (
        <ul className="space-y-1" aria-live="polite" aria-busy={busy}>
          {view.checks.map((c, i) => (
            <CheckRow key={`${c.id}-${i}`} check={c} onOpen={onOpen} />
          ))}
        </ul>
      )}

      {view.halted && (
        <div className="rounded-md border border-destructive/35 bg-destructive/5 px-3 py-2">
          <p className="text-[11px] leading-5 text-foreground">{view.halted}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="xs" variant="outline" onClick={onBack}>
              Back to the options
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}

      {view.committed && (
        <div className="space-y-2 rounded-md border border-success/30 bg-success/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Rocket className="size-3.5 text-success" aria-hidden />
            v{plan.version} recorded
          </p>

          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
            <Package className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>
              {manifest.length} files · {manifestChars(manifest).toLocaleString()} characters. The bytes stay in this
              browser; the manifest is what makes the version immutable.
            </span>
          </div>

          {view.targets.length > 0 && (
            <ul className="space-y-0.5">
              {view.targets.map((t) => (
                <li key={t.id} className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <FileCode className="size-2.5 shrink-0" aria-hidden />
                  {TARGET_BY_ID[t.id]?.name}
                  <span className="text-muted-foreground/60">→ {t.path}</span>
                </li>
              ))}
            </ul>
          )}

          {/* The sentence that keeps the target list from being a claim. */}
          <p className="flex items-start gap-1.5 text-[10px] leading-4 text-muted-foreground">
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
            Those are where a real install would put it. Nothing was written outside this workspace, and the install
            counts on the catalog cards are seeded demo numbers that do not move.
          </p>

          {view.done && <p className="text-[10px] leading-4 text-muted-foreground">{view.done}</p>}

          <Button type="button" size="xs" onClick={onClose}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
