import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  Boxes,
  GitFork,
  MessageSquare,
  MoreVertical,
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
import AgentHalvesBar from "./AgentHalvesBar";
import ReleasesPanel from "./ReleasesPanel";
import FrontmatterEditor from "./FrontmatterEditor";
import AssistantPanel from "./AssistantPanel";
import PathSuggest from "./PathSuggest";
import Resizer from "./Resizer";

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

export default function AgentView({ agentId, onBack, onDistribute, onChat }) {
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
  // The assistant is part of the editing surface, not a page-level panel,
  // and it is always opt-in.
  const [assist, setAssist] = useState(false);
  // Panel widths are the user's to set: the width that suits reading a file
  // and the width that suits a conversation are not the same number.
  const [folderW, setFolderW] = useState(220);
  const [assistW, setAssistW] = useState(380);
  // null | "folder" | "editor" | "assistant" — one panel taking the full width.
  const [focus, setFocus] = useState(null);
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
  const textareaRef = useRef(null);

  const activeFile = useMemo(
    () => agent?.files.find((f) => f.path === activePath) ?? agent?.files[0],
    [agent, activePath],
  );

  useEffect(() => () => clearTimeout(flushRef.current), []);

  if (!agent || !activeFile) return null;

  const isEntry = activeFile.path === "AGENT.md";
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

  /** Only the two operations that are not inline reach this. */
  const onFileAction = (action, node) => {
    if (action === "duplicate") {
      duplicateNode(agent.id, node.path);
    } else if (action === "delete") {
      if (node.path === "AGENT.md") {
        toast.error("AGENT.md is the entrypoint and cannot be deleted.");
        return;
      }
      setPendingDelete(node.path);
    }
  };

  const createInline = (kind, path) => {
    if (kind === "folder") {
      addFolder(agent.id, path);
      return;
    }
    const title = path.split("/").pop().replace(/\.\w+$/, "");
    addFile(agent.id, path, `# ${title}\n\n`);
    setActivePath(path);
  };

  const renameInline = (from, to) => {
    renameNode(agent.id, from, to);
    if (activePath === from) setActivePath(to);
  };

  /** Drag-to-move. Dropping a folder into itself is a no-op, not an error. */
  const moveInline = (from, toDir) => {
    if (from === toDir || toDir.startsWith(`${from}/`)) return;
    const base = from.split("/").pop();
    const to = toDir ? `${toDir}/${base}` : base;
    if (to === from) return;
    moveNode(agent.id, from, toDir);
    if (activePath === from) setActivePath(to);
  };

  return (
    <div className="flex flex-col gap-4">
      {/*
        One header block, not three.

        Identity, the two halves and the actions were a name row, two bordered
        cards and a lone kebab — roughly two hundred pixels before the file
        appeared, on a screen whose entire job is the file. Everything that is
        a summary is now a summary: one line to read, one click to open.
      */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to agents">
              <ArrowLeft className="size-4" aria-hidden />
            </Button>
            <div className="min-w-0">
              <h2
                className={cn(
                  "truncate text-lg leading-6 font-semibold tracking-tight",
                  agent.name.trim() ? "text-foreground" : "text-muted-foreground italic",
                )}
              >
                {agent.name.trim() || "Name this agent"}
              </h2>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{agent.slug || "—"}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/*
              Promoted out of the menu. Trying the agent is how you find out
              whether any of the editing worked, so it should not be two
              clicks behind a kebab.
            */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!agent.runtime}
              title={agent.runtime ? `Try it on ${agent.runtime.model}` : "Bind a model first"}
              onClick={() => onChat?.(agent)}
            >
              <MessageSquare className="size-3.5" aria-hidden />
              Try this agent
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button type="button" variant="outline" size="icon-sm" aria-label="More actions" />}
              >
                <MoreVertical className="size-3.5" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
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
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!ready} onClick={() => setDialog("release")}>
                  <Rocket className="size-3.5" aria-hidden />
                  {agent.release ? "New release" : "Release"}
                </DropdownMenuItem>
                {agent.release && (
                  <DropdownMenuItem onClick={onDistribute}>
                    <Boxes className="size-3.5" aria-hidden />
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
            if (agent.release) setReleasesOpen(true);
            else setDialog("release");
          }}
        />
      </div>

      {/*
        Three columns, all resizable, any of them able to take the whole width.

        The assistant is a sibling of the editor COLUMN, not a child of its
        body — it starts at the top of the card, level with the file toolbar.
        A conversation that begins halfway down reads as an attachment to the
        file rather than a peer of it.
      */}
      <div className="flex min-h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card lg:flex-row">
        {focus !== "editor" && focus !== "assistant" && (
          <>
            <div
              style={focus === "folder" ? undefined : { width: folderW }}
              className={cn(
                "flex w-full shrink-0 flex-col border-b border-border lg:border-b-0",
                assist && "hidden lg:flex",
                focus === "folder" ? "lg:w-full" : "lg:border-r",
              )}
            >
              <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
                <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                  Folder
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={focus === "folder" ? "Restore layout" : "Focus the folder"}
                  aria-pressed={focus === "folder"}
                  onClick={() => setFocus(focus === "folder" ? null : "folder")}
                >
                  {focus === "folder" ? (
                    <Minimize2 className="size-3" aria-hidden />
                  ) : (
                    <Maximize2 className="size-3" aria-hidden />
                  )}
                </Button>
              </div>
              <div className="flex flex-1 flex-col overflow-y-auto p-2">
                <FileTree
                  files={agent.files}
                  folders={agent.folders}
                  activePath={activeFile.path}
                  onSelect={setActivePath}
                  onAction={onFileAction}
                  onCreate={createInline}
                  onRename={renameInline}
                  onMove={moveInline}
                  onCreateSuggested={(path, seed) => {
                    addFile(agent.id, path, seed);
                    setActivePath(path);
                  }}
                />
              </div>
            </div>
            {focus === null && (
              <Resizer
                label="Resize folder panel"
                onDrag={(dx) => setFolderW((w) => Math.min(420, Math.max(150, w + dx)))}
              />
            )}
          </>
        )}

        {focus !== "folder" && focus !== "assistant" && (
          <div className={cn("flex min-w-0 flex-1 flex-col", assist && "hidden lg:flex")}>
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {activeFile.path}
              </span>
              {isEntry && <Badge variant="outline">entrypoint</Badge>}

              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant={assist ? "secondary" : "outline"}
                  aria-pressed={assist}
                  onClick={() => setAssist((v) => !v)}
                  title="Ask for changes to this agent"
                >
                  <Sparkles className="size-3" aria-hidden />
                  Assistant
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={focus === "editor" ? "Restore layout" : "Focus the editor"}
                  aria-pressed={focus === "editor"}
                  onClick={() => setFocus(focus === "editor" ? null : "editor")}
                >
                  {focus === "editor" ? (
                    <Minimize2 className="size-3" aria-hidden />
                  ) : (
                    <Maximize2 className="size-3" aria-hidden />
                  )}
                </Button>
              </div>
            </div>

            {isEntry && <FrontmatterEditor agent={agent} />}

            <div className="relative flex min-h-[300px] flex-1 flex-col">
              <Textarea
                ref={textareaRef}
                aria-label={`${activeFile.path} content`}
                value={content}
                onChange={(e) => writeFile(e.target.value)}
                placeholder={isEntry ? SCAFFOLD : undefined}
                className="min-h-[300px] flex-1 resize-none rounded-none border-0 bg-transparent font-mono text-[11px] leading-5 focus-visible:ring-0"
              />
              <PathSuggest
                textareaRef={textareaRef}
                value={content}
                currentPath={activeFile.path}
                files={agent.files}
                folders={agent.folders}
                onInsert={(from, to, text) => {
                  const next = content.slice(0, from) + text + content.slice(to);
                  writeFile(next);
                  requestAnimationFrame(() => {
                    const el = textareaRef.current;
                    if (!el) return;
                    const caret = from + text.length;
                    el.focus();
                    el.setSelectionRange(caret, caret);
                  });
                }}
              />
            </div>

            <p className="shrink-0 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              {isEntry
                ? "This file is the agent. Everything else in the folder supports it."
                : "Loaded alongside the entrypoint when this agent runs."}
            </p>
          </div>
        )}

        {assist && focus !== "folder" && focus !== "editor" && (
          <>
            {focus === null && (
              <Resizer
                label="Resize assistant panel"
                onDrag={(dx) => setAssistW((w) => Math.min(640, Math.max(280, w - dx)))}
              />
            )}
            <div
              style={focus === "assistant" ? undefined : { width: assistW }}
              className={cn(
                "flex w-full min-w-0 shrink-0 flex-col",
                focus === "assistant" ? "lg:w-full lg:flex-1" : "lg:border-l lg:border-border",
              )}
            >
              <AssistantPanel
                agent={agent}
                onClose={() => setAssist(false)}
                embedded
                focused={focus === "assistant"}
                onToggleFocus={() => setFocus(focus === "assistant" ? null : "assistant")}
              />
            </div>
          </>
        )}
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
