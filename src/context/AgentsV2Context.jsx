import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { AGENTS_V2, ALL_TOOLS, bumpVersion } from "@/data/agentsV2";

/**
 * Mock state for the unified Agents prototype.
 *
 * Everything a user does here is real within the session, because the design's
 * central claim — that an agent has two halves and either can be filled in
 * later — is only convincing if you can watch a half get filled.
 *
 * Structural file operations (new, rename, move, delete) commit immediately,
 * the way a real file explorer behaves. File CONTENT is drafted in the editor
 * and committed with Save draft. Mixing those two would mean a rename you
 * cannot undo sitting behind a save button you might never press.
 */

const KEY = "aziron_agents_v2";
const AgentsV2Context = createContext(null);

const ensureFiles = (a) =>
  Array.isArray(a.files) && a.files.length && typeof a.files[0] === "object"
    ? a.files
    : [{ path: "AGENT.md", content: `# ${a.name}\n\n${a.description}\n` }];

/**
 * The single funnel every record passes through, so it is the only place that
 * can guarantee shape. Every array the UI reads with `.length` is defaulted
 * here — a record built by `create()` or restored from an older localStorage
 * payload would otherwise reach a chip with an undefined field and take the
 * whole page down, which is exactly what an unguarded `targets` did.
 */
function normalise(a) {
  const granted = a.granted ?? (a.tools === "scoped" ? ALL_TOOLS.slice(0, a.toolCount ?? 0) : []);
  return {
    ...a,
    files: ensureFiles(a),
    folders: a.folders ?? [],
    granted,
    toolCount: granted.length,
    tools: a.tools ?? "none",
    targets: a.targets ?? [],
    knowledge: a.knowledge ?? [],
    collections: a.collections ?? [],
    quickPrompts: a.quickPrompts ?? [],
    releaseNotes: a.releaseNotes ?? [],
    release: a.release ?? null,
    runtime: a.runtime ?? null,
    category: a.category ?? "Operations",
    status: a.status ?? "idle",
    visibility: a.visibility ?? "private",
    successRate: a.successRate ?? 0,
    lastRun: a.lastRun ?? "never",
    installs: a.installs ?? 0,
    owner: a.owner ?? "You",
    temperature: a.temperature ?? 0.7,
    maxTokens: a.maxTokens ?? 4096,
    maxIterations: a.maxIterations ?? 10,
    vectorDbId: a.vectorDbId ?? "",
    ragMode: a.ragMode ?? false,
    vectorSearch: a.vectorSearch ?? false,
    apiTokenId: a.apiTokenId ?? "",
    origin: a.origin ?? "both",
  };
}

/** Rename/delete on a folder must carry its whole subtree. */
const isUnder = (path, dir) => path === dir || path.startsWith(`${dir}/`);
const reparent = (path, from, to) => (path === from ? to : `${to}${path.slice(from.length)}`);

