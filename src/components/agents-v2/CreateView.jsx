import { useState } from "react";
import {
  ArrowLeft,
  Check,
  FileText,
  Loader2,
  PenLine,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CATEGORIES, KNOWLEDGE_SOURCES } from "@/data/agentsV2";
import { useAgentsV2 } from "@/context/AgentsV2Context";

/**
 * Creating an agent.
 *
 * Two genuinely different jobs, so two genuinely different paths rather than
 * one wizard that half-serves both:
 *
 *   Write it     — the author already knows what they want. Name, description
 *                  and instructions, straight into AGENT.md. No model involved.
 *   Generate it  — the author knows the goal but not the shape. The model
 *                  drafts the whole folder, and they edit it afterwards.
 *
 * Generation is also available field-by-field, because "I wrote the
 * instructions but cannot phrase the description" is the common case and
 * forcing a choice of path up front would not serve it.
 */

const SOURCES = KNOWLEDGE_SOURCES.slice(0, 5);

const EXAMPLES = [
  "Answer HR policy questions from our handbook",
  "Triage static-analysis findings and file the real ones",
  "Provision EKS clusters with eksctl on macOS and Windows",
];

const BREAK = /^(from|with|and|or|that|then|using|based|so|but|plus|into|against|across)$/i;

/** Title-case the opening clause of the intent so the agent gets a real name. */
function nameFrom(intent) {
  const words = intent.trim().replace(/[.!?,;:].*$/s, "").split(/\s+/).filter(Boolean);
  const cut = words.findIndex((w, i) => i >= 2 && BREAK.test(w));
  const kept = (cut > 0 ? words.slice(0, cut) : words).slice(0, 5);
  const name = kept
    .map((w) => w.replace(/(^|-)(\w)/g, (_, sep, ch) => sep + ch.toUpperCase()))
    .join(" ")
    .trim();
  return name || "New Agent";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── mock generation ─────────────────────────────────────────────────────── */

const genDescription = (intent) =>
  `${intent.trim().replace(/\.$/, "")}. Cites the source it used, and says plainly when something is not covered.`;

const genInstructions = (name, intent) =>
  [
    `# ${name}`,
    "",
    intent.trim().replace(/\.$/, "") + ".",
    "",
    "## How to answer",
    "",
    "- Read the reference files in this folder before answering.",
    "- Quote the section you relied on rather than paraphrasing it.",
    "- When something is not covered, say so instead of guessing.",
    "",
    "## When to ask first",
    "",
    "Ask a clarifying question when the request could reasonably mean two",
    "different things, rather than picking one and proceeding.",
    "",
  ].join("\n");

const GEN_FILES = [
  {
    id: "agentmd",
    label: "AGENT.md",
    note: "Instructions and frontmatter",
    always: true,
  },
  { id: "references", label: "references/", note: "Background the agent reads before answering" },
  { id: "scripts", label: "scripts/", note: "Helper scripts it can run" },
  { id: "preparation", label: ".aziron/preparation.yaml", note: "Machine setup for the targets it installs into" },
];

function generateFiles(name, intent, picks) {
  const out = [{ path: "AGENT.md", content: genInstructions(name, intent) }];
  if (picks.includes("references")) {
    out.push({
      path: "references/background.md",
      content: `# Background\n\nWhat ${name} needs to know before answering, kept out of the entrypoint so the instructions stay short.\n`,
    });
    out.push({
      path: "references/examples.md",
      content: `# Examples\n\nA good answer, and a bad one with the reason it is bad.\n`,
    });
  }
  if (picks.includes("scripts")) {
    out.push({
      path: "scripts/check.sh",
      content: `#!/usr/bin/env bash\nset -euo pipefail\n\n# Preflight for ${name}.\necho "ok"\n`,
    });
  }
  if (picks.includes("preparation")) {
    out.push({
      path: ".aziron/preparation.yaml",
      content: `schema: 1\n\npreparation:\n  precheck:\n    - id: cli\n      label: Required CLI installed\n      platforms:\n        all:\n          check:\n            kind: binary\n            argv: ["cli"]\n`,
    });
  }
  return out;
}

/* ── small pieces ────────────────────────────────────────────────────────── */

function PathCard({ icon: Icon, title, blurb, bullets, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Otherwise the accessible name is the title, blurb and every bullet
      // concatenated into a single unreadable run.
      aria-label={title}
      className={cn(
        "flex h-full flex-col rounded-xl border p-4 text-left transition-all",
        "hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        tone === "primary"
          ? "border-primary/35 bg-primary/5 hover:border-primary/60"
          : "border-border bg-card hover:border-primary/40",
      )}
    >
      <Icon className={cn("size-5", tone === "primary" ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <h3 className="mt-2.5 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{blurb}</p>
      <ul className="mt-2.5 space-y-1">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Check className="mt-0.5 size-2.5 shrink-0 text-primary" aria-hidden />
            {b}
          </li>
        ))}
      </ul>
    </button>
  );
}

