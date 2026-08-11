import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useFlowCatalog } from "@/context/FlowCatalogContext";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { PAGE_PATH } from "@/navigation/pagePaths";
import { TENANTS } from "@/data/adminData";
import NewChatPage from "@/components/pages/NewChatPage";
import AgentsListPage from "@/components/pages/AgentsListPage";
import AgentDetailPage from "@/components/pages/AgentDetailPage";
import CreateAgentPage from "@/components/pages/CreateAgentPage";
import AgentsV2Page from "@/components/pages/AgentsV2Page";
import {
  INITIAL_AGENTS,
  loadAgentsFromStorage,
  saveAgentsToStorage,
} from "@/data/agentsCatalog";
import { agentPublishScopePatch } from "@/lib/agentPublishScope";
import { AgentsProvider } from "@/context/AgentsContext";
import { KnowledgeHubProvider } from "@/context/KnowledgeHubContext";
import { MyDigitalHubRelationshipSync } from "@/components/features/knowledge/MyDigitalHubRelationshipSync";
import { VaultProvider } from "@/context/VaultContext";
import AgentPage from "@/components/pages/AgentPage";
import SettingsAppearancePage from "@/components/pages/SettingsAppearancePage";
import FlowsPage from "@/components/pages/FlowsPage";
import NotFoundPage from "@/components/pages/NotFoundPage";
import UsersListPage from "@/components/pages/UsersListPage";
import UserDetailPage from "@/components/pages/UserDetailPage";
import UserGroupsPage from "@/components/pages/UserGroupsPage";
import UsagePage from "@/components/pages/UsagePage";
import VaultPage from "@/components/pages/VaultPage";
import KnowledgePage, { DocumentsRouteRedirect } from "@/components/pages/KnowledgePage";
import MarketplacePage from "@/components/pages/MarketplacePage";
import TenantListPage from "@/components/pages/TenantListPage";
import TenantDetailPage from "@/components/pages/TenantDetailPage";
import TenantCreatePage from "@/components/pages/TenantCreatePage";
import PricingPlansPage from "@/components/pages/PricingPlansPage";
import TenantUsersPage from "@/components/pages/TenantUsersPage";
import PulsePage from "@/components/pages/PulsePage";
import InsuranceManagementPage from "@/components/pages/InsuranceManagementPage";
import InsuranceConfigPage     from "@/components/pages/InsuranceConfigPage";
import EmployeeInsurancePage from "@/components/pages/EmployeeInsurancePage";
import MyProfilePage from "@/components/pages/MyProfilePage";
import ProjectsPage from "@/components/pages/ProjectsPage";
import ProjectDetailPage from "@/components/pages/ProjectDetailPage";
import ProjectFormPage from "@/components/pages/ProjectFormPage";
import ProjectDocumentUploadPage from "@/components/pages/ProjectDocumentUploadPage";
import InvoiceSectionPage from "@/components/pages/invoice/InvoiceSectionPage";

const FlowViewPage = lazy(() => import("@/components/pages/FlowViewPage"));

function FlowViewLoading() {
  return (
    <div className="flex min-h-[60vh] w-full flex-1 items-center justify-center bg-background px-6">
      <p className="text-sm text-muted-foreground">Loading flow editor…</p>
    </div>
  );
}

function useLegacyNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (page, options) => {
      const path = PAGE_PATH[page];
      if (path) navigate(path, options);
      else navigate("/", options);
    },
    [navigate],
  );
}

