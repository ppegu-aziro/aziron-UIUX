import { ArrowRight, Boxes, Check, Cpu, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { openToolCount, originCounts } from "@/data/agentsV2";
import { useAgentsV2 } from "@/context/AgentsV2Context";

/**
 * The model, explained.
 *
 * Kept inside the prototype on purpose. A unification lands or fails on
 * whether people can repeat the sentence, so the sentence should be somewhere
 * they will actually see it — not only in a deck.
 */

function Half({ on, label }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        on ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {on ? <Check className="size-2.5" aria-hidden /> : <Minus className="size-2.5" aria-hidden />}
      {label}
    </span>
  );
}

const MAPPING = [
  {
    was: "Agent",
    wasNote: "A form: model, tools, knowledge. Ran here, could never travel.",
    here: true,
    anywhere: false,
    gains: "Gains files, versions and targets — so it can leave Aziron.",
  },
  {
    was: "Skill",
    wasNote: "A folder: files, versions, targets. Travelled, never ran here.",
    here: false,
    anywhere: true,
    gains: "Gains a model and a tool grant — so it can be chatted with.",
  },
];

export default function ModelView() {
  const { agents } = useAgentsV2();
  const counts = originCounts(agents);
  const open = openToolCount(agents);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {/* The sentence */}
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-5">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">The model</p>
        <p className="mt-2 text-lg leading-7 font-medium text-foreground">
          An agent is a folder of instructions.
          <br />
          Give it a model and it <span className="text-primary">runs here</span>.
          <br />
          Release it and it <span className="text-primary">runs anywhere</span>.
        </p>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          There is one noun. The two things that used to be separate types are now two capabilities an
          agent either has or lacks — and both are visible on every card.
        </p>
      </div>

      {/* Why this is a union, not a rename */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-medium text-foreground">Why this is a union, not a rename</h3>
        <p className="mt-1 mb-4 text-xs leading-5 text-muted-foreground">
          Agents and skills were never two kinds of thing. They were two halves of one thing — each had
          exactly what the other lacked. So nothing is absorbed and nothing is lost; each side gains the
          half it never had.
        </p>

        <div className="space-y-2">
          {MAPPING.map((m) => (
            <div key={m.was} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">was: {m.was}</Badge>
                <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                <Badge variant="outline">Agent</Badge>
                <span className="ml-auto flex gap-1.5">
                  <Half on={m.here} label="Runs here" />
                  <Half on={m.anywhere} label="Runs anywhere" />
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{m.wasNote}</p>
              <p className="mt-1 text-xs font-medium text-foreground">{m.gains}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-md bg-muted px-2 py-1">
            {counts.agent} from agents
          </span>
          <span className="rounded-md bg-muted px-2 py-1">{counts.skill} from skills</span>
          <span className="rounded-md bg-muted px-2 py-1">{counts.both} already both</span>
          <span className="rounded-md bg-muted px-2 py-1">{agents.length} total</span>
        </div>
      </div>

      {/* What the research changed */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-medium text-foreground">What reading the code changed</h3>
        <div className="mt-3 space-y-3">
          {[
            {
              t: "The difference was never mainly about tools",
              d: "Agent instructions become a raw system message with no framing. Skill files are wrapped in an “# Active Skills … authoritative guidance” header, get per-provider overrides, and are protected by a prompt-leak guard agents do not have. The real split is runtime versus package.",
            },
            {
              t: "Skills fail open; tools fail closed",
              d: "A skill that cannot be resolved is skipped and the chat proceeds. A tool outside policy is refused outright. Unifying the noun without noticing this would hide a mis-scoped agent behind a silent success.",
            },
            {
              t: "Skills stop applying the moment work is delegated",
              d: "Handing off to another agent forwards only an id and a message, so an active skill silently stops applying. Under one noun that becomes indefensible — a user will reasonably expect an agent to stay itself.",
            },
            {
              t: "Nothing surfaces unrestricted tool access",
              d: `An empty allow-list means every tool. Nothing in the product shows it. ${open} of ${agents.length} agents here are in that state, which is why it is a chip and a filter rather than a report.`,
            },
          ].map((x) => (
            <div key={x.t} className="border-l-2 border-border pl-3">
              <p className="text-xs font-medium text-foreground">{x.t}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{x.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Vocabulary */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-medium text-foreground">Vocabulary</h3>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          Every term has to survive a user meeting it cold, and the word “skill” has already meant three
          unrelated things in this schema.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { icon: Cpu, t: "Runs here", d: "Model, tools and knowledge. Aziron only." },
            { icon: Boxes, t: "Runs anywhere", d: "Released files, version and targets." },
            { t: "Instructions", d: "The body of AGENT.md. What the model reads." },
            { t: "Files", d: "References and scripts beside the entrypoint." },
            { t: "Draft / Release", d: "Draft runs here. Release is what travels." },
            { t: "Target", d: "A tool it installs into. Not a new noun for the agent." },
          ].map((v) => (
            <div key={v.t} className="rounded-lg border border-border px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                {v.icon && <v.icon className="size-3 text-muted-foreground" aria-hidden />}
                {v.t}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{v.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
          Deliberately not used: <strong>Capability</strong> (sounds like a permission and a feature at
          once) and <strong>Plugin</strong>, which is reserved for what a host calls the thing after it
          is installed there.
        </p>
      </div>
    </div>
  );
}
