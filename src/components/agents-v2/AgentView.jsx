import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Boxes,
  GitFork,
  MessageSquare,
  MoreVertical,
  Rocket,
  Save,
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AGENT_JSON_PATH } from "@/data/agentJsonSchema";
import { useAgentsV2 } from "@/context/AgentsV2Context";
import { KnowledgeDialog, ModelDialog, ReleaseDialog, ToolsDialog } from "./dialogs";
import FileTree from "./FileTree";
import SettingsPanel from "./SettingsPanel";
import AgentHalvesBar from "./AgentHalvesBar";
import ReleasesPanel from "./ReleasesPanel";
import FrontmatterEditor from "./FrontmatterEditor";
import AssistantPanel from "./AssistantPanel";
import EditorSuggest from "./EditorSuggest";
import AgentJsonView from "./AgentJsonView";
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
    agentFiles,
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
  // Small screens only: the folder stacks above the editor there, so left open
  // it costs half the screen before you reach the file. Above `lg` the tree is
  // a column and this does nothing.
  const [treeOpen, setTreeOpen] = useState(false);

  // Buffer for the file being typed into, flushed to the store shortly after
  // typing stops. Keeps every keystroke off global state without reintroducing
  // a Save button someone can forget to press.
  //
  // Keyed by path rather than cleared by an effect: switching files then simply
  // stops matching, which is one fewer render and one fewer thing to get wrong.
  // { path, value, committed }. `committed` rather than a byte comparison
  // against the file: AGENT.json is generated, so its canonical text can never
  // equal what the user typed once they reformat it, and a byte compare would
  // leave the unsaved dot permanently lit and make Ctrl-S always claim a save.
  const [buffer, setBuffer] = useState(null);
  const flushRef = useRef(null);
  const textareaRef = useRef(null);

  // The folder as the user sees it: the agent's own files plus the generated
  // AGENT.json. Everything that lists, resolves or completes a path reads this
  // rather than the raw record.
  const files = agentFiles(agentId);

  const activeFile = useMemo(
    () => files.find((f) => f.path === activePath) ?? files[0],
    [files, activePath],
  );

  /**
   * Commit whatever is buffered, now.
   *
   * Content already autosaves ~300ms after typing stops, so this is not what
   * makes the work durable — it ends the wait and says so. People want to be
   * told their draft is safe, and a button that reports state is a better
   * answer to that than one that pretends to be the only thing writing.
   *
   * Deliberately not a release: saving a draft and publishing a version are
   * different promises, and the second one is in the menu.
   */
  const saveNow = () => {
    if (!agent || !activeFile) return;
    clearTimeout(flushRef.current);
    const pending = buffer?.path === activeFile.path && !buffer.committed;
    if (pending) {
      saveFiles(agent.id, { [activeFile.path]: buffer.value });
      setBuffer((b) => (b ? { ...b, committed: true } : b));
      toast.success("Draft saved");
    } else {
      toast.message("Draft is already saved");
    }
  };

  useEffect(() => () => clearTimeout(flushRef.current), []);

  // Cmd/Ctrl-S saves the draft instead of offering to save the web page.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // no dep array: saveNow closes over the current buffer

  if (!agent || !activeFile) return null;

  const isEntry = activeFile.path === "AGENT.md";
  const isConfig = activeFile.path === AGENT_JSON_PATH;
  const content = buffer?.path === activeFile.path ? buffer.value : activeFile.content;
  // True while a keystroke is still sitting in the debounce. The Save button
  // exists to end that window on demand rather than to gate the write.
  const unsaved = buffer?.path === activeFile.path && !buffer.committed;
  const named = Boolean(agent.name.trim());
  const hasBody = Boolean(agent.files.find((f) => f.path === "AGENT.md")?.content.trim());
  const ready = named && hasBody;
  // Say which half is missing. "needs a name" on an agent that has one but no
  // instructions sends the reader to fix something that is not wrong.
  const notReadyWhy = !named ? "needs a name" : !hasBody ? "needs instructions" : "";

  const writeFile = (next) => {
    const path = activeFile.path;
    setBuffer({ path, value: next, committed: false });
    clearTimeout(flushRef.current);
    flushRef.current = setTimeout(() => {
      saveFiles(agent.id, { [path]: next });
      setBuffer((b) => (b && b.path === path && b.value === next ? { ...b, committed: true } : b));
    }, 300);
  };

  /** Splice a completion in and put the caret after it. */
  const insertAtCaret = (from, to, text) => {
    const next = content.slice(0, from) + text + content.slice(to);
    writeFile(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const caret = from + text.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  /**
   * A form control changed.
   *
   * The form never rewrites the document — it patches the record, and the JSON
   * re-derives. So the buffer holding whatever text was on screen has to go:
   * left in place it would keep showing a file that predates the patch, and the
   * next debounce would fold that stale text straight back over the edit.
   */
  const applyConfigPatch = (changes) => {
    if (changes && Object.keys(changes).length) patch(agent.id, changes);
    clearTimeout(flushRef.current);
    setBuffer(null);
  };

  const editConfigField = (spec, value) => applyConfigPatch(spec.write(value, agent));

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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/*
        One row.

        It was three: a page title saying "Agents" above an agent that names
        itself, a name row, and a strip of two label-over-value cards. Identity
        does not need a column of its own — the name, the slug, what it runs on
        and what has shipped are all the same fact about the same thing, so
        they read as one line.
      */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to agents">
          <ArrowLeft className="size-4" aria-hidden />
        </Button>

        <div className="flex min-w-0 items-baseline gap-2">
          <h2
            className={cn(
              "truncate text-base leading-6 font-semibold tracking-tight",
              agent.name.trim() ? "text-foreground" : "text-muted-foreground italic",
            )}
          >
            {agent.name.trim() || "Name this agent"}
          </h2>
          <span className="truncate font-mono text-[11px] text-muted-foreground">{agent.slug || "—"}</span>
        </div>

        <AgentHalvesBar
          agent={agent}
          onSetup={() => setDialog("model")}
          onSettings={() => setSettingsOpen(true)}
          onRelease={() => {
            if (!ready) {
              toast.error(`Cannot release — it ${notReadyWhy}.`);
              return;
            }
            if (agent.release) setReleasesOpen(true);
            else setDialog("release");
          }}
        />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!agent.runtime}
            title={agent.runtime ? `Try it on ${agent.runtime.model}` : "Pick a model first"}
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
                {!ready && <span className="ml-auto text-[10px] text-muted-foreground">{notReadyWhy}</span>}
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

      {/*
        Three columns, all resizable, any of them able to take the whole width.

        The assistant is a sibling of the editor COLUMN, not a child of its
        body — it starts at the top of the card, level with the file toolbar.
        A conversation that begins halfway down reads as an attachment to the
        file rather than a peer of it.
      */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card lg:flex-row">
        {focus !== "editor" && focus !== "assistant" && (
          <>
            <div
              style={focus === "folder" ? undefined : { width: folderW }}
              className={cn(
                "flex min-h-0 w-full shrink-0 flex-col border-b border-border lg:border-b-0",
                assist && "hidden lg:flex",
                // Collapsed, the panel is just its 36px header — it must not
                // hold the height its tree used to occupy.
                !treeOpen && "lg:min-h-0",
                focus === "folder" ? "lg:w-full" : "lg:border-r",
              )}
            >
              <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
                {/*
                  "Explorer", not "Folder": the column beside it is headed with
                  a file path, so this one should name the panel rather than the
                  shape of the container behind it. It is also what every editor
                  the audience already uses calls this exact panel.

                  The count is the part that earns its place on a phone — with
                  the tree closed it is the only thing telling you there is
                  more here than the file already on screen.

                  Below `lg` this row is the disclosure. Above it, a heading.
                */}
                <button
                  type="button"
                  onClick={() => setTreeOpen((v) => !v)}
                  aria-expanded={treeOpen}
                  aria-controls="agent-file-tree"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left lg:pointer-events-none"
                >
                  {treeOpen ? (
                    <ChevronDown className="size-3 shrink-0 text-muted-foreground lg:hidden" aria-hidden />
                  ) : (
                    <ChevronRight className="size-3 shrink-0 text-muted-foreground lg:hidden" aria-hidden />
                  )}
                  <span className="text-[11px] font-medium text-muted-foreground">Explorer</span>
                  <span className="font-mono text-[11px] text-muted-foreground/60">
                    {files.length}
                  </span>
                </button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="hidden lg:inline-flex"
                  aria-label={focus === "folder" ? "Restore layout" : "Focus the explorer"}
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
              <div
                id="agent-file-tree"
                className={cn(
                  "flex-1 flex-col overflow-y-auto p-2",
                  treeOpen ? "flex" : "hidden lg:flex",
                )}
              >
                <FileTree
                  files={files}
                  folders={agent.folders}
                  activePath={activeFile.path}
                  onSelect={(p) => {
                    setActivePath(p);
                    // On small screens the tree is covering the editor, so
                    // choosing a file should hand the screen back to it.
                    setTreeOpen(false);
                  }}
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
                label="Resize the explorer"
                onDrag={(dx) => setFolderW((w) => Math.min(420, Math.max(150, w + dx)))}
              />
            )}
          </>
        )}

        {focus !== "folder" && focus !== "assistant" && (
          <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", assist && "hidden lg:flex")}>
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {activeFile.path}
              </span>
              {isEntry && <Badge variant="outline">entrypoint</Badge>}

              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={saveNow}
                  aria-label={unsaved ? "Save draft" : "Draft saved"}
                  title={unsaved ? "Save draft (Ctrl/Cmd+S)" : "Draft saved"}
                  className={`relative ${unsaved ? "text-primary" : "text-muted-foreground"}`}
                >
                  <Save className="size-3.5" aria-hidden />
                  {/* A dot, not a spinner: the wait is 300ms and a spinner
                      would imply the work might fail. */}
                  {unsaved && (
                    <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" aria-hidden />
                  )}
                </Button>

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

            {isConfig ? (
              <AgentJsonView
                agent={agent}
                text={content}
                files={files}
                folders={agent.folders}
                textareaRef={textareaRef}
                onChangeText={writeFile}
                onInsert={insertAtCaret}
                onEditField={editConfigField}
                onApplyPatch={applyConfigPatch}
                onFlush={saveNow}
              />
            ) : (
              <>
                <div className="shrink-0">{isEntry && <FrontmatterEditor agent={agent} />}</div>

                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                  <Textarea
                    ref={textareaRef}
                    aria-label={`${activeFile.path} content`}
                    value={content}
                    onChange={(e) => writeFile(e.target.value)}
                    placeholder={isEntry ? SCAFFOLD : undefined}
                    className="min-h-0 flex-1 resize-none overflow-y-auto rounded-none border-0 bg-transparent font-mono text-[11px] leading-5 focus-visible:ring-0"
                  />
                  <EditorSuggest
                    textareaRef={textareaRef}
                    value={content}
                    currentPath={activeFile.path}
                    files={files}
                    folders={agent.folders}
                    onInsert={insertAtCaret}
                  />
                </div>

                {/*
                  The footer is the only always-visible surface in the editor, so
                  it carries the two things you cannot discover by looking: that
                  ./ completes a file and {{ completes a vault variable. Neither
                  announces itself, and both fail silently when typed wrong.
                */}
                <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                  <span>
                    {isEntry
                      ? "This file is the agent. Everything else in the folder supports it."
                      : "Loaded alongside the entrypoint when this agent runs."}
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    <span>
                      Type <code className="rounded bg-muted px-1 font-mono text-[10px]">./</code> to link a
                      file
                    </span>
                    <span>
                      <code className="rounded bg-muted px-1 font-mono text-[10px]">{"{{"}</code> for a vault
                      variable
                    </span>
                  </span>
                </div>
              </>
            )}
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
                "flex min-h-0 w-full min-w-0 shrink-0 flex-col",
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
            <SheetTitle>Model &amp; tools</SheetTitle>
            {/* The scope, stated rather than encoded in a label. This is the
                thing "runs here" was trying and failing to say. */}
            <SheetDescription>
              How this agent thinks and what it can reach. Applies inside Aziron only — none of it is
              included in a release.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <SettingsPanel agent={agent} onOpenDialog={setDialog} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={releasesOpen} onOpenChange={setReleasesOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Releases</SheetTitle>
            <SheetDescription>
              Versions of this agent&apos;s folder, and where each one installs.
            </SheetDescription>
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
