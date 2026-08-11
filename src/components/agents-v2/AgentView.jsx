import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  Cpu,
  Database,
  FileCode,
  GitFork,
  History,
  Loader2,
  MessageSquare,
  Pencil,
  Rocket,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  Wand2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TARGET_BY_ID, TOOL_POSTURE, frontmatterFor } from "@/data/agentsV2";
import { useAgentsV2 } from "@/context/AgentsV2Context";
import { ToolsChip } from "./FacetChips";
import { KnowledgeDialog, ModelDialog, ReleaseDialog, ToolsDialog } from "./dialogs";
import FileTree from "./FileTree";
import SettingsPanel from "./SettingsPanel";
import ChatPanel from "./ChatPanel";

/**
 * The agent screen.
 *
 * Three tabs rather than a wizard: Instructions (what it does), Files (the
 * folder it ships), Settings (how it runs here). The two halves live in the
 * right rail where they are always visible without competing for the header.
 */

const RAIL = "w-full shrink-0 lg:w-[290px]";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const EditBtn = ({ onClick, label }) => (
  <Button type="button" variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
    <Pencil className="size-3" aria-hidden />
  </Button>
);

const Row = ({ label, value, mono }) => (
  <div className="flex items-baseline justify-between gap-3 py-1">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={cn("truncate text-xs font-medium text-foreground", mono && "font-mono")}>{value}</span>
  </div>
);

const TABS = [
  { id: "instructions", label: "Instructions", icon: SlidersHorizontal },
  { id: "files", label: "Files", icon: FileCode },
  { id: "settings", label: "Settings", icon: Wrench },
];

