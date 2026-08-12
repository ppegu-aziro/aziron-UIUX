/**
 * Relative-path resolution for the editor's `./` and `../` autocomplete.
 *
 * Pure functions, no React: agents are multi-file and the entrypoint's job is
 * to point at the other files, so this is the logic that decides what actually
 * exists at a typed prefix. Keeping it separate makes it testable and keeps the
 * component to rendering.
 */

/** Find a `./` or `../` token immediately behind the caret, if any. */
export function tokenBehindCaret(value, caret) {
  const upto = String(value ?? "").slice(0, caret);
  const match = upto.match(/(\.{1,2}\/[^\s"'`)\]]*)$/);
  if (!match) return null;
  return { token: match[1], start: caret - match[1].length };
}

/**
 * Resolve a typed prefix against the current file's directory.
 *
 * Returns entries for the level being typed, or null when the token does not
 * navigate anywhere (or climbs above the agent folder, which has nothing to
 * offer — an agent cannot reference outside its own package).
 */
export function resolveCandidates(token, currentPath, files = [], folders = []) {
  const dir = String(currentPath ?? "").split("/").slice(0, -1).join("/");

  // Split into the part that navigates and the part still being typed:
  // "../refs/back" → segments ["..", "refs"], typed "back".
  const segs = String(token ?? "").split("/");
  const typed = segs.pop();
  let base = dir;
  let stepped = false;

  for (const seg of segs) {
    if (seg === ".") {
      stepped = true;
      continue;
    }
    if (seg === "..") {
      if (!base) return null; // above the agent folder
      base = base.split("/").slice(0, -1).join("/");
      stepped = true;
      continue;
    }
    base = base ? `${base}/${seg}` : seg;
  }
  if (!stepped) return null;

  const prefix = base ? `${base}/` : "";
  const seen = new Map();

  const consider = (path, isDir) => {
    if (!path.startsWith(prefix)) return;
    const rest = path.slice(prefix.length);
    if (!rest) return;
    const [head, ...tail] = rest.split("/");
    // Anything with a deeper tail is a directory at this level.
    const dirEntry = isDir || tail.length > 0;
    if (!head.toLowerCase().startsWith(typed.toLowerCase())) return;
    if (!seen.has(head)) seen.set(head, dirEntry);
  };

  files.forEach((f) => consider(f.path, false));
  folders.forEach((f) => consider(f, true));

  // Never offer the file back to itself.
  const selfName = String(currentPath ?? "").slice(prefix.length);
  return [...seen.entries()]
    .filter(([name]) => name !== selfName)
    .sort((a, b) => (a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] ? -1 : 1))
    .map(([name, isDir]) => ({ name, isDir }));
}
