import { useMemo } from "react";
import { Boxes, Cpu, Database, MessageSquare, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FIELDS, SECTIONS, fieldsIn } from "@/data/agentJsonSchema";
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
 * It opens on Common rather than showing all twenty-odd fields, because this
 * screen already learned that lesson once: the tabbed layout was removed for
 * handing a nine-section configuration form to someone who had not yet written
 * a sentence, and a complete generated form re-creates exactly that.
 */

const ICONS = {
  package: Boxes,
  runtime: Cpu,
  knowledge: Database,
  chat: MessageSquare,
  workspace: Sparkles,
};

const TIERS = [
  { id: "common", label: "Common" },
  { id: "changed", label: "Only changed" },
  { id: "all", label: "All" },
];

export default function AgentJsonForm({ agent, tier, onTierChange, onEdit, onFocusPath, cursorPath }) {
  // Built from the record so the form still renders when the text is broken.
  // Reading the half-typed document instead would hand every control undefined
  // at exactly the moment the form is the only surface still working.
  const doc = useMemo(() => toDoc(agent), [agent]);
  const changed = useMemo(() => changedPaths(agent), [agent]);
  const ctx = { doc, agent };

  const visible = (spec) => {
    if (spec.when && !spec.when(ctx)) return false;
    if (tier === "all") return true;
    if (tier === "changed") return changed.has(spec.path);
    return spec.tier === "common";
  };

  const shown = FIELDS.filter(visible);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
          {TIERS.map((t) => (
            <Button
              key={t.id}
              type="button"
              size="xs"
              variant={tier === t.id ? "secondary" : "ghost"}
              aria-pressed={tier === t.id}
              onClick={() => onTierChange(t.id)}
            >
              {t.label}
              {t.id === "changed" && changed.size > 0 && (
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">{changed.size}</span>
              )}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {shown.length} of {FIELDS.length} settings
        </p>
      </div>

      {SECTIONS.map((section) => {
        const specs = fieldsIn(section.id).filter(visible);
        if (!specs.length) return null;
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
            </div>
          </Section>
        );
      })}

      {tier === "changed" && changed.size === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          Nothing has been changed from its default yet, so AGENT.json is nearly empty.
        </p>
      )}
    </div>
  );
}
