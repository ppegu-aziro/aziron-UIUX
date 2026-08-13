import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  MessageSquare,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GROUPS, SECTIONS, fieldAt, fieldsInGroup, sectionOfGroup } from "@/data/agentJsonSchema";
import { changedPaths, toDoc } from "./utils/agentJson";
import { Section } from "./utils/formControls";
import SchemaField from "./SchemaField";

/**
 * The interactive half of the agent's configuration file.
 *
 * A menu down the side and one continuous scroll beside it, the way an editor's
 * settings screen works. The menu is a jump-list, not a set of tabs: every
 * group is already on the page, so scrolling reveals everything and clicking
 * only saves you the scroll. Tabs would make finding a setting cost a guess
 * about which tab it is behind, and guessing wrong costs two more clicks.
 *
 * The rail follows the scroll rather than the other way round, so "where am I"
 * is answered without asking.
 *
 * Fields are generated from the schema with no per-field code, which is the
 * whole point: a hand-written form beside a schema-driven validator is how a
 * product ends up offering a value its own file rejects.
 */

const ICONS = {
  general: Boxes,
  tools: Wrench,
  model: Cpu,
  knowledge: Database,
  chat: MessageSquare,
  workspace: Sparkles,
};

/**
 * How much of the six-column grid each field takes.
 *
 * Container queries, not viewport ones: this pane is resizable and halves in
 * Both mode, so what decides the column count is the width of the pane the
 * fields are actually in. A viewport breakpoint would put three columns in a
 * 300px column the moment the window was wide.
 */
const SPAN = {
  sm: "col-span-6 @md:col-span-3 @3xl:col-span-2",
  md: "col-span-6 @md:col-span-3",
  lg: "col-span-6",
};

const TRAVELS = Object.fromEntries(SECTIONS.map((s) => [s.id, s.travels]));