function FlowViewRoute() {
  const { flowId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { flows, patchFlow, forkFlow } = useFlowCatalog();
  const onNavigate = useLegacyNavigate();
  const flow = flows.find((f) => String(f.id) === String(flowId));
  const intent = location.state?.flowOpenIntent ?? "execute";
  const autoRun = location.state?.autoRun === true;

  const handleForkFlow = useCallback(
    (opts) => {
      const forked = forkFlow(flowId, opts);
      if (forked) navigate(`/flows/${forked.id}`, { state: { flowOpenIntent: "edit" } });
    },
    [forkFlow, flowId, navigate],
  );

  if (!flow) {
    return <Navigate to="/flows" replace />;
  }

  return (
    <Suspense fallback={<FlowViewLoading />}>
      <FlowViewPage
        flow={flow}
        onNavigate={onNavigate}
        flowOpenIntent={intent}
        autoRunFromRoute={autoRun}
        onFlowPatch={patchFlow}
        onForkFlow={handleForkFlow}
      />
    </Suspense>
  );
}

function InsuranceAdminRoute({ children }) {
  const { auth } = useAuth();
  if (auth.role !== "superadmin" && auth.role !== "tenantadmin") {
    return <Navigate to="/my-profile" replace />;
  }
  return children;
}

function EmployeeInsuranceRoute({ onNavigate }) {
  const { auth } = useAuth();
  if (auth.role !== "superadmin" && auth.role !== "tenantadmin" && auth.role !== "tenantuser") {
    return <Navigate to="/new-chat" replace />;
  }
  return <EmployeeInsurancePage onNavigate={onNavigate} />;
}

/** Creates a draft via catalog and lands on `/flows/:id` (edit intent). */
function TenantCreateRoute({ onNavigate, onTenantCreated }) {
  const { can } = usePermissions();
  if (!can("tenants.create")) {
    const fallback = can("tenants.view") ? "/tenants/detail" : "/new-chat";
    return <Navigate to={fallback} replace />;
  }
  return <TenantCreatePage onNavigate={onNavigate} onTenantCreated={onTenantCreated} />;
}

function MarketplaceRoute({ onNavigate, agents, patchAgent, navigate }) {
  const { can } = usePermissions();
  if (!can("marketplace.view")) {
    return <Navigate to="/new-chat" replace />;
  }
  return (
    <MarketplacePage
      onNavigate={onNavigate}
      workspaceAgents={agents}
      onUnpublishAgent={(agentId) => {
        patchAgent(agentId, agentPublishScopePatch("private"));
        navigate("/agents");
      }}
    />
  );
}

function CreateFlowRedirect() {
  const navigate = useNavigate();
  const { createDraftFlow } = useFlowCatalog();
  const initiated = useRef(false);

  useEffect(() => {
    if (initiated.current) return;
    initiated.current = true;
    const f = createDraftFlow("template");
    navigate(`/flows/${f.id}`, { replace: true, state: { flowOpenIntent: "edit" } });
  }, [createDraftFlow, navigate]);

  return (
    <div className="flex min-h-[40vh] w-full flex-1 items-center justify-center bg-background px-6">
      <p className="text-sm text-muted-foreground">Starting new flow…</p>
    </div>
  );
}

export default function AppRoutes() {
  const navigate = useNavigate();
  const onNavigate = useLegacyNavigate();
  const { auth } = useAuth();

  const isTenantAdmin = auth.role === "tenantadmin";
  // Tenant admins always operate on their own org (Meridian Financial = TENANTS[0])
  const ownTenant = TENANTS[0];

  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agents, setAgents] = useState(() => loadAgentsFromStorage() ?? INITIAL_AGENTS);

  useEffect(() => {
    saveAgentsToStorage(agents);
  }, [agents]);
  const [viewedAgent, setViewedAgent] = useState(null);
  const [initialMessage, setInitialMessage] = useState("");
  const [viewedUser, setViewedUser] = useState(null);
  const [viewedTenant, setViewedTenant] = useState(isTenantAdmin ? ownTenant : null);

  const openAgent = useCallback((agent) => {
    setSelectedAgent(agent);
    if (agent?.name === "Customer Appreciation") {
      navigate("/agents", { state: { openKudosAgent: true } });
    } else {
      navigate("/chat");
    }
  }, [navigate]);

  const viewAgent = useCallback(
    (agent) => {
      setViewedAgent(agent);
      navigate("/agents/detail");
    },
    [navigate],
  );

  const patchAgent = useCallback((id, partial) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...partial } : a)));
    setViewedAgent((prev) => (prev?.id === id ? { ...prev, ...partial } : prev));
  }, []);

  const addAgent = useCallback((payload) => {
    setAgents((prev) => {
      const nextId = prev.length ? Math.max(...prev.map((a) => a.id)) + 1 : 0;
      const date = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      return [
        ...prev,
        {
          id: nextId,
          date,
          status: "idle",
          lastRun: "Never",
          success: 0,
          accessEnabled: false,
          visibility: "private",
          ...payload,
        },
      ];
    });
  }, []);

  const navigateToEditAgent = useCallback(
    (agent) => {
      navigate(`/agents/${agent.id}/edit`);
    },
    [navigate],
  );

  const startChat = useCallback(
    (message) => {
      setInitialMessage(message);
      setSelectedAgent(null);
      navigate("/chat");
    },
    [navigate],
  );

  return (
    <AgentsProvider
      agents={agents}
      setAgents={setAgents}
      patchAgent={patchAgent}
      addAgent={addAgent}
    >
      <KnowledgeHubProvider>
        <MyDigitalHubRelationshipSync />
        <VaultProvider>
        <Routes>
      <Route path="/" element={<Navigate to="/new-chat" replace />} />

      <Route
        path="/new-chat"
        element={<NewChatPage onNavigate={onNavigate} onStartChat={startChat} />}
      />
      {/* Unified "Agents" concept prototype — see components/agents-v2/. */}
      <Route path="/agents-v2" element={<AgentsV2Page onNavigate={onNavigate} />} />
      <Route
        path="/agents"
        element={
          <AgentsListPage
            onNavigate={onNavigate}
            onViewAgent={viewAgent}
            onEditAgent={navigateToEditAgent}
            agents={agents}
            onAgentsChange={setAgents}
          />
        }
      />
      <Route
        path="/agents/create"
        element={
          <CreateAgentPage
            onNavigate={onNavigate}
            agents={agents}
            onPatchAgent={patchAgent}
            onAddAgent={addAgent}
            onAgentsChange={setAgents}
          />
        }
      />
      <Route
        path="/agents/:agentId/edit"
        element={
          <CreateAgentPage
            onNavigate={onNavigate}
            agents={agents}
            onPatchAgent={patchAgent}
            onAddAgent={addAgent}
            onAgentsChange={setAgents}
          />
        }
      />
      <Route
        path="/agents/detail"
        element={
          <AgentDetailPage
            agent={viewedAgent}
            onNavigate={onNavigate}
            onEditAgent={
              viewedAgent ? () => navigate(`/agents/${viewedAgent.id}/edit`) : undefined
            }
          />
        }
      />
      <Route
        path="/chat"
        element={
          <AgentPage agent={selectedAgent} initialMessage={initialMessage} onNavigate={onNavigate} />
        }
      />
      <Route
        path="/kudos"
        element={<Navigate to="/agents" replace state={{ openKudosAgent: true }} />}
      />
      <Route path="/settings" element={<SettingsAppearancePage onNavigate={onNavigate} />} />
      <Route
        path="/notifications"
        element={<SettingsAppearancePage onNavigate={onNavigate} initialSection="notifications" />}
      />

      <Route path="/flows" element={<FlowsPage />} />
      <Route path="/flows/:flowId" element={<FlowViewRoute />} />
      <Route path="/create-flow" element={<CreateFlowRedirect />} />

      <Route
        path="/users"
        element={
          <UsersListPage
            onNavigate={onNavigate}
            onViewUser={(u) => {
              setViewedUser(u);
              navigate("/users/detail");
            }}
          />
        }
      />
      <Route
        path="/users/detail"
        element={<UserDetailPage user={viewedUser} onNavigate={onNavigate} />}
      />
      <Route path="/user-groups" element={<UserGroupsPage onNavigate={onNavigate} />} />
      <Route path="/usage" element={<UsagePage onNavigate={onNavigate} />} />
      <Route path="/vault" element={<VaultPage onNavigate={onNavigate} />} />
      <Route path="/knowledge" element={<KnowledgePage onNavigate={onNavigate} />} />
      <Route path="/knowledge/:hubId" element={<KnowledgePage onNavigate={onNavigate} />} />
      <Route path="/knowledge/documents" element={<DocumentsRouteRedirect />} />
      <Route path="/documents" element={<DocumentsRouteRedirect />} />
      <Route path="/marketplace" element={<MarketplaceRoute onNavigate={onNavigate} agents={agents} patchAgent={patchAgent} navigate={navigate} />} />
      <Route path="/pulse" element={<PulsePage onNavigate={onNavigate} />} />

      <Route
        path="/tenants"
        element={
          isTenantAdmin
            ? <Navigate to="/tenants/detail" replace />
            : <TenantListPage
                onNavigate={onNavigate}
                onViewTenant={(t) => {
                  setViewedTenant(t);
                  navigate("/tenants/detail");
                }}
                onEditTenant={(t) => {
                  setViewedTenant(t);
                  navigate("/tenants/detail?section=settings");
                }}
                onCreateTenant={() => navigate("/tenants/new")}
              />
        }
      />
      <Route
        path="/tenants/detail"
        element={
          <TenantDetailPage
            tenant={isTenantAdmin ? ownTenant : viewedTenant}
            onNavigate={onNavigate}
          />
        }
      />
      <Route
        path="/tenants/new"
        element={
          <TenantCreateRoute
            onNavigate={onNavigate}
            onTenantCreated={(t) => {
              setViewedTenant(t);
              navigate("/tenants/detail");
            }}
          />
        }
      />
      <Route path="/pricing-plans" element={<PricingPlansPage onNavigate={onNavigate} />} />
      <Route
        path="/insurance-management"
        element={
          <InsuranceAdminRoute>
            <InsuranceManagementPage onNavigate={onNavigate} />
          </InsuranceAdminRoute>
        }
      />
      <Route
        path="/insurance-config"
        element={
          <InsuranceAdminRoute>
            <InsuranceConfigPage onNavigate={onNavigate} />
          </InsuranceAdminRoute>
        }
      />
      <Route path="/employee-insurance" element={<EmployeeInsuranceRoute onNavigate={onNavigate} />} />
      <Route path="/tenant-users" element={<TenantUsersPage onNavigate={onNavigate} />} />

      <Route path="/my-profile" element={<MyProfilePage onNavigate={onNavigate} />} />

      <Route path="/finance/projects" element={<ProjectsPage onNavigate={onNavigate} />} />
      <Route
        path="/finance/projects/create/manual"
        element={<ProjectFormPage onNavigate={onNavigate} mode="manual-create" />}
      />
      <Route
        path="/finance/projects/create/document"
        element={<Navigate to="/finance/projects/create/manual" replace />}
      />
      <Route path="/finance/projects/create" element={<Navigate to="/finance/projects" replace />} />
      <Route path="/finance/projects/new" element={<Navigate to="/finance/projects" replace />} />
      <Route
        path="/finance/projects/:projectId/edit"
        element={<ProjectFormPage onNavigate={onNavigate} mode="manual-edit" />}
      />
      <Route
        path="/finance/projects/:projectId/upload"
        element={<ProjectDocumentUploadPage onNavigate={onNavigate} />}
      />
      <Route
        path="/finance/projects/:projectId"
        element={<ProjectDetailPage onNavigate={onNavigate} />}
      />
      <Route
        path="/finance/reports"
        element={
          <InvoiceSectionPage
            activePage="invoice-reports"
            onNavigate={onNavigate}
            title="Reports"
            description="View invoice and revenue reports."
          />
        }
      />
      <Route
        path="/finance/invoices"
        element={
          <InvoiceSectionPage
            activePage="invoice-invoices"
            onNavigate={onNavigate}
            title="Invoices"
            description="Create and manage customer invoices."
          />
        }
      />
      <Route
        path="/finance/payments"
        element={
          <InvoiceSectionPage
            activePage="invoice-payments"
            onNavigate={onNavigate}
            title="Payments"
            description="Track and reconcile incoming payments."
          />
        }
      />
      <Route
        path="/finance/customers"
        element={
          <InvoiceSectionPage
            activePage="invoice-customers"
            onNavigate={onNavigate}
            title="Customers"
            description="Manage billing customers and contacts."
          />
        }
      />
      <Route
        path="/finance/currency-rates"
        element={
          <InvoiceSectionPage
            activePage="invoice-currency-rates"
            onNavigate={onNavigate}
            title="Currency Rates"
            description="Configure exchange rates for multi-currency billing."
          />
        }
      />

      <Route path="*" element={<NotFoundPage onNavigate={onNavigate} />} />
        </Routes>
        </VaultProvider>
      </KnowledgeHubProvider>
    </AgentsProvider>
  );
}
