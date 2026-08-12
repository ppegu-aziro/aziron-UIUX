import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, Check, Cpu, Database, Rocket, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  KNOWLEDGE_SOURCES,
  PROVIDERS,
  TARGETS,
  TOOL_CATALOG,
  bumpVersion,
} from "@/data/agentsV2";
import { useAgentsV2 } from "@/context/AgentsV2Context";

/* ── shared bits ─────────────────────────────────────────────────────────── */

function Tick({ on }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
        on ? "border-primary bg-primary text-primary-foreground" : "border-input",
      )}
    >
      {on && <Check className="size-2.5" aria-hidden />}
    </span>
  );
}

function Pick({ on, onClick, title, note, right, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
        on ? "border-primary/45 bg-primary/5" : "border-border hover:border-primary/25",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <Tick on={on} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{title}</span>
        {note && <span className="block truncate text-[11px] text-muted-foreground">{note}</span>}
      </span>
      {right}
    </button>
  );
}

/* ── Model ───────────────────────────────────────────────────────────────── */

/**
 * Picking a model is what makes an agent testable inside Aziron, so this
 * dialog is the one that visibly converts a former skill into something you
 * can talk to. It leads with Automatic because choosing a specific model up
 * front is the decision users are least equipped to make.
 */
export function ModelDialog({ agent, open, onOpenChange }) {
  const { setRuntime, clearRuntime } = useAgentsV2();
  const [choice, setChoice] = useState(agent?.runtime ?? null);

  const save = () => {
    if (choice) {
      setRuntime(agent.id, choice);
      toast.success(`${agent.name} now uses ${choice.model}`);
    } else {
      clearRuntime(agent.id);
      toast.message(`${agent.name} has no model — it cannot be tried here`);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="size-4 text-muted-foreground" aria-hidden />
            Pick a model
          </DialogTitle>
          <DialogDescription>
            The model this agent thinks with inside Aziron. A released copy uses whatever model its
            host provides, so this does not travel with it.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
          {PROVIDERS.map((p) => (
            <div key={p.id}>
              <p className="mb-1.5 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                {p.name}
              </p>
              <div className="space-y-1.5">
                {p.models.map((m) => (
                  <Pick
                    key={m.id}
                    on={choice?.model === m.id}
                    onClick={() => setChoice({ provider: p.name, model: m.id })}
                    title={m.id}
                    note={m.note}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!agent?.runtime}
            onClick={() => setChoice(null)}
          >
            Unbind
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={save}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Tools ───────────────────────────────────────────────────────────────── */

/**
 * Posture first, then the list.
 *
 * "Open" is presented with its real consequence spelled out rather than as a
 * neutral third option, because today it is both the permissive state and the
 * invisible one — an empty allow-list already means every tool.
 */
export function ToolsDialog({ agent, open, onOpenChange }) {
  const { setTools } = useAgentsV2();
  const [posture, setPosture] = useState(agent?.tools ?? "none");
  const [granted, setGranted] = useState(agent?.granted ?? []);

  const toggle = (t) =>
    setGranted((g) => (g.includes(t) ? g.filter((x) => x !== t) : [...g, t]));

  // Choosing "scoped" and ticking nothing is indistinguishable from "none" at
  // runtime, so it is blocked rather than silently saved as a stricter-looking
  // version of the same thing.
  const invalid = posture === "scoped" && granted.length === 0;

  const save = () => {
    setTools(agent.id, { tools: posture, granted });
    toast.success(
      posture === "scoped"
        ? `${granted.length} tools granted to ${agent.name}`
        : posture === "open"
          ? `${agent.name} can use every tool`
          : `${agent.name} has no tools`,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" aria-hidden />
            Tool access
          </DialogTitle>
          <DialogDescription>What this agent is allowed to call while it runs.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Pick
            on={posture === "none"}
            onClick={() => setPosture("none")}
            title="No tools"
            note="Instructions only. Cannot call anything."
          />
          <Pick
            on={posture === "scoped"}
            onClick={() => setPosture("scoped")}
            title="Scoped"
            note="Only the tools ticked below."
            right={<ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden />}
          />
          <Pick
            on={posture === "open"}
            onClick={() => setPosture("open")}
            title="Open"
            note="Every tool available to whoever runs it."
            right={<AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden />}
          />
        </div>

        {posture === "open" && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] leading-4 text-foreground">
            This agent will appear under <strong>“can use every tool”</strong> in the catalog, and any
            tool added to the workspace later is granted to it automatically.
          </p>
        )}

        {posture === "scoped" && (
          <div className="max-h-[34vh] space-y-3 overflow-y-auto pr-1">
            {TOOL_CATALOG.map((c) => (
              <div key={c.category}>
                <p className="mb-1.5 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                  {c.category}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {c.tools.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggle(t)}
                      aria-pressed={granted.includes(t)}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                        granted.includes(t)
                          ? "border-primary/45 bg-primary/5"
                          : "border-border hover:border-primary/25",
                      )}
                    >
                      <Tick on={granted.includes(t)} />
                      <span className="truncate font-mono text-[11px] text-foreground">{t}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <span className="self-center text-[11px] text-muted-foreground">
            {posture === "scoped" ? `${granted.length} selected` : ""}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={invalid}>
              {invalid ? "Pick at least one" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Knowledge ───────────────────────────────────────────────────────────── */

export function KnowledgeDialog({ agent, open, onOpenChange }) {
  const { setKnowledge } = useAgentsV2();
  const [picked, setPicked] = useState(agent?.knowledge ?? []);

  const toggle = (name) =>
    setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="size-4 text-muted-foreground" aria-hidden />
            Knowledge
          </DialogTitle>
          <DialogDescription>
            What this agent answers from. With nothing attached it answers from the model alone.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
          {KNOWLEDGE_SOURCES.map((s) => (
            <Pick
              key={s.id}
              on={picked.includes(s.name)}
              onClick={() => toggle(s.name)}
              title={s.name}
              note={s.meta}
            />
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setKnowledge(agent.id, picked);
              toast.success(
                picked.length
                  ? `${picked.length} source${picked.length === 1 ? "" : "s"} attached`
                  : "Knowledge detached",
              );
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Release ─────────────────────────────────────────────────────────────── */

/**
 * Releasing fills the "runs anywhere" half. The dialog shows what will actually
 * ship, because a release is the moment the files stop being yours to change
 * quietly — everything after this is installed on somebody's machine.
 */
export function ReleaseDialog({ agent, open, onOpenChange }) {
  const { release, agentFiles } = useAgentsV2();
  const [kind, setKind] = useState(agent?.release ? "minor" : "patch");
  const [notes, setNotes] = useState("");
  const [targets, setLocalTargets] = useState(
    agent?.targets?.length ? agent.targets : ["claude"],
  );

  const next = useMemo(
    () => (agent?.release ? bumpVersion(agent.release.version, kind) : "1.0.0"),
    [agent, kind],
  );

  const first = !agent?.release;

  /**
   * What actually ships, entrypoint first.
   *
   * Read through the projection: AGENT.json is generated and therefore absent
   * from the record, and this is the one screen that tells someone what a
   * release contains. Listing the folder without the file that configures it
   * would be a lie at exactly the moment it matters.
   */
  const ENTRY_FIRST = { "AGENT.md": 0, "AGENT.json": 1 };
  const shipping = [...(agentFiles(agent?.id) ?? [])].sort(
    (a, b) => (ENTRY_FIRST[a.path] ?? 2) - (ENTRY_FIRST[b.path] ?? 2) || a.path.localeCompare(b.path),
  );

  const go = () => {
    // One patch, not two. Between a separate setTargets and release the record
    // holds the new targets with the old version, and anything serialising in
    // that window disagrees with the release that ships it.
    release(agent.id, { kind, notes, targets });
    toast.success(`${agent.name} v${next} released`, {
      description: `Installable into ${targets.length} target${targets.length === 1 ? "" : "s"}.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="size-4 text-muted-foreground" aria-hidden />
            {first ? "Release this agent" : "New release"}
          </DialogTitle>
          <DialogDescription>
            {first
              ? "A release snapshots the files at a version so they can be installed outside Aziron."
              : "Publishes a new immutable version. Installed copies stay on their current version until updated."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!first && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-foreground">Version</p>
              <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
                {["patch", "minor", "major"].map((k) => (
                  <Button
                    key={k}
                    type="button"
                    size="xs"
                    variant={kind === k ? "secondary" : "ghost"}
                    onClick={() => setKind(k)}
                    aria-pressed={kind === k}
                    className="flex-1 capitalize"
                  >
                    {k}
                  </Button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                v{agent.release.version} → <span className="font-mono text-foreground">v{next}</span>
              </p>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">Targets</p>
            <div className="space-y-1.5">
              {TARGETS.map((t) => (
                <Pick
                  key={t.id}
                  on={targets.includes(t.id)}
                  onClick={() =>
                    setLocalTargets((s) =>
                      s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id],
                    )
                  }
                  title={t.name}
                  note={`${t.path}${agent?.slug ?? ""}/`}
                  right={
                    <Badge variant="outline" className="shrink-0">
                      {t.format}
                    </Badge>
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">
              What changed <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Added a Linux branch to preparation."
              className="resize-none text-sm"
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-foreground">
              <Boxes className="size-3 text-muted-foreground" aria-hidden />
              Ships in v{next}
              <span className="font-normal text-muted-foreground">
                · {shipping.length} file{shipping.length === 1 ? "" : "s"}
              </span>
            </p>
            <div className="flex flex-wrap gap-1">
              {/* files are {path, content} — rendering the object itself is
                  what took this dialog down. */}
              {shipping.map((f) => (
                <span
                  key={f.path}
                  className="rounded bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {f.path}
                </span>
              ))}
            </div>
            {/* The distinction the config file makes concrete: the package half
                travels, the runtime half does not. */}
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
              AGENT.json ships with its <span className="text-foreground">package</span> settings only —
              the model, credentials and retrieval stay on this workspace.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={go} disabled={targets.length === 0}>
            {targets.length === 0 ? "Pick a target" : `Release v${next}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
