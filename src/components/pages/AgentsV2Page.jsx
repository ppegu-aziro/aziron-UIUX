import { useState } from "react";
import { Boxes, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import AppHeader from "@/components/layout/AppHeader";
import Sidebar from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import CatalogView from "@/components/agents-v2/CatalogView";
import AgentView from "@/components/agents-v2/AgentView";
import CreateView from "@/components/agents-v2/CreateView";
import DistributeView from "@/components/agents-v2/DistributeView";
import ChatPanel from "@/components/agents-v2/ChatPanel";
import { AgentsV2Provider, useAgentsV2 } from "@/context/AgentsV2Context";

/**
 * Agents v2 — the unified concept prototype.
 *
 * One noun ("Agent") absorbing what used to be two overlapping objects.
 *
 * There is no view switcher. Distribute and the concept explainer were tabs in
 * the first pass and read as top-level destinations, which they are not — you
 * cannot distribute "agents", only a particular agent. Both are now reached
 * from the agent that owns them, and the list is simply the page.
 */

function AgentsV2Inner({ onNavigate }) {
  const { get, reset } = useAgentsV2();
  const [view, setView] = useState("catalog");
  const [agentId, setAgentId] = useState(null);
  const [chatId, setChatId] = useState(null);

  const chatAgent = chatId ? get(chatId) : null;

  const openEditor = (a) => {
    setAgentId(a?.id ?? a);
    setView("agent");
  };

  const backToCatalog = () => {
    setAgentId(null);
    setView("catalog");
  };

  const title =
    view === "create" ? "New agent" : view === "distribute" ? "Distribute" : "Agents";

  return (
    <main className="app-page-main flex h-full min-h-0 w-full flex-1 overflow-hidden bg-background">
      <Sidebar activePage="agents-v2" onNavigate={onNavigate} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
                  {/* Create lives in the header, where every other list page
                      in this product puts its primary action. */}
                  <Button type="button" size="sm" onClick={() => setView("create")}>
                    <Plus className="size-3.5" aria-hidden />
                    New agent
                  </Button>
                </>
              )}
            </PageHeader>

            <div className="pb-12">
              {view === "catalog" && (
                <CatalogView onChat={(a) => setChatId(a.id)} onEdit={openEditor} />
              )}

              {view === "agent" && agentId && (
                <AgentView
                  key={agentId}
                  agentId={agentId}
                  onBack={backToCatalog}
                  onDistribute={() => setView("distribute")}
                />
              )}

              {view === "create" && (
                <CreateView onBack={backToCatalog} onCreated={(record) => openEditor(record)} />
              )}

              {view === "distribute" && agentId && (
                <DistributeView agentId={agentId} onBack={() => setView("agent")} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat opens from a card click, the way it does in the live page. */}
      {chatAgent && (
        <ChatPanel
          agent={chatAgent}
          onClose={() => setChatId(null)}
          onSetupRuntime={() => {
            const id = chatAgent.id;
            setChatId(null);
            openEditor(id);
          }}
        />
      )}
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
