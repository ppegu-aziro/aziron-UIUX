import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/**
 * The three wrappers every settings surface in agents-v2 is built from.
 *
 * Lifted out of SettingsPanel so the generated AGENT.json form and the settings
 * sheet render the same shapes rather than two hand-written approximations of
 * each other. They are presentational only — no store, no schema.
 */

export function Section({ icon: Icon, title, note, children, muted, right, id }) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-xl border bg-card p-4",
        muted ? "border-dashed border-border" : "border-border",
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            {Icon && <Icon className="size-3.5 text-muted-foreground" aria-hidden />}
            {title}
          </h3>
          {note && <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{note}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, hint, children, htmlFor, right }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="block text-xs font-medium text-foreground">
          {label}
        </label>
        {right}
      </div>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Toggle({ id, label, hint, checked, onChange, disabled, right }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="text-xs font-medium text-foreground">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{hint}</p>}
      </div>
      <span className="flex shrink-0 items-center gap-2">
        {right}
        <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </span>
    </div>
  );
}
