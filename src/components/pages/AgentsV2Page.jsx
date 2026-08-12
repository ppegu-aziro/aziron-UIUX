import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Boxes, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import AppHeader from "@/components/layout/AppHeader";
import Sidebar from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import CatalogView from "@/components/agents-v2/CatalogView";
import AgentView from "@/components/agents-v2/AgentView";
import DistributeView from "@/components/agents-v2/DistributeView";
import ChatPanel from "@/components/agents-v2/ChatPanel";
import { AgentsV2Provider, useAgentsV2 } from "@/context/AgentsV2Context";

/**
 * Agents v2 — the unified concept prototype.
 *
 * There is no separate create screen. "New agent" makes an empty draft and
 * opens the editor, ready to type in. The Agent Generator is a sibling panel
 * you open with Generate when you want it — never opened for you, because
 * writing by hand is the baseline and generating is the assist.
 *
 * Once open it sits beside the editor rather than replacing it, so generating
 * and editing are the same view: ask, watch the files change, edit by hand,
 * ask again. A wizard that generates and then hands you off to an editor makes
 * the generated result feel finished and the editing feel like repair.
 *
 * One side panel at a time — Generator writes files, Chat talks to the agent.
 * Both are inline siblings of the content column, as in the live page.
 */

function AgentsV2Inner({ onNavigate }) {
  const { get, create, remove, reset } = useAgentsV2();
  const [view, setView] = useState("catalog");
  const [agentId, setAgentId] = useState(null);
  const [panel, setPanel] = useState(null); // { type: "chat", id }
  // A sentence from the catalog, handed to the editor to open its assistant with.
  const [seed, setSeed] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const panelAgent = panel ? get(panel.id) : null;
  const hideMainColumn = Boolean(panelAgent) && expanded;

  const openEditor = (a) => {
    setSeed(null);
    setAgentId(a?.id ?? a);
    setView("agent");
    // Arrive on a clean editor. A panel left open from the previous action is
    // leftover context, and the generator in particular must be opt-in.
    setPanel(null);
    setExpanded(false);
  };

  const backToCatalog = () => {
    setAgentId(null);
    setView("catalog");
  };

  const closePanel = () => {
    setPanel(null);
    setExpanded(false);
  };

  const openPanel = (type, a) => {
    setPanel({ type, id: a?.id ?? a });
    setExpanded(false);
  };

  const blankDraft = () =>
    create({ name: "", description: "", instructions: "", files: [{ path: "AGENT.md", content: "" }] });

  /**
   * Start blank: an empty, unnamed draft opened ready to type in.
   *
   * Nothing is named for you — a placeholder name survives into the catalog,
   * the slug and the release unless someone remembers to change it. The
   * Assistant is not opened either; this is the hand-authoring path.
   */
  const startBlank = () => {
    setSeed(null);
    openEditor(blankDraft());
  };

  /**
   * Create from a sentence typed on the catalog.
   *
   * Stating intent and getting a draft are one action rather than two screens:
   * the sentence becomes the Assistant's first turn, so by the time the
   * workspace paints, the files are already being written.
   */
  const createFromIntent = (text) => {
    const record = blankDraft();
    setSeed(text);
    setAgentId(record.id);
    setView("agent");
    setPanel(null);
  };

  /**
   * Leaving the editor discards a draft nobody committed to: no name and no
   * content. Keeping it would put an anonymous row in the catalog that the
   * user never asked to create.
   */
  const leaveEditor = () => {
    const a = agentId ? get(agentId) : null;
    const untouched =
      a && !a.name.trim() && a.files.every((f) => !f.content.trim()) && !a.description.trim();
    if (untouched) {
      remove(a.id);
      toast.message("Empty draft discarded");
    }
    backToCatalog();
  };

  const title = view === "distribute" ? "Distribute" : "Agents";

  return (
    <main className="app-page-main flex h-full min-h-0 w-full flex-1 overflow-hidden bg-background">
      <Sidebar activePage="agents-v2" onNavigate={onNavigate} />

      <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          className={hideMainColumn ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"}
        >
          <AppHeader onNavigate={onNavigate} />

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 px-6 py-4">
              <PageHeader
                title={title}
                description={
                  view === "catalog"
                    ? "One agent is a folder of instructions. Give it a model and it runs here; release it and it runs anywhere."
                    : undefined
                }
              >
                {view === "catalog" && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        reset();
                        backToCatalog();
                        closePanel();
                        toast.message("Prototype reset to its seed data");
                      }}
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                      Reset
                    </Button>
                    <Badge variant="outline" className="gap-1">
                      <Boxes className="size-3" aria-hidden />
                      concept · v2
                    </Badge>
                    <Button type="button" size="sm" onClick={startBlank}>
                      <Plus className="size-3.5" aria-hidden />
                      New agent
                    </Button>
                  </>
                )}
              </PageHeader>

              <div className="pb-12">
                {view === "catalog" && (
                  <CatalogView
                    onChat={(a) => openPanel("chat", a)}
                    onEdit={openEditor}
                    onCreateFromIntent={createFromIntent}
                    onStartBlank={startBlank}
                  />
                )}

                {view === "agent" && agentId && (
                  <AgentView
                    key={agentId}
                    agentId={agentId}
                    onBack={leaveEditor}
                    onDistribute={() => setView("distribute")}
                    onChat={(a) => openPanel("chat", a)}
                    seedPrompt={seed}
                  />
                )}

                {view === "distribute" && agentId && (
                  <DistributeView agentId={agentId} onBack={() => setView("agent")} />
                )}
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {panelAgent && panel.type === "chat" && (
            <ChatPanel
              key={`chat-${panelAgent.id}`}
              agent={panelAgent}
              onClose={closePanel}
              isExpanded={expanded}
              onToggleExpand={() => setExpanded((v) => !v)}
            />
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

export default function AgentsV2Page({ onNavigate }) {
  return (
    <AgentsV2Provider>
      <AgentsV2Inner onNavigate={onNavigate} />
    </AgentsV2Provider>
  );
}
