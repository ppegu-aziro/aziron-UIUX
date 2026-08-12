import { useMemo, useState } from "react";
import { AlertTriangle, Check, Hand, Minus, MessageCircleQuestion, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { OS_TABS } from "@/data/preparationSchema";
import { Button } from "@/components/ui/button";
import { coverageOf, missingPlatforms, planFor } from "./utils/preparation/resolve";
import { InlineText } from "./PreparationField";
import PreparationAddForm from "./PreparationAddForm";
import PreparationStepCard, { CheckRow } from "./PreparationStepCard";

/**
 * What preparation does, on each machine.
 *
 * A preparation document says what to do on `all`, overrides it for `windows`,
 * and then lists strategies of which the first available wins. Reading the file
 * top to bottom does not answer "so what happens on Windows?" — resolving it
 * does, and that is all this pane is.
 *
 * Read-only on purpose. A row here can have come from `all`, from
 * `darwin,linux` or from `windows`, and the row cannot say which of those an
 * edit was meant for; a form that guessed would silently rewrite a machine the
 * author was not looking at. Editing happens in the file, where the key being
 * changed is written down.
 *
 * Nothing here has probed anything. Every badge is about what the document
 * DECLARES, never about the reader's machine.
 */

const VERDICT = {
  covered: { label: "covered", icon: Check, cls: "text-success" },
  manual: { label: "manual only", icon: Hand, cls: "text-warning" },
  gaps: { label: "not covered", icon: AlertTriangle, cls: "text-destructive" },
  empty: { label: "nothing declared", icon: Minus, cls: "text-muted-foreground" },
};

const MARK = {
  covered: { ch: "✓", cls: "text-success", title: "Runs by itself" },
  "manual-only": { ch: "◐", cls: "text-warning", title: "Tells the user what to do; changes nothing" },
  undefined: { ch: "✕", cls: "text-destructive", title: "No definition — skipped on this machine" },
};

export default function PreparationSetup({
  js,
  goos,
  onGoos,
  stale,
  cursorPath,
  onJump,
  // Absent when the document does not parse: nothing is editable then, and
  // the pane keeps rendering the last version that did.
  onEdit,
  onAdd,
}) {
  const [adding, setAdding] = useState(null);
  const plans = useMemo(() => Object.fromEntries(OS_TABS.map((t) => [t.goos, planFor(js, t.goos)])), [js]);
  const gaps = useMemo(() => missingPlatforms(js), [js]);
  const plan = plans[goos];

  // Every id in the document. Steps share one namespace across all three
  // phases, so a clash check that only looked at one would miss most of them.
  const takenIds = useMemo(() => {
    const prep = js?.preparation ?? {};
    const steps = ["prerequisites", "commands", "configure"].flatMap((k) => prep.preconfigure?.[k] ?? []);
    return [...(prep.precheck ?? []), ...steps].map((n) => n?.id).filter(Boolean);
  }, [js]);

  /** Every node once, with its mark per machine — the "what is missing" table. */
  const matrix = useMemo(() => {
    const rows = [];
    for (const p of js?.preparation?.precheck ?? []) {
      rows.push({
        kind: "check",
        label: p?.label || p?.id || "a precheck",
        marks: Object.fromEntries(OS_TABS.map((t) => [t.goos, coverageOf(p, t.goos, { precheck: true })])),
      });
    }
    for (const phase of plan?.phases ?? []) {
      for (const s of phase.steps) {
        const node = js?.preparation?.preconfigure?.[phase.id]?.[s.index];
        rows.push({
          kind: phase.id,
          label: s.label || s.id,
          marks: Object.fromEntries(OS_TABS.map((t) => [t.goos, coverageOf(node, t.goos)])),
        });
      }
    }
    return rows;
  }, [js, plan]);

  if (!js?.preparation) {
    return (
      <div className="p-4">
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          No <code className="font-mono">preparation:</code> block yet. Write one in the file and it will
          be resolved here, machine by machine.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", stale && "opacity-60")}>
      {/*
        Above the tabs, deliberately. A banner inside the Linux tab is invisible
        from the macOS tab, so the author who introduced the gap is exactly the
        person who would never see it.
      */}
      {gaps && (
        <div className="flex shrink-0 items-start gap-2 border-b border-destructive/25 bg-destructive/5 px-3 py-2">
          <AlertTriangle className="mt-0.5 size-3 shrink-0 text-destructive" aria-hidden />
          <p className="text-[11px] leading-4 text-foreground">
            {OS_TABS.filter((t) => gaps[t.goos]?.length)
              .map((t) => `${t.label} has nothing declared for ${gaps[t.goos].length} of these`)
              .join(" · ")}
            . Those steps are skipped there — the agent still installs, it just is not set up.
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {matrix.length > 0 && (
          <div className="border-b border-border px-3 py-2">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-1 text-left font-medium">Coverage</th>
                  {OS_TABS.map((t) => (
                    <th key={t.goos} className="w-16 pb-1 text-center font-medium">
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, i) => (
                  <tr key={`${row.label}-${i}`} className="border-t border-border/40">
                    <td className="py-0.5 pr-2">
                      <span className="mr-1.5 font-mono text-[10px] text-muted-foreground/60">{row.kind}</span>
                      <span className="text-foreground">{row.label}</span>
                    </td>
                    {OS_TABS.map((t) => {
                      const m = MARK[row.marks[t.goos]];
                      return (
                        <td key={t.goos} className={cn("py-0.5 text-center", m.cls)} title={m.title}>
                          {m.ch}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              <span className="text-success">✓</span> runs by itself ·{" "}
              <span className="text-warning">◐</span> tells you what to do ·{" "}
              <span className="text-destructive">✕</span> no definition
            </p>
          </div>
        )}

        {/*
          Underline tabs, not a second pill group. A pill row directly under the
          mode switcher reads as one control broken in half — this editor
          learned that once already and deleted the second row for it.
        */}
        <div role="tablist" aria-label="Machine" className="flex shrink-0 gap-4 border-b border-border px-3">
          {OS_TABS.map((t) => {
            const v = VERDICT[plans[t.goos].verdict];
            const on = t.goos === goos;
            return (
              <button
                key={t.goos}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onGoos(t.goos)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 py-1.5 text-xs transition-colors",
                  on
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span className={cn("flex items-center gap-0.5 text-[10px]", v.cls)}>
                  <v.icon className="size-2.5" aria-hidden />
                  {v.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-3 p-3">
          {/*
            The one field with no scope question at all: `preparation.prompt` is
            a single scalar that is not inside a platforms map, so editing it
            reaches exactly one place. The quote marks are decoration and never
            enter the file.
          */}
          {(plan.prompt || onEdit) && (
            <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                <MessageCircleQuestion className="size-3" aria-hidden />
                Asked once, before anything runs
              </p>
              <p className="mt-0.5 text-xs text-foreground">
                {onEdit ? (
                  <>
                    “
                    <InlineText
                      value={plan.prompt ?? ""}
                      label="The question asked before setup runs"
                      placeholder="Set up this machine for the agent now?"
                      onCommit={(v) => onEdit(["preparation", "prompt"], v)}
                    />
                    ”
                  </>
                ) : (
                  `“${plan.prompt}”`
                )}
              </p>
            </div>
          )}

          {plan.prechecks.length > 0 && (
            <section>
              <h4 className="mb-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                First it checks
              </h4>
              <div className="rounded-lg border border-border/60 bg-muted/15">
                {plan.prechecks.map((p) => (
                  <CheckRow key={p.path} node={p} onJump={onJump} />
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                Nothing above is run from here. These say what would be probed on the machine.
              </p>
              {onAdd && adding !== "check" && (
                <Button type="button" size="xs" variant="outline" className="mt-1.5" onClick={() => setAdding("check")}>
                  <Plus className="size-3" aria-hidden />
                  Add a check
                </Button>
              )}
              {adding === "check" && (
                <div className="mt-1.5">
                  <PreparationAddForm
                    mode="check"
                    goos={goos}
                    existingIds={takenIds}
                    onCancel={() => setAdding(null)}
                    onAdd={(item) => {
                      onAdd("precheck", item);
                      setAdding(null);
                    }}
                  />
                </div>
              )}
            </section>
          )}

          {/*
            An empty phase still draws its heading while editing, so "add the
            first step to Configure" has somewhere to hang. With editing off it
            stays hidden — an empty heading is noise to a reader.
          */}
          {plan.phases
            .filter((phase) => phase.steps.length || onAdd)
            .map((phase) => (
              <section key={phase.id}>
                <h4 className="mb-1 flex items-baseline gap-2 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  {phase.label}
                  <span className="text-[10px] font-normal tracking-normal normal-case">{phase.note}</span>
                </h4>
                <div className="space-y-1.5">
                  {phase.steps.map((s) => (
                    <PreparationStepCard key={s.path} step={s} onJump={onJump} cursorPath={cursorPath} />
                  ))}
                </div>
                {onAdd && adding !== phase.id && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="mt-1.5"
                    onClick={() => setAdding(phase.id)}
                  >
                    <Plus className="size-3" aria-hidden />
                    Add a step to {phase.label}
                  </Button>
                )}
                {adding === phase.id && (
                  <div className="mt-1.5">
                    <PreparationAddForm
                      mode="step"
                      phase={phase.id}
                      goos={goos}
                      existingIds={takenIds}
                      onCancel={() => setAdding(null)}
                      onAdd={(item, target) => {
                        onAdd(`preconfigure.${target}`, item);
                        setAdding(null);
                      }}
                    />
                  </div>
                )}
              </section>
            ))}

          {plan.verify.length > 0 && (
            <section>
              <h4 className="mb-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                Then it checks again
              </h4>
              <div className="rounded-lg border border-border/60 bg-muted/15">
                {plan.verify.map((v) => (
                  <CheckRow key={v.path} node={v} onJump={onJump} />
                ))}
              </div>
            </section>
          )}

          {plan.verdict === "empty" && (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
              Nothing is declared yet, so preparation does nothing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
