import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  File as FileIcon,
  FilePlus,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * File explorer for an agent's folder.
 *
 * Creating, renaming and moving happen in the tree itself. They were modal
 * dialogs, which is the wrong shape for an operation whose whole context is
 * the row you are pointing at: a dialog covers the tree, loses your place, and
 * asks you to describe a location you were already looking at.
 *
 * So: a new file appears as an input where the file will be, renaming turns
 * the label into an input, and moving is a drag. Rename also accepts a path,
 * which is the same operation as a move and is how editors have always let you
 * do it without leaving the keyboard.
 *
 * Paths are stored flat and the tree is derived, so a rename can never leave
 * the stored paths and the displayed tree disagreeing.
 */

function buildTree(files, folders) {
  const root = { name: "", path: "", dir: true, children: new Map() };

  const ensureDir = (segments) =>
    segments.reduce((node, seg) => {
      const path = node.path ? `${node.path}/${seg}` : seg;
      if (!node.children.has(seg)) {
        node.children.set(seg, { name: seg, path, dir: true, children: new Map() });
      }
      return node.children.get(seg);
    }, root);

  folders.forEach((f) => ensureDir(f.split("/")));

  files.forEach((file) => {
    const segs = file.path.split("/");
    const name = segs.pop();
    const parent = segs.length ? ensureDir(segs) : root;
    parent.children.set(name, { name, path: file.path, dir: false, children: new Map() });
  });

  const sort = (node) => {
    const kids = [...node.children.values()].sort((a, b) =>
      a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1,
    );
    kids.forEach(sort);
    node.list = kids;
    return node;
  };

  return sort(root);
}

/**
 * Folders an agent can have, shown as dashed ghost rows when absent — the
 * folder contract taught as a live control rather than in docs.
 */
const SUGGESTED = [
  {
    dir: "references",
    job: "things it reads before answering",
    seed: "references/background.md",
    content: `# Background\n\nWhat this agent needs to know before answering.\n`,
  },
  {
    dir: "scripts",
    job: "commands that run on the target machine",
    seed: "scripts/run.sh",
    content: `#!/usr/bin/env bash\nset -euo pipefail\n\necho "ok"\n`,
  },
  {
    dir: ".aziron",
    job: "setup checks before it runs",
    seed: ".aziron/preparation.yaml",
    content: `schema: 1\n\npreparation:\n  precheck:\n    - id: cli\n      label: Required CLI installed\n`,
  },
];

const MENU = [
  { id: "newFile", label: "New file", icon: FilePlus, dirOnly: true },
  { id: "newFolder", label: "New folder", icon: FolderPlus, dirOnly: true },
  { id: "rename", label: "Rename or move…", icon: Pencil },
  { id: "duplicate", label: "Duplicate", icon: Copy, fileOnly: true },
  { id: "delete", label: "Delete", icon: Trash2, danger: true },
];

const ROW =
  "group flex items-center gap-1.5 rounded-md py-1 pr-2 text-[11px] transition-colors select-none";

