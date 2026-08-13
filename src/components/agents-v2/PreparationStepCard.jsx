import { AlertTriangle, CornerDownRight, Hand, Lock, ShieldAlert, Terminal } from "lucide-react";

import { cn } from "@/lib/utils";
import { previewArgv } from "./utils/preparation/resolve";
import PreparationField from "./PreparationField";

/**
 * One resolved precheck or step, for one machine.
 *
 * Everything shown here is a CONDITION, never a verdict. This runs in a
 * browser: it has not looked at anybody's PATH, has not run a probe, and does
 * not know whether winget is installed. So a strategy is "needs winget", never
 * "will use winget", and a check is "expects version ≥ 2.0.0", never "passed".
 * Saying otherwise would be inventing an answer only the machine has.
 *
 * Nothing is editable. A row here can come from `all`, from `darwin,linux`, or
 * from `windows`, and the row itself cannot say which of those an edit was
 * meant for — so editing happens in the file, where the key you are changing is
 * written down in front of you.
 */

/** What the value under each check kind actually is. */
const KIND_LABEL = {
  binary: "Program name",
  env: "Variable name",
  file: "Path",
  "env-file": "Path to the env file",
};

const COVERAGE = {
  covered: { label: "covered", cls: "border-success/30 bg-success/10 text-success" },
  "manual-only": { label: "manual only", cls: "border-warning/30 bg-warning/10 text-warning" },
  undefined: { label: "no definition", cls: "border-destructive/30 bg-destructive/10 text-destructive" },
};

/** Where the resolved body came from, which is the thing an author most needs. */
function Provenance({ from, onJump, path }) {
  if (!from) return null;
  return (
    <button
      type="button"
      onClick={() => onJump?.(path)}
      title={
        from === "all"
          ? "Written under `all`, so it is shared with every other machine"
          : `Written under \`${from}\``
      }
      className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      {from}
    </button>
  );
}

function Chip({ children, tone = "muted", icon: Icon, title }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] whitespace-nowrap",
        tone === "warning"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {Icon && <Icon className="size-2.5" aria-hidden />}
      {children}
    </span>
  );
}