export default function AgentJsonForm({ agent, onlyChanged, onShowAll, onEdit, onFocusPath, cursorPath }) {
  // Built from the record so the form still renders when the text is broken.
  // Reading the half-typed document instead would hand every control undefined
  // at exactly the moment the form is the only surface still working.
  const doc = useMemo(() => toDoc(agent), [agent]);
  const changed = useMemo(() => changedPaths(agent), [agent]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [active, setActive] = useState(GROUPS[0].id);
  const [tail, setTail] = useState(24);
  const scrollRef = useRef(null);
  // Held while a click-to-jump animates, so the observer does not light up
  // every group the scroll passes through on the way there.
  const jumping = useRef(false);
  const jumpTimer = useRef(null);

  const ctx = { doc, agent };
  const visible = (spec) =>
    (!spec.when || spec.when(ctx)) && (!onlyChanged || changed.has(spec.path));

  const shown = GROUPS.map((g) => ({
    ...g,
    fields: fieldsInGroup(g.id).filter(visible),
    changed: fieldsInGroup(g.id).filter((f) => changed.has(f.path)).length,
  })).filter((g) => g.fields.length > 0);

  const ids = shown.map((g) => g.id).join(",");

  /*
   * A field in the collapsed advanced tier has no card to scroll to.
   *
   * Temperature and the two limits sit behind "4 more settings", so the
   * assistant filling one moved the editor to this file and then highlighted
   * nothing — the change was real, invisible, and looked like a bug in the
   * thing that made it. Opening the group is the right response: hiding a value
   * because it is advanced is a rule about BROWSING, and this is not browsing,
   * it is being shown something that just changed.
   *
   * Adjusted during render rather than in an effect, both because the rules
   * forbid the effect and because an effect would paint one frame of a
   * highlight pointing at a card that is not there yet.
   */
  // Seeded null, not from the prop: this form is usually mounted BY the fill it
  // is announcing, so on the first render the cursor is already set and there
  // is no later change to react to. Seeding from the prop makes the first fill
  // the one case that never opens its group.
  const [lastCursor, setLastCursor] = useState(null);
  if (cursorPath !== lastCursor) {
    setLastCursor(cursorPath);
    const spec = cursorPath ? fieldAt(cursorPath) : null;
    if (spec?.tier === "advanced" && !expanded.has(spec.group)) {
      setExpanded((s) => new Set(s).add(spec.group));
    }
  }

  /*
   * A control somebody else changed has to be on screen to have been seen.
   *
   * The assistant fills a field, the editor switches to this file, and the
   * highlight lands three groups below the fold — a highlight nobody ever sees.
   * `nearest` rather than `center`: a control already visible must not be
   * shuffled to the middle, because the form lurching on every fill is worse
   * than the fill being missed.
   *
   * The scroll-spy is suppressed while this runs, or it lights up whichever
   * group the scroll passed through on the way.
   */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !cursorPath) return undefined;

    /*
     * Deferred by a timer, NOT by requestAnimationFrame.
     *
     * The deferral is needed at all because a fill into the advanced tier opens
     * its group in the same pass that moves the cursor, so measuring the card
     * immediately reads the layout from before the group grew. rAF is the
     * obvious way to wait for that and is the wrong one here: its callbacks do
     * not run while the page is not compositing — a background tab, a hidden
     * window — so the scroll would simply never happen, and would then happen
     * all at once when the tab was brought forward.
     *
     * Keyed on `expanded` as well as the path, so opening the group re-aims it.
     */
    let done = 0;
    const timer = setTimeout(() => {
      const el = root.querySelector(`[data-path="${cursorPath}"]`);
      if (!el) return;
      // Only when it is actually off screen. A control already in front of you
      // must not be shuffled, or the form lurches on every fill of a run.
      const top = el.offsetTop;
      if (top >= root.scrollTop && top + el.offsetHeight <= root.scrollTop + root.clientHeight) return;
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      jumping.current = true;
      root.scrollTo({ top: Math.max(0, top - 8), behavior: still ? "auto" : "smooth" });
      done = setTimeout(() => {
        jumping.current = false;
      }, 400);
    }, 0);

    return () => {
      clearTimeout(timer);
      clearTimeout(done);
    };
  }, [cursorPath, expanded]);

  /**
   * Which group is being read: the last one whose heading has passed a line a
   * quarter of the way down the pane.
   *
   * Computed from the scroll position rather than with an IntersectionObserver,
   * which was the first attempt and was subtly wrong — an observer's callback
   * receives only the entries that CHANGED, so "the topmost intersecting entry
   * in this batch" ignores the group that is still filling the screen and the
   * rail sticks partway down the list.
   *
   * The end of the scroll is its own case. Without it the final group can never
   * be current: there is nothing below it to scroll, so its heading never
   * reaches the line.
   */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return undefined;

    const sync = () => {
      if (jumping.current) return;
      const marks = [...root.querySelectorAll("[data-group]")];
      if (!marks.length) return;
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
        setActive(marks[marks.length - 1].dataset.group);
        return;
      }
      const line = root.scrollTop + root.clientHeight * 0.25;
      let current = marks[0].dataset.group;
      for (const el of marks) if (el.offsetTop <= line) current = el.dataset.group;
      setActive(current);
    };

    sync();
    root.addEventListener("scroll", sync, { passive: true });
    return () => root.removeEventListener("scroll", sync);
  }, [ids]);

  useEffect(() => () => clearTimeout(jumpTimer.current), []);

  /**
   * Room below the last group so it can reach the top of the pane.
   *
   * Without it, clicking the final entry scrolls as far as the content allows
   * and leaves that group stranded halfway down — the rail says you are there
   * and the heading is somewhere else. Measured rather than a fixed percentage,
   * because the last group's height changes when its advanced fields open.
   */
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return undefined;
    const measure = () => {
      const marks = root.querySelectorAll("[data-group]");
      const last = marks[marks.length - 1];
      if (!last) return;
      // Exactly the pane minus the last group. Subtracting anything for
      // "breathing room" eats into the very distance that lets it reach the
      // top: max scroll works out to the last group's offset, and no further.
      setTail(Math.max(24, root.clientHeight - last.offsetHeight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [ids, expanded]);

  const jump = useCallback((id) => {
    const root = scrollRef.current;
    const el = root?.querySelector(`[data-group="${id}"]`);
    if (!root || !el) return;
    setActive(id);
    jumping.current = true;
    // Animated by default, instant when the reader has asked for less motion —
    // and a smooth scroll needs animation frames, so anywhere they do not run
    // the jump has to still arrive rather than quietly do nothing.
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: still ? "auto" : "smooth" });
    clearTimeout(jumpTimer.current);
    jumpTimer.current = setTimeout(() => {
      jumping.current = false;
    }, still ? 0 : 500);
  }, []);

  const railItem = (g, horizontal) => (
    <button
      key={g.id}
      type="button"
      onClick={() => jump(g.id)}
      aria-current={active === g.id ? "true" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md text-left text-xs transition-colors",
        horizontal ? "shrink-0 px-2 py-1" : "w-full px-2 py-1.5",
        active === g.id
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="truncate">{g.label}</span>
      {/* How many decisions were made here — so the menu says where the
          configuration actually is before you go looking for it. */}
      {g.changed > 0 && (
        <span
          className={cn(
            "ml-auto shrink-0 font-mono text-[10px]",
            active === g.id ? "text-primary/70" : "text-muted-foreground/60",
          )}
        >
          {g.changed}
        </span>
      )}
    </button>
  );

  if (!shown.length) {
    return (
      <div className="p-3">
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            Nothing has been changed from its defaults, so this file is nearly empty.
          </p>
          <Button type="button" size="xs" variant="outline" className="mt-2" onClick={onShowAll}>
            Show every setting
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Beside the settings when there is room for both; above them when there
          is not, because a rail and a form cannot each have the width they need
          inside a split pane. */}
      <nav
        aria-label="Settings groups"
        className="hidden w-40 shrink-0 space-y-0.5 overflow-y-auto border-r border-border p-2 lg:block"
      >
        {shown.map((g) => railItem(g, false))}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-1.5 lg:hidden">
          {shown.map((g) => railItem(g, true))}
        </div>

        {/* One scroll holding every group. `relative` so offsetTop is measured
            against this box and a jump lands where it was aimed. */}
        <div ref={scrollRef} className="@container relative min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {shown.map((g) => {
            const hidden = g.fields.filter((f) => f.tier === "advanced").length;
            // Filtering to what changed is already a deliberate narrowing;
            // hiding part of that result behind a second one would be two.
            const open = expanded.has(g.id) || onlyChanged;
            const specs = open ? g.fields : g.fields.filter((f) => f.tier === "common");
            const Icon = ICONS[g.id];
            const travels = TRAVELS[sectionOfGroup(g.id)];

            return (
              <Section
                key={g.id}
                id={`aj-group-${g.id}`}
                data-group={g.id}
                icon={Icon}
                title={g.label}
                note={g.note}
                muted={g.id === "model" && !agent.runtime}
                right={
                  /*
                    Said once per group instead of once per screen. The failure
                    it warns about — tuning temperature and finding it ignored
                    on your laptop — is a per-key fact.
                  */
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap",
                      travels
                        ? "border-primary/25 bg-primary/8 text-primary"
                        : "border-border bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {travels ? "ships in a release" : "Aziron only"}
                  </span>
                }
              >
                {/*
                  A grid of tiles, not a column of rows. Each field asks for the
                  width its control needs, and dense flow lets a later short one
                  backfill the gap a wide one left. Dense repacks what is
                  PAINTED and leaves the DOM alone, so reading order and tab
                  order still follow the file.
                */}
                <div className="grid grid-flow-row-dense grid-cols-6 gap-2">
                  {specs.map((spec) => (
                    <div
                      key={spec.path}
                      data-path={spec.path}
                      className={cn(
                        "min-w-0 rounded-lg border p-2.5 transition-colors",
                        SPAN[spec.width ?? "md"],
                        // Flashes the field you had the caret on in the JSON,
                        // which is how you learn which key the control was.
                        cursorPath === spec.path
                          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                          : changed.has(spec.path)
                            ? "border-border bg-muted/30"
                            : "border-border/50 bg-muted/15",
                      )}
                    >
                      <SchemaField
                        spec={spec}
                        agent={agent}
                        doc={doc}
                        changed={changed.has(spec.path)}
                        onEdit={onEdit}
                        onReset={() => onEdit(spec, spec.fallback)}
                        onFocus={() => onFocusPath?.(spec.path)}
                      />
                    </div>
                  ))}

                  {hidden > 0 && !onlyChanged && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((s) => {
                          const next = new Set(s);
                          next.has(g.id) ? next.delete(g.id) : next.add(g.id);
                          return next;
                        })
                      }
                      aria-expanded={open}
                      className="col-span-6 flex items-center gap-1 pt-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {open ? (
                        <ChevronDown className="size-3" aria-hidden />
                      ) : (
                        <ChevronRight className="size-3" aria-hidden />
                      )}
                      {open ? "Fewer settings" : `${hidden} more setting${hidden === 1 ? "" : "s"}`}
                    </button>
                  )}
                </div>
              </Section>
            );
          })}

          <div style={{ height: tail }} className="shrink-0" aria-hidden />
        </div>
      </div>
    </div>
  );
}
