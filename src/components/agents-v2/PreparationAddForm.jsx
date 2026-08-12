import { useState } from "react";
import { Lock, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { OS_TABS, PHASES } from "@/data/preparationSchema";
import {
  CHECK_RECIPES,
  STEP_RECIPES,
  buildCheck,
  buildStep,
  platformKeyFor,
} from "@/data/preparationForms";

/**
 * Adding a check or a step, in place.
 *
 * A catalogue first and a blank form second, because the schema is the thing
 * nobody wants to learn and a named starting point skips it entirely. Every
 * recipe is checked by the validator in the test suite.
 *
 * Two things are decided here rather than left to be discovered:
 *
 * Which machines it applies to is a FIELD, asked first and defaulted to all —
 * so the shared-value question is answered at creation, where it is a choice,
 * rather than at the first edit, where it is a surprise.
 *
 * And a step always ends in a last resort that needs nothing. That zone is
 * locked, so the rule the whole schema exists for — never leave a machine with
 * nothing to try — cannot be violated by anything built here. It is not
 * validated afterwards; it is not reachable.
 */

const slug = (s) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);

/** Which machines this lands on. Answered first, because it is the widest choice. */
function MachinePicker({ machines, onChange }) {
  const all = machines.length === 0;
  return (
    <div>
      <p className="mb-1 text-[10px] text-muted-foreground">Applies to</p>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          aria-pressed={all}
          onClick={() => onChange([])}
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
            all ? "border-primary/45 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30",
          )}
        >
          All machines
        </button>
        <span className="text-[10px] text-muted-foreground/60">or</span>
        {OS_TABS.map((t) => {
          const on = machines.includes(t.goos);
          return (
            <button
              key={t.goos}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(on ? machines.filter((m) => m !== t.goos) : [...machines, t.goos])
              }
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                on ? "border-primary/45 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground/70">
        {all
          ? "Written under `all` — every machine runs the same thing."
          : machines.length === OS_TABS.length
            ? "All three named separately does the same as `all`, which keeps them from drifting apart."
            : `Written under \`${platformKeyFor(machines)}\`. You can add the others later.`}
      </p>
    </div>
  );
}

function Row({ label, hint, children }) {
  return (
    <div>
      <p className="mb-1 text-[10px] text-muted-foreground">{label}</p>
      {children}
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export default function PreparationAddForm({ mode, phase, existingIds, goos, onAdd, onCancel }) {
  const recipes = mode === "check" ? CHECK_RECIPES : STEP_RECIPES;
  const [recipe, setRecipe] = useState(null);
  const [machines, setMachines] = useState([]);
  const [answer, setAnswer] = useState("");
  const [extra, setExtra] = useState("");
  const [name, setName] = useState("");
  const [touchedName, setTouchedName] = useState(false);
  const [id, setId] = useState("");
  const [touchedId, setTouchedId] = useState(false);
  const [target, setTarget] = useState(phase ?? "commands");
  const [lastResort, setLastResort] = useState("");

  // The name writes itself from what was typed above, and stops the moment
  // somebody types here — a suggestion, never a correction.
  const derivedName = recipe && answer ? recipe.label(answer) : "";
  const shownName = touchedName ? name : derivedName;
  const shownId = touchedId ? id : slug(shownName);

  const clash = existingIds?.includes(shownId);
  const needsLastResort = mode === "step" && !recipe?.build(answer, extra, goos)?.lastResort;

  const why = !recipe
    ? "Pick what it does first."
    : !answer.trim()
      ? `${recipe.ask.label} is needed.`
      : !shownName.trim()
        ? "Give it a name."
        : !shownId
          ? "Give it a short id."
          : clash
            ? `There is already something called “${shownId}”.`
            : mode === "step" && needsLastResort && !lastResort.trim()
              ? "The last resort needs something to tell the user."
              : null;

  const submit = () => {
    if (why) return;
    const platformKey = platformKeyFor(machines);
    if (mode === "check") {
      onAdd(buildCheck({ id: shownId, label: shownName, check: recipe.build(answer, extra), platformKey }));
      return;
    }
    const built = recipe.build(answer, extra, machines.length === 1 ? machines[0] : goos);
    onAdd(
      buildStep({
        id: shownId,
        label: shownName,
        ways: built.ways,
        lastResort: built.lastResort ?? lastResort,
        platformKey,
      }),
      target,
    );
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          {mode === "check" ? "Add a check" : "Add a step"}
        </p>
        <Button type="button" size="icon-sm" variant="ghost" onClick={onCancel} aria-label="Cancel">
          <X className="size-3" aria-hidden />
        </Button>
      </div>

      <div className="space-y-3">
        <Row label={mode === "check" ? "What is checked" : "What it does"}>
          <div className="flex flex-wrap gap-1">
            {recipes.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={recipe?.id === r.id}
                title={r.hint}
                onClick={() => {
                  setRecipe(r);
                  if (mode === "step" && r.phase) setTarget(r.phase);
                }}
                className={cn(
                  "rounded-md border px-2 py-1 text-left text-[11px] transition-colors",
                  recipe?.id === r.id
                    ? "border-primary/45 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30",
                )}
              >
                {r.title}
              </button>
            ))}
          </div>
          {recipe && <p className="mt-1 text-[10px] text-muted-foreground/70">{recipe.hint}</p>}
        </Row>

        {/* Nothing below appears until the choice above has been made — a form
            that shows every field at once is a wall, not a tool. */}
        {recipe && (
          <>
            <MachinePicker machines={machines} onChange={setMachines} />

            <Row label={recipe.ask.label}>
              <Input
                autoFocus
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={recipe.ask.placeholder}
                className={cn("h-7 text-xs md:text-xs", recipe.ask.mono && "font-mono")}
              />
              {recipe.ask.chips && (
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                  There is no shell here — this is split on spaces into separate arguments.
                </p>
              )}
            </Row>

            {recipe.extra && (
              <Row label={recipe.extra.label}>
                <Input
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  placeholder={recipe.extra.placeholder}
                  className="h-7 font-mono text-xs md:text-xs"
                />
              </Row>
            )}

            {mode === "step" && (
              <Row label="Runs as part of">
                <div className="flex gap-1">
                  {PHASES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={target === p.id}
                      title={p.note}
                      onClick={() => setTarget(p.id)}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                        target === p.id
                          ? "border-primary/45 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Row>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Row label="Name it">
                <Input
                  value={shownName}
                  onChange={(e) => {
                    setTouchedName(true);
                    setName(e.target.value);
                  }}
                  placeholder="Shown while it runs"
                  className="h-7 text-xs md:text-xs"
                />
              </Row>
              <Row label="Short id" hint={clash ? undefined : "Used to refer to it from elsewhere."}>
                <Input
                  value={shownId}
                  onChange={(e) => {
                    setTouchedId(true);
                    setId(slug(e.target.value));
                  }}
                  aria-invalid={clash}
                  className={cn("h-7 font-mono text-xs md:text-xs", clash && "border-destructive")}
                />
                {clash && <p className="mt-0.5 text-[10px] text-destructive">Already taken.</p>}
              </Row>
            </div>

            {/*
              The locked zone. A step built here always ends in something that
              needs nothing, so the rule the schema exists for cannot be broken
              by anything this form produces — it is unreachable, not merely
              validated.
            */}
            {mode === "step" && (
              <div className="rounded-md border border-border bg-muted/25 p-2">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-medium text-foreground">
                  <Lock className="size-2.5 text-muted-foreground" aria-hidden />
                  Last resort — always runs
                </p>
                {needsLastResort ? (
                  <Textarea
                    rows={2}
                    value={lastResort}
                    onChange={(e) => setLastResort(e.target.value)}
                    placeholder="Install it by hand, then run preparation again."
                    className="resize-none text-xs md:text-xs"
                  />
                ) : (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {recipe.build(answer || "…", extra, goos)?.lastResort}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground/70">
                  This is what happens when none of the options above are available. It cannot depend on
                  anything, which is what stops a machine being told it is not ready with nowhere to go.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {why && <span className="mr-auto text-[10px] text-muted-foreground">{why}</span>}
        <Button type="button" size="xs" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="xs" onClick={submit} disabled={Boolean(why)}>
          <Plus className="size-3" aria-hidden />
          {mode === "check" ? "Add check" : "Add step"}
        </Button>
      </div>
    </div>
  );
}
