import { useMemo, useState } from "react";
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
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * File explorer for an agent's folder.
 *
 * Agents are multi-file now, so the editor needs a real tree rather than a flat
 * list: nesting, expand/collapse, and a context menu carrying the operations
 * anyone who has used an editor will look for first — new, rename, duplicate,
 * move, delete.
 *
 * Paths are stored flat and the tree is derived, matching how the skill archive
 * actually stores them. Deriving it here means a rename can never leave the
 * stored paths and the displayed tree disagreeing.
 */

/** Build a nested tree from flat paths plus any explicitly-empty folders. */
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

  // Folders first, then files, each alphabetical — the ordering every editor
  // uses, so nothing has to be learned.
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

const MENU = [
  { id: "newFile", label: "New file", icon: FilePlus, dirOnly: true },
  { id: "newFolder", label: "New folder", icon: FolderPlus, dirOnly: true },
  { id: "rename", label: "Rename…", icon: Pencil },
  { id: "duplicate", label: "Duplicate", icon: Copy, fileOnly: true },
  { id: "move", label: "Move…", icon: FolderClosed },
  { id: "delete", label: "Delete", icon: Trash2, danger: true },
];

function Node({ node, depth, active, onSelect, onMenu, expanded, toggle, dirtyPaths }) {
  const isOpen = expanded.has(node.path);
  const dirty = !node.dir && dirtyPaths.has(node.path);

  return (
    <>
      <div
        role="treeitem"
        aria-selected={active === node.path}
        aria-expanded={node.dir ? isOpen : undefined}
        tabIndex={0}
        onClick={() => (node.dir ? toggle(node.path) : onSelect(node.path))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            node.dir ? toggle(node.path) : onSelect(node.path);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu({ x: e.clientX, y: e.clientY, node });
        }}
        style={{ paddingLeft: 6 + depth * 12 }}
        className={cn(
          "group flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 text-[11px] transition-colors select-none",
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
        {dirty && (
          <span
            className="ml-auto size-1.5 shrink-0 rounded-full bg-warning"
            title="Unsaved changes"
            aria-label="Unsaved changes"
          />
        )}
      </div>

      {node.dir &&
        isOpen &&
        node.list.map((child) => (
          <Node
            key={child.path}
            node={child}
            depth={depth + 1}
            active={active}
            onSelect={onSelect}
            onMenu={onMenu}
            expanded={expanded}
            toggle={toggle}
            dirtyPaths={dirtyPaths}
          />
        ))}
    </>
  );
}

export default function FileTree({
  files,
  folders = [],
  activePath,
  dirtyPaths = new Set(),
  onSelect,
  onAction,
}) {
  const tree = useMemo(() => buildTree(files, folders), [files, folders]);
  const [expanded, setExpanded] = useState(
    () => new Set(files.flatMap((f) => f.path.split("/").slice(0, -1).map((_, i, arr) => arr.slice(0, i + 1).join("/")))),
  );
  const [menu, setMenu] = useState(null);

  const toggle = (path) =>
    setExpanded((s) => {
      const next = new Set(s);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const allDirs = useMemo(() => {
    const out = [];
    const walk = (n) => n.list?.forEach((c) => c.dir && (out.push(c.path), walk(c)));
    walk(tree);
    return out;
  }, [tree]);

  return (
    <div className="relative">
      <div
        role="tree"
        aria-label="Agent files"
        className="space-y-0.5"
        onContextMenu={(e) => {
          // Right-clicking empty space targets the folder root, so "New file"
          // is reachable without having to hit an existing node first.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, node: tree });
          }
        }}
      >
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
            dirtyPaths={dirtyPaths}
          />
        ))}
        <div className="h-6" />
      </div>

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
            className="fixed z-50 w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
          >
            {MENU.filter((m) => !(m.dirOnly && !menu.node.dir) && !(m.fileOnly && menu.node.dir))
              .filter((m) => !(menu.node.path === "" && m.id !== "newFile" && m.id !== "newFolder"))
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAction(m.id, menu.node, allDirs);
                    setMenu(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                    m.danger
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-foreground hover:bg-muted",
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
