import { Check, Lock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CATEGORIES, TARGETS } from "@/data/agentsV2";
import { useAgentsV2 } from "@/context/AgentsV2Context";

/**
 * AGENT.md frontmatter, edited in place.
 *
 * It was a read-only `<pre>` with the real controls somewhere else — the page
 * header for name and description, a settings sheet for category, a release
 * dialog for targets. So the file showed you values you could not touch, and
 * changing them meant leaving the file you were looking at.
 *
 * Now the block is the control. It still reads as frontmatter — the `---`
 * fences, the mono keys, the muted colour — because that is what it becomes on
 * disk, and an author needs to recognise it in a file they will later open in
 * an editor. `version` stays read-only: it is set by releasing, and a version
 * you can type is a version that means nothing.
 */

const KEY = "w-[86px] shrink-0 pt-1.5 font-mono text-[11px] text-muted-foreground";
const FIELD =
  "h-7 border-0 bg-transparent px-1.5 font-mono text-[11px] shadow-none focus-visible:bg-background focus-visible:ring-1 md:text-[11px]";

export default function FrontmatterEditor({ agent }) {
  const { patch, setTargets } = useAgentsV2();

  const toggleTarget = (id) =>
    setTargets(agent.id, agent.targets.includes(id) ? agent.targets.filter((t) => t !== id) : [...agent.targets, id]);

  return (
    <div className="border-b border-border bg-muted/40 px-3 py-2">
      <p className="font-mono text-[11px] text-muted-foreground">---</p>

      <div className="space-y-0.5 py-0.5">
        <div className="flex items-start gap-1">
          <span className={KEY}>name:</span>
          <Input
            value={agent.name}
            onChange={(e) => patch(agent.id, { name: e.target.value })}
            placeholder="what this agent is called"
            aria-label="name"
            className={cn(FIELD, "flex-1")}
          />
        </div>

        <div className="flex items-start gap-1">
          <span className={KEY}>description:</span>
          {/*
            A textarea, not an input: descriptions run past one line and this
            is the field the catalog and the model both read, so it should be
            readable while being written rather than scrolling sideways in a
            box narrower than the sentence.
          */}
          <Textarea
            rows={2}
            value={agent.description}
            onChange={(e) => patch(agent.id, { description: e.target.value })}
            placeholder="what it does — shown in the catalog and used to decide when it is relevant"
            aria-label="description"
            className={cn(
              "min-h-0 flex-1 resize-y border-0 bg-transparent px-1.5 py-1 font-mono text-[11px] leading-5 shadow-none focus-visible:bg-background focus-visible:ring-1 md:text-[11px]",
            )}
          />
        </div>

        <div className="flex items-start gap-1">
          <span className={KEY}>category:</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="category"
                  className="rounded px-1.5 py-1 text-left font-mono text-[11px] text-foreground hover:bg-background"
                />
              }
            >
              {agent.category}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {CATEGORIES.map((c) => (
                <DropdownMenuItem key={c} onClick={() => patch(agent.id, { category: c })}>
                  {c}
                  {c === agent.category && <Check className="ml-auto size-3" aria-hidden />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-start gap-1">
          <span className={KEY}>targets:</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="targets"
                  className="min-w-0 flex-1 rounded px-1.5 py-1 text-left font-mono text-[11px] text-foreground hover:bg-background"
                />
              }
            >
              <span className="truncate">
                {agent.targets.length ? `[${agent.targets.join(", ")}]` : "[]"}
                {agent.targets.length === 0 && (
                  <span className="ml-2 text-muted-foreground">all targets</span>
                )}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {/* GroupLabel is a Base UI group part and throws outside one. */}
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs">Where it can install</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {TARGETS.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={agent.targets.includes(t.id)}
                    onCheckedChange={() => toggleTarget(t.id)}
                  >
                    {t.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1">
          <span className={cn(KEY, "pt-0")}>version:</span>
          <span className="flex items-center gap-1.5 px-1.5 font-mono text-[11px] text-muted-foreground">
            {agent.release ? agent.release.version : "—"}
            <Lock className="size-2.5" aria-hidden />
            <span className="text-[10px]">set by releasing</span>
          </span>
        </div>
      </div>

      <p className="font-mono text-[11px] text-muted-foreground">---</p>
    </div>
  );
}
