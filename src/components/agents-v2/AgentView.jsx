import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Eye,
  GitFork,
  MessageSquare,
  MoreVertical,
  PenLine,
  Rocket,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAgentsV2 } from "@/context/AgentsV2Context";
import { KnowledgeDialog, ModelDialog, ReleaseDialog, ToolsDialog } from "./dialogs";
import FileTree from "./FileTree";
import SettingsPanel from "./SettingsPanel";
import MarkdownPreview from "./MarkdownPreview";
import AgentHalvesBar from "./AgentHalvesBar";
import ReleasesPanel from "./ReleasesPanel";
import FrontmatterEditor from "./FrontmatterEditor";
import { FileNameDialog, MoveFileDialog } from "./FileDialogs";

/**
 * The agent workspace.
 *
 * Not a tabbed editor. Three tabs asserted that Instructions, Files and
 * Settings were parallel, order-free destinations — which handed a nine-section
 * configuration form to someone who had not yet written a sentence, and hid the
 * folder behind a tab even though the folder IS the agent.
 *
 * So: the folder is permanently on the left, the file you picked fills the
 * middle, the two halves sit under the header, and configuration is a sheet
 * opened from the half that owns it.
 *
 * Everything commits as you type. There is no Save. Two writers — you and the
 * Assistant — write to the same store, so a generation cannot be clobbered by a
 * stale save, and the panel's premise (watch the files change) is literally
 * true rather than a sync promise you have to trust.
 */

/** The folder contract, taught as a placeholder: never saved, never released. */
const SCAFFOLD = `#
One sentence on what this agent does.

## How to answer
- The rules it follows every time. Two or three is plenty.

## When to ask first
- What it must never guess at.`;

