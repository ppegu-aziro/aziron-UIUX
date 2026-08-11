import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { AGENTS_V2, ALL_TOOLS, bumpVersion } from "@/data/agentsV2";

/**
 * Mock state for the unified Agents prototype.
 *
 * Everything a user does here is real within the session: binding a model,
 * granting tools, editing instructions, releasing. That matters because the
 * design's central claim — that an agent has two halves and either can be
 * filled in later — is only convincing if you can watch a half get filled.
 *
 * Persisted to localStorage the same way agentsCatalog does, so a reviewer can
 * reload without losing what they were shown.
 */

const KEY = "aziron_agents_v2";

const AgentsV2Context = createContext(null);

/** Default instructions body for a seed record that has none stored. */
const defaultInstructions = (a) =>
  [
    `# ${a.name}`,
    "",
    a.description,
    "",
    "Use the references in this folder before answering. When something is not",
    "covered, say so rather than guessing.",
  ].join("\n");

/**
 * Seeds carry a tool COUNT but no tool names. Materialise names so the tool
 * picker has something real to check, and so posture and grant can never
 * disagree — the count is derived from the list, never stored beside it.
 */
function normalise(a) {
  const granted =
    a.granted ?? (a.tools === "scoped" ? ALL_TOOLS.slice(0, a.toolCount ?? 0) : []);
  return {
    ...a,
    instructions: a.instructions ?? defaultInstructions(a),
    granted,
    toolCount: granted.length,
    releaseNotes: a.releaseNotes ?? [],
  };
}

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
      /* storage full or blocked — the prototype still works in-memory */
    }
  }, [agents]);

  const patch = useCallback((id, changes) => {
    setAgents((list) =>
      list.map((a) =>
        a.id === id
          ? normalise({ ...a, ...(typeof changes === "function" ? changes(a) : changes), updated: "just now" })
          : a,
      ),
    );
  }, []);

  const api = useMemo(
    () => ({
      agents,

      get: (id) => agents.find((a) => a.id === id) ?? null,

      patch,

      /** Fill the "runs here" half. */
      setRuntime: (id, runtime) => patch(id, { runtime }),
      clearRuntime: (id) => patch(id, { runtime: null }),

      /**
       * Posture and grant move together. Selecting "scoped" with nothing ticked
       * would otherwise read as restricted while behaving like "none", which is
       * exactly the kind of quiet disagreement this design exists to remove.
       */
      setTools: (id, { tools, granted = [] }) =>
        patch(id, {
          tools,
          granted: tools === "scoped" ? granted : [],
        }),

      setKnowledge: (id, knowledge) => patch(id, { knowledge }),
      setTargets: (id, targets) => patch(id, { targets }),

      /** Fill the "runs anywhere" half. */
      release: (id, { kind = "patch", notes = "" } = {}) =>
        patch(id, (a) => {
          const version = a.release ? bumpVersion(a.release.version, kind) : "1.0.0";
          return {
            release: { version, published: "just now" },
            targets: a.targets.length ? a.targets : ["claude"],
            releaseNotes: [{ version, notes, at: "just now" }, ...(a.releaseNotes ?? [])],
          };
        }),

      /** Create from the Create flow. */
      create: ({ name, description, instructions, knowledge = [] }) => {
        const id = `a-new-${Date.now()}`;
        const record = normalise({
          id,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          name,
          description,
          instructions,
          category: "Operations",
          origin: "both",
          runtime: { provider: "Automatic", model: "Auto" },
          release: null,
          targets: [],
          tools: "none",
          granted: [],
          knowledge,
          files: ["AGENT.md"],
          updated: "just now",
          installs: 0,
          owner: "You",
        });
        setAgents((list) => [record, ...list]);
        return record;
      },

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
