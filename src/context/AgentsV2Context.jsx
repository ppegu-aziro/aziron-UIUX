import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AGENTS_V2, ALL_TOOLS, bumpVersion } from "@/data/agentsV2";
import { AGENT_JSON_PATH } from "@/data/agentJsonSchema";
import { parseAgentJson, serialiseAgentJson } from "@/components/agents-v2/utils/agentJson";

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
function normalise(a, { hydrating = false } = {}) {
  // The legacy branch fabricates a permission set from ALL_TOOLS ordering when
  // `granted` is missing, and it is reachable only from an old localStorage
  // payload that stored a count instead of a list. With the config editable as
  // JSON, deleting one line would otherwise silently grant the first N tools —
  // so outside hydration, absent means none.
  const granted =
    a.granted ??
    (hydrating && a.tools === "scoped" ? ALL_TOOLS.slice(0, a.toolCount ?? 0) : []);
  return {
    ...a,
    // Spread-only until now, which held while every writer was a form control.
    // A patch built from a parsed document can carry an explicit undefined, and
    // object spread copies it — CatalogView's a.name.toLowerCase() then takes
    // the whole catalog down on a search keystroke.
    name: a.name ?? "",
    description: a.description ?? "",
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
      if (Array.isArray(parsed) && parsed.length)
        return parsed.map((a) => normalise(a, { hydrating: true }));
    } catch {
      /* fall through to seed */
    }
    return AGENTS_V2.map((a) => normalise(a));
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(agents));
    } catch {
      /* storage blocked — still works in memory */
    }
  }, [agents]);

  const slugify = (name) =>
    (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const patch = useCallback((id, changes) => {
    setAgents((list) =>
      list.map((a) => {
        if (a.id !== id) return a;
        const delta = typeof changes === "function" ? changes(a) : changes;
        // An empty patch must not stamp `updated`. AGENT.json is folded back
        // into a patch on every keystroke and most folds change nothing; without
        // this the timestamp churns and the file can never equal itself, so the
        // unsaved dot would never go out.
        if (!delta || Object.keys(delta).length === 0) return a;
        const next = { ...a, ...delta };
        // The slug is derived, never stored independently. Renaming without
        // this left a stale identifier in the catalog, the release dialog's
        // install path and `aziron agent install <nothing>`.
        if (next.name !== a.name) next.slug = slugify(next.name);
        return normalise({ ...next, updated: "just now" });
      }),
    );
  }, []);

  /**
   * The agent's folder as the user sees it: its real files, plus the generated
   * config file appended.
   *
   * Deliberately NOT folded into `get()` or `agents`. Two callers read the raw
   * record and would break: the page discards an untouched draft by testing
   * that every file is empty, and the assistant greets a blank agent by testing
   * `files.length === 1`. Injecting globally would leave an anonymous row in the
   * catalog for every abandoned draft and give every new agent the wrong
   * greeting. This is load-bearing — keep the injection narrow.
   *
   * Memoised rather than mapped inline in a component: the file tree and the
   * editor's autocomplete both memoise on the array identity, and a fresh array
   * every render makes the suggestion popup flicker while you type.
   *
   * Appended, never prepended: `files[0]` is read unguarded in two places as
   * the entrypoint.
   */
  const projected = useMemo(() => {
    const m = new Map();
    for (const a of agents) {
      m.set(a.id, [...a.files, { path: AGENT_JSON_PATH, content: serialiseAgentJson(a), generated: true }]);
    }
    return m;
  }, [agents]);

  /**
   * Fold an edited AGENT.json back into the record.
   *
   * Atomic: a document that does not parse, or that carries a contradiction,
   * applies nothing at all rather than the half of it that happened to be
   * valid. Some-keys-applied-one-silently-reverted is a state nobody can hold.
   */
  const applyAgentJson = useCallback(
    (id, text) => {
      patch(id, (a) => parseAgentJson(text, a).patch ?? {});
    },
    [patch],
  );

  /**
   * The generated file is not in `a.files`, so every structural operation would
   * map or filter a path that is not there: the patch changes nothing, `updated`
   * bumps, and the UI reports success. A rename that leaves the old name in
   * place reads as a broken tree rather than a refusal, so each one refuses.
   */
  const refuseReserved = (path, verb) => {
    if (path === AGENT_JSON_PATH) {
      toast.error(`${AGENT_JSON_PATH} is generated from this agent's settings and cannot be ${verb}.`);
      return true;
    }
    // The folder it lives in, too. Removing `.aziron` would take the generated
    // file out of the tree while the projection put it straight back, which
    // reads as an operation that did not work rather than one that was refused.
    if (AGENT_JSON_PATH.startsWith(`${path}/`)) {
      toast.error(`${path}/ holds this agent's generated settings and cannot be ${verb}.`);
      return true;
    }
    return false;
  };

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

      // Targets land in the same patch as the version. Set separately, the
      // record briefly holds the new targets against the old version, and the
      // config file serialised in that window states a release that never shipped.
      release: (id, { kind = "patch", notes = "", targets } = {}) =>
        patch(id, (a) => {
          const version = a.release ? bumpVersion(a.release.version, kind) : "1.0.0";
          const next = targets?.length ? targets : a.targets.length ? a.targets : ["claude"];
          /*
           * The manifest is what makes a version mean anything.
           *
           * Computed from the record this patch is ABOUT to produce, not from
           * the one it was called with: the generated config file carries the
           * version and the target list, so a manifest taken a moment earlier
           * describes a package that was never released. Building `after`
           * here is the only way to serialise the file the release actually
           * ships, since the store has not committed yet.
           */
          const after = { ...a, release: { version, published: "just now" }, targets: next };
          const manifest = [
            ...a.files.map((f) => ({ path: f.path, chars: f.content.length })),
            { path: AGENT_JSON_PATH, chars: serialiseAgentJson(after).length },
          ].sort((x, y) => x.path.localeCompare(y.path));

          return {
            release: { version, published: "just now" },
            targets: next,
            releaseNotes: [{ version, notes, at: "just now", manifest }, ...(a.releaseNotes ?? [])],
          };
        }),

      setKnowledge: (id, knowledge) => patch(id, { knowledge }),
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
          runtime: null,
          apiTokenId: "",
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
      /** The folder including the generated config file. */
      agentFiles: (id) => projected.get(id) ?? [],
      applyAgentJson,

      /** Commit drafted content for many paths at once (Save draft). */
      saveFiles: (id, edited) => {
        // The reserved path comes out FIRST. Left in, the map below matches
        // nothing — a generated path is in no record — the patch still runs,
        // and the user's edit is discarded while the UI reports it saved.
        const { [AGENT_JSON_PATH]: config, ...rest } = edited;
        if (config !== undefined) applyAgentJson(id, config);
        if (!Object.keys(rest).length) return;
        patch(id, (a) => ({
          files: a.files.map((file) =>
            Object.prototype.hasOwnProperty.call(rest, file.path)
              ? { ...file, content: rest[file.path] }
              : file,
          ),
        }));
      },

      addFile: (id, path, content = "") => {
        // Without this the dedupe below cannot see the projection, so a second,
        // inert AGENT.json is appended and shadows the real one in the tree.
        if (refuseReserved(path, "created twice")) return;
        patch(id, (a) =>
          a.files.some((x) => x.path === path) ? {} : { files: [...a.files, { path, content }] },
        );
      },

      addFolder: (id, path) =>
        patch(id, (a) => (a.folders.includes(path) ? {} : { folders: [...a.folders, path] })),

      renameNode: (id, from, to) => {
        if (refuseReserved(from, "renamed")) return;
        if (refuseReserved(to, "created twice")) return;
        patch(id, (a) => ({
          files: a.files.map((x) => (isUnder(x.path, from) ? { ...x, path: reparent(x.path, from, to) } : x)),
          folders: a.folders.map((x) => (isUnder(x, from) ? reparent(x, from, to) : x)),
        }));
      },

      deleteNode: (id, path) => {
        if (refuseReserved(path, "deleted")) return;
        patch(id, (a) => ({
          files: a.files.filter((x) => !isUnder(x.path, path)),
          folders: a.folders.filter((x) => !isUnder(x, path)),
        }));
      },

      duplicateNode: (id, path) => {
        if (refuseReserved(path, "duplicated")) return;
        patch(id, (a) => {
          const src = a.files.find((x) => x.path === path);
          if (!src) return {};
          const dot = path.lastIndexOf(".");
          const copy = dot > 0 ? `${path.slice(0, dot)}-copy${path.slice(dot)}` : `${path}-copy`;
          return { files: [...a.files, { path: copy, content: src.content }] };
        });
      },

      moveNode: (id, from, toDir) => {
        if (refuseReserved(from, "moved")) return;
        patch(id, (a) => {
          const base = from.split("/").pop();
          const to = toDir ? `${toDir}/${base}` : base;
          if (to === from) return {};
          return {
            files: a.files.map((x) => (isUnder(x.path, from) ? { ...x, path: reparent(x.path, from, to) } : x)),
            folders: a.folders.map((x) => (isUnder(x, from) ? reparent(x, from, to) : x)),
          };
        });
      },

      reset: () => setAgents(AGENTS_V2.map((a) => normalise(a))),
    }),
    [agents, patch, projected, applyAgentJson],
  );

  return <AgentsV2Context.Provider value={api}>{children}</AgentsV2Context.Provider>;
}

export function useAgentsV2() {
  const ctx = useContext(AgentsV2Context);
  if (!ctx) throw new Error("useAgentsV2 must be used inside <AgentsV2Provider>");
  return ctx;
}
