import { useState } from "react";
import { Cpu, Database, KeyRound, Plus, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { API_TOKENS, CATEGORIES, PROVIDERS, TOOL_POSTURE, VECTOR_DBS } from "@/data/agentsV2";
import { useAgentsV2 } from "@/context/AgentsV2Context";
import { ToolsChip } from "./FacetChips";

/**
 * Everything the v1 agent form carried, on one screen instead of four wizard
 * steps — plus the distinction v1 could not make.
 *
 * Runtime settings (model, credentials, sampling, RAG) apply ONLY when the
 * agent runs inside Aziron. They are not part of the released package and do
 * not travel to Claude Code or Codex. The section says so, because a user who
 * tunes temperature and then finds it ignored on their laptop has been misled
 * by the UI rather than by the runtime.
 */

function Section({ icon: Icon, title, note, children, muted }) {
  return (
    <section className={cn("rounded-xl border bg-card p-4", muted ? "border-dashed border-border" : "border-border")}>
      <header className="mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Icon className="size-3.5 text-muted-foreground" aria-hidden />
          {title}
        </h3>
        {note && <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{note}</p>}
      </header>
      {children}
    </section>
  );
}

function Field({ label, hint, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({ id, label, hint, checked, onChange, disabled }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="text-xs font-medium text-foreground">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export default function SettingsPanel({ agent, onOpenDialog }) {
  const { patch, setTools } = useAgentsV2();
  const [qpLabel, setQpLabel] = useState("");
  const [qpPrompt, setQpPrompt] = useState("");

  const bound = Boolean(agent.runtime);
  const provider = PROVIDERS.find((p) => p.name === agent.runtime?.provider);
  const tokens = API_TOKENS[agent.runtime?.provider] ?? [];
  const db = VECTOR_DBS.find((d) => d.id === agent.vectorDbId);

  const addQuickPrompt = () => {
    if (!qpLabel.trim() || !qpPrompt.trim()) return;
    patch(agent.id, {
      quickPrompts: [...agent.quickPrompts, { label: qpLabel.trim(), prompt: qpPrompt.trim() }],
    });
    setQpLabel("");
    setQpPrompt("");
    toast.success("Quick prompt added");
  };

  return (
    <div className="space-y-3">
      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <Section icon={Sparkles} title="Identity" note="Shown in the catalog and used to decide when this agent is relevant.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" htmlFor="set-cat" hint="What v1 called a label.">
            <Select value={agent.category} onValueChange={(v) => patch(agent.id, { category: v })}>
              <SelectTrigger id="set-cat" className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status" htmlFor="set-status">
            <Select value={agent.status} onValueChange={(v) => patch(agent.id, { status: v })}>
              <SelectTrigger id="set-status" className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["active", "idle", "error", "disabled"].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Section>

      {/* ── Model configuration — Aziron only ────────────────────────────── */}
      <Section
        icon={Cpu}
        title="Model configuration"
        muted={!bound}
        note="Applies inside Aziron only. A released copy uses whatever model and tools its host provides."
      >
        {!bound ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">No model bound, so this agent cannot run here.</p>
            <Button type="button" variant="outline" size="xs" onClick={() => onOpenDialog("model")}>
              <Cpu className="size-3" aria-hidden />
              Bind a model
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provider" htmlFor="set-prov">
                <Select
                  value={agent.runtime.provider}
                  onValueChange={(v) => {
                    const p = PROVIDERS.find((x) => x.name === v);
                    patch(agent.id, {
                      runtime: { provider: v, model: p.models[0].id },
                      apiTokenId: (API_TOKENS[v] ?? [])[0]?.id ?? "",
                    });
                  }}
                >
                  <SelectTrigger id="set-prov" className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Model" htmlFor="set-model">
                <Select
                  value={agent.runtime.model}
                  onValueChange={(v) => patch(agent.id, { runtime: { ...agent.runtime, model: v } })}
                >
                  <SelectTrigger id="set-model" className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(provider?.models ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field
              label="API token"
              htmlFor="set-token"
              hint="A saved credential. Never written into a release — it stays on the runtime."
            >
              <Select value={agent.apiTokenId} onValueChange={(v) => patch(agent.id, { apiTokenId: v })}>
                <SelectTrigger id="set-token" className="text-sm">
                  <SelectValue placeholder="Select a token" />
                </SelectTrigger>
                <SelectContent>
                  {tokens.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <KeyRound className="size-3 text-muted-foreground" aria-hidden />
                        {t.label}
                        <span className="font-mono text-[10px] text-muted-foreground">{t.masked}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={`Temperature · ${agent.temperature}`} htmlFor="set-temp">
                <input
                  id="set-temp"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={agent.temperature}
                  onChange={(e) => patch(agent.id, { temperature: Number(e.target.value) })}
                  className="w-full accent-primary"
                />
              </Field>
              <Field label="Max tokens" htmlFor="set-maxtok">
                <Input
                  id="set-maxtok"
                  type="number"
                  value={agent.maxTokens}
                  onChange={(e) => patch(agent.id, { maxTokens: Number(e.target.value) })}
                  className="h-8 text-sm"
                />
              </Field>
              <Field label="Max iterations" htmlFor="set-maxiter">
                <Input
                  id="set-maxiter"
                  type="number"
                  value={agent.maxIterations}
                  onChange={(e) => patch(agent.id, { maxIterations: Number(e.target.value) })}
                  className="h-8 text-sm"
                />
              </Field>
            </div>
          </div>
        )}
      </Section>

      {/* ── Tools ────────────────────────────────────────────────────────── */}
      <Section icon={Wrench} title="Tools" note="What this agent may call while it runs.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ToolsChip agent={agent} />
            <span className="text-[11px] text-muted-foreground">{TOOL_POSTURE[agent.tools].blurb}</span>
          </div>
          <Button type="button" variant="outline" size="xs" onClick={() => onOpenDialog("tools")}>
            Configure
          </Button>
        </div>

        {agent.tools === "scoped" && agent.granted.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {agent.granted.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground"
              >
                {t}
                <button
                  type="button"
                  onClick={() =>
                    setTools(agent.id, { tools: "scoped", granted: agent.granted.filter((x) => x !== t) })
                  }
                  aria-label={`Revoke ${t}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-2.5" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* ── Knowledge / RAG ──────────────────────────────────────────────── */}
      <Section
        icon={Database}
        title="Knowledge & retrieval"
        muted={!bound}
        note="Aziron-side retrieval. A released copy answers from its files alone unless the host provides its own retrieval."
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vector database" htmlFor="set-vdb">
              <Select
                value={agent.vectorDbId || "none"}
                onValueChange={(v) =>
                  patch(agent.id, { vectorDbId: v === "none" ? "" : v, collections: [] })
                }
              >
                <SelectTrigger id="set-vdb" className="text-sm">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {VECTOR_DBS.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Sources" htmlFor="set-src">
              <Button
                id="set-src"
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => onOpenDialog("knowledge")}
              >
                <Database className="size-3.5" aria-hidden />
                {agent.knowledge.length ? `${agent.knowledge.length} attached` : "Attach sources"}
              </Button>
            </Field>
          </div>

          {db && (
            <Field label="Collections" hint="Narrow retrieval to part of the database.">
              <div className="flex flex-wrap gap-1.5">
                {db.collections.map((c) => {
                  const on = agent.collections.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        patch(agent.id, {
                          collections: on
                            ? agent.collections.filter((x) => x !== c)
                            : [...agent.collections, c],
                        })
                      }
                      aria-pressed={on}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors",
                        on
                          ? "border-primary/45 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30",
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {agent.knowledge.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {agent.knowledge.map((k) => (
                <Badge key={k} variant="outline">
                  {k}
                </Badge>
              ))}
            </div>
          )}

          <Separator />

          <Toggle
            id="set-rag"
            label="RAG mode"
            hint="Retrieve before answering, and cite what was retrieved."
            checked={agent.ragMode}
            onChange={(v) => patch(agent.id, { ragMode: v })}
          />
          <Toggle
            id="set-vs"
            label="Vector search"
            hint="Semantic search across the selected collections."
            checked={agent.vectorSearch}
            onChange={(v) => patch(agent.id, { vectorSearch: v })}
          />
        </div>
      </Section>

      {/* ── Quick prompts ────────────────────────────────────────────────── */}
      <Section icon={Sparkles} title="Quick prompts" note="Starter buttons shown above the composer in chat.">
        {agent.quickPrompts.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {agent.quickPrompts.map((q, i) => (
              <div key={`${q.label}-${i}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <Badge variant="secondary" className="shrink-0">
                  {q.label}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{q.prompt}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${q.label}`}
                  onClick={() =>
                    patch(agent.id, { quickPrompts: agent.quickPrompts.filter((_, x) => x !== i) })
                  }
                >
                  <Trash2 className="size-3 text-destructive" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={qpLabel}
            onChange={(e) => setQpLabel(e.target.value)}
            placeholder="Label"
            aria-label="Quick prompt label"
            className="h-8 text-sm sm:w-36"
          />
          <Input
            value={qpPrompt}
            onChange={(e) => setQpPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addQuickPrompt()}
            placeholder="The prompt this button sends"
            aria-label="Quick prompt text"
            className="h-8 flex-1 text-sm"
          />
          <Button type="button" size="sm" onClick={addQuickPrompt} disabled={!qpLabel.trim() || !qpPrompt.trim()}>
            <Plus className="size-3.5" aria-hidden />
            Add
          </Button>
        </div>
      </Section>

      {/* ── Summary ──────────────────────────────────────────────────────── */}
      <Section icon={Sparkles} title="Summary" note="What this agent is, in the terms the new model uses.">
        <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
          {[
            ["Model", agent.runtime ? `${agent.runtime.provider} · ${agent.runtime.model}` : "Not set up"],
            ["Release", agent.release ? `v${agent.release.version} · ${agent.targets.length} targets` : "Not released"],
            ["Tools", agent.tools === "scoped" ? `${agent.granted.length} granted` : TOOL_POSTURE[agent.tools].label],
            ["Knowledge", agent.knowledge.length ? `${agent.knowledge.length} sources` : "None"],
            ["Retrieval", [agent.ragMode && "RAG", agent.vectorSearch && "Vector search"].filter(Boolean).join(", ") || "Off"],
            ["Files", `${agent.files.length}`],
            ["Quick prompts", `${agent.quickPrompts.length}`],
            ["Visibility", agent.visibility === "public" ? "Public" : "Private"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border py-1 last:border-0">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate font-medium text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
