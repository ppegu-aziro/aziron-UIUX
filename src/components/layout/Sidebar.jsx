import { useState, useRef, useEffect, useId, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Sparkles, Bot, Vault, BarChart2, LayoutDashboard, Users, Workflow,
  ChevronDown, ChevronsUpDown, Settings, LogOut,
  UserCircle, ShieldCheck, Clock, Building2, Tag, Store, ChevronRight, ClipboardList, Shield,
  Receipt, FileBarChart2, FileText, CreditCard, FolderKanban, CircleDollarSign,
  BookOpen, Boxes,
} from "lucide-react";
import { useAuth, ROLES } from "@/context/AuthContext";
import { useKnowledgeHubs } from "@/context/KnowledgeHubContext";
import { ROLE_SCOPE, SCOPE_COLORS } from "@/config/rbac";
import { KNOWLEDGE_TERMS } from "@/lib/knowledgeTerminology";
import { getRecentHubs } from "@/lib/recentHubs";
import { countHubSyncWarnings } from "@/lib/hubNavBadges";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";

const imgAzironLogo = "/logo.svg";
const imgAzironLogoExpanded = "/logo-expanded.svg";
const imgUserAvatar = "https://www.figma.com/api/mcp/asset/6a5664fe-b4d1-48b0-bc2f-f6023a197ef0";

const recentChatsData = [
  "Product Roadmap", "Q3 OKRs", "Team Lunch at Joe's",
  "Customer Feedback Review", "Budget for Q4",
  "Marketing Campaign Brainstorm", "New Hire Onboarding",
  "Team Introduction Session", "Company Policies Overview",
  "Role-Specific Training", "Software Setup and Access",
  "Performance Expectations", "Mentorship Program Intro",
  "Introduction to Company Culture", "First Week Check-in",
];

/** Sidebar label for items that differ by role (e.g. org admin vs platform). */
function navItemDisplayLabel(item, role) {
  if (item.page === "tenants" && role === "tenantadmin") return "Organisation";
  return item.label;
}

const navGroups = [
  {
    id: "build", label: "BUILD",
    roles: ["superadmin", "tenantadmin", "tenantuser"],
    items: [
      { icon: Sparkles, label: "New Chat", page: "new-chat" },
      { icon: Bot,      label: "Agents",   page: "agents"   },
      // Concept prototype, listed alongside the live page so the two can be
      // compared directly. Remove this entry when the concept is settled.
      { icon: Boxes,    label: "Agents v2", page: "agents-v2" },
      { icon: Workflow, label: "Flows",     page: "flows"    },
    ],
  },
  {
    id: "platform", label: "PLATFORM",
    roles: ["superadmin", "tenantadmin", "tenantuser"],
    items: [
      {
        icon: BookOpen,
        label: KNOWLEDGE_TERMS.sidebarGroup,
        page: "knowledge",
        roles: ["superadmin", "tenantadmin", "tenantuser"],
      },
      { icon: Store,     label: "Marketplace",    page: "marketplace", roles: ["superadmin", "tenantadmin", "tenantuser"] },
      { icon: Vault,     label: "Vault",           page: "vault",       roles: ["superadmin", "tenantadmin", "tenantuser"] },
      {
        icon: Users, label: "User Management", page: "users",
        roles: ["superadmin", "tenantadmin"],
        subItems: [
          { icon: UserCircle,  label: "Users",       page: "tenant-users" },
          { icon: Users,       label: "User Groups", page: "user-groups"  },
          { icon: ShieldCheck, label: "Roles",       page: "users-roles"  },
        ],
      },
      { icon: Shield, label: "Employee Insurance", page: "employee-insurance", roles: ["tenantuser", "tenantadmin"] },
      { icon: BarChart2,        label: "Usage",   page: "usage",   roles: ["superadmin", "tenantadmin"] },
      { icon: LayoutDashboard,  label: "Pulse",   page: "pulse",   roles: ["superadmin", "tenantadmin"] },
    ],
  },
  {
    id: "finance",
    label: "FINANCE",
    roles: ["superadmin", "tenantadmin"],
    items: [
      {
        icon: Receipt,
        label: "Invoice Management",
        page: "invoice-management",
        activeFor: [
          "invoice-reports",
          "invoice-invoices",
          "invoice-payments",
          "invoice-customers",
          "invoice-projects",
          "invoice-currency-rates",
        ],
        roles: ["superadmin", "tenantadmin"],
        subItems: [
          { icon: FileBarChart2,    label: "Reports",        page: "invoice-reports" },
          { icon: FileText,         label: "Invoices",       page: "invoice-invoices" },
          { icon: CreditCard,       label: "Payments",       page: "invoice-payments" },
          { icon: Users,            label: "Customers",      page: "invoice-customers" },
          { icon: FolderKanban,     label: "Projects",       page: "invoice-projects" },
          { icon: CircleDollarSign, label: "Currency Rates", page: "invoice-currency-rates" },
        ],
      },
    ],
  },
  {
    id: "admin", label: "ADMIN",
    roles: ["superadmin", "tenantadmin"],
    items: [
      { icon: Building2,     label: "Tenants",              page: "tenants",              activeFor: ["tenant-detail", "tenant-create"], roles: ["superadmin", "tenantadmin"] },
      { icon: Tag,           label: "Pricing & Plans",      page: "pricing-plans",        roles: ["superadmin"] },
      {
        icon: ClipboardList,
        label: "Insurance Management",
        page: "insurance-management",
        activeFor: ["insurance-config"],
        roles: ["superadmin", "tenantadmin"],
      },
    ],
  },
  {
    id: "history",
    label: "HISTORY",
    roles: ["superadmin", "tenantadmin", "tenantuser"],
    items: [
      {
        icon: Clock,
        label: "History",
        page: "history",
        activeFor: ["chat"],
        roles: ["superadmin", "tenantadmin", "tenantuser"],
        subItems: recentChatsData.map((chat) => ({
          label: chat,
          page: "chat",
          noIcon: true,
          trackActive: false,
        })),
      },
    ],
  },
];

