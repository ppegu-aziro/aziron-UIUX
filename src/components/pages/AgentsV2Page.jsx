import { useState } from "react";
import { Boxes, Compass, Layers, Rocket, Sparkles } from "lucide-react";

import AppHeader from "@/components/layout/AppHeader";
import Sidebar from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import CatalogView from "@/components/agents-v2/CatalogView";
import AgentView from "@/components/agents-v2/AgentView";
import CreateView from "@/components/agents-v2/CreateView";
import DistributeView from "@/components/agents-v2/DistributeView";
import ModelView from "@/components/agents-v2/ModelView";
import { AGENTS_V2 } from "@/data/agentsV2";

/**
 * Agents v2 — the unified concept prototype.
 *
 * One noun ("Agent") absorbing what used to be two overlapping objects. The
 * screens here are a walkthrough rather than an app: catalog, agent, create,
 * distribute, and the model itself.
 *
 * `The model` is a tab rather than a doc because the concept's whole risk is
 * whether people can repeat the sentence. If it only lives in a deck, it loses.
 */

const VIEWS = [
  { id: "catalog", label: "Agents", icon: Layers },
  { id: "create", label: "Create", icon: Sparkles },
  { id: "distribute", label: "Distribute", icon: Rocket },
  { id: "model", label: "The model", icon: Compass },
];

export default function AgentsV2Page({ onNavigate }) {
  const [view, setView] = useState("catalog");
  const [agent, setAgent] = useState(null);

  const openAgent = (a) => {
    setAgent(a);
    setView("agent");
  };

  const backToCatalog = () => {
    setAgent(null);
    setView("catalog");
  };

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
              <Badge variant="outline" className="gap-1">
                <Boxes className="size-3" aria-hidden />
                concept · v2
              </Badge>
            </PageHeader>

            {/* View switcher */}
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
                    onClick={() => {
                      setView(v.id);
                      if (v.id !== "agent") setAgent(v.id === "distribute" ? agent : null);
                    }}
                  >
                    <v.icon className="size-3.5" aria-hidden />
                    {v.label}
                  </Button>
                );
              })}
            </div>

            <div className={cn("pb-10", view === "agent" && "pb-16")}>
              {view === "catalog" && (
                <CatalogView onOpen={openAgent} onCreate={() => setView("create")} />
              )}

              {view === "agent" && agent && (
                <AgentView
                  agent={agent}
                  onBack={backToCatalog}
                  onDistribute={() => setView("distribute")}
                />
              )}

              {view === "create" && (
                <CreateView onBack={backToCatalog} onCreated={() => openAgent(AGENTS_V2[1])} />
              )}

              {view === "distribute" && (
                <DistributeView
                  agent={agent ?? AGENTS_V2[0]}
                  onBack={() => (agent ? setView("agent") : backToCatalog())}
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
