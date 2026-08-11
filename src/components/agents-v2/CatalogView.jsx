import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Download, Plus, Search, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FACET_FILTERS, openToolCount } from "@/data/agentsV2";
import { useAgentsV2 } from "@/context/AgentsV2Context";
import { FacetChips } from "./FacetChips";

/**
 * One catalog for everything.
 *
 * Before unification a user had to know which of two lists to look in, and the
 * answer depended on an implementation detail (does it have a bound model?).
 * Here there is one list, and the property that used to pick the list is now
 * just a filter over it.
 */

function AgentCard({ agent, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(agent)}
      // Without this the accessible name is the whole card read as one run-on
      // string — every chip, the owner and the install count included.
      aria-label={`Open ${agent.name}`}
      className={cn(
        "group flex h-full flex-col rounded-xl border border-border bg-card p-4 text-left transition-all",
        "hover:border-primary/40 hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{agent.name}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{agent.slug}</p>
        </div>
        <ArrowUpRight
          className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>

      <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-muted-foreground">
        {agent.description}
      </p>

      <FacetChips agent={agent} className="mt-3" />

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-[11px] text-muted-foreground">
        <span className="truncate">
          {agent.owner} · {agent.updated}
        </span>
        {agent.installs > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
            <Download className="size-3" aria-hidden />
            {agent.installs.toLocaleString()}
          </span>
        )}
      </div>
    </button>
  );
}

export default function CatalogView({ onOpen, onCreate }) {
  const { agents } = useAgentsV2();
  const [facet, setFacet] = useState("all");
  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);

  const openCount = openToolCount(agents);

  const filtered = useMemo(() => {
    const test = FACET_FILTERS.find((f) => f.id === facet)?.test ?? (() => true);
    const q = query.trim().toLowerCase();
    return agents
      .filter(test)
      .filter((a) => (openOnly ? a.tools === "open" : true))
      .filter(
        (a) =>
          !q ||
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q),
      );
  }, [agents, facet, query, openOnly]);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
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
          {FACET_FILTERS.map((f) => (
            <Button
              key={f.id}
              type="button"
              size="xs"
              variant={facet === f.id ? "secondary" : "ghost"}
              onClick={() => setFacet(f.id)}
              aria-pressed={facet === f.id}
            >
              {f.label}
            </Button>
          ))}
        </div>

        <Button type="button" size="sm" onClick={onCreate}>
          <Plus className="size-3.5" aria-hidden />
          New agent
        </Button>
      </div>

      {/*
        The governance row. Both usability and architecture review flagged the
        same hole: nothing in the product answers "which agents can reach every
        tool?". It is one line here, and it is a filter rather than a report.
      */}
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
            <span className="font-medium text-foreground">{openCount} agents</span> can use every tool
            available to the caller.
          </span>
          <span className="shrink-0 font-medium text-primary">
            {openOnly ? "Show all" : "Review these"}
          </span>
        </button>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <SlidersHorizontal className="size-3" aria-hidden />
        Showing {filtered.length} of {agents.length}
        {facet !== "all" && (
          <Badge variant="outline" className="ml-1">
            {FACET_FILTERS.find((f) => f.id === facet)?.label}
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((a) => (
          <AgentCard key={a.id} agent={a} onOpen={onOpen} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">No agents match that.</p>
        </div>
      )}
    </div>
  );
}
