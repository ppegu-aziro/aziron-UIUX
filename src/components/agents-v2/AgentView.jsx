import { useState } from "react";
import {
  ArrowLeft,
  Boxes,
  Braces,
  Cpu,
  Database,
  FileText,
  Info,
  Layers,
  MessageSquare,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { TARGET_BY_ID, TOOL_POSTURE, toAgentMd } from "@/data/agentsV2";
import { HalvesSummary, ToolsChip } from "./FacetChips";

/**
 * The agent screen.
 *
 * Two authoring postures used to exist: a 4-step wizard (agents) and a file
 * editor (skills). Neither could reach the other's object. Here they are two
 * VIEWS of one object — "Form" and "Files" render the same bytes, and the
 * toggle between them is the only thing separating a business user from a
 * skill author.
 *
 * The rails are the two halves. Absent halves stay visible and dashed rather
 * than collapsing, because the empty state IS the migration story.
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

/* ── Form view: the frontmatter, rendered as controls ────────────────────── */

function FormView({ agent }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">Name</label>
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
          {agent.name}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">Description</label>
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          {agent.description}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Shown in the catalog and used to decide when this agent is relevant.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">Instructions</label>
        <div className="min-h-[180px] rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground">
          <p className="font-medium"># {agent.name}</p>
          <p className="mt-2 text-muted-foreground">{agent.description}</p>
          <p className="mt-3 text-muted-foreground">
            Use the references in this folder before answering. When something is not covered, say so
            rather than guessing.
          </p>
        </div>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Info className="size-3" aria-hidden />
          This is the body of <code className="font-mono">AGENT.md</code>. Editing here edits the file.
        </p>
      </div>
    </div>
  );
}

/* ── Files view: the same object, as a tree + source ─────────────────────── */

function FilesView({ agent }) {
  const [active, setActive] = useState(agent.files[0]);
  const isEntry = active === "AGENT.md";

  return (
    <div className="flex min-h-[380px] gap-3">
      <div className="w-[190px] shrink-0 space-y-0.5">
        {agent.files.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setActive(f)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-mono text-[11px] transition-colors",
              active === f
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <FileText className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{f}</span>
          </button>
        ))}
      </div>

      <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5">
          <Braces className="size-3 text-muted-foreground" aria-hidden />
          <span className="font-mono text-[11px] text-muted-foreground">{active}</span>
          {isEntry && (
            <Badge variant="outline" className="ml-auto">
              entrypoint
            </Badge>
          )}
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-5 text-foreground">
          {isEntry
            ? toAgentMd(agent)
            : `# ${active.split("/").pop().replace(/\.\w+$/, "")}\n\nReference material loaded alongside\nthe entrypoint when this agent runs.\n`}
        </pre>
      </div>
    </div>
  );
}

/* ── Screen ──────────────────────────────────────────────────────────────── */

export default function AgentView({ agent, onBack, onDistribute }) {
  const [mode, setMode] = useState("form");
  const posture = TOOL_POSTURE[agent.tools];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to agents">
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">{agent.name}</h2>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{agent.slug}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!agent.runtime}>
            <MessageSquare className="size-3.5" aria-hidden />
            Chat
          </Button>
          <Button type="button" size="sm" onClick={onDistribute}>
            <Rocket className="size-3.5" aria-hidden />
            {agent.release ? "Manage release" : "Release"}
          </Button>
        </div>
      </div>

      <HalvesSummary agent={agent} />

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Authoring surface */}
        <div className="min-w-0 flex-1 rounded-xl border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
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
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              Same bytes, two views — switching never converts anything.
            </p>
          </div>

          {mode === "form" ? <FormView agent={agent} /> : <FilesView agent={agent} />}
        </div>

        {/* The two halves, as rails */}
        <div className={cn(RAIL, "space-y-3")}>
          <RailSection icon={Cpu} title="Runs here" dashed={!agent.runtime}>
            {agent.runtime ? (
              <div className="space-y-0.5">
                <Row label="Provider" value={agent.runtime.provider} />
                <Row label="Model" value={agent.runtime.model} />
                <Separator className="my-2" />
                <div className="flex items-center justify-between gap-2 py-1">
                  <span className="text-xs text-muted-foreground">Tools</span>
                  <ToolsChip agent={agent} />
                </div>
                <p className="pt-1 text-[11px] leading-4 text-muted-foreground">{posture.blurb}</p>
                {agent.knowledge.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex items-center gap-1.5 pb-1">
                      <Database className="size-3 text-muted-foreground" aria-hidden />
                      <span className="text-xs text-muted-foreground">Knowledge</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {agent.knowledge.map((k) => (
                        <Badge key={k} variant="outline" className="max-w-full">
                          <span className="truncate">{k}</span>
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs leading-5 text-muted-foreground">
                  No model bound, so this agent cannot be chatted with inside Aziron. It still installs
                  and runs on every target below.
                </p>
                <Button type="button" variant="outline" size="xs" className="w-full">
                  <Sparkles className="size-3" aria-hidden />
                  Set up a runtime
                </Button>
              </div>
            )}
          </RailSection>

          <RailSection icon={Boxes} title="Runs anywhere" dashed={!agent.release}>
            {agent.release ? (
              <div className="space-y-0.5">
                <Row label="Version" value={`v${agent.release.version}`} mono />
                <Row label="Published" value={agent.release.published} />
                <Separator className="my-2" />
                <div className="space-y-1.5">
                  {agent.targets.map((t) => {
                    const target = TARGET_BY_ID[t];
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
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs leading-5 text-muted-foreground">
                  Never released. Releasing snapshots the files at a version so they can be installed
                  outside Aziron.
                </p>
                <Button type="button" variant="outline" size="xs" className="w-full" onClick={onDistribute}>
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
          </RailSection>
        </div>
      </div>
    </div>
  );
}