/** A check, described rather than judged. */
export function CheckRow({ node, goos, onJump, onEdit, editableAt }) {
  const c = node.check;
  const cov = COVERAGE[node.coverage];

  return (
    <div className="flex items-start gap-2 border-t border-border/60 px-3 py-2 first:border-t-0">
      <span className={cn("mt-0.5 size-1.5 shrink-0 rounded-full", node.coverage === "undefined" ? "bg-destructive" : "bg-muted-foreground/40")} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {onEdit ? (
            /* The label sits ABOVE the platforms map, so one machine's tab is
               the only place it appears and an edit reaches exactly one key. */
            <span className="text-xs font-medium text-foreground">
              <PreparationField
                label={null}
                name="Check name"
                scope={{ kind: "exact", shared: false, others: [], covers: [], key: null }}
                goos={goos}
                value={node.label}
                placeholder="Name this check"
                validate={(v) => (v.trim() ? null : "A check needs a name.")}
                onCommit={(v) => onEdit([...node.segments, "label"], v)}
              />
            </span>
          ) : (
            <span className="text-xs font-medium text-foreground">{node.label || node.id}</span>
          )}
          {node.dedupKey && (
            <Chip title="Shared machine-wide, so two agents needing it check once">
              shared as {node.dedupKey}
            </Chip>
          )}
        </div>

        {!c ? (
          <p className="text-[11px] text-destructive">
            Nothing is declared for this machine, so it would be skipped.
          </p>
        ) : (
          <>
            {c.kind === "command" ? (
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                <span className="text-muted-foreground/60">$ </span>
                {previewArgv(c.argv)}
              </p>
            ) : onEdit && node.checkSegments ? (
              /* Under `platforms.<key>`, so this is where an edit can reach a
                 machine you are not looking at — and where the field component
                 puts its sentence. */
              <PreparationField
                label={KIND_LABEL[c.kind] ?? c.kind}
                scope={node.scope}
                goos={goos}
                mono
                value={String(c.value ?? "")}
                placeholder="not set"
                editable={editableAt?.([...node.checkSegments, "value"])}
                validate={(v) =>
                  // The same shape the validator enforces: a bare name, not a
                  // path. Stated as what IS allowed rather than as a list of
                  // forbidden characters, which is one fewer thing to get wrong.
                  c.kind === "binary" && v && !/^[A-Za-z0-9._+-]+$/.test(v)
                    ? "A bare program name, looked up on PATH — not a path."
                    : null
                }
                onCommit={(v) => onEdit([...node.checkSegments, "value"], v)}
                onOpenFile={onJump}
              />
            ) : (
              <p className="font-mono text-[11px] text-muted-foreground">
                {c.kind} · {String(c.value ?? "")}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1">
              {c.expect?.min_version && <Chip>expects ≥ {c.expect.min_version}</Chip>}
              {/* Named, never shown. The point of the flag is that the output
                  is not read, so printing it here would defeat it. */}
              {c.sensitive_output && <Chip icon={Lock}>output not captured</Chip>}
              <Chip>{c.timeout_seconds ?? 10}s</Chip>
            </div>
            {node.dependsOn?.length > 0 && (
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <CornerDownRight className="size-2.5" aria-hidden />
                skipped unless {node.dependsOn.join(" and ")} {node.dependsOn.length === 1 ? "is" : "are"} satisfied
              </p>
            )}
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px]", cov.cls)}>{cov.label}</span>
        <Provenance from={node.from} onJump={onJump} path={node.path} />
      </div>
    </div>
  );
}

/** A step, with its strategy ladder. */
export default function PreparationStepCard({ step, goos, onJump, cursorPath, onEdit, editableAt }) {
  const cov = COVERAGE[step.coverage];
  const focused = cursorPath && step.path && cursorPath.startsWith(step.path);

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        focused ? "border-primary/40 bg-primary/5" : "border-border/60 bg-muted/15",
      )}
    >
      <div className="flex flex-wrap items-start gap-2 px-3 pt-2">
        <div className="min-w-0 flex-1">
          {onEdit ? (
            <p className="text-xs font-medium text-foreground">
              <PreparationField
                label={null}
                name="Step name"
                scope={{ kind: "exact", shared: false, others: [], covers: [], key: null }}
                goos={goos}
                value={step.label}
                placeholder="Name this step"
                validate={(v) => (v.trim() ? null : "A step needs a name.")}
                onCommit={(v) => onEdit([...step.segments, "label"], v)}
              />
            </p>
          ) : (
            <p className="text-xs font-medium text-foreground">{step.label || step.id}</p>
          )}
          {step.when?.precheck && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              runs when <span className="text-foreground">{step.when.precheck}</span> is{" "}
              {step.whenStatus}
              {/* The default nobody wrote down. A plan showing only what was
                  typed hides half of what will happen. */}
              {step.when.status == null && <span className="text-muted-foreground/60"> (default)</span>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px]", cov.cls)}>{cov.label}</span>
          <Provenance from={step.from} onJump={onJump} path={step.path} />
        </div>
      </div>

      {step.coverage === "undefined" ? (
        <p className="px-3 py-2 text-[11px] text-destructive">
          Nothing is declared for this machine. The agent still installs; this step is skipped.
        </p>
      ) : (
        <>
          <p className="px-3 pt-1.5 text-[10px] text-muted-foreground">
            {step.select === "prompt"
              ? "the user picks one"
              : step.strategies.length > 1
                ? "the first one whose requirements are on PATH wins"
                : step.sugar
                  ? "one way, always available"
                  : "one way"}
          </p>

          <ol className="mt-1 space-y-px px-3 pb-2">
            {step.strategies.map((s, i) => {
              const unconditional = s.requires.length === 0;
              const last = i === step.strategies.length - 1;
              const manual = s.actions.every((a) => a?.kind === "instructions");
              return (
                <li
                  key={s.id}
                  className="flex items-start gap-2 rounded border border-border/50 bg-background/50 px-2 py-1.5"
                >
                  <span className="mt-0.5 w-3 shrink-0 text-right font-mono text-[10px] text-muted-foreground/60">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] text-foreground">{s.label ?? s.id}</span>
                      {onEdit && s.segments && !last ? (
                        /* Also under `platforms.<key>`. The LAST rung is left
                           alone: it is what runs when nothing else is
                           available, so adding a requirement to it is exactly
                           the dead end the schema forbids. */
                        <PreparationField
                          label="Only if these are on PATH"
                          scope={step.scope}
                          goos={goos}
                          control="chips"
                          value={s.requires}
                          placeholder="brew"
                          caption={unconditional ? "always available" : undefined}
                          editable={editableAt?.([...s.segments, "requires"])}
                          onAdd={(v) => onEdit([...s.segments, "requires", s.requires.length], v)}
                          onRemove={(i) =>
                            onEdit([...s.segments, "requires", i], null)
                          }
                        />
                      ) : (
                        <Chip title={unconditional ? "Nothing has to be installed first" : "Only if these are on PATH"}>
                          {unconditional ? "always available" : `needs ${s.requires.join(", ")}`}
                        </Chip>
                      )}
                      {s.actions.some((a) => a?.elevation === "required") && (
                        <Chip tone="warning" icon={ShieldAlert}>needs admin</Chip>
                      )}
                      {s.actions.some((a) => a?.elevation === "may-prompt") && (
                        <Chip icon={ShieldAlert}>may ask for admin</Chip>
                      )}
                      {s.actions.some((a) => a?.interactive) && <Chip icon={Terminal}>needs a terminal</Chip>}
                      {manual && <Chip tone="warning" icon={Hand}>you do this by hand</Chip>}
                    </div>

                    {s.actions.map((a, j) => (
                      <div key={j} className="min-w-0">
                        {a?.kind === "command" ? (
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            <span className="text-muted-foreground/60">$ </span>
                            {previewArgv(a.argv)}
                          </p>
                        ) : a?.kind === "instructions" ? (
                          <p className="text-[11px] leading-4 text-muted-foreground">{a.message}</p>
                        ) : (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            writes {a?.path}
                            {a?.vars?.length ? ` · ${a.vars.length} variable${a.vars.length === 1 ? "" : "s"}` : ""}
                          </p>
                        )}
                      </div>
                    ))}

                    {s.pathHints.length > 0 && (
                      <p className="truncate font-mono text-[10px] text-muted-foreground/70">
                        then adds to PATH: {s.pathHints.join(", ")}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onJump?.(s.path)}
                    title="Show this in the file"
                    className="shrink-0 text-[10px] text-muted-foreground/60 transition-colors hover:text-primary"
                  >
                    ↗
                  </button>
                </li>
              );
            })}
          </ol>

          {/* The rule the schema exists for, restated where it is broken. */}
          {step.strategies.length > 0 && step.strategies.at(-1).requires.length > 0 && (
            <p className="flex items-start gap-1.5 border-t border-destructive/25 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
              Every option here is conditional. A machine with none of them does nothing and is told
              the agent is not ready, with no way forward.
            </p>
          )}
        </>
      )}
    </div>
  );
}
