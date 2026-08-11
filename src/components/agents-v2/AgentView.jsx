import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  Braces,
  Cpu,
  Database,
  FileText,
  History,
  Info,
  Layers,
  MessageSquare,
  Pencil,
  Rocket,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TARGET_BY_ID, TOOL_POSTURE } from "@/data/agentsV2";
import { useAgentsV2 } from "@/context/AgentsV2Context";
import { HalvesSummary, ToolsChip } from "./FacetChips";
import { KnowledgeDialog, ModelDialog, ReleaseDialog, ToolsDialog } from "./dialogs";
import ChatPanel from "./ChatPanel";

/**
 * The agent screen — one object, two views, two halves.
 *
 * "Form" and "Files" render the same bytes; the toggle is the only thing
 * separating a business user from a skill author. The rails are the halves,
 * and each one is editable in place, because the design's claim is that a
 * missing half is filled in later rather than chosen up front.
 */

const RAIL = "w-full shrink-0 lg:w-[300px]";

function RailSection({ icon: Icon, title, action, children, dashed }) {
  return (
    <section
      className={cn(
        "rounded-xl border bg-card p-3.5",
        dashed ? "border-dashed border-border bg-muted/20" : "border-border",
      )}
    >
      <header className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-foreground uppercase">
          <Icon className="size-3.5 text-muted-foreground" aria-hidden />
          {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

function EditBtn({ onClick, label }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
      <Pencil className="size-3" aria-hidden />
    </Button>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("truncate text-xs font-medium text-foreground", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}

/** The AGENT.md a draft would serialise to. Rendered live as the user types. */
function agentMdFor(draft, agent) {
  const fm = ["---", `name: ${draft.name}`, "description: >-", `  ${draft.description}`];
  if (agent.targets.length) fm.push(`targets: [${agent.targets.join(", ")}]`);
  if (agent.tools === "scoped") fm.push(`tools: [${agent.granted.join(", ")}]`);
  if (agent.tools === "open") fm.push("tools: open     # every tool the caller has");
  if (agent.release) fm.push(`version: ${agent.release.version}`);
  fm.push("---", "");
  return [...fm, draft.instructions].join("\n");
}

export default function AgentView({ agentId, onBack, onDistribute }) {
  const { get, patch } = useAgentsV2();
  const agent = get(agentId);

  const [mode, setMode] = useState("form");
  const [dialog, setDialog] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeFile, setActiveFile] = useState("AGENT.md");

  // Local draft of the editable text. Committed on Save so a half-typed name
  // never propagates to the catalog behind the user's back. Initial state, not
  // an effect: the page keys this component by agentId so it remounts per agent.
  const [draft, setDraft] = useState(() =>
    agent
      ? { name: agent.name, description: agent.description, instructions: agent.instructions }
      : null,
  );

  const dirty = useMemo(() => {
    if (!agent || !draft) return false;
    return (
      draft.name !== agent.name ||
      draft.description !== agent.description ||
      draft.instructions !== agent.instructions
    );
  }, [agent, draft]);

  if (!agent || !draft) return null;

  const posture = TOOL_POSTURE[agent.tools];

  const save = () => {
    patch(agent.id, {
      name: draft.name.trim() || agent.name,
      description: draft.description.trim(),
      instructions: draft.instructions,
    });
    toast.success("Saved");
  };

  const discard = () =>
    setDraft({
      name: agent.name,
      description: agent.description,
      instructions: agent.instructions,
    });

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to agents">
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {agent.name}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{agent.slug}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {dirty && (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={discard}>
                <RotateCcw className="size-3.5" aria-hidden />
                Discard
              </Button>
              <Button type="button" variant="default" size="sm" onClick={save}>
                Save changes
              </Button>
              <Separator orientation="vertical" className="mx-1 h-5" />
            </>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setChatOpen(true)}
            title={agent.runtime ? `Chat on ${agent.runtime.model}` : "No model bound yet"}
          >
            <MessageSquare className="size-3.5" aria-hidden />
            Chat
          </Button>
          <Button type="button" size="sm" onClick={() => setDialog("release")}>
            <Rocket className="size-3.5" aria-hidden />
            {agent.release ? "New release" : "Release"}
          </Button>
        </div>
      </div>

      <HalvesSummary
        agent={agent}
        onFill={(half) => setDialog(half === "here" ? "model" : "release")}
      />

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1 rounded-xl border border-border bg-card p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
              {[
                { id: "form", label: "Form", icon: SlidersHorizontal },
                { id: "files", label: "Files", icon: Layers },
              ].map((m) => (
                <Button
                  key={m.id}
                  type="button"
                  size="xs"
                  variant={mode === m.id ? "secondary" : "ghost"}
                  onClick={() => setMode(m.id)}
                  aria-pressed={mode === m.id}
                >
                  <m.icon className="size-3" aria-hidden />
                  {m.label}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {dirty ? (
                <span className="font-medium text-warning">Unsaved changes</span>
              ) : (
                "Same bytes, two views — switching never converts anything."
              )}
            </p>
          </div>

          {mode === "form" ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="ag-name" className="mb-1.5 block text-xs font-medium text-foreground">
                  Name
                </label>
                <Input id="ag-name" value={draft.name} onChange={set("name")} className="text-sm" />
              </div>

              <div>
                <label htmlFor="ag-desc" className="mb-1.5 block text-xs font-medium text-foreground">
                  Description
                </label>
                <Textarea
                  id="ag-desc"
                  rows={2}
                  value={draft.description}
                  onChange={set("description")}
                  className="resize-none text-sm"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Shown in the catalog and used to decide when this agent is relevant.
                </p>
              </div>

              <div>
                <label htmlFor="ag-inst" className="mb-1.5 block text-xs font-medium text-foreground">
                  Instructions
                </label>
                <Textarea
                  id="ag-inst"
                  rows={10}
                  value={draft.instructions}
                  onChange={set("instructions")}
                  className="resize-none font-mono text-xs leading-6"
                />
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Info className="size-3" aria-hidden />
                  This is the body of <code className="font-mono">AGENT.md</code>. Editing here edits
                  the file — switch to Files to see it.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[380px] flex-col gap-3 sm:flex-row">
              <div className="w-full shrink-0 space-y-0.5 sm:w-[190px]">
                {agent.files.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActiveFile(f)}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-mono text-[11px] transition-colors",
                      activeFile === f
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <FileText className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{f}</span>
                  </button>
                ))}
              </div>

              <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
                <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5">
                  <Braces className="size-3 text-muted-foreground" aria-hidden />
                  <span className="font-mono text-[11px] text-muted-foreground">{activeFile}</span>
                  {activeFile === "AGENT.md" && (
                    <Badge variant="outline" className="ml-auto">
                      entrypoint
                    </Badge>
                  )}
                </div>

                {activeFile === "AGENT.md" ? (
                  <Textarea
                    aria-label="AGENT.md source"
                    value={agentMdFor(draft, agent)}
                    onChange={(e) => {
                      // Frontmatter is owned by the rails; only the body is
                      // editable here, so the two views cannot disagree.
                      const body = e.target.value.split(/^---$/m).slice(2).join("---").replace(/^\n/, "");
                      setDraft((d) => ({ ...d, instructions: body }));
                    }}
                    className="min-h-[320px] flex-1 resize-none rounded-none border-0 bg-muted/30 font-mono text-[11px] leading-5"
                  />
                ) : (
                  <pre className="flex-1 overflow-x-auto bg-muted/30 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
{`# ${activeFile.split("/").pop().replace(/\.\w+$/, "")}

Reference material loaded alongside the
entrypoint when this agent runs.`}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={cn(RAIL, "space-y-3")}>
          <RailSection
            icon={Cpu}
            title="Runs here"
            dashed={!agent.runtime}
            action={agent.runtime && <EditBtn onClick={() => setDialog("model")} label="Change model" />}
          >
            {agent.runtime ? (
              <div className="space-y-0.5">
                <Row label="Provider" value={agent.runtime.provider} />
                <Row label="Model" value={agent.runtime.model} />

                <Separator className="my-2" />
                <div className="flex items-center justify-between gap-2 py-1">
                  <span className="text-xs text-muted-foreground">Tools</span>
                  <div className="flex items-center gap-1">
                    <ToolsChip agent={agent} />
                    <EditBtn onClick={() => setDialog("tools")} label="Change tool access" />
                  </div>
                </div>
                <p className="pt-0.5 text-[11px] leading-4 text-muted-foreground">{posture.blurb}</p>

                <Separator className="my-2" />
                <div className="flex items-center justify-between gap-2 pb-1">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Database className="size-3" aria-hidden />
                    Knowledge
                  </span>
                  <EditBtn onClick={() => setDialog("knowledge")} label="Change knowledge" />
                </div>
                {agent.knowledge.length ? (
                  <div className="flex flex-wrap gap-1">
                    {agent.knowledge.map((k) => (
                      <Badge key={k} variant="outline" className="max-w-full">
                        <span className="truncate">{k}</span>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Nothing attached — answers from the model alone.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs leading-5 text-muted-foreground">
                  No model bound, so this agent cannot be chatted with inside Aziron. It still installs
                  and runs on every target below.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="w-full"
                  onClick={() => setDialog("model")}
                >
                  <Cpu className="size-3" aria-hidden />
                  Set up a runtime
                </Button>
              </div>
            )}
          </RailSection>

          <RailSection
            icon={Boxes}
            title="Runs anywhere"
            dashed={!agent.release}
            action={agent.release && <EditBtn onClick={() => setDialog("release")} label="New release" />}
          >
            {agent.release ? (
              <div className="space-y-0.5">
                <Row label="Version" value={`v${agent.release.version}`} mono />
                <Row label="Published" value={agent.release.published} />
                <Separator className="my-2" />
                <div className="space-y-1.5">
                  {agent.targets.map((t) => {
                    const target = TARGET_BY_ID[t];
                    if (!target) return null;
                    return (
                      <div key={t} className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-foreground">{target.name}</span>
                        <Badge variant="secondary" className="shrink-0">
                          {target.format}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="mt-2 w-full"
                  onClick={onDistribute}
                >
                  View install
                </Button>

                {agent.releaseNotes?.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <History className="size-3" aria-hidden />
                      History
                    </p>
                    <div className="space-y-1">
                      {agent.releaseNotes.slice(0, 3).map((r) => (
                        <div key={r.version} className="text-[11px] text-muted-foreground">
                          <span className="font-mono text-foreground">v{r.version}</span>
                          {r.notes ? ` — ${r.notes}` : ""} · {r.at}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs leading-5 text-muted-foreground">
                  Never released. Releasing snapshots the files at a version so they can be installed
                  outside Aziron.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="w-full"
                  onClick={() => setDialog("release")}
                >
                  <Rocket className="size-3" aria-hidden />
                  Release this agent
                </Button>
              </div>
            )}
          </RailSection>

          <RailSection icon={ShieldCheck} title="Governance">
            <div className="space-y-0.5">
              <Row label="Owner" value={agent.owner} />
              <Row label="Category" value={agent.category} />
              <Row label="Updated" value={agent.updated} />
            </div>
            {agent.tools === "open" && (
              <p className="mt-2 flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-[11px] leading-4 text-foreground">
                <Wrench className="mt-0.5 size-3 shrink-0 text-warning" aria-hidden />
                Unrestricted tool access.
              </p>
            )}
          </RailSection>
        </div>
      </div>

      {/* Mounted only while open, so each opens reflecting the agent as it
          stands right now rather than as it stood when the screen loaded. */}
      {dialog === "model" && (
        <ModelDialog agent={agent} open onOpenChange={() => setDialog(null)} />
      )}
      {dialog === "tools" && (
        <ToolsDialog agent={agent} open onOpenChange={() => setDialog(null)} />
      )}
      {dialog === "knowledge" && (
        <KnowledgeDialog agent={agent} open onOpenChange={() => setDialog(null)} />
      )}
      {dialog === "release" && (
        <ReleaseDialog agent={agent} open onOpenChange={() => setDialog(null)} />
      )}

      {chatOpen && (
        <ChatPanel
          agent={agent}
          onClose={() => setChatOpen(false)}
          onSetupRuntime={() => {
            setChatOpen(false);
            setDialog("model");
          }}
        />
      )}
    </div>
  );
}
