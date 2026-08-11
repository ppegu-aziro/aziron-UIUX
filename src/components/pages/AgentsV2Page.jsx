import { useState } from "react";
import { Boxes, Compass, Layers, RotateCcw, Rocket, Sparkles } from "lucide-react";
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
import ModelView from "@/components/agents-v2/ModelView";
import { AgentsV2Provider, useAgentsV2 } from "@/context/AgentsV2Context";

/**
 * Agents v2 — the unified concept prototype.
 *
 * One noun ("Agent") absorbing what used to be two overlapping objects.
 * Everything here mutates real (mock) state: binding a model, granting tools,
 * editing instructions and releasing all persist, because the design's central
 * claim is that an agent has two halves and either can be filled in later —
 * and that is only convincing if you can watch a half get filled.
 */

const VIEWS = [
  { id: "catalog", label: "Agents", icon: Layers },
  { id: "create", label: "Create", icon: Sparkles },
  { id: "distribute", label: "Distribute", icon: Rocket },
  { id: "model", label: "The model", icon: Compass },
];

function AgentsV2Inner({ onNavigate }) {
  const { agents, reset } = useAgentsV2();
  const [view, setView] = useState("catalog");
  const [agentId, setAgentId] = useState(null);

  const openAgent = (a) => {
    setAgentId(a?.id ?? a);
    setView("agent");
  };

  const backToCatalog = () => {
    setAgentId(null);
    setView("catalog");
  };

  // Distribute needs an agent; fall back to the first released one so the tab
  // is never a dead end when reached from the top nav.
  const distributeId = agentId ?? agents.find((a) => a.release)?.id ?? agents[0]?.id;

  return (
    <main className="app-page-main flex h-full min-h-0 w-full flex-1 overflow-hidden bg-background">
      <Sidebar activePage="agents-v2" onNavigate={onNavigate} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader onNavigate={onNavigate} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 px-6 py-4">
            <PageHeader
              title="Agents"
              description="One agent is a folder of instructions. Give it a model and it runs here; release it and it runs anywhere."
            >
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
            </PageHeader>

            <div className="flex items-center gap-0.5 self-start rounded-lg border border-border bg-card p-0.5">
              {VIEWS.map((v) => {
                const active = view === v.id || (v.id === "catalog" && view === "agent");
                return (
                  <Button
                    key={v.id}
                    type="button"
                    size="sm"
                    variant={active ? "secondary" : "ghost"}
                    aria-pressed={active}
                    onClick={() => setView(v.id)}
                  >
                    <v.icon className="size-3.5" aria-hidden />
                    {v.label}
                  </Button>
                );
              })}
            </div>

            <div className="pb-12">
              {view === "catalog" && (
                <CatalogView onOpen={openAgent} onCreate={() => setView("create")} />
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
                <CreateView
                  onBack={backToCatalog}
                  onCreated={(record) => openAgent(record)}
                />
              )}

              {view === "distribute" && (
                <DistributeView
                  agentId={distributeId}
                  onBack={() => (agentId ? setView("agent") : backToCatalog())}
                />
              )}

              {view === "model" && <ModelView />}
            </div>
          </div>
        </div>
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
