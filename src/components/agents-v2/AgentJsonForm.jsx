import { useMemo, useState } from "react";
import { Boxes, ChevronDown, ChevronRight, Cpu, Database, MessageSquare, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SECTIONS, fieldsIn } from "@/data/agentJsonSchema";
import { changedPaths, toDoc } from "./utils/agentJson";
import { Section } from "./utils/formControls";
import SchemaField from "./SchemaField";

/**
 * The interactive half of AGENT.json.
 *
 * Generated from the schema, with no per-field code — which is the whole point.
 * A hand-written form beside a schema-driven validator is how a product ends up
 * offering a value its own file rejects.
 *
 * Rarely-touched fields sit behind a disclosure inside the section that owns
 * them, rather than behind a global Common/All switch. Sampling settings are a
 * fact about the model, so the place to ask for them is under the model — and a
 * top-level control that governed four fields cost more attention than the four
 * fields were worth.
 */

const ICONS = {
  package: Boxes,
  runtime: Cpu,
  knowledge: Database,
  chat: MessageSquare,
  workspace: Sparkles,
};

export default function AgentJsonForm({ agent, onlyChanged, onShowAll, onEdit, onFocusPath, cursorPath }) {
  // Built from the record so the form still renders when the text is broken.
  // Reading the half-typed document instead would hand every control undefined
  // at exactly the moment the form is the only surface still working.
  const doc = useMemo(() => toDoc(agent), [agent]);
  const changed = useMemo(() => changedPaths(agent), [agent]);
  const ctx = { doc, agent };
  const [expanded, setExpanded] = useState(() => new Set());

  const visible = (spec) =>
    (!spec.when || spec.when(ctx)) && (!onlyChanged || changed.has(spec.path));

  const anyVisible = SECTIONS.some((s) => fieldsIn(s.id).some(visible));

  return (
    <div className="space-y-3">
      {SECTIONS.map((section) => {
        const all = fieldsIn(section.id).filter(visible);
        if (!all.length) return null;

        const hidden = all.filter((f) => f.tier === "advanced").length;
        // Filtering to what changed is already a deliberate narrowing; hiding
        // some of the result behind a second disclosure would be a second one.
        const open = expanded.has(section.id) || onlyChanged;
        const specs = open ? all : all.filter((f) => f.tier === "common");
        const Icon = ICONS[section.id];

        return (
          <Section
            key={section.id}
            icon={Icon}
            title={section.label}
            note={section.note}
            muted={section.id === "runtime" && !agent.runtime}
            right={
              /*
                Said once per section instead of once per screen. The current UI
                spends three separate paragraphs explaining this distinction, and
                the failure it warns about — tuning temperature and finding it
                ignored on your laptop — is a per-key fact.
              */
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap",
                  section.travels
                    ? "border-primary/25 bg-primary/8 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground",
                )}
              >
                {section.travels ? "ships in a release" : "Aziron only"}
              </span>
            }
          >
            <div className="space-y-3">
              {specs.map((spec) => (
                <div
                  key={spec.path}
                  className={cn(
                    "rounded-md transition-colors",
                    // Flashes the field you had the caret on in the JSON, which
                    // is how you learn which key the control was.
                    cursorPath === spec.path && "-mx-1.5 bg-primary/5 px-1.5 py-1 ring-1 ring-primary/25",
                  )}
                >
                  <SchemaField
                    spec={spec}
                    agent={agent}
                    doc={doc}
                    changed={changed.has(spec.path)}
                    onEdit={onEdit}
                    onReset={() => onEdit(spec, spec.fallback)}
                    onFocus={() => onFocusPath?.(spec.path)}
                  />
                </div>
              ))}

              {hidden > 0 && !onlyChanged && (
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((s) => {
                      const next = new Set(s);
                      next.has(section.id) ? next.delete(section.id) : next.add(section.id);
                      return next;
                    })
                  }
                  aria-expanded={open}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {open ? (
                    <ChevronDown className="size-3" aria-hidden />
                  ) : (
                    <ChevronRight className="size-3" aria-hidden />
                  )}
                  {open ? "Fewer settings" : `${hidden} more setting${hidden === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          </Section>
        );
      })}

      {onlyChanged && !anyVisible && (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            Nothing has been changed from its defaults, so AGENT.json is nearly empty.
          </p>
          <Button type="button" size="xs" variant="outline" className="mt-2" onClick={onShowAll}>
            Show every setting
          </Button>
        </div>
      )}
    </div>
  );
}