export default function AgentView({ agentId, onBack, onDistribute, onChat, onAssistant, assistantOpen }) {
  const {
    get,
    patch,
    fork,
    saveFiles,
    addFile,
    addFolder,
    renameNode,
    deleteNode,
    duplicateNode,
    moveNode,
  } = useAgentsV2();
  const agent = get(agentId);

  const [dialog, setDialog] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [releasesOpen, setReleasesOpen] = useState(false);
  // { mode, node, dirs } — one piece of state for every file operation.
  const [fileOp, setFileOp] = useState(null);
  const [mode, setMode] = useState("edit");
  const [activePath, setActivePath] = useState("AGENT.md");
  const [pendingDelete, setPendingDelete] = useState(null);

  // Buffer for the file being typed into, flushed to the store shortly after
  // typing stops. Keeps every keystroke off global state without reintroducing
  // a Save button someone can forget to press.
  //
  // Keyed by path rather than cleared by an effect: switching files then simply
  // stops matching, which is one fewer render and one fewer thing to get wrong.
  const [buffer, setBuffer] = useState(null); // { path, value }
  const flushRef = useRef(null);

  const activeFile = useMemo(
    () => agent?.files.find((f) => f.path === activePath) ?? agent?.files[0],
    [agent, activePath],
  );

  useEffect(() => () => clearTimeout(flushRef.current), []);

  if (!agent || !activeFile) return null;

  const isEntry = activeFile.path === "AGENT.md";
  const isMarkdown = /\.md$/i.test(activeFile.path);
  const content = buffer?.path === activeFile.path ? buffer.value : activeFile.content;
  const named = Boolean(agent.name.trim());
  const hasBody = Boolean(agent.files.find((f) => f.path === "AGENT.md")?.content.trim());
  const ready = named && hasBody;

  const writeFile = (next) => {
    const path = activeFile.path;
    setBuffer({ path, value: next });
    clearTimeout(flushRef.current);
    flushRef.current = setTimeout(() => saveFiles(agent.id, { [path]: next }), 300);
  };

  const onFileAction = (action, node, dirs) => {
    if (action === "duplicate") {
      duplicateNode(agent.id, node.path);
      return;
    }
    if (action === "delete") {
      if (node.path === "AGENT.md") {
        toast.error("AGENT.md is the entrypoint and cannot be deleted.");
        return;
      }
      setPendingDelete(node.path);
      return;
    }
    setFileOp({ mode: action, node, dirs });
  };

  /** Directory the operation is relative to. */
  const opDir = fileOp
    ? fileOp.node.dir
      ? fileOp.node.path
      : fileOp.node.path.split("/").slice(0, -1).join("/")
    : "";

  const submitFileOp = (value) => {
    const { mode, node } = fileOp;
    if (mode === "newFile") {
      const path = opDir ? `${opDir}/${value}` : value;
      addFile(agent.id, path, `# ${value.replace(/\.\w+$/, "")}

`);
      setActivePath(path);
    } else if (mode === "newFolder") {
      addFolder(agent.id, opDir ? `${opDir}/${value}` : value);
    } else if (mode === "rename") {
      renameNode(agent.id, node.path, value);
      if (activePath === node.path) setActivePath(value);
    } else if (mode === "move") {
      moveNode(agent.id, node.path, value);
      const base = node.path.split("/").pop();
      const next = value ? `${value}/${base}` : base;
      if (activePath === node.path) setActivePath(next);
    }
    setFileOp(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header: identity, and only the actions that make sense ───────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to agents">
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
          <div className="min-w-0 flex-1">
            {/*
              Read-only here. Name, description, category and targets are
              frontmatter, and frontmatter is edited in the file it belongs to
              — duplicating them in the header meant two places to change one
              value, and neither looked like what ends up on disk.
            */}
            <h2
              className={cn(
                "truncate text-xl font-semibold tracking-tight",
                agent.name.trim() ? "text-foreground" : "text-muted-foreground italic",
              )}
            >
              {agent.name.trim() || "Name this agent"}
            </h2>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {agent.slug || "—"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant={assistantOpen ? "secondary" : "outline"}
            size="sm"
            aria-pressed={assistantOpen}
            onClick={() => onAssistant?.(agent)}
          >
            <Sparkles className="size-3.5" aria-hidden />
            Assistant
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="outline" size="icon-sm" aria-label="More actions" />}
            >
              <MoreVertical className="size-3.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/*
                Disabled with a stated reason. An empty, unnamed draft could
                previously be chatted with, forked, published and released —
                four ways to make a mess out of nothing.
              */}
              <DropdownMenuItem disabled={!agent.runtime} onClick={() => onChat?.(agent)}>
                <MessageSquare className="size-3.5" aria-hidden />
                Chat
                {!agent.runtime && <span className="ml-auto text-[10px] text-muted-foreground">no model</span>}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!ready}
                onClick={() => {
                  const copy = fork(agent.id);
                  if (copy) toast.success(`Forked as “${copy.name}”`);
                }}
              >
                <GitFork className="size-3.5" aria-hidden />
                Fork
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!ready}
                onClick={() => {
                  patch(agent.id, { visibility: agent.visibility === "public" ? "private" : "public" });
                  toast.success(agent.visibility === "public" ? "Unpublished" : "Published");
                }}
              >
                <Upload className="size-3.5" aria-hidden />
                {agent.visibility === "public" ? "Unpublish" : "Publish"}
                {!ready && <span className="ml-auto text-[10px] text-muted-foreground">needs a name</span>}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!ready} onClick={() => setDialog("release")}>
                <Rocket className="size-3.5" aria-hidden />
                {agent.release ? "New release" : "Release"}
              </DropdownMenuItem>
              {agent.release && (
                <DropdownMenuItem onClick={onDistribute}>
                  <Rocket className="size-3.5" aria-hidden />
                  View install
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AgentHalvesBar
        agent={agent}
        onSetup={() => setDialog("model")}
        onSettings={() => setSettingsOpen(true)}
        onRelease={() => {
          if (!ready) {
            toast.error("Give it a name and some instructions first.");
            return;
          }
          // Released agents open their history; unreleased ones have no history
          // to show, so they go straight to the dialog.
          if (agent.release) setReleasesOpen(true);
          else setDialog("release");
        }}
      />

      {/* ── The folder, and the file you picked ──────────────────────────── */}
      <div className="flex min-h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card sm:flex-row">
        {/* flex column so the tree can fill the panel and make the empty space
            below the last file a real right-click target. */}
        <div className="flex w-full shrink-0 flex-col border-b border-border p-2 sm:w-[220px] sm:border-r sm:border-b-0">
          <p className="mb-1.5 px-2 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Folder
          </p>
          <FileTree
            files={agent.files}
            folders={agent.folders}
            activePath={activeFile.path}
            onSelect={setActivePath}
            onAction={onFileAction}
            onCreateSuggested={(path, seed) => {
              addFile(agent.id, path, seed);
              setActivePath(path);
            }}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
            <span className="truncate font-mono text-[11px] text-muted-foreground">{activeFile.path}</span>
            {isEntry && <Badge variant="outline">entrypoint</Badge>}
            <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
              {[
                { id: "edit", label: "Edit", icon: PenLine },
                { id: "preview", label: "Preview", icon: Eye },
              ].map((m) => (
                <Button
                  key={m.id}
                  type="button"
                  size="xs"
                  variant={mode === m.id ? "secondary" : "ghost"}
                  onClick={() => setMode(m.id)}
                  aria-pressed={mode === m.id}
                  disabled={!isMarkdown && m.id === "preview"}
                  title={!isMarkdown && m.id === "preview" ? "Preview is for markdown files" : undefined}
                >
                  <m.icon className="size-3" aria-hidden />
                  {m.label}
                </Button>
              ))}
            </div>
          </div>

          {isEntry && <FrontmatterEditor agent={agent} />}

          {mode === "preview" && isMarkdown ? (
            <div className="min-h-[360px] flex-1 overflow-y-auto bg-muted/20">
              <MarkdownPreview source={content} />
            </div>
          ) : (
            <Textarea
              aria-label={`${activeFile.path} content`}
              value={content}
              onChange={(e) => writeFile(e.target.value)}
              placeholder={isEntry ? SCAFFOLD : undefined}
              className="min-h-[380px] flex-1 resize-none rounded-none border-0 bg-transparent font-mono text-[11px] leading-5 focus-visible:ring-0"
            />
          )}

          <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            {isEntry
              ? "This file is the agent. Everything else in the folder supports it."
              : "Loaded alongside the entrypoint when this agent runs."}
          </p>
        </div>
      </div>

      {/* Settings live behind the half that owns them, not a third tab. */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Runs here — settings</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            <SettingsPanel agent={agent} onOpenDialog={setDialog} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={releasesOpen} onOpenChange={setReleasesOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Runs anywhere — releases</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            <ReleasesPanel
              agent={agent}
              onRelease={() => {
                setReleasesOpen(false);
                setDialog("release");
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <FileNameDialog
        key={`name-${fileOp?.mode}-${fileOp?.node.path ?? ""}`}
        open={Boolean(fileOp) && fileOp.mode !== "move"}
        mode={fileOp?.mode}
        initial={fileOp?.mode === "rename" ? fileOp.node.path : ""}
        existing={agent.files.map((f) => f.path).concat(agent.folders)}
        onSubmit={submitFileOp}
        onClose={() => setFileOp(null)}
      />

      <MoveFileDialog
        key={`move-${fileOp?.node.path ?? ""}`}
        open={fileOp?.mode === "move"}
        path={fileOp?.node.path}
        folders={fileOp?.dirs ?? []}
        onSubmit={submitFileOp}
        onClose={() => setFileOp(null)}
      />

      {dialog === "model" && <ModelDialog agent={agent} open onOpenChange={() => setDialog(null)} />}
      {dialog === "tools" && <ToolsDialog agent={agent} open onOpenChange={() => setDialog(null)} />}
      {dialog === "knowledge" && <KnowledgeDialog agent={agent} open onOpenChange={() => setDialog(null)} />}
      {dialog === "release" && <ReleaseDialog agent={agent} open onOpenChange={() => setDialog(null)} />}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete}?`}
          message="This removes the file from the agent's folder."
          confirmLabel="Delete"
          onConfirm={() => {
            deleteNode(agent.id, pendingDelete);
            if (activePath === pendingDelete) setActivePath("AGENT.md");
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