export function AgentsV2Provider({ children }) {
  const [agents, setAgents] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length) return parsed.map(normalise);
    } catch {
      /* fall through to seed */
    }
    return AGENTS_V2.map(normalise);
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(agents));
    } catch {
      /* storage blocked — still works in memory */
    }
  }, [agents]);

  const patch = useCallback((id, changes) => {
    setAgents((list) =>
      list.map((a) =>
        a.id === id
          ? normalise({
              ...a,
              ...(typeof changes === "function" ? changes(a) : changes),
              updated: "just now",
            })
          : a,
      ),
    );
  }, []);

  const api = useMemo(
    () => ({
      agents,
      get: (id) => agents.find((a) => a.id === id) ?? null,
      patch,

      /* ── halves ───────────────────────────────────────────────────────── */
      setRuntime: (id, runtime) => patch(id, { runtime }),
      clearRuntime: (id) => patch(id, { runtime: null, apiTokenId: "" }),

      setTools: (id, { tools, granted = [] }) =>
        patch(id, { tools, granted: tools === "scoped" ? granted : [] }),

      release: (id, { kind = "patch", notes = "" } = {}) =>
        patch(id, (a) => {
          const version = a.release ? bumpVersion(a.release.version, kind) : "1.0.0";
          return {
            release: { version, published: "just now" },
            targets: a.targets.length ? a.targets : ["claude"],
            releaseNotes: [{ version, notes, at: "just now" }, ...(a.releaseNotes ?? [])],
          };
        }),

      setTargets: (id, targets) => patch(id, { targets }),

      /* ── lifecycle ────────────────────────────────────────────────────── */
      remove: (id) => setAgents((list) => list.filter((a) => a.id !== id)),

      fork: (id) => {
        const src = agents.find((a) => a.id === id);
        if (!src) return null;
        // Forking a fork should count, not stack suffixes into "(fork) (fork)".
        const base = src.name.replace(/ \(fork(?: \d+)?\)$/, "");
        const taken = agents.filter((a) => a.name.startsWith(`${base} (fork`)).length;
        const name = taken === 0 ? `${base} (fork)` : `${base} (fork ${taken + 1})`;
        const copy = normalise({
          ...structuredClone(src),
          id: `a-fork-${Date.now()}`,
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          // A fork is your draft of somebody's work: the package history and
          // the tool grant are theirs, not yours, and must not transfer.
          release: null,
          releaseNotes: [],
          targets: [],
          installs: 0,
          visibility: "private",
          owner: "You",
          updated: "just now",
        });
        setAgents((list) => [copy, ...list]);
        return copy;
      },

      create: ({ name, description, instructions, knowledge = [], category = "Operations", files }) => {
        const record = normalise({
          id: `a-new-${Date.now()}`,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          name,
          description,
          category,
          origin: "both",
          runtime: { provider: "Automatic", model: "Auto" },
          apiTokenId: "auto",
          tools: "none",
          granted: [],
          knowledge,
          files: files ?? [{ path: "AGENT.md", content: instructions }],
          status: "idle",
          visibility: "private",
          successRate: 0,
          lastRun: "never",
          installs: 0,
          owner: "You",
          updated: "just now",
        });
        setAgents((list) => [record, ...list]);
        return record;
      },

      /* ── files ────────────────────────────────────────────────────────── */
      /** Commit drafted content for many paths at once (Save draft). */
      saveFiles: (id, edited) =>
        patch(id, (a) => ({
          files: a.files.map((file) =>
            Object.prototype.hasOwnProperty.call(edited, file.path)
              ? { ...file, content: edited[file.path] }
              : file,
          ),
        })),

      addFile: (id, path, content = "") =>
        patch(id, (a) =>
          a.files.some((x) => x.path === path) ? {} : { files: [...a.files, { path, content }] },
        ),

      addFolder: (id, path) =>
        patch(id, (a) => (a.folders.includes(path) ? {} : { folders: [...a.folders, path] })),

      renameNode: (id, from, to) =>
        patch(id, (a) => ({
          files: a.files.map((x) => (isUnder(x.path, from) ? { ...x, path: reparent(x.path, from, to) } : x)),
          folders: a.folders.map((x) => (isUnder(x, from) ? reparent(x, from, to) : x)),
        })),

      deleteNode: (id, path) =>
        patch(id, (a) => ({
          files: a.files.filter((x) => !isUnder(x.path, path)),
          folders: a.folders.filter((x) => !isUnder(x, path)),
        })),

      duplicateNode: (id, path) =>
        patch(id, (a) => {
          const src = a.files.find((x) => x.path === path);
          if (!src) return {};
          const dot = path.lastIndexOf(".");
          const copy = dot > 0 ? `${path.slice(0, dot)}-copy${path.slice(dot)}` : `${path}-copy`;
          return { files: [...a.files, { path: copy, content: src.content }] };
        }),

      moveNode: (id, from, toDir) =>
        patch(id, (a) => {
          const base = from.split("/").pop();
          const to = toDir ? `${toDir}/${base}` : base;
          if (to === from) return {};
          return {
            files: a.files.map((x) => (isUnder(x.path, from) ? { ...x, path: reparent(x.path, from, to) } : x)),
            folders: a.folders.map((x) => (isUnder(x, from) ? reparent(x, from, to) : x)),
          };
        }),

      reset: () => setAgents(AGENTS_V2.map(normalise)),
    }),
    [agents, patch],
  );

  return <AgentsV2Context.Provider value={api}>{children}</AgentsV2Context.Provider>;
}

export function useAgentsV2() {
  const ctx = useContext(AgentsV2Context);
  if (!ctx) throw new Error("useAgentsV2 must be used inside <AgentsV2Provider>");
  return ctx;
}