export default function AgentView({ agentId, onBack, onDistribute }) {
  const { get, patch, fork, saveFiles, addFile, addFolder, renameNode, deleteNode, duplicateNode, moveNode } =
    useAgentsV2();
  const agent = get(agentId);

  const [tab, setTab] = useState("instructions");
  const [dialog, setDialog] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [busy, setBusy] = useState("");

  // Identity draft — committed on Save so a half-typed name never reaches the
  // catalog. Initial state, not an effect: the page keys this by agentId.
  const [draft, setDraft] = useState(() =>
    agent ? { name: agent.name, description: agent.description } : null,
  );

  // File content drafts, keyed by path. Structural operations commit
  // immediately; content waits for Save draft.
  const [edits, setEdits] = useState({});
  const [activePath, setActivePath] = useState("AGENT.md");

  const identityDirty = useMemo(
    () => agent && draft && (draft.name !== agent.name || draft.description !== agent.description),
    [agent, draft],
  );
  const dirtyPaths = useMemo(
    () => new Set(Object.keys(edits).filter((p) => edits[p] !== agent?.files.find((f) => f.path === p)?.content)),
    [edits, agent],
  );

  if (!agent || !draft) return null;

  const posture = TOOL_POSTURE[agent.tools];
  const activeFile = agent.files.find((f) => f.path === activePath) ?? agent.files[0];
  const activeContent = edits[activeFile?.path] ?? activeFile?.content ?? "";
  const isEntry = activeFile?.path === "AGENT.md";

  const saveIdentity = () => {
    patch(agent.id, { name: draft.name.trim() || agent.name, description: draft.description.trim() });
    toast.success("Saved");
  };

  const saveDraft = () => {
    saveFiles(agent.id, edits);
    setEdits({});
    toast.success(`${dirtyPaths.size} file${dirtyPaths.size === 1 ? "" : "s"} saved`);
  };

  /** Context-menu actions from the file tree. */
  const onFileAction = (action, node, dirs) => {
    const dir = node.dir ? node.path : node.path.split("/").slice(0, -1).join("/");
    if (action === "newFile") {
      const name = window.prompt("New file name", "notes.md");
      if (name) addFile(agent.id, dir ? `${dir}/${name}` : name, `# ${name.replace(/\.\w+$/, "")}\n\n`);
    } else if (action === "newFolder") {
      const name = window.prompt("New folder name", "references");
      if (name) addFolder(agent.id, dir ? `${dir}/${name}` : name);
    } else if (action === "rename") {
      const next = window.prompt("Rename to", node.path);
      if (next && next !== node.path) {
        renameNode(agent.id, node.path, next);
        if (activePath === node.path) setActivePath(next);
      }
    } else if (action === "duplicate") {
      duplicateNode(agent.id, node.path);
    } else if (action === "move") {
      const target = window.prompt(
        `Move into which folder?\n\n${["(root)", ...dirs].join("\n")}`,
        dirs[0] ?? "",
      );
      if (target !== null) moveNode(agent.id, node.path, target.trim() === "(root)" ? "" : target.trim());
    } else if (action === "delete") {
      if (node.path === "AGENT.md") {
        toast.error("AGENT.md is the entrypoint and cannot be deleted.");
        return;
      }
      if (window.confirm(`Delete ${node.path}?`)) {
        deleteNode(agent.id, node.path);
        if (activePath === node.path) setActivePath("AGENT.md");
      }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
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

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setChatOpen(true)}>
            <MessageSquare className="size-3.5" aria-hidden />
            Chat
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const copy = fork(agent.id);
              if (copy) toast.success(`Forked as “${copy.name}”`);
            }}
          >
            <GitFork className="size-3.5" aria-hidden />
            Fork
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              patch(agent.id, { visibility: agent.visibility === "public" ? "private" : "public" });
              toast.success(agent.visibility === "public" ? "Unpublished" : "Published");
            }}
          >
            <Upload className="size-3.5" aria-hidden />
            {agent.visibility === "public" ? "Unpublish" : "Publish"}
          </Button>
          <Button type="button" size="sm" onClick={() => setDialog("release")}>
            <Rocket className="size-3.5" aria-hidden />
            {agent.release ? "New release" : "Release"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          {/* Tabs */}
          <div className="mb-3 flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
            {TABS.map((t) => (
              <Button
                key={t.id}
                type="button"
                size="sm"
                variant={tab === t.id ? "secondary" : "ghost"}
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
              >
                <t.icon className="size-3.5" aria-hidden />
                {t.label}
                {t.id === "files" && dirtyPaths.size > 0 && (
                  <span className="ml-1 size-1.5 rounded-full bg-warning" aria-label="Unsaved" />
                )}
              </Button>
            ))}
          </div>

          {/* ── Instructions ───────────────────────────────────────────── */}
          {tab === "instructions" && (
            <div className="space-y-4 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-end gap-2">
                {identityDirty && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setDraft({ name: agent.name, description: agent.description })}
                    >
                      <RotateCcw className="size-3" aria-hidden />
                      Discard
                    </Button>
                    <Button type="button" size="xs" onClick={saveIdentity}>
                      Save
                    </Button>
                  </>
                )}
              </div>

              <div>
                <label htmlFor="ag-name" className="mb-1.5 block text-xs font-medium text-foreground">
                  Name
                </label>
                <Input
                  id="ag-name"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="text-sm"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="ag-desc" className="text-xs font-medium text-foreground">
                    Description
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={busy === "desc"}
                    onClick={async () => {
                      setBusy("desc");
                      await sleep(700);
                      setDraft((d) => ({
                        ...d,
                        description: `${d.name}. ${d.description || "Cites the source it used"}, and says plainly when something is not covered.`
                          .replace(/\s+/g, " ")
                          .slice(0, 220),
                      }));
                      setBusy("");
                      toast.success("Description drafted");
                    }}
                  >
                    {busy === "desc" ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                    ) : (
                      <Wand2 className="size-3" aria-hidden />
                    )}
                    Generate
                  </Button>
                </div>
                <Textarea
                  id="ag-desc"
                  rows={2}
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  className="resize-none text-sm"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="ag-inst" className="text-xs font-medium text-foreground">
                    Instructions <span className="font-normal text-muted-foreground">— body of AGENT.md</span>
                  </label>
                  {dirtyPaths.has("AGENT.md") && (
                    <Button type="button" size="xs" onClick={saveDraft}>
                      <Save className="size-3" aria-hidden />
                      Save draft
                    </Button>
                  )}
                </div>
                <Textarea
                  id="ag-inst"
                  rows={14}
                  value={edits["AGENT.md"] ?? agent.files.find((f) => f.path === "AGENT.md")?.content ?? ""}
                  onChange={(e) => setEdits((s) => ({ ...s, "AGENT.md": e.target.value }))}
                  className="resize-none font-mono text-xs leading-6"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  This is the file itself — the Files tab shows the same bytes.
                </p>
              </div>
            </div>
          )}

          {/* ── Files ──────────────────────────────────────────────────── */}
          {tab === "files" && (
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  Right-click for new, rename, duplicate, move and delete.
                </p>
                <Button type="button" size="xs" onClick={saveDraft} disabled={dirtyPaths.size === 0}>
                  <Save className="size-3" aria-hidden />
                  {dirtyPaths.size ? `Save draft (${dirtyPaths.size})` : "Saved"}
                </Button>
              </div>

              <div className="flex min-h-[440px] flex-col sm:flex-row">
                <div className="w-full shrink-0 border-b border-border p-2 sm:w-[210px] sm:border-r sm:border-b-0">
                  <FileTree
                    files={agent.files}
                    folders={agent.folders}
                    activePath={activePath}
                    dirtyPaths={dirtyPaths}
                    onSelect={setActivePath}
                    onAction={onFileAction}
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                    <span className="font-mono text-[11px] text-muted-foreground">{activeFile?.path}</span>
                    {isEntry && (
                      <Badge variant="outline" className="ml-auto">
                        entrypoint
                      </Badge>
                    )}
                  </div>

                  {isEntry && (
                    <pre className="border-b border-border bg-muted/40 px-3 py-2 font-mono text-[10px] leading-4 text-muted-foreground">
                      {frontmatterFor(agent)}
                      {"\n"}
                      <span className="text-[9px] italic">
                        ↑ generated from Settings — edit those, not this
                      </span>
                    </pre>
                  )}

                  <Textarea
                    aria-label={`${activeFile?.path} content`}
                    value={activeContent}
                    onChange={(e) => setEdits((s) => ({ ...s, [activeFile.path]: e.target.value }))}
                    className="min-h-[360px] flex-1 resize-none rounded-none border-0 bg-transparent font-mono text-[11px] leading-5 focus-visible:ring-0"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Settings ───────────────────────────────────────────────── */}
          {tab === "settings" && <SettingsPanel agent={agent} onOpenDialog={setDialog} />}
        </div>

        {/* ── Rails: the two halves ─────────────────────────────────────── */}
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
                <p className="text-[11px] leading-4 text-muted-foreground">{posture.blurb}</p>
                <Separator className="my-2" />
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Database className="size-3" aria-hidden />
                    Knowledge
                  </span>
                  <EditBtn onClick={() => setDialog("knowledge")} label="Change knowledge" />
                </div>
                {agent.knowledge.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {agent.knowledge.map((k) => (
                      <Badge key={k} variant="outline" className="max-w-full">
                        <span className="truncate">{k}</span>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Nothing attached.</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs leading-5 text-muted-foreground">
                  No model bound, so it cannot be chatted with here. It still installs and runs on its targets.
                </p>
                <Button type="button" variant="outline" size="xs" className="w-full" onClick={() => setDialog("model")}>
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
                <Button type="button" variant="ghost" size="xs" className="mt-2 w-full" onClick={onDistribute}>
                  View install
                </Button>
                {agent.releaseNotes?.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <History className="size-3" aria-hidden />
                      History
                    </p>
                    {agent.releaseNotes.slice(0, 3).map((r) => (
                      <div key={r.version} className="text-[11px] text-muted-foreground">
                        <span className="font-mono text-foreground">v{r.version}</span>
                        {r.notes ? ` — ${r.notes}` : ""} · {r.at}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs leading-5 text-muted-foreground">
                  Never released. Releasing snapshots the files at a version so they install outside Aziron.
                </p>
                <Button type="button" variant="outline" size="xs" className="w-full" onClick={() => setDialog("release")}>
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
              <Row label="Visibility" value={agent.visibility === "public" ? "Public" : "Private"} />
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

      {dialog === "model" && <ModelDialog agent={agent} open onOpenChange={() => setDialog(null)} />}
      {dialog === "tools" && <ToolsDialog agent={agent} open onOpenChange={() => setDialog(null)} />}
      {dialog === "knowledge" && <KnowledgeDialog agent={agent} open onOpenChange={() => setDialog(null)} />}
      {dialog === "release" && <ReleaseDialog agent={agent} open onOpenChange={() => setDialog(null)} />}

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
