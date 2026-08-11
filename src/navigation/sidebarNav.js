/**
 * Pages that map directly to a sidebar nav item (top-level or sub-menu link).
 * These should not show an AppHeader breadcrumb — the sidebar already provides context.
 *
 * Child / drill-down routes (e.g. tenant-detail, insurance-config, user-detail) are excluded.
 */
export const PRIMARY_SIDEBAR_PAGES = new Set([
  // BUILD
  "new-chat",
  "agents",
  "agents-v2",
  "flows",
  // PLATFORM
  "knowledge",
  "marketplace",
  "vault",
  "usage",
  "pulse",
  "tenant-users",
  "user-groups",
  "users-roles",
  "users-list",
  // ADMIN
  "tenants",
  "pricing-plans",
  "insurance-management",
  "employee-insurance",
  // FINANCE — Invoice Management
  "invoice-reports",
  "invoice-invoices",
  "invoice-payments",
  "invoice-customers",
  "invoice-projects",
  "invoice-currency-rates",
]);

export function isPrimarySidebarPage(pageId) {
  return PRIMARY_SIDEBAR_PAGES.has(pageId);
}