/** Rules shared by every inline edit. Returns an error, or "" when usable. */
function validate(value, { taken = [], current = "", kind = "file", resolve = (v) => v } = {}) {
  const v = value.trim();
  if (!v) return "";
  if (v.startsWith("/") || v.endsWith("/")) return "No leading or trailing slash";
  if (v.split("/").some((seg) => !seg.trim())) return "Empty folder name";
  if (v.includes("..")) return "Cannot step outside the folder";
  if (/[\\:*?"<>|]/.test(v)) return 'Avoid \\ : * ? " < > |';
  // Compared as a resolved path: a bare name typed inside a folder is not the
  // same string as the stored path, and comparing the two never matched.
  const full = resolve(v);
  if (full !== current && taken.includes(full))
    return `${kind === "folder" ? "Folder" : "File"} already exists`;
  return "";
}

/**
 * The input that stands in for a row.
 *
 * Enter commits, Escape cancels, clicking away commits if valid and cancels if
 * not — so an abandoned edit never leaves a half-named file behind.
 */
function InlineRow({ depth, kind, initial, taken, current, resolve = (v) => v, onCommit, onCancel }) {
  const [value, setValue] = useState(initial);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Select the basename only, so renaming a nested file does not make you
    // re-type the folder you are already in.
    const dot = value.lastIndexOf(".");
    const slash = value.lastIndexOf("/");
    el.setSelectionRange(slash + 1, dot > slash ? dot : value.length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const error = validate(value, { taken, current, kind, resolve });
  const ok = Boolean(value.trim()) && !error;

  return (
    <div style={{ paddingLeft: 6 + depth * 12 }} className="py-0.5 pr-2">
      <div className="flex items-center gap-1.5">
        {kind === "folder" ? (
          <FolderClosed className="size-3 shrink-0 text-primary/70" aria-hidden />
        ) : (
          <FileIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <input
          ref={ref}
          value={value}
          aria-label={kind === "folder" ? "Folder name" : "File name"}
          aria-invalid={Boolean(error)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (ok) onCommit(value.trim());
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          onBlur={() => (ok ? onCommit(value.trim()) : onCancel())}
          className={cn(
            "min-w-0 flex-1 rounded border bg-background px-1 py-0.5 font-mono text-[11px] text-foreground outline-none",
            error ? "border-destructive" : "border-primary/50",
          )}
        />
      </div>
      {error && <p className="mt-0.5 pl-4.5 text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

function Node({
  node,
  depth,
  active,
  onSelect,
  onMenu,
  expanded,
  toggle,
  editing,
  startEdit,
  commitEdit,
  cancelEdit,
  taken,
  dragOver,
  setDragOver,
  onDropInto,
}) {
  const isOpen = expanded.has(node.path);
  const isRenaming = editing?.kind === "rename" && editing.path === node.path;
  const isDropTarget = node.dir && dragOver === node.path;

  if (isRenaming) {
    return (
      <InlineRow
        depth={depth}
        kind={node.dir ? "folder" : "file"}
        initial={node.path}
        taken={taken}
        current={node.path}
        onCommit={commitEdit}
        onCancel={cancelEdit}
      />
    );
  }

  return (
    <>
      <div
        role="treeitem"
        aria-selected={active === node.path}
        aria-expanded={node.dir ? isOpen : undefined}
        tabIndex={0}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData("text/plain", node.path);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!node.dir) return;
          e.preventDefault();
          e.stopPropagation();
          setDragOver(node.path);
        }}
        onDragLeave={() => node.dir && setDragOver((d) => (d === node.path ? null : d))}
        onDrop={(e) => {
          if (!node.dir) return;
          e.preventDefault();
          e.stopPropagation();
          onDropInto(e.dataTransfer.getData("text/plain"), node.path);
        }}
        onClick={() => (node.dir ? toggle(node.path) : onSelect(node.path))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            node.dir ? toggle(node.path) : onSelect(node.path);
          } else if (e.key === "F2") {
            e.preventDefault();
            startEdit({ kind: "rename", path: node.path });
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu({ x: e.clientX, y: e.clientY, node });
        }}
        style={{ paddingLeft: 6 + depth * 12 }}
        className={cn(
          ROW,
          "cursor-pointer",
          isDropTarget && "ring-1 ring-primary ring-inset",
          active === node.path
            ? "bg-primary/10 font-medium text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {node.dir ? (
          <>
            {isOpen ? (
              <ChevronDown className="size-3 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="size-3 shrink-0" aria-hidden />
            )}
            {isOpen ? (
              <FolderOpen className="size-3 shrink-0 text-primary/70" aria-hidden />
            ) : (
              <FolderClosed className="size-3 shrink-0 text-primary/70" aria-hidden />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <FileIcon className="size-3 shrink-0" aria-hidden />
          </>
        )}
        <span className="truncate font-mono">{node.name}</span>
      </div>

      {node.dir && isOpen && (
        <>
          {node.list.map((child) => (
            <Node
              key={child.path}
              node={child}
              depth={depth + 1}
              active={active}
              onSelect={onSelect}
              onMenu={onMenu}
              expanded={expanded}
              toggle={toggle}
              editing={editing}
              startEdit={startEdit}
              commitEdit={commitEdit}
              cancelEdit={cancelEdit}
              taken={taken}
              dragOver={dragOver}
              setDragOver={setDragOver}
              onDropInto={onDropInto}
            />
          ))}
          {/* A new entry appears where it will actually live. */}
          {editing?.kind !== "rename" && editing?.parent === node.path && (
            <InlineRow
              depth={depth + 1}
              kind={editing.kind === "newFolder" ? "folder" : "file"}
              initial=""
              taken={taken}
              resolve={(v) => (editing.parent ? `${editing.parent}/${v}` : v)}
              onCommit={commitEdit}
              onCancel={cancelEdit}
            />
          )}
        </>
      )}
    </>
  );
}

export default function FileTree({
  files,
  folders = [],
  activePath,
  onSelect,
  onAction,
  onCreateSuggested,
  onCreate,
  onRename,
  onMove,
}) {
  const tree = useMemo(() => buildTree(files, folders), [files, folders]);
  const [expanded, setExpanded] = useState(
    () =>
      new Set(
        files.flatMap((f) =>
          f.path.split("/").slice(0, -1).map((_, i, arr) => arr.slice(0, i + 1).join("/")),
        ),
      ),
  );
  const [menu, setMenu] = useState(null);
  // { kind: "newFile" | "newFolder", parent } | { kind: "rename", path }
  const [editing, setEditing] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const taken = useMemo(() => files.map((f) => f.path).concat(folders), [files, folders]);

  const toggle = (path) =>
    setExpanded((s) => {
      const next = new Set(s);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const startEdit = (next) => {
    setMenu(null);
    // Creating inside a collapsed folder would put the input somewhere you
    // cannot see, so open it first.
    if (next.parent) setExpanded((s) => new Set(s).add(next.parent));
    setEditing(next);
  };

  const commitEdit = (value) => {
    if (!editing) return;
    if (editing.kind === "rename") {
      if (value !== editing.path) onRename(editing.path, value);
    } else {
      const path = editing.parent ? `${editing.parent}/${value}` : value;
      onCreate(editing.kind === "newFolder" ? "folder" : "file", path);
    }
    setEditing(null);
  };

  const handleMenu = (id, node) => {
    if (id === "newFile" || id === "newFolder") {
      startEdit({ kind: id, parent: node.dir ? node.path : node.path.split("/").slice(0, -1).join("/") });
    } else if (id === "rename") {
      startEdit({ kind: "rename", path: node.path });
    } else {
      onAction(id, node);
    }
  };

  return (
    <div
      className={cn(
        "relative flex min-h-full flex-1 flex-col rounded-md",
        dragOver === "" && "ring-1 ring-primary ring-inset",
      )}
      onContextMenu={(e) => {
        if (e.defaultPrevented) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, node: tree });
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver("");
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData("text/plain");
        if (from) onMove(from, "");
        setDragOver(null);
      }}
    >
      <div role="tree" aria-label="Agent files" className="space-y-0.5">
        {tree.list.map((child) => (
          <Node
            key={child.path}
            node={child}
            depth={0}
            active={activePath}
            onSelect={onSelect}
            onMenu={setMenu}
            expanded={expanded}
            toggle={toggle}
            editing={editing}
            startEdit={startEdit}
            commitEdit={commitEdit}
            cancelEdit={() => setEditing(null)}
            taken={taken}
            dragOver={dragOver}
            setDragOver={setDragOver}
            onDropInto={(from, to) => {
              setDragOver(null);
              if (from) onMove(from, to);
            }}
          />
        ))}

        {editing?.kind !== "rename" && editing && !editing.parent && (
          <InlineRow
            depth={0}
            kind={editing.kind === "newFolder" ? "folder" : "file"}
            initial=""
            taken={taken}
            resolve={(v) => v}
            onCommit={commitEdit}
            onCancel={() => setEditing(null)}
          />
        )}

        {onCreateSuggested &&
          SUGGESTED.filter(
            (sug) => !files.some((f) => f.path.startsWith(`${sug.dir}/`)) && !folders.includes(sug.dir),
          ).map((sug) => (
            <button
              key={sug.dir}
              type="button"
              onClick={() => onCreateSuggested(sug.seed, sug.content)}
              title={`Create ${sug.dir}/`}
              className="group flex w-full items-start gap-1.5 rounded-md border border-dashed border-transparent py-1 pr-2 pl-1.5 text-left transition-colors hover:border-border hover:bg-muted/50"
            >
              <Plus className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate font-mono text-[11px] text-muted-foreground group-hover:text-foreground">
                  {sug.dir}/
                </span>
                <span className="block text-[10px] leading-3 text-muted-foreground/70">{sug.job}</span>
              </span>
            </button>
          ))}
      </div>

      <div className="min-h-8 flex-1" aria-hidden />

      {menu && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            role="menu"
            style={{ top: menu.y, left: menu.x }}
            className="fixed z-50 w-48 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
          >
            {MENU.filter((m) => !(m.dirOnly && !menu.node.dir) && !(m.fileOnly && menu.node.dir))
              .filter((m) => !(menu.node.path === "" && m.id !== "newFile" && m.id !== "newFolder"))
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleMenu(m.id, menu.node)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                    m.danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-muted",
                  )}
                >
                  <m.icon className="size-3 shrink-0" aria-hidden />
                  {m.label}
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