/**
 * Determines if a navigation item or page is currently active
 * Handles parent-child relationships and routing aliases
 */
function isActive(itemPage, activePage, activeFor = []) {
  // Direct match
  if (itemPage === activePage) return true;

  if (activeFor.includes(activePage)) return true;

  // Handle routing aliases and related pages
  if (itemPage === "users" && (activePage === "users-list" || activePage === "user-groups" || activePage === "users-roles" || activePage === "tenant-users")) return true;
  if (itemPage === "tenants" && activePage === "tenant-detail") return true;
  if (
    itemPage === "invoice-management" &&
    [
      "invoice-reports",
      "invoice-invoices",
      "invoice-payments",
      "invoice-customers",
      "invoice-projects",
      "invoice-currency-rates",
    ].includes(activePage)
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if any child items are active (used for parent highlighting)
 */
function hasActiveChild(items, activePage) {
  return items?.some(item =>
    item.page === activePage ||
    (item.subItems && item.subItems.some(sub => sub.page === activePage))
  );
}

/**
 * SIDEBAR ARCHITECTURE
 * ════════════════════════════════════════════════════════════════
 *
 * Structure:
 * - SidebarHeader: Logo (responsive to collapsed state)
 * - SidebarContent:
 *   - NavGroup: Collapsible groups (Build, Platform, Admin, History)
 * - SidebarFooter: User profile & account actions only
 *
 * Features:
 * ✓ Auto-expand groups/submenus when child items are active
 * ✓ Collapsed icon mode with hover tooltips
 * ✓ Active state indicators (blue left bar + icon scaling)
 * ✓ Parent-child state management
 * ✓ Responsive user menu positioning
 * ✓ Keyboard support (Escape closes menus)
 * ════════════════════════════════════════════════════════════════
 */

/* ── Logout modal ─────────────────────────────────────────────── */
function LogoutModal({ onConfirm, onCancel, displayName = "Admin", displayEmail = "admin@aziro.com", initials = "A" }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent showCloseButton={false} className="w-[340px] max-w-[340px] overflow-hidden rounded-2xl p-0 gap-0">
        <div className="h-1 w-full bg-gradient-to-r from-destructive to-orange-500" />
        <div className="px-6 pt-6 pb-5 flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="size-14 rounded-full bg-destructive/10 dark:bg-destructive/20 flex items-center justify-center">
              <div className="size-9 rounded-full bg-destructive/20 dark:bg-destructive/30 flex items-center justify-center">
                <LogOut size={18} className="text-destructive" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-foreground">Log out of Aziron?</h2>
              <p className="text-sm text-muted-foreground leading-5">
                You'll be signed out of your current session.<br />Any unsaved work may be lost.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2.5 bg-muted border border-border rounded-2xl">
            <Avatar className="size-8 flex-shrink-0">
              <AvatarImage src={imgUserAvatar} /><AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-foreground">{displayName}</span>
              <span className="text-sm text-muted-foreground">{displayEmail}</span>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={onCancel}
              className="flex-1 h-10 rounded-2xl border border-border bg-background text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 h-10 rounded-2xl bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <LogOut size={14} /> Log out
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Role badge color map ──────────────────────────────────────── */
const roleBadgeStyles = {
  superadmin:  { bg: "var(--accent)", text: "var(--chart-chart-4)", dot: "var(--chart-chart-4)" },
  tenantadmin: { bg: "var(--primary)/10", text: "var(--primary)", dot: "var(--primary)" },
  tenantuser:  { bg: "var(--muted)", text: "var(--muted-foreground)", dot: "var(--muted-foreground)" },
};

function RoleBadge({ roleId, small = false }) {
  const role = ROLES[roleId];
  if (!role) return null;
  const s = roleBadgeStyles[roleId] ?? roleBadgeStyles.tenantuser;
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full leading-none ${small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"}`}
      style={{ background: s.bg, color: s.text }}>
      <span className="rounded-full flex-shrink-0" style={{ width: small ? 4 : 5, height: small ? 4 : 5, background: s.dot }} />
      {role.label}
    </span>
  );
}

/* ── User footer ──────────────────────────────────────────────── */
function UserFooter({ onNavigate }) {
  const { state } = useSidebar();
  const { auth, logout, switchRole } = useAuth();
  const collapsed = state === "collapsed";
  const [open, setOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const displayName  = auth.user?.name  ?? "Admin";
  const displayEmail = auth.user?.email ?? "admin@aziro.com";
  const initials     = displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const currentRole  = auth.role ?? "superadmin";

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          triggerRef.current && !triggerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      if (collapsed) {
        setMenuStyle({ position: "fixed", left: rect.right + 8, bottom: window.innerHeight - rect.bottom, width: 220 });
      } else {
        setMenuStyle({ position: "fixed", left: rect.left, bottom: window.innerHeight - rect.top + 4, width: rect.width });
      }
    }
    setOpen(v => !v);
  };

  const handleSwitchRole = (roleId) => {
    switchRole(roleId);
    setOpen(false);
  };

  return (
    <>
      {open && (
        <div ref={menuRef}
          className="z-[9999] overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
          style={menuStyle}>

          {/* User header */}
          <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
            <Avatar className="size-7 flex-shrink-0">
              <AvatarImage src={imgUserAvatar} /><AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-semibold leading-none text-foreground">{displayName}</span>
              <span className="truncate text-xs text-muted-foreground">{displayEmail}</span>
            </div>
          </div>

          {/* Role switcher */}
          <div className="px-3 pt-2.5 pb-1">
            <p className="type-section-eyebrow mb-1.5">Switch Role</p>
            <div className="flex flex-col gap-0.5">
              {Object.values(ROLES).map(role => {
                const isActive = currentRole === role.id;
                const s = roleBadgeStyles[role.id];
                return (
                  <button
                    key={role.id}
                    onClick={() => handleSwitchRole(role.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      isActive ? "bg-muted" : "hover:bg-muted"
                    }`}>
                    <span className="mt-0.5 size-2 shrink-0 rounded-full" style={{ background: s.dot }} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className={`text-xs font-medium leading-none ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                        {role.label}
                      </span>
                      <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{role.sublabel}</span>
                    </div>
                    {isActive && (
                      <span className="size-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: s.bg }}>
                        <span className="size-1.5 rounded-full" style={{ background: s.dot }} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="mx-3 my-1.5 border-t border-border" />

          {/* Settings & Logout */}
          <div className="pb-1.5">
            <button onClick={() => { setOpen(false); onNavigate?.("my-profile"); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted">
              <UserCircle size={14} /> My Profile
            </button>
            <button onClick={() => { setOpen(false); onNavigate?.("settings"); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted">
              <Settings size={14} /> Settings
            </button>
            <button onClick={() => { setOpen(false); setShowLogout(true); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10">
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
      )}

      {showLogout && (
        <LogoutModal
          displayName={displayName} displayEmail={displayEmail} initials={initials}
          onConfirm={() => { setShowLogout(false); logout(); }}
          onCancel={() => setShowLogout(false)}
        />
      )}

      {collapsed ? (
        <button ref={triggerRef} onClick={handleToggle}
          aria-label="Open user menu"
          aria-haspopup="menu"
          aria-expanded={open}
          className={`relative flex items-center justify-center w-full p-1 rounded-2xl transition-colors ${
            open ? "bg-sidebar-accent" : "hover:bg-sidebar-accent"
          }`}>
          <Avatar className="size-6"><AvatarImage src={imgUserAvatar} /><AvatarFallback>{initials}</AvatarFallback></Avatar>
          {/* Role dot indicator */}
          <span className="absolute bottom-1 right-1 size-2 rounded-full border border-card dark:border-slate-950 ring-1 ring-white"
            style={{ background: roleBadgeStyles[currentRole]?.dot ?? "var(--muted-foreground)" }} />
        </button>
      ) : (
        <button ref={triggerRef} onClick={handleToggle}
          className={`flex w-full items-center justify-between gap-2 rounded-2xl border px-2 py-2 transition-colors ${
            open
              ? "border-border bg-muted"
              : "border-border bg-card hover:bg-muted/50"
          }`}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar className="size-6 shrink-0"><AvatarImage src={imgUserAvatar} /><AvatarFallback>{initials}</AvatarFallback></Avatar>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
              <span className="w-full truncate text-sm font-semibold leading-none text-foreground">{displayName}</span>
              <div className="flex w-full min-w-0 items-center gap-1">
                <span className="size-1.5 shrink-0 rounded-full"
                  style={{ background: roleBadgeStyles[currentRole]?.dot ?? "var(--muted-foreground)" }} />
                <span className="shrink-0 whitespace-nowrap text-[11px] font-medium leading-none"
                  style={{ color: roleBadgeStyles[currentRole]?.text ?? "var(--muted-foreground)" }}>
                  {ROLES[currentRole]?.label}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground/50">·</span>
                <span className="truncate text-[11px] leading-none text-muted-foreground">{displayEmail}</span>
              </div>
            </div>
          </div>
          <ChevronsUpDown size={16} className={`shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </>
  );
}

/* ── Nav item (with optional submenu) ─────────────────────────── */
function NavSubBadge({ count, variant = "secondary" }) {
  if (!count || count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className={cn(
        "ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1 text-[10px] font-semibold tabular-nums",
        variant === "warning"
          ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
          : "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
    >
      {label}
    </span>
  );
}

function NavItem({
  item,
  activePage,
  onNavigate,
  role = "superadmin",
  knowledgeNavExtras = null,
}) {
  const location = useLocation();
  const displayLabel = navItemDisplayLabel(item, role);
  const { state } = useSidebar();
  const sidebarCollapsed = state === "collapsed";
  const isKnowledgeRoute = location.pathname.startsWith("/knowledge");
  const isKnowledgeGroup = item.page === "knowledge" || item.page === "knowledge-research";

  function isSubItemActive(sub) {
    if (sub.trackActive === false) return false;
    if (isKnowledgeGroup && (sub.page === "documents" || sub.page === "knowledge")) {
      return isKnowledgeRoute;
    }
    return sub.page === activePage;
  }

  const active = isActive(item.page, activePage, item.activeFor || []);
  const subActive = item.subItems?.some((s) => isSubItemActive(s));
  const isParentActive = active || subActive;

  const [subOpen, setSubOpen] = useState(!sidebarCollapsed && isParentActive);
  const [showPopover, setShowPopover] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({});
  const isPopoverHoveredRef = useRef(false);
  const itemRef = useRef(null);
  const popoverRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const submenuPanelId = useId();

  useEffect(() => {
    if (!sidebarCollapsed && isParentActive) {
      setSubOpen(true);
    }
  }, [isParentActive, sidebarCollapsed]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showPopover) return;
    const onDown = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        itemRef.current &&
        !itemRef.current.contains(e.target)
      ) {
        setShowPopover(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setShowPopover(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showPopover]);

  const placeCollapsedSubmenu = () => {
    if (itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      setPopoverStyle({
        position: "fixed",
        left: rect.right + 8,
        top: rect.top,
        width: 220,
        zIndex: 99999,
      });
    }
  };

  const handlePopoverHoverEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    isPopoverHoveredRef.current = true;
    setShowPopover(true);
  };

  const handlePopoverHoverLeave = () => {
    isPopoverHoveredRef.current = false;
    if (!isParentActive) {
      setShowPopover(false);
    }
  };

  const handleParentClick = () => {
    if (sidebarCollapsed && item.subItems?.length) {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      placeCollapsedSubmenu();
      setShowPopover((v) => !v);
      return;
    }
    if (!sidebarCollapsed && !isParentActive) {
      setSubOpen((v) => !v);
    }
  };

  function subItemBadge(sub) {
    if (!knowledgeNavExtras) return null;
    if (sub.page === "documents" && knowledgeNavExtras.documentCount > 0) {
      return <NavSubBadge count={knowledgeNavExtras.documentCount} />;
    }
    if (sub.page === "knowledge" && knowledgeNavExtras.hubSyncWarningCount > 0) {
      return <NavSubBadge count={knowledgeNavExtras.hubSyncWarningCount} variant="warning" />;
    }
    return null;
  }

  const navButtonActiveClass = (isItemActive) =>
    cn(
      "relative rounded-lg transition-colors duration-150",
      isItemActive && "bg-sidebar-accent text-sidebar-accent-foreground",
    );

  const navIconClass = (isItemActive) =>
    cn(
      "transition-colors duration-150",
      isItemActive ? "text-primary" : "text-muted-foreground group-hover/menu-button:text-foreground",
    );

  if (item.subItems?.length) {
    return (
      <>
        <SidebarMenuItem ref={itemRef}>
          <Collapsible
            open={sidebarCollapsed ? false : subOpen}
            onOpenChange={setSubOpen}
            className="group/sub w-full"
          >
            <SidebarMenuButton
              tooltip={sidebarCollapsed ? displayLabel : undefined}
              isActive={isParentActive}
              className={navButtonActiveClass(isParentActive)}
              aria-expanded={sidebarCollapsed ? showPopover : subOpen}
              onClick={handleParentClick}
            >
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-full bg-primary transition-all duration-300"
                style={{ height: isParentActive ? 18 : 0, opacity: isParentActive ? 1 : 0 }}
              />
              {item.icon && <item.icon className={navIconClass(isParentActive)} />}
              <span className={cn(isParentActive ? "font-medium" : "font-normal")}>
                {displayLabel}
              </span>
              {!sidebarCollapsed && (
                <ChevronDown
                  size={13}
                  className={cn(
                    "ml-auto transition-transform duration-200",
                    subOpen && "rotate-180",
                  )}
                />
              )}
            </SidebarMenuButton>

            {!sidebarCollapsed && (
              <CollapsibleContent>
                <SidebarMenuSub role="group" aria-label={displayLabel}>
                  {item.subItems.map((sub) => {
                    const subIsActive = isSubItemActive(sub);
                    return (
                      <SidebarMenuSubItem key={`${sub.page}-${sub.label}`}>
                        <SidebarMenuSubButton
                          render={<button type="button" />}
                          isActive={subIsActive}
                          onClick={() => onNavigate?.(sub.page)}
                          className="h-auto min-h-7 w-full gap-2 py-1.5 text-left"
                        >
                          {!sub.noIcon && sub.icon && (
                            <sub.icon size={13} className={navIconClass(subIsActive)} />
                          )}
                          <span className="flex min-w-0 flex-1 flex-col items-start gap-0">
                            <span className="truncate text-sm leading-tight">{sub.label}</span>
                            {sub.description ? (
                              <span className="truncate text-[10px] leading-tight text-muted-foreground">
                                {sub.description}
                              </span>
                            ) : null}
                          </span>
                          {subItemBadge(sub)}
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}

                  {isKnowledgeGroup &&
                  knowledgeNavExtras?.recentHubs?.length > 0 ? (
                    <>
                      <li className="mt-1 list-none px-2 py-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Recent
                        </span>
                      </li>
                      {knowledgeNavExtras.recentHubs.map((hub) => (
                        <SidebarMenuSubItem key={`recent-${hub.id}`}>
                          <SidebarMenuSubButton
                            render={<button type="button" />}
                            onClick={() => knowledgeNavExtras.onNavigateHub?.(hub.id)}
                            className="h-7 w-full gap-2 text-left"
                          >
                            <span className="truncate text-xs text-muted-foreground">{hub.name}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </>
                  ) : null}
                </SidebarMenuSub>
              </CollapsibleContent>
            )}
          </Collapsible>
        </SidebarMenuItem>

        {sidebarCollapsed && showPopover && (
          <div
            ref={popoverRef}
            id={submenuPanelId}
            role="menu"
            aria-label={displayLabel}
            onMouseEnter={handlePopoverHoverEnter}
            onMouseLeave={handlePopoverHoverLeave}
            className="fixed z-[99999] max-h-100 overflow-y-auto rounded-2xl border border-border bg-card shadow-lg pointer-events-auto"
            style={popoverStyle}
          >
            {item.subItems.map((sub) => {
              const subIsActive = isSubItemActive(sub);
              return (
                <button
                  key={sub.label}
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate?.(sub.page);
                    setShowPopover(false);
                  }}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors cursor-pointer",
                    sub.noIcon ? "pl-2" : "",
                    subIsActive
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-foreground hover:bg-muted/50",
                  )}
                >
                  {!sub.noIcon && sub.icon && (
                    <sub.icon size={13} className={subIsActive ? "text-primary" : ""} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-left">{sub.label}</span>
                </button>
              );
            })}
            {isKnowledgeGroup && knowledgeNavExtras?.recentHubs?.length > 0 ? (
              <>
                <div className="mx-2 my-1 border-t border-border" />
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent
                </p>
                {knowledgeNavExtras.recentHubs.map((hub) => (
                  <button
                    key={`recent-pop-${hub.id}`}
                    role="menuitem"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      knowledgeNavExtras.onNavigateHub?.(hub.id);
                      setShowPopover(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                  >
                    <span className="min-w-0 flex-1 truncate text-left text-xs">{hub.name}</span>
                  </button>
                ))}
              </>
            ) : null}
          </div>
        )}
      </>
    );
  }

  // Render item without icon (for Recent chats)
  if (item.noIcon) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={displayLabel}
          isActive={active}
          onClick={() => onNavigate?.(item.page)}
          className={navButtonActiveClass(active)}
        >
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-full bg-primary transition-all duration-300"
            style={{ height: active ? 20 : 0, opacity: active ? 1 : 0 }}
          />
          <span className={cn("truncate", active && "font-semibold")}>{displayLabel}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={displayLabel}
        isActive={active}
        onClick={() => onNavigate?.(item.page)}
        className={navButtonActiveClass(active)}
      >
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-full bg-primary transition-all duration-300"
          style={{ height: active ? 20 : 0, opacity: active ? 1 : 0 }}
        />
        <item.icon className={navIconClass(active)} />
        <span className={cn(active ? "font-semibold" : "font-medium")}>{displayLabel}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/* ── Collapsible nav group ─────────────────────────────────────── */
function NavGroup({ group, activePage, onNavigate, role, knowledgeNavExtras }) {
  const { state } = useSidebar();
  const sidebarCollapsed = state === "collapsed";

  // Filter items by role
  const visibleItems = group.items.filter(item =>
    !item.hidden && (!item.roles || item.roles.includes(role))
  );

  // Check if any item in this group is active (for auto-expand behavior)
  const hasActiveItem = hasActiveChild(visibleItems, activePage);

  // Initialize group open state: open by default, but can be manually toggled
  // Keep open if sidebar is not collapsed OR if an item in this group is active
  const [open, setOpen] = useState(true);

  // Auto-expand group when an item inside becomes active
  useEffect(() => {
    if (hasActiveItem && !open) {
      setOpen(true);
    }
  }, [hasActiveItem, open]);

  if (visibleItems.length === 0) return null;

  return (
    <Collapsible
      open={sidebarCollapsed ? true : open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
      <SidebarGroup>
        <SidebarGroupLabel className="block px-0">
          <CollapsibleTrigger className="flex h-8 w-full items-center justify-between rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] hover:text-sidebar-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0">
            {group.label}
            <ChevronDown
              size={14}
              className="transition-transform duration-150 group-data-[state=closed]/collapsible:-rotate-90"
            />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map(item => (
                <NavItem
                  key={item.label}
                  item={item}
                  activePage={activePage}
                  onNavigate={onNavigate}
                  role={role}
                  knowledgeNavExtras={
                    item.page === "knowledge" ? knowledgeNavExtras : null
                  }
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

/* ── Logo header ──────────────────────────────────────────────── */
function LogoHeader({ onNavigate }) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <SidebarHeader className="p-2">
      <button onClick={() => onNavigate?.("agents")} aria-label="Go to Aziron home"
        className={`flex w-full items-center rounded-[8px] px-1 py-1 ${isCollapsed ? "justify-center" : "justify-start"}`}>
        <img
          src={isCollapsed ? imgAzironLogo : imgAzironLogoExpanded}
          alt="Aziron"
          className="object-contain flex-shrink-0"
          style={isCollapsed ? { width: 25.5, height: 23 } : { height: 28 }}
        />
      </button>
    </SidebarHeader>
  );
}

/* ── Scope context strip ──────────────────────────────────────── */
function ScopeStrip({ role }) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const scope = ROLE_SCOPE[role] ?? ROLE_SCOPE.tenantuser;
  const c     = SCOPE_COLORS[scope.color] ?? SCOPE_COLORS.slate;

  if (isCollapsed) {
    return (
      <div className="flex justify-center px-2 pb-1">
        <span className="size-2 rounded-full" title={`${scope.label} — ${scope.sublabel}`}
          style={{ background: c.dot }} />
      </div>
    );
  }

  return (
    <div className="mx-2 mb-1 px-2.5 py-1.5 rounded-xl flex items-center gap-2"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <span className="size-1.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-semibold leading-none truncate" style={{ color: c.text }}>
          {scope.label}
        </span>
        <span className="text-[10px] leading-none mt-0.5 truncate" style={{ color: c.dot, opacity: 0.75 }}>
          {scope.sublabel}
        </span>
      </div>
    </div>
  );
}

/* ── Main export ──────────────────────────────────────────────── */
export default function AppSidebar({ activePage = "agents", onNavigate }) {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const { hubs, documents } = useKnowledgeHubs();
  const currentRole = auth.role ?? "superadmin";

  const knowledgeNavExtras = useMemo(
    () => ({
      recentHubs: getRecentHubs(hubs),
      documentCount: documents?.length ?? 0,
      hubSyncWarningCount: countHubSyncWarnings(hubs),
      onNavigateHub: (hubId) => navigate(`/knowledge/${hubId}`),
    }),
    [hubs, documents, navigate],
  );

  // Filter groups by role
  const visibleGroups = navGroups.filter(group =>
    !group.roles || group.roles.includes(currentRole)
  );

  return (
    <Sidebar collapsible="icon">
      {/* Logo */}
      <LogoHeader onNavigate={onNavigate} />

      {/* Nav */}
      <SidebarContent
        role="navigation"
        aria-label="Main navigation"
        className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden group-data-[collapsible=icon]:overflow-hidden"
      >
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          {visibleGroups.map(group => (
            <NavGroup
              key={group.id}
              group={group}
              activePage={activePage}
              onNavigate={onNavigate}
              role={currentRole}
              knowledgeNavExtras={knowledgeNavExtras}
            />
          ))}
        </div>
      </SidebarContent>

      {/* Footer — account only */}
      <SidebarFooter className="p-2">
        <UserFooter onNavigate={onNavigate} />
      </SidebarFooter>
    </Sidebar>
  );
}
