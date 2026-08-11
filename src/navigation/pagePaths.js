/** Maps legacy `currentPage` ids (Sidebar / onNavigate) to URL paths. */
export const PAGE_PATH = {
  "new-chat": "/new-chat",
  agents: "/agents",
  "agents-v2": "/agents-v2",
  "agent-detail": "/agents/detail",
  chat: "/chat",
  kudos: "/kudos",
  settings: "/settings",
  notifications: "/notifications",
  flows: "/flows",
  "flow-view": "/flows",
  users: "/users",
  "users-list": "/users",
  "user-detail": "/users/detail",
  "user-groups": "/user-groups",
  usage: "/usage",
  /** Sidebar “Roles” → tenant users until a dedicated roles route exists */
  "users-roles": "/tenant-users",
  vault: "/vault",
  knowledge: "/knowledge",
  "knowledge-research": "/knowledge",
  documents: "/knowledge",
  marketplace: "/marketplace",
  pulse: "/pulse",
  tenants: "/tenants",
  "tenant-detail": "/tenants/detail",
  "tenant-create": "/tenants/new",
  "pricing-plans": "/pricing-plans",
  "tenant-users": "/tenant-users",
  "insurance-management": "/insurance-management",
  "insurance-config":     "/insurance-config",
  "employee-insurance":   "/employee-insurance",
  "my-profile":           "/my-profile",
  "invoice-reports":        "/finance/reports",
  "invoice-invoices":       "/finance/invoices",
  "invoice-payments":       "/finance/payments",
  "invoice-customers":      "/finance/customers",
  "invoice-projects":       "/finance/projects",
  "invoice-currency-rates": "/finance/currency-rates",
};

/**
 * Sidebar active highlight: derive legacy page id from location.pathname.
 */
export function pathToActivePage(pathname) {
  if (!pathname || pathname === "/") return "new-chat";
  if (pathname === "/new-chat") return "new-chat";
  if (pathname.startsWith("/flows") || pathname === "/create-flow") return "flows";
  // Checked before "/agents" so the v2 prototype does not fall through to it.
  if (pathname.startsWith("/agents-v2")) return "agents";
  if (pathname.startsWith("/agents/detail")) return "agent-detail";
  if (pathname.startsWith("/agents")) return "agents";
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/kudos")) return "kudos";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/notifications")) return "notifications";
  if (pathname.startsWith("/users/detail")) return "user-detail";
  if (pathname.startsWith("/users")) return "tenant-users";
  if (pathname.startsWith("/user-groups")) return "user-groups";
  if (pathname.startsWith("/usage")) return "usage";
  if (pathname.startsWith("/vault")) return "vault";
  if (pathname.startsWith("/documents")) return "knowledge";
  if (pathname.startsWith("/knowledge")) return "knowledge";
  if (pathname.startsWith("/marketplace")) return "marketplace";
  if (pathname.startsWith("/pulse")) return "pulse";
  if (pathname.startsWith("/tenants/new")) return "tenant-create";
  if (pathname.startsWith("/tenants/detail")) return "tenant-detail";
  if (pathname.startsWith("/tenants")) return "tenants";
  if (pathname.startsWith("/pricing-plans")) return "pricing-plans";
  if (pathname.startsWith("/tenant-users")) return "tenant-users";
  if (pathname.startsWith("/insurance-config"))     return "insurance-config";
  if (pathname.startsWith("/insurance-management")) return "insurance-management";
  if (pathname.startsWith("/employee-insurance"))   return "employee-insurance";
  if (pathname.startsWith("/my-profile"))           return "my-profile";
  if (pathname.startsWith("/finance/reports"))        return "invoice-reports";
  if (pathname.startsWith("/finance/invoices"))       return "invoice-invoices";
  if (pathname.startsWith("/finance/payments"))       return "invoice-payments";
  if (pathname.startsWith("/finance/customers"))      return "invoice-customers";
  if (pathname.startsWith("/finance/projects")) return "invoice-projects";
  if (pathname.startsWith("/finance/currency-rates")) return "invoice-currency-rates";
  return "new-chat";
}
