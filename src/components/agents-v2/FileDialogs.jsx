import { useMemo, useState } from "react";
import { FolderClosed } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * File operations, as dialogs.
 *
 * These were `window.prompt` and `window.confirm` — which cannot be styled,
 * cannot validate before accepting, block the whole tab, and in the move case
 * asked the user to retype a path from a list rendered as plain text inside
 * the prompt body, including a literal "(root)" token they had to spell.
 *
 * Validation happens before the dialog will close, so a name that would
 * collide, escape the folder, or produce an empty segment is refused with the
 * reason visible rather than silently creating something odd.
 */

/** Shared rules. Returns an error string, or "" when the value is usable. */
function validate(value, { existing = [], current = "", kind = "file" } = {}) {
  const v = value.trim();
  if (!v) return "";
  if (v.startsWith("/") || v.endsWith("/")) return "Leave off the leading and trailing slash.";
  if (v.split("/").some((seg) => !seg.trim())) return "That leaves an empty folder name.";
  if (v.includes("..")) return "Paths cannot step outside the folder.";
  if (/[\\:*?"<>|]/.test(v)) return "Avoid \\ : * ? \" < > and |.";
  if (v !== current && existing.includes(v)) return `${kind === "folder" ? "A folder" : "A file"} called that already exists.`;
  return "";
}

/**
 * New file, new folder and rename share a shape: one name, validated, applied
 * on Enter. Separate dialogs for them would be three copies of this.
 */
export function FileNameDialog({ open, mode, initial = "", existing = [], onSubmit, onClose }) {
  // Initial state, not an effect: the caller remounts this with a key per
  // operation, so there is nothing to re-sync.
  const [value, setValue] = useState(initial);

  // Looked up with a fallback because this component renders even while
  // closed: with `mode="move"` the lookup missed and `copy.kind` threw, taking
  // the page down the moment Move was chosen.
  const COPY = {
    newFile: {
      title: "New file",
      description: "Markdown, scripts and YAML all live in the same folder.",
      label: "File name",
      placeholder: "notes.md",
      action: "Create file",
      kind: "file",
    },
    newFolder: {
      title: "New folder",
      description: "Folders group what the entrypoint reads or runs.",
      label: "Folder name",
      placeholder: "references",
      action: "Create folder",
      kind: "folder",
    },
    rename: {
      title: "Rename",
      description: "Renaming a folder moves everything inside it.",
      label: "Path",
      placeholder: "references/background.md",
      action: "Rename",
      kind: "file",
    },
  };
  const copy = COPY[mode] ?? COPY.newFile;

  const error = validate(value, { existing, current: initial, kind: copy.kind });
  const canSubmit = Boolean(value.trim()) && !error;

  const submit = () => {
    if (canSubmit) onSubmit(value.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div>
          <label htmlFor="file-name" className="mb-1.5 block text-xs font-medium text-foreground">
            {copy.label}
          </label>
          <Input
            id="file-name"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={copy.placeholder}
            aria-invalid={Boolean(error)}
            className="font-mono text-sm"
          />
          {/* Reserve the row so the dialog does not jump as you type. */}
          <p className="mt-1 min-h-4 text-[11px] text-destructive">{error}</p>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={!canSubmit}>
            {copy.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Move: pick a destination from the folders that exist. No retyping. */
export function MoveFileDialog({ open, path, folders = [], onSubmit, onClose }) {
  const currentDir = useMemo(() => path?.split("/").slice(0, -1).join("/") ?? "", [path]);
  const [dest, setDest] = useState(currentDir || "__root__");

  const base = path?.split("/").pop() ?? "";
  const target = dest === "__root__" ? "" : dest;
  const preview = target ? `${target}/${base}` : base;
  const unchanged = preview === path;

  // A folder cannot be moved inside itself.
  const options = folders.filter((f) => f !== path && !f.startsWith(`${path}/`));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{path}</span>
          </DialogDescription>
        </DialogHeader>

        <div>
          <label htmlFor="move-dest" className="mb-1.5 block text-xs font-medium text-foreground">
            Destination
          </label>
          <Select value={dest} onValueChange={setDest}>
            <SelectTrigger id="move-dest" className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__root__">
                <span className="flex items-center gap-2">
                  <FolderClosed className="size-3 text-muted-foreground" aria-hidden />
                  Folder root
                </span>
              </SelectItem>
              {options.map((f) => (
                <SelectItem key={f} value={f}>
                  <span className="flex items-center gap-2">
                    <FolderClosed className="size-3 text-muted-foreground" aria-hidden />
                    <span className="font-mono">{f}/</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground">→ {preview}</p>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => onSubmit(target)} disabled={unchanged}>
            {unchanged ? "Already there" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
