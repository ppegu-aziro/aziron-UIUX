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
import AuthorPanel from "@/components/agents-v2/AuthorPanel";
import { AgentsV2Provider, useAgentsV2 } from "@/context/AgentsV2Context";

/**
 * Agents v2 — the unified concept prototype.
 *
 * There is no separate create screen. "New agent" makes an empty draft and
 * opens the editor with the Author panel beside it, so generating and editing
 * are the same view: ask for something, watch the files change, edit them by
 * hand, ask for the next thing.
 *
 * A wizard that generates and then hands you off to an editor makes the
 * generated result feel finished and the editing feel like repair. Putting
 * them side by side makes iteration the default.
 *
 * One side panel at a time — Author writes files, Chat talks to the agent.
 * Both are inline siblings of the content column, as in the live page.
 */

function AgentsV2Inner({ onNavigate }) {
  const { get, create, reset } = useAgentsV2();
  const [view, setView] = useState("catalog");
  const [agentId, setAgentId] = useState(null);
  const [panel, setPanel] = useState(null); // { type: "chat" | "author", id }
  const [expanded, setExpanded] = useState(false);

  const panelAgent = panel ? get(panel.id) : null;
  const hideMainColumn = Boolean(panelAgent) && expanded;

  const openEditor = (a) => {
    setAgentId(a?.id ?? a);
    setView("agent");
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

  /** New agent: an empty draft, opened in the editor with Author beside it. */
  const newAgent = () => {
    const record = create({
      name: "Untitled agent",
      description: "",
      instructions: "",
      files: [{ path: "AGENT.md", content: "" }],
    });
    openEditor(record);
    openPanel("author", record);
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
                    <Button type="button" size="sm" onClick={newAgent}>
                      <Plus className="size-3.5" aria-hidden />
                      New agent
                    </Button>
                  </>
                )}
              </PageHeader>

              <div className="pb-12">
                {view === "catalog" && (
                  <CatalogView onChat={(a) => openPanel("chat", a)} onEdit={openEditor} />
                )}

                {view === "agent" && agentId && (
                  <AgentView
                    key={agentId}
                    agentId={agentId}
                    onBack={backToCatalog}
                    onDistribute={() => setView("distribute")}
                    onChat={(a) => openPanel("chat", a)}
                    onAuthor={(a) => openPanel("author", a)}
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
          {panelAgent && panel.type === "author" && (
            <AuthorPanel
              key={`author-${panelAgent.id}`}
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