/** A label with an inline "write this for me" affordance. */
function FieldLabel({ htmlFor, children, onGenerate, busy, disabled }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
        {children}
      </label>
      {onGenerate && (
        <Button type="button" variant="ghost" size="xs" onClick={onGenerate} disabled={busy || disabled}>
          {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Wand2 className="size-3" aria-hidden />}
          Generate
        </Button>
      )}
    </div>
  );
}

/* ── screen ──────────────────────────────────────────────────────────────── */

export default function CreateView({ onBack, onCreated }) {
  const { create } = useAgentsV2();
  const [path, setPath] = useState(null); // null | "manual" | "ai"

  // shared form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Operations");
  const [instructions, setInstructions] = useState("");
  const [sources, setSources] = useState([]);
  const [busy, setBusy] = useState("");

  // ai path
  const [intent, setIntent] = useState("");
  const [picks, setPicks] = useState(["references"]);
  const [drafted, setDrafted] = useState(null);

  const togglePick = (id) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleSource = (n) => setSources((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));

  const commit = (files, finalName, finalDesc) => {
    const record = create({
      name: finalName,
      description: finalDesc,
      category,
      knowledge: sources,
      instructions: files?.[0]?.content,
      files,
    });
    toast.success(`${finalName} created`, { description: "Runs here on Auto. Nothing published." });
    onCreated(record);
  };

  /* ── path picker ──────────────────────────────────────────────────────── */
  if (!path) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to agents">
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">New agent</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Both paths land in the same editor — this only decides who writes the first draft.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <PathCard
            icon={PenLine}
            title="Write it myself"
            blurb="You already know what it should do."
            bullets={["Name, description, instructions", "Goes straight into AGENT.md", "No model involved"]}
            onClick={() => setPath("manual")}
          />
          <PathCard
            icon={Sparkles}
            tone="primary"
            title="Generate it"
            blurb="Describe the job and get a working folder."
            bullets={["Drafts AGENT.md", "Optional references, scripts, setup", "Everything editable afterwards"]}
            onClick={() => setPath("ai")}
          />
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          Already have something close? Fork it from the agent list instead.
        </p>
      </div>
    );
  }

  /* ── manual ───────────────────────────────────────────────────────────── */
  if (path === "manual") {
    const ready = name.trim().length > 1 && instructions.trim().length > 0;
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPath(null)} aria-label="Back">
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Write it myself</h2>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <FieldLabel htmlFor="new-name">Name</FieldLabel>
            <Input
              id="new-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="HR Policy Desk"
              className="text-sm"
            />
          </div>

          <div>
            <FieldLabel
              htmlFor="new-desc"
              busy={busy === "desc"}
              disabled={!name.trim() && !instructions.trim()}
              onGenerate={async () => {
                setBusy("desc");
                await sleep(700);
                setDescription(genDescription(instructions.split("\n").find((l) => l && !l.startsWith("#")) || name));
                setBusy("");
                toast.success("Description drafted");
              }}
            >
              Description
            </FieldLabel>
            <Textarea
              id="new-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What it does, in one sentence."
              className="resize-none text-sm"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Shown in the catalog and used to decide when this agent is relevant.
            </p>
          </div>

          <div>
            <FieldLabel htmlFor="new-cat">Category</FieldLabel>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="new-cat" className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel
              htmlFor="new-inst"
              busy={busy === "inst"}
              disabled={!name.trim()}
              onGenerate={async () => {
                setBusy("inst");
                await sleep(900);
                setInstructions(genInstructions(name.trim() || "New Agent", description || name));
                setBusy("");
                toast.success("Instructions drafted");
              }}
            >
              Instructions <span className="font-normal text-muted-foreground">— the body of AGENT.md</span>
            </FieldLabel>
            <Textarea
              id="new-inst"
              rows={10}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={"# HR Policy Desk\n\nAnswer employee questions from the handbook.\n\nQuote the section you relied on."}
              className="resize-none font-mono text-xs leading-6"
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-[11px] text-muted-foreground">Created as a draft. Nothing is published.</p>
            <Button
              type="button"
              size="sm"
              disabled={!ready}
              onClick={() =>
                commit(
                  [{ path: "AGENT.md", content: instructions }],
                  name.trim(),
                  description.trim() || name.trim(),
                )
              }
            >
              Create agent
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── generate ─────────────────────────────────────────────────────────── */
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => (drafted ? setDrafted(null) : setPath(null))}
          aria-label="Back"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Generate it</h2>
      </div>

      {!drafted ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <label htmlFor="intent" className="block text-sm font-medium text-foreground">
              What should this agent do?
            </label>
            <p className="mt-1 mb-2 text-xs text-muted-foreground">Plain English. One or two sentences is plenty.</p>
            <Textarea
              id="intent"
              autoFocus
              rows={3}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="Answer employee questions from our handbook, and say when it doesn't cover something."
              className="resize-none text-sm"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
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

          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">What to generate</p>
            <div className="space-y-1.5">
              {GEN_FILES.map((g) => {
                const on = g.always || picks.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={g.always}
                    onClick={() => togglePick(g.id)}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                      on ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/25",
                      g.always && "opacity-80",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {on && <Check className="size-2.5" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11px] font-medium text-foreground">
                        {g.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">{g.note}</span>
                    </span>
                    {g.always && (
                      <Badge variant="outline" className="shrink-0">
                        required
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">
              Answer from something of yours <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSource(s.name)}
                  aria-pressed={sources.includes(s.name)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    sources.includes(s.name)
                      ? "border-primary/45 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30",
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end border-t border-border pt-4">
            <Button
              type="button"
              size="sm"
              disabled={intent.trim().length < 8 || busy === "gen"}
              onClick={async () => {
                setBusy("gen");
                await sleep(1100);
                const n = nameFrom(intent);
                setName(n);
                setDescription(genDescription(intent));
                setDrafted(generateFiles(n, intent, picks));
                setBusy("");
              }}
            >
              {busy === "gen" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Drafting…
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" aria-hidden />
                  Generate
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-foreground">Draft ready</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Review it here, or create it and edit in the full editor.
              </p>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="gen-name">Name</FieldLabel>
            <Input id="gen-name" value={name} onChange={(e) => setName(e.target.value)} className="text-sm" />
            <p className="mt-1 text-[11px] text-muted-foreground">Taken from your description — change it freely.</p>
          </div>

          <div>
            <FieldLabel
              htmlFor="gen-desc"
              busy={busy === "desc"}
              onGenerate={async () => {
                setBusy("desc");
                await sleep(600);
                setDescription(genDescription(intent));
                setBusy("");
              }}
            >
              Description
            </FieldLabel>
            <Textarea
              id="gen-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none text-sm"
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">{drafted.length} files</p>
            <div className="space-y-1.5">
              {drafted.map((file) => (
                <details key={file.path} className="rounded-lg border border-border">
                  <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-[11px]">
                    <FileText className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="font-mono text-foreground">{file.path}</span>
                    <span className="ml-auto text-muted-foreground">{file.content.split("\n").length} lines</span>
                  </summary>
                  <pre className="max-h-44 overflow-auto border-t border-border bg-muted/30 p-3 font-mono text-[10px] leading-5 text-muted-foreground">
                    {file.content}
                  </pre>
                </details>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDrafted(null)}>
              Change the brief
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!name.trim()}
              onClick={() => commit(drafted, name.trim(), description.trim() || name.trim())}
            >
              Create agent
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
