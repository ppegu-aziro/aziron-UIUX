import { useMemo, useState } from "react";
import {
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
  ArrowRight,
  Search,
  Sparkles,
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
import { CATEGORIES, RUNS_IN_FILTERS, STATUS, VISIBILITY_FILTERS } from "@/data/agentsV2";
import { useAgentsV2 } from "@/context/AgentsV2Context";
import { FacetChips } from "./FacetChips";

/**
 * The agent catalog.
 *
 * Deliberately the v1 listing — grid/list, status, visibility, the same row of
 * actions — so the only thing a returning user has to absorb is the facet
 * chips. Changing the noun and the layout in one release would make the rename
 * look like a rebuild.
 *
 * No success-rate bar: it measures runs inside Aziron, and most of this list
 * now runs elsewhere or has never run at all.
 *
 * Clicking a card opens the agent. This is an authoring product, and the
 * default gesture on a card should be the thing a person mid-build wants —
 * chat is a hover control and a menu item beside it.
 */

const EXAMPLES = [
  "Answers HR questions from our handbook",
  "Triages static-analysis findings and files the real ones",
  "Provisions EKS clusters with eksctl",
];

/**
 * The on-ramp.
 *
 * Creation starts on the page you are already on, in a box that asks the one
 * question you can actually answer — what should it do — rather than behind a
 * button that mints an empty record and drops you in a maintenance screen.
 *
 * "Start blank" sits at the same altitude, so the assistant is opt-out rather
 * than mandatory. Every product that does this well offers the escape at equal
 * weight; the ones that don't force you to describe your intent to a model
 * before you are allowed to type.
 */
function AgentStarter({ onCreateFromIntent, onStartBlank }) {
  const [intent, setIntent] = useState("");
  const submit = () => {
    const t = intent.trim();
    if (t) onCreateFromIntent(t);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Sparkles className="size-3.5 text-primary" aria-hidden />
        Create an agent
      </h2>
      <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
        Say what it should do and the assistant drafts the files. You edit everything afterwards.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Describe what this agent should do…"
          aria-label="Describe what this agent should do"
          className="h-10 flex-1 text-sm"
        />
        <div className="flex items-center gap-2">
          <Button type="button" size="lg" onClick={submit} disabled={!intent.trim()}>
            Create
            <ArrowRight className="size-3.5" data-icon="inline-end" aria-hidden />
          </Button>
          <Button type="button" size="lg" variant="ghost" onClick={onStartBlank}>
            Start blank
          </Button>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Try:</span>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setIntent(e)}
            className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

const GRADIENTS = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
];

// Seeded from the name; an unnamed draft would otherwise reduce an empty
// array with no initial value and throw.
const gradientFor = (name) =>
  GRADIENTS[[...(name || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];

function Avatar({ name, size = "lg" }) {
  const initials =
    (name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "—";
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
            aria-label={`Actions for ${agent.name || "unnamed agent"}`}
          />
        }
      >
        <MoreVertical className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      {/*
        The menu renders inside the card, and the card's own onClick opens
        chat. Without stopping propagation here every menu item ALSO fired
        chat — Edit navigated and was immediately given a chat panel back,
        which looked like the panel refusing to close.
      */}
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
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
      aria-label={`Open ${agent.name || "unnamed agent"}`}
      onClick={() => actions.onEdit(agent)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          actions.onEdit(agent);
        }
      }}
      className="group flex h-full cursor-pointer flex-col rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={agent.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <StatusDot status={agent.status} />
            <h3 className={cn("truncate text-sm font-semibold", agent.name ? "text-foreground" : "text-muted-foreground italic")}>
              {agent.name || "Not named yet"}
            </h3>
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{agent.slug}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Chat with ${agent.name || "unnamed agent"}`}
            onClick={(e) => {
              e.stopPropagation();
              actions.onChat(agent);
            }}
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MessageSquare className="size-3.5" aria-hidden />
          </Button>
          <AgentMenu agent={agent} {...actions} />
        </div>
      </div>

      <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-muted-foreground">
        {agent.description}
      </p>

      <FacetChips agent={agent} className="mt-2.5" />

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <VisibilityBadge visibility={agent.visibility} />
          <Badge variant="secondary" className="shrink-0">
            {agent.category}
          </Badge>
        </div>
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
      aria-label={`Open ${agent.name || "unnamed agent"}`}
      onClick={() => actions.onEdit(agent)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          actions.onEdit(agent);
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
          <span className={cn("truncate text-xs font-medium", agent.name ? "text-foreground" : "text-muted-foreground italic")}>
            {agent.name || "Not named yet"}
          </span>
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
      </div>
      <span className="hidden w-24 shrink-0 truncate text-[11px] text-muted-foreground md:block">
        {agent.lastRun}
      </span>
      <AgentMenu agent={agent} {...actions} />
    </div>
  );
}

export default function CatalogView({ onChat, onEdit, onCreateFromIntent, onStartBlank }) {
  const { agents, remove, fork, patch } = useAgentsV2();
  const [visibility, setVisibility] = useState("all");
  const [runsIn, setRunsIn] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(null);
  const [view, setView] = useState("grid");
  const [pendingDelete, setPendingDelete] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const runsInTests = RUNS_IN_FILTERS.filter((f) => runsIn.includes(f.id));
    return agents
      .filter((a) => (visibility === "all" ? true : a.visibility === visibility))
      // OR across selected places: an agent that runs in Claude Code AND Codex
      // should appear under either, not only when both are picked.
      .filter((a) => (runsInTests.length === 0 ? true : runsInTests.some((f) => f.test(a))))
      .filter((a) => (category ? a.category === category : true))
      .filter(
        (a) =>
          !q ||
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q),
      );
  }, [agents, visibility, runsIn, query, category]);

  const clearAll = () => {
    setVisibility("all");
    setRunsIn([]);
    setCategory(null);
    setQuery("");
  };

  const hasFilter =
    visibility !== "all" || runsIn.length > 0 || !!category || !!query.trim();

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
      <AgentStarter onCreateFromIntent={onCreateFromIntent} onStartBlank={onStartBlank} />

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
