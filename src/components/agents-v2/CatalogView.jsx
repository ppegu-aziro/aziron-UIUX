import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Boxes,
  Download,
  GitFork,
  Globe,
  Home,
  LayoutGrid,
  List,
  Lock,
  MessageSquare,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CATEGORIES, RUNS_IN_FILTERS, STATUS, VISIBILITY_FILTERS, openToolCount } from "@/data/agentsV2";
import { useAgentsV2 } from "@/context/AgentsV2Context";
import { FacetChips } from "./FacetChips";

/**
 * The agent catalog.
 *
 * Deliberately the v1 listing — grid/list, status, success rate, visibility,
 * the same row of actions — so the only thing a returning user has to absorb
 * is the facet chips. Changing the noun and the layout in one release would
 * make the rename look like a rebuild.
 *
 * Clicking a card opens chat, exactly as it does today. Editing is a menu item,
 * because "open" and "configure" are different intents and v1 already settled
 * which one the click belongs to.
 */

const GRADIENTS = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
];

const gradientFor = (name) =>
  GRADIENTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];

function Avatar({ name, size = "lg" }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br font-semibold text-white",
        gradientFor(name),
        size === "lg" ? "size-9 text-xs" : "size-7 text-[10px]",
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function StatusDot({ status }) {
  const cfg = STATUS[status] ?? STATUS.idle;
  return (
    <span
      className="size-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: cfg.dot }}
      title={cfg.label}
      aria-label={cfg.label}
    />
  );
}

function VisibilityBadge({ visibility }) {
  const pub = visibility === "public";
  return (
    <Badge variant="outline" className="gap-1">
      {pub ? <Globe className="size-2.5" aria-hidden /> : <Lock className="size-2.5" aria-hidden />}
      {pub ? "Public" : "Private"}
    </Badge>
  );
}

function SuccessBar({ pct }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", pct >= 90 ? "bg-success" : pct >= 70 ? "bg-warning" : "bg-destructive")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

/** The action set, shared by grid and list so they cannot drift apart. */
function AgentMenu({ agent, onChat, onEdit, onFork, onPublish, onDelete }) {
  return (
    <DropdownMenu>
      {/*
        Base UI (not Radix) — the trigger composes via `render`, not `asChild`.
        Passing asChild here is silently ignored and yields a nested button
        that swallows the click, which is exactly what it did first time.
      */}
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Actions for ${agent.name}`}
          />
        }
      >
        <MoreVertical className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onChat(agent)}>
          <MessageSquare className="size-3.5" aria-hidden />
          Chat
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(agent)}>
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onFork(agent)}>
          <GitFork className="size-3.5" aria-hidden />
          Fork
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPublish(agent)}>
          <Upload className="size-3.5" aria-hidden />
          {agent.visibility === "public" ? "Unpublish" : "Publish"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onDelete(agent)}>
          <Trash2 className="size-3.5" aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AgentCard({ agent, actions }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Chat with ${agent.name}`}
      onClick={() => actions.onChat(agent)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          actions.onChat(agent);
        }
      }}
      className="group flex h-full cursor-pointer flex-col rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={agent.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <StatusDot status={agent.status} />
            <h3 className="truncate text-sm font-semibold text-foreground">{agent.name}</h3>
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{agent.slug}</p>
        </div>
        <AgentMenu agent={agent} {...actions} />
      </div>

      <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-muted-foreground">
        {agent.description}
      </p>

      <FacetChips agent={agent} className="mt-2.5" />

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <VisibilityBadge visibility={agent.visibility} />
          <Badge variant="secondary" className="shrink-0">
            {agent.category}
          </Badge>
        </div>
        <SuccessBar pct={agent.successRate} />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">
          {agent.owner} · {agent.lastRun}
        </span>
        {agent.installs > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
            <Download className="size-3" aria-hidden />
            {agent.installs.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

function AgentRow({ agent, actions, zebra }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Chat with ${agent.name}`}
      onClick={() => actions.onChat(agent)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          actions.onChat(agent);
        }
      }}
      className={cn(
        "flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        zebra && "bg-muted/20",
      )}
    >
      <Avatar name={agent.name} size="sm" />
      <div className="min-w-0 flex-[2]">
        <div className="flex items-center gap-1.5">
          <StatusDot status={agent.status} />
          <span className="truncate text-xs font-medium text-foreground">{agent.name}</span>
        </div>
        <p className="truncate text-[11px] text-muted-foreground">{agent.description}</p>
      </div>
      <div className="hidden min-w-0 flex-[2] lg:block">
        <FacetChips agent={agent} />
      </div>
      <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
        {agent.category}
      </Badge>
      <div className="hidden shrink-0 sm:block">
        <SuccessBar pct={agent.successRate} />
      </div>
      <span className="hidden w-24 shrink-0 truncate text-[11px] text-muted-foreground md:block">
        {agent.lastRun}
      </span>
      <AgentMenu agent={agent} {...actions} />
    </div>
  );
}

export default function CatalogView({ onChat, onEdit }) {
  const { agents, remove, fork, patch } = useAgentsV2();
  const [visibility, setVisibility] = useState("all");
  const [runsIn, setRunsIn] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [view, setView] = useState("grid");
  const [pendingDelete, setPendingDelete] = useState(null);

  const openCount = openToolCount(agents);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const runsInTests = RUNS_IN_FILTERS.filter((f) => runsIn.includes(f.id));
    return agents
      .filter((a) => (visibility === "all" ? true : a.visibility === visibility))
      // OR across selected places: an agent that runs in Claude Code AND Codex
      // should appear under either, not only when both are picked.
      .filter((a) => (runsInTests.length === 0 ? true : runsInTests.some((f) => f.test(a))))
      .filter((a) => (openOnly ? a.tools === "open" : true))
      .filter((a) => (category ? a.category === category : true))
      .filter(
        (a) =>
          !q ||
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q),
      );
  }, [agents, visibility, runsIn, query, openOnly, category]);

  const clearAll = () => {
    setVisibility("all");
    setRunsIn([]);
    setCategory(null);
    setOpenOnly(false);
    setQuery("");
  };

  const hasFilter =
    visibility !== "all" || runsIn.length > 0 || !!category || openOnly || !!query.trim();

  const actions = {
    onChat,
    onEdit,
    onFork: (a) => {
      const copy = fork(a.id);
      if (copy) toast.success(`Forked as “${copy.name}”`, { description: "Private draft, not released." });
    },
    onPublish: (a) => {
      patch(a.id, { visibility: a.visibility === "public" ? "private" : "public" });
      toast.success(a.visibility === "public" ? `${a.name} unpublished` : `${a.name} published`);
    },
    onDelete: (a) => setPendingDelete(a),
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents…"
            className="h-8 pl-8 text-sm"
            aria-label="Search agents"
          />
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
          {VISIBILITY_FILTERS.map((v) => (
            <Button
              key={v.id}
              type="button"
              size="xs"
              variant={visibility === v.id ? "secondary" : "ghost"}
              onClick={() => setVisibility(v.id)}
              aria-pressed={visibility === v.id}
            >
              {v.id === "public" && <Globe className="size-3" aria-hidden />}
              {v.id === "private" && <Lock className="size-3" aria-hidden />}
              {v.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
          <Button
            type="button"
            size="icon-sm"
            variant={view === "grid" ? "secondary" : "ghost"}
            onClick={() => setView("grid")}
            aria-label="Grid view"
            aria-pressed={view === "grid"}
          >
            <LayoutGrid className="size-3.5" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={view === "list" ? "secondary" : "ghost"}
            onClick={() => setView("list")}
            aria-label="List view"
            aria-pressed={view === "list"}
          >
            <List className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      {/* Where it runs. Aziron first, then the hosts it installs into. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 shrink-0 text-[11px] text-muted-foreground">Runs in:</span>
        {RUNS_IN_FILTERS.map((f) => {
          const on = runsIn.includes(f.id);
          const count = agents.filter(f.test).length;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setRunsIn((s) => (on ? s.filter((x) => x !== f.id) : [...s, f.id]))}
              aria-pressed={on}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                on
                  ? "border-primary/45 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30",
              )}
            >
              {f.id === "aziron" ? (
                <Home className="size-2.5" aria-hidden />
              ) : (
                <Boxes className="size-2.5" aria-hidden />
              )}
              {f.label}
              <span className="tabular-nums opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Categories — v1's labels, renamed. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 shrink-0 text-[11px] text-muted-foreground">Category:</span>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory((x) => (x === c ? null : c))}
            aria-pressed={category === c}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
              category === c
                ? "border-primary/45 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Governance: the question nothing in the product can answer today. */}
      {openCount > 0 && (
        <button
          type="button"
          onClick={() => setOpenOnly((v) => !v)}
          aria-pressed={openOnly}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
            openOnly
              ? "border-warning/40 bg-warning/10 text-foreground"
              : "border-border bg-muted/30 text-muted-foreground hover:border-warning/30 hover:bg-warning/5",
          )}
        >
          <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden />
          <span className="flex-1">
            <span className="font-medium text-foreground">{openCount} agents</span> can use every tool available
            to the caller.
          </span>
          <span className="shrink-0 font-medium text-primary">{openOnly ? "Show all" : "Review these"}</span>
        </button>
      )}

      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {agents.length}
        </p>
        {hasFilter && (
          <Button type="button" variant="ghost" size="xs" onClick={clearAll}>
            <X className="size-3" aria-hidden />
            Clear filters
          </Button>
        )}
      </div>

      {view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a) => (
            <AgentCard key={a.id} agent={a} actions={actions} />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {filtered.map((a, i) => (
            <AgentRow key={a.id} agent={a} actions={actions} zebra={i % 2 === 1} />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <Bot className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm text-muted-foreground">No agents match that.</p>
        </div>
      )}

      {/* ConfirmDialog renders itself open, so the parent gates it. */}
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.name}?`}
          message={
            pendingDelete.release
              ? `This removes the agent and its release history. Copies already installed on people's machines are not removed — an install is a copy, not a link.`
              : "This removes the agent and its files. It has never been released, so nothing is installed anywhere."
          }
          confirmLabel="Delete"
          onConfirm={() => {
            remove(pendingDelete.id);
            toast.success(`${pendingDelete.name} deleted`);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
