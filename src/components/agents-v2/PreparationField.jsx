import { useEffect, useRef, useState } from "react";
import { Check, FileCode, Plus, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { scopeSentence } from "./utils/preparation/scope";

/**
 * One editable value in the resolved preview.
 *
 * `scope` is a REQUIRED prop and this component renders its own warning from
 * it. That is the whole safety mechanism: a row on the macOS tab may live under
 * `all`, where changing it changes Linux and Windows too, and because one
 * component emits both the control and the sentence there is no code path that
 * produces the first without the second.
 *
 * The sentence sits in the card, in normal flow, directly above the value — so
 * it scrolls with the field it describes. Anchoring it to the tab strip would
 * put it off screen on a long file, which is a warning that exists only in the
 * first paragraph.
 */

/** Click-to-edit text. Enter commits, Escape reverts, blur commits. */
function InlineText({ value, placeholder, mono, multiline, onCommit, validate, label }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef(null);

  // The draft is seeded when editing STARTS rather than kept in sync by an
  // effect. Syncing means a write landing while somebody is typing replaces
  // what they typed, which is the one thing an input must never do.
  const start = () => {
    setDraft(value ?? "");
    setEditing(true);
  };

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  const error = editing ? validate?.(draft) : null;

  const commit = () => {
    setEditing(false);
    if (error) return;
    if (draft !== (value ?? "")) onCommit(draft);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={start}
        aria-label={`Edit ${label}`}
        className={cn(
          "-mx-1 rounded px-1 text-left transition-colors hover:bg-muted",
          mono && "font-mono",
          value ? "text-foreground" : "text-muted-foreground italic",
        )}
      >
        {value || placeholder || "not set"}
      </button>
    );
  }

  return (
    <span className="inline-flex min-w-0 flex-col gap-0.5">
      <Input
        ref={ref}
        value={draft}
        aria-label={label}
        aria-invalid={Boolean(error)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !multiline) {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        onBlur={commit}
        className={cn("h-6 px-1.5 text-xs md:text-xs", mono && "font-mono", error && "border-destructive")}
      />
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </span>
  );
}

/** A closed set, as buttons. Commits immediately — there is nothing to type. */
function Segmented({ value, options, ghost, onCommit, label }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5" role="group" aria-label={label}>
      {options.map((o) => {
        const on = (value ?? ghost) === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            title={o.note}
            onClick={() => onCommit(o.value === ghost ? null : o.value)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] transition-colors",
              on ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label ?? o.value}
            {/* A value nobody wrote down, shown as the default it is. */}
            {on && value == null && <span className="ml-1 text-muted-foreground/60">default</span>}
          </button>
        );
      })}
    </span>
  );
}

/** A list of bare words. Each is one argument, never a line to be word-split. */
function Chips({ values, onAdd, onRemove, placeholder, label, caption, firstIsProgram }) {
  const [draft, setDraft] = useState("");
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]",
            firstIsProgram && i === 0
              ? "border-primary/35 bg-primary/8 text-primary"
              : "border-border bg-muted/40 text-foreground",
          )}
          title={firstIsProgram && i === 0 ? "the program, looked up on PATH" : undefined}
        >
          {v}
          <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${v}`}>
            <X className="size-2.5 text-muted-foreground hover:text-destructive" aria-hidden />
          </button>
        </span>
      ))}
      <Input
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && draft.trim()) {
            e.preventDefault();
            onAdd(draft.trim());
            setDraft("");
          } else if (e.key === "Backspace" && !draft && values.length) {
            onRemove(values.length - 1);
          }
        }}
        className="h-5 w-24 px-1 font-mono text-[10px] md:text-[10px]"
      />
      {caption && <span className="text-[10px] text-muted-foreground/70">{caption}</span>}
    </span>
  );
}

export default function PreparationField({
  label,
  scope,
  goos,
  editable = { ok: true },
  control = "text",
  value,
  options,
  ghost,
  placeholder,
  mono,
  caption,
  firstIsProgram,
  validate,
  onCommit,
  onAdd,
  onRemove,
  onOpenFile,
  onAddForMachine,
}) {
  const shared = scope?.shared;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {label && <span className="text-[10px] text-muted-foreground">{label}</span>}

        {!editable.ok ? (
          // Never a dead disabled input. A reason, and a way to get at it.
          <span className="inline-flex flex-wrap items-baseline gap-1.5">
            <span className={cn("text-xs text-muted-foreground", mono && "font-mono")}>{value || "—"}</span>
            <span className="text-[10px] text-muted-foreground/80">{editable.why}</span>
            {editable.line > 0 && (
              <button
                type="button"
                onClick={() => onOpenFile?.(editable.line)}
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <FileCode className="size-2.5" aria-hidden />
                Edit in the file, line {editable.line}
              </button>
            )}
          </span>
        ) : scope?.kind === "none" ? (
          <span className="inline-flex items-baseline gap-2">
            <span className="text-[11px] text-destructive">{scopeSentence(scope, goos)}</span>
            {onAddForMachine && (
              <Button type="button" size="xs" variant="outline" onClick={onAddForMachine}>
                <Plus className="size-3" aria-hidden />
                Add for this machine
              </Button>
            )}
          </span>
        ) : control === "segmented" ? (
          <Segmented value={value} options={options} ghost={ghost} onCommit={onCommit} label={label} />
        ) : control === "chips" ? (
          <Chips
            values={value ?? []}
            onAdd={onAdd}
            onRemove={onRemove}
            placeholder={placeholder}
            label={label}
            caption={caption}
            firstIsProgram={firstIsProgram}
          />
        ) : (
          <InlineText
            value={value}
            placeholder={placeholder}
            mono={mono}
            onCommit={onCommit}
            validate={validate}
            label={label}
          />
        )}
      </div>

      {/*
        The invariant. Rendered by the same component that renders the control,
        so an editable shared value cannot exist without it, and placed in flow
        so it travels with the field rather than sitting in a header that
        scrolls away.
      */}
      {editable.ok && shared && (
        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-warning">
          <Users className="size-2.5 shrink-0" aria-hidden />
          {scopeSentence(scope, goos)}
        </p>
      )}
    </div>
  );
}

export { InlineText, Segmented, Chips };
