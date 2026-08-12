import { useState } from "react";
import { Check, Lock, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Field, Toggle } from "./utils/formControls";

/**
 * One field spec, rendered.
 *
 * The only file that knows what a slider or a chip looks like. Everything else
 * — which fields exist, what they mean, what values are legal — comes from the
 * schema, so adding a field to the catalogue lights it up here without a line
 * of code, and the control can never offer a value the validator rejects.
 *
 * Every change goes out as `onEdit(spec, value)`, never as a mutation of a
 * document. The form does not own text: it patches the record, and the JSON is
 * re-derived from it. That is why an edit here cannot clobber a key the form
 * does not model, which is the classic failure of form-over-YAML editors.
 */

/** Marks a field the user actually decided, and offers to undo it. */
function ChangedMark({ changed, onReset, readOnly }) {
  if (readOnly) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Lock className="size-2.5" aria-hidden />
        set by releasing
      </span>
    );
  }
  if (!changed) return null;
  return (
    <button
      type="button"
      onClick={onReset}
      title="Reset to the default, which removes it from the file"
      className="flex items-center gap-1 rounded px-1 text-[10px] text-primary transition-colors hover:bg-muted"
    >
      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
      changed
      <RotateCcw className="size-2.5" aria-hidden />
    </button>
  );
}

function Chips({ spec, value, options, open, onChange }) {
  const [draft, setDraft] = useState("");
  const picked = Array.isArray(value) ? value : [];
  const groups = [...new Set(options.map((o) => o.group ?? ""))];

  const toggle = (v) =>
    onChange(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]);

  return (
    <div className="space-y-2">
      {/* Anything chosen that the catalogue does not know about — kept, and
          marked, rather than quietly dropped the way the old dialog dropped it. */}
      {picked.filter((v) => !options.some((o) => o.value === v)).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {picked
            .filter((v) => !options.some((o) => o.value === v))
            .map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]"
              >
                {v}
                <span className="text-muted-foreground">not in the catalogue</span>
                <button type="button" onClick={() => toggle(v)} aria-label={`Remove ${v}`}>
                  <X className="size-2.5 text-muted-foreground hover:text-destructive" aria-hidden />
                </button>
              </span>
            ))}
        </div>
      )}

      {groups.map((g) => (
        <div key={g}>
          {g && (
            <p className="mb-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
              {g}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {options
              .filter((o) => (o.group ?? "") === g)
              .map((o) => {
                const on = picked.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    aria-pressed={on}
                    title={o.note}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] transition-colors",
                      on
                        ? "border-primary/45 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30",
                    )}
                  >
                    {on && <Check className="size-2.5" aria-hidden />}
                    {o.label ?? o.value}
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      {open && (
        <div className="flex gap-1.5">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !draft.trim()) return;
              e.preventDefault();
              onChange([...picked, draft.trim()]);
              setDraft("");
            }}
            placeholder="Add one not in the list"
            aria-label={`Add to ${spec.label}`}
            className="h-7 flex-1 text-xs"
          />
        </div>
      )}
    </div>
  );
}

function PromptList({ value, onChange }) {
  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const list = Array.isArray(value) ? value : [];

  const add = () => {
    if (!label.trim() || !prompt.trim()) return;
    onChange([...list, { label: label.trim(), prompt: prompt.trim() }]);
    setLabel("");
    setPrompt("");
  };

  return (
    <div className="space-y-2">
      {list.map((q, i) => (
        <div
          key={`${q.label}-${i}`}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5"
        >
          <Badge variant="secondary" className="shrink-0">
            {q.label}
          </Badge>
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{q.prompt}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${q.label}`}
            onClick={() => onChange(list.filter((_, x) => x !== i))}
          >
            <Trash2 className="size-3 text-destructive" aria-hidden />
          </Button>
        </div>
      ))}
      <div className="flex flex-col gap-1.5 sm:flex-row">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label"
          aria-label="Quick prompt label"
          className="h-7 text-xs sm:w-32"
        />
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="The prompt this button sends"
          aria-label="Quick prompt text"
          className="h-7 flex-1 text-xs"
        />
        <Button type="button" size="xs" onClick={add} disabled={!label.trim() || !prompt.trim()}>
          <Plus className="size-3" aria-hidden />
          Add
        </Button>
      </div>
    </div>
  );
}

export default function SchemaField({ spec, agent, doc, changed, onEdit, onReset, onFocus }) {
  const value = spec.read(agent);
  const id = `aj-${spec.path.replace(/\./g, "-")}`;
  const options = spec.options?.({ doc, agent }) ?? [];
  const set = (v) => onEdit(spec, v);
  const mark = <ChangedMark changed={changed} readOnly={spec.readOnly} onReset={onReset} />;

  // A toggle carries its own label, so it does not sit inside a Field.
  if (spec.control === "toggle") {
    return (
      <Toggle
        id={id}
        label={spec.label}
        hint={spec.hint}
        checked={Boolean(value)}
        onChange={set}
        right={mark}
      />
    );
  }

  const control = (() => {
    switch (spec.control) {
      case "textarea":
        return (
          <Textarea
            id={id}
            rows={2}
            value={value ?? ""}
            onChange={(e) => set(e.target.value)}
            onFocus={onFocus}
            className="resize-y text-sm"
          />
        );

      case "select":
        return (
          <Select value={value || undefined} onValueChange={set} disabled={spec.readOnly}>
            <SelectTrigger id={id} onFocus={onFocus} className="text-sm">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <span className="flex items-baseline gap-2">
                    {o.label ?? o.value}
                    {o.note && <span className="text-[10px] text-muted-foreground">{o.note}</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "slider":
        return (
          <input
            id={id}
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={value ?? 0}
            onChange={(e) => set(Number(e.target.value))}
            onFocus={onFocus}
            className="w-full accent-primary"
          />
        );

      case "number":
        return (
          <Input
            id={id}
            type="number"
            value={value ?? 0}
            onChange={(e) => set(Number(e.target.value))}
            onFocus={onFocus}
            className="h-8 text-sm"
          />
        );

      case "chips":
        return (
          <Chips spec={spec} value={value} options={options} open={spec.open} onChange={set} />
        );

      case "prompt-list":
        return <PromptList value={value} onChange={set} />;

      default:
        return (
          <Input
            id={id}
            value={value ?? ""}
            onChange={(e) => set(e.target.value)}
            onFocus={onFocus}
            readOnly={spec.readOnly}
            className={cn("h-8 text-sm", spec.readOnly && "text-muted-foreground")}
          />
        );
    }
  })();

  return (
    <Field
      label={spec.control === "slider" ? `${spec.label} · ${value}` : spec.label}
      hint={spec.hint}
      htmlFor={id}
      right={mark}
    >
      {control}
    </Field>
  );
}
