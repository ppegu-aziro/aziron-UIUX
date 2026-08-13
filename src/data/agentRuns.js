/**
 * What the assistant says and does, as recipes.
 *
 * Scripted, and it says so on screen rather than only here. A mock that hides
 * its seams demos the illusion instead of the loop — and the loop (prompt,
 * folder changes, edit, ask again) is the only thing this prototype can
 * honestly prove. Keyword matching, openly: pretending otherwise would set the
 * wrong expectation about what the demo shows.
 *
 * The generated reference bodies are stubs that SAY they are stubs. The one
 * genuinely dangerous thing this file could do is produce plausible policy text
 * and sign a user's agent's name to it, so every generated body discloses
 * itself in its own text — which is the only place a disclosure survives a
 * screenshot.
 */

import { SEED } from "@/data/preparationSchema";
import { API_TOKENS, PROVIDERS } from "@/data/agentsV2";
import {
  done,
  field,
  folder,
  propose,
  quote,
  say,
  set,
  step,
  think,
  write,
} from "@/components/agents-v2/utils/runScript";

/* ── naming ──────────────────────────────────────────────────────────────── */

const BREAK = /^(from|with|and|or|that|then|using|based|so|but|plus|into|against|across)$/i;

/** A name from the first clause of a request, title-cased. */
export const nameFrom = (intent) => {
  const words = String(intent).trim().replace(/[.!?,;:].*$/s, "").split(/\s+/).filter(Boolean);
  const cut = words.findIndex((w, i) => i >= 2 && BREAK.test(w));
  const kept = (cut > 0 ? words.slice(0, cut) : words).slice(0, 5);
  return (
    kept.map((w) => w.replace(/(^|-)(\w)/g, (_, s, c) => s + c.toUpperCase())).join(" ").trim() ||
    "New Agent"
  );
};

const slugOf = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").slice(0, 4).join("-") ||
  "note";

const titleOf = (s) => {
  const t = String(s).trim().replace(/\.$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Category from keywords, and openly a table.
 *
 * A category picked by meaning is a claim this prototype cannot back, so the
 * table is the honest shape: it is obviously a lookup, it is obviously
 * incomplete, and the fallback is the most common answer rather than a guess
 * dressed up as one.
 */
const CATEGORY_OF = [
  [/handbook|leave|benefit|onboard|hiring|hr\b|people|payroll|policy/, "People"],
  [/incident|runbook|deploy|on-?call|status page|escalat|provision|cluster/, "Operations"],
  [/invoice|billing|contract|revenue|arr|churn|spend|cost/, "Finance"],
  [/vuln|cve|sast|threat|pentest|secret|audit|security/, "Security"],
  [/warehouse|sql|dataset|dashboard|etl|analytic/, "Data"],
  [/campaign|copy|launch|positioning|seo|marketing/, "Marketing"],
];

const categoryFrom = (p) => CATEGORY_OF.find(([re]) => re.test(p))?.[1] ?? "Engineering";

const providerFrom = (p) =>
  /openai|gpt/i.test(p) ? "OpenAI" : /auto/i.test(p) ? "Automatic" : "Anthropic";

const modelFrom = (p) => {
  const provider = PROVIDERS.find((x) => x.name === providerFrom(p));
  if (/fast|cheap|quick/i.test(p)) return provider.models[provider.models.length - 1].id;
  if (/capable|best|hard|complex/i.test(p)) return provider.models[0].id;
  return provider.models[Math.min(1, provider.models.length - 1)].id;
};

const tokenLabelFor = (provider) => API_TOKENS[provider]?.[0]?.label ?? "the saved credential";

const entryOf = (a) => a?.files?.find((f) => f.path === "AGENT.md") ?? { path: "AGENT.md", content: "" };

const hasFolder = (a, dir) =>
  Boolean(a?.folders?.includes(dir)) || Boolean(a?.files?.some((f) => f.path.startsWith(`${dir}/`)));

/** Drop the bulleted guidance, keep the headings, collapse the gaps it leaves. */
const tightened = (body) =>
  body.split("\n").filter((l) => !l.startsWith("- ")).join("\n").replace(/\n{3,}/g, "\n\n");

const appendHeading = (body, prompt) =>
  `${body.replace(/\s+$/, "")}\n\n## ${titleOf(prompt)}\n\nApply this when it is relevant to the request.\n`;

/* ── authoring recipes ───────────────────────────────────────────────────── */

const createFromIntent = {
  id: "create-from-intent",
  title: "build it from scratch",
  // Only on a genuinely blank agent: no name, and an entrypoint nobody has
  // written into. Anything else and "create" would overwrite somebody's work.
  match: (prompt, a) => !a?.name?.trim() && !entryOf(a).content.trim(),
  build: (prompt, a) => {
    const name = nameFrom(prompt);
    const subject = String(prompt).trim().replace(/\.$/, "");
    const category = categoryFrom(String(prompt).toLowerCase());
    return [
      think("reading the folder — one AGENT.md, empty"),
      ...say(
        "Right. I'll build this as an agent that reads before it answers, and says so when its own files don't cover something. Writing the folder now.",
      ),

      field(
        "package.description",
        `${titleOf(subject)}. Quotes the passage it used, and says plainly when the material is silent.`,
      ),
      field("package.category", category),

      folder("references"),

      ...write(
        "AGENT.md",
        [
          `# ${name}`,
          ``,
          `${titleOf(subject)}, using the documents in this folder.`,
          ``,
          `## How to answer`,
          ``,
          "- Read `references/` before answering. Do not answer from memory.",
          `- Quote the passage you relied on and name the file it came from.`,
          `- When the material is silent, say it is silent. Do not reason to an answer.`,
          `- Anything about one person's own case goes to a human, not to you.`,
          ``,
          `## When to ask first`,
          ``,
          `Ask a clarifying question when the request could reasonably mean two`,
          `different things. The wrong branch is worse than a follow-up question.`,
          ``,
        ].join("\n"),
        { from: entryOf(a).content },
      ),

      ...write(
        "references/background.md",
        [
          `# Background`,
          ``,
          `Stub. Paste the real material here — this agent reads this file, not`,
          `the internet.`,
          ``,
          `- One heading per topic, with the rule underneath it`,
          `- Anything you leave out, the agent will say it cannot answer`,
          `- Which is the behaviour you want, and the reason this file is empty`,
          ``,
        ].join("\n"),
      ),

      field("chat.quickPrompts", [
        { label: "What do you cover?", prompt: "What subjects can you answer on?" },
        { label: "Not covered?", prompt: "What do you do when your files don't cover it?" },
      ]),

      // No provider is bound yet, so this one is invisible in the form. The
      // compiler demotes it into the runtime proposal rather than writing it
      // into a section nobody can see.
      field("runtime.temperature", 0.3, { into: "runtime" }),

      propose("package", `Call it “${name}”`, "names the agent, its slug and its install path", [
        ["package.name", name],
      ]),
      propose(
        "runtime",
        "Bind Anthropic · Claude Sonnet 4.5",
        `also binds the “${tokenLabelFor("Anthropic")}” credential`,
        [
          ["runtime.provider", "Anthropic"],
          ["runtime.model", "Claude Sonnet 4.5"],
        ],
      ),
      propose("package.tools", "Scope it to vector_search and get_file_content", "it can read, and nothing else", [
        ["package.tools.posture", "scoped"],
        ["package.tools.granted", ["vector_search", "get_file_content"]],
      ]),

      done(
        `The reference file is a stub on purpose. I don't have your material, and generating plausible text and signing your agent's name to it would be the worst thing I could do here. Paste the real thing in — the agent reads what is in the file.`,
      ),
    ];
  },
};

const addReference = {
  id: "add-reference",
  title: "add a reference file",
  match: (prompt) => /\brefer|example|background|context|source\b/.test(prompt),
  build: (prompt, a) => {
    const path = `references/${slugOf(prompt)}.md`;
    return [
      think("checking whether references/ exists"),
      ...say(
        "Adding it as its own file rather than growing the entrypoint. The entrypoint is read every time; this is read when it is relevant.",
      ),
      hasFolder(a, "references") ? null : folder("references"),
      ...write(
        path,
        [
          `# ${titleOf(prompt)}`,
          ``,
          `${titleOf(prompt)}.`,
          ``,
          `Kept out of AGENT.md so the instructions stay short. Replace this`,
          `paragraph with the actual material — the agent reads the file, not this`,
          `note.`,
          ``,
        ].join("\n"),
      ),
      done(
        "Linked nothing automatically — if the entrypoint should point at it, type `./` in AGENT.md and the completion will offer it.",
      ),
    ];
  },
};

const addScript = {
  id: "add-script",
  title: "add a script",
  match: (prompt) => /\bscript|command|shell|bash\b/.test(prompt),
  build: (prompt, a) => [
    think("scripts ship with a release and run on the target machine"),
    ...say(
      "Writing it as an executable file in scripts/. It runs where the agent is installed, not in Aziron.",
    ),
    hasFolder(a, "scripts") ? null : folder("scripts"),
    ...write(
      "scripts/run.sh",
      [
        `#!/usr/bin/env bash`,
        `set -euo pipefail`,
        ``,
        `# ${String(prompt).trim()}`,
        ``,
        `# Fail loudly and early: a script that half-runs on someone's laptop is`,
        `# worse than one that refuses to start.`,
        `command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }`,
        ``,
        `echo "ok"`,
        ``,
      ].join("\n"),
    ),
    propose(
      "package.tools",
      "Grant run_command (scoped)",
      "it could then execute shell on whatever machine it is installed to",
      [
        ["package.tools.posture", "scoped"],
        ["package.tools.granted", [...new Set([...(a?.granted ?? []), "run_command"])]],
      ],
    ),
    done("The tool grant is a proposal, not a fill. Shell execution on someone else's machine is not mine to hand out."),
  ],
};

const addPreparation = {
  id: "add-preparation",
  title: "add machine setup",
  match: (prompt) => /\bprepar|setup|set up|install|dependenc|precheck\b/.test(prompt),
  build: () => [
    think("`.aziron/` already holds the generated settings file"),
    ...say(
      "Adding a preparation document beside it. It declares what a machine needs before the agent runs — and the last strategy declares no requirements, so preparation can never dead-end.",
    ),
    ...write(".aziron/preparation.yaml", SEED),
    done(
      "Open it and the setup pane takes over from the text editor. That pane commits into the file itself — preparation.yaml's truth is its own bytes.",
    ),
  ],
};

const configure = {
  id: "configure",
  title: "change the settings",
  match: (prompt) =>
    /\bset (it )?up for|make it (careful|strict|fast)|use (anthropic|openai)|temperature|careful|deterministic|model\b/.test(
      prompt,
    ),
  build: (prompt) => {
    const provider = providerFrom(prompt);
    const model = modelFrom(prompt);
    return [
      think("this one only touches settings — no files change"),
      ...say(
        "Two of these I can set outright. The model binding I can't: it picks a credential, and that is a choice you make, not one I make for you.",
      ),
      field("runtime.temperature", 0.2, { into: "runtime" }),
      field("runtime.maxIterations", 6, { into: "runtime" }),
      propose("runtime", `Bind ${provider} · ${model}`, `also binds the “${tokenLabelFor(provider)}” credential`, [
        ["runtime.provider", provider],
        ["runtime.model", model],
      ]),
      done(
        "Temperature and iteration count are Aziron-only — a released copy runs on whatever model its host provides, and ignores both.",
      ),
    ];
  },
};

const tighten = {
  id: "tighten",
  title: "make it shorter",
  match: (prompt) => /\bshort|concise|brief|trim|tighten\b/.test(prompt),
  build: (prompt, a) => {
    const entry = entryOf(a);
    const bullets = entry.content.split("\n").filter((l) => l.startsWith("- ")).length;
    const headings = entry.content.split("\n").filter((l) => l.startsWith("#")).length;
    return [
      think(`reading AGENT.md — ${headings} headings, ${bullets} bullets`),
      ...say("Cutting the bulleted guidance and keeping the headings. Check it still says what you need."),
      set("AGENT.md", entry.content, tightened(entry.content)),
      done(
        "Nothing here is recoverable except by the undo in the row above — this store keeps no history. If the cut went too far, press it now.",
      ),
    ];
  },
};

/**
 * The fallback, and it says so.
 *
 * A generic answer presented confidently is worse than a thin one presented as
 * the fallback it is, because the first teaches the audience that the mock
 * understood them.
 */
const revise = {
  id: "revise",
  title: "the generic one",
  match: () => true,
  build: (prompt, a) => {
    const entry = entryOf(a);
    return [
      think("no recipe matched — falling back"),
      ...say(
        "That didn't match anything I have a recipe for, so this is the generic one: I appended your words to AGENT.md as a heading. Keyword matching, not meaning.",
      ),
      ...write("AGENT.md", appendHeading(entry.content, prompt), { from: entry.content }),
      done(
        "If that wasn't what you wanted, it is the honest answer rather than a better-looking wrong one. Try “add a reference file”, “add a script”, “make it shorter”, or describe what it should do from scratch.",
      ),
    ];
  },
};

export const AUTHORING = [
  createFromIntent,
  addReference,
  addScript,
  addPreparation,
  configure,
  tighten,
  revise,
];

/** Suggestion chips map straight onto recipe ids, so a chip cannot mis-fire. */
export const SUGGESTIONS = [
  { id: "add-reference", label: "Add a reference file" },
  { id: "add-preparation", label: "Add machine setup" },
  { id: "tighten", label: "Make it shorter" },
];

/* ── runtime chat ────────────────────────────────────────────────────────── */

const STOP = new Set(
  "a an and are as at be by can do does for from how i in is it its me my of on or our so than that the their them then there these this to too was what when where which who why will with you your".split(
    " ",
  ),
);

const terms = (s) =>
  String(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

/** Every `#`/`##` section of every file in the agent's folder, as a corpus. */
export function sectionsOf(agent) {
  const out = [];
  for (const file of agent?.files ?? []) {
    if (!/\.(md|markdown|txt)$/i.test(file.path)) continue;
    const lines = file.content.split("\n");
    let heading = null;
    let body = [];
    const flush = () => {
      if (heading && body.join("").trim()) out.push({ file: file.path, heading, body: body.join("\n").trim() });
      body = [];
    };
    for (const line of lines) {
      if (/^#{1,2} /.test(line)) {
        flush();
        heading = line.replace(/^#+ /, "").trim();
      } else if (heading) {
        body.push(line);
      }
    }
    flush();
  }
  return out;
}

/**
 * The best-matching section of the agent's own files, or nothing.
 *
 * Real retrieval over the one real corpus available. Two matched terms is the
 * floor: below that the "match" is a coincidence, and a coincidence quoted back
 * confidently is exactly the failure this whole panel is built to avoid.
 */
export function retrieve(agent, prompt) {
  const want = new Set(terms(prompt));
  if (!want.size) return null;
  const sections = sectionsOf(agent);
  let best = null;
  for (const s of sections) {
    const have = new Set(terms(`${s.heading} ${s.body}`));
    let hits = 0;
    for (const w of want) if (have.has(w)) hits += 1;
    if (!best || hits > best.hits) best = { ...s, hits };
  }
  return best && best.hits >= 2 ? { ...best, of: sections.length } : { of: sections.length, hits: 0 };
}

const firstLine = (body) => body.split("\n").find((l) => l.trim()) ?? body.trim();

const CHAT = {
  /** Answers by quoting the agent's own file, and says that is what it did. */
  quote: (prompt, a, hit) => [
    think(`searching this agent's folder — ${a.files.length} files, ${hit.of} sections`),
    step("file", `${hit.file} › ${hit.heading}`, `best of ${hit.of} sections · ${hit.hits} terms matched`),
    ...say("I'm reading your files, not calling a model. This is the passage that matched:"),
    quote(firstLine(hit.body), `${hit.file} › ${hit.heading}`),
    ...say(
      "That is the instruction in your own file. Whether it produces a good answer to your question is a question about the model, and there is no model on the other side of this panel.",
    ),
    step(
      "cpu",
      `${a.runtime.model} · temperature ${a.temperature ?? 0.3} · up to ${a.maxIterations ?? 10} iterations`,
      "bound, not called",
    ),
  ],

  /** Answers about its own configuration, read straight off the record. */
  config: (prompt, a) => {
    const granted = a.tools === "scoped" ? a.granted : [];
    const asked = /\b([a-z][a-z0-9_]{3,})\b/g;
    const named = [...String(prompt).toLowerCase().matchAll(asked)].map((m) => m[1]);
    const missing = named.find((w) => w.includes("_") && !granted.includes(w));
    return [
      think("reading this agent's own record"),
      a.tools === "open"
        ? step("wrench", "Every tool available to whoever runs it", "and anything added to the workspace later")
        : step(
            "wrench",
            granted.length ? granted.join(", ") : "no tools",
            `${granted.length} of ${a.tools === "none" ? "none granted" : "the catalogue"}`,
          ),
      step(
        "book",
        a.knowledge?.length ? a.knowledge.join(", ") : "no sources attached",
        a.knowledge?.length ? "readable inside Aziron only" : "it would answer from its own files alone",
      ),
      ...say(
        missing
          ? `No. I hold ${granted.length ? granted.join(", ") : "no tools"}, and \`${missing}\` is not one of them. Grant it in Settings → Tools and ask me again — this answer is read off the record, so it changes when the record does.`
          : `That is read off this agent's record rather than from a model, so it changes the moment you change the settings. Grant a tool or attach a source and ask again.`,
      ),
    ];
  },

  /** No model bound: the panel says so and does not then answer anyway. */
  unbound: (prompt, a) => [
    think("no runtime is bound to this agent"),
    ...say(
      `${a.name} has no model bound, so there is nothing to ask. It still installs and runs on its targets — they bring their own model. Bind one here and the panel comes alive.`,
    ),
    propose("runtime", "Bind Anthropic · Claude Sonnet 4.5", `also binds the “${tokenLabelFor("Anthropic")}” credential`, [
      ["runtime.provider", "Anthropic"],
      ["runtime.model", "Claude Sonnet 4.5"],
    ]),
  ],

  /** Nothing matched, and it refuses rather than inventing. */
  refuse: (prompt, a, hit) => [
    think(`searching this agent's folder — ${a.files.length} files, ${hit?.of ?? 0} sections`),
    ...say(
      "Nothing in this agent's files covers that, and I'm reading the files rather than a model — so answering would mean making it up and signing your agent's name to it. Add a section for it and ask again.",
    ),
  ],
};

const CONFIG_Q = /\btool|model|access|can you|permission|knowledge|search|allowed|reach\b/;

/** Which chat shape answers this question. Order is the policy. */
export function chatRecipe(prompt, agent) {
  if (!agent?.runtime) return { id: "unbound", build: (p, a) => CHAT.unbound(p, a) };
  const hit = retrieve(agent, prompt);
  if (hit?.hits >= 2) return { id: "quote", build: (p, a) => CHAT.quote(p, a, hit) };
  if (CONFIG_Q.test(String(prompt).toLowerCase())) return { id: "config", build: (p, a) => CHAT.config(p, a) };
  return { id: "refuse", build: (p, a) => CHAT.refuse(p, a, hit) };
}

/* ── selection ───────────────────────────────────────────────────────────── */

/**
 * Which recipe answers this prompt.
 *
 * An explicit intent from a suggestion chip always wins over guessing from the
 * text — the chip already said what it wanted, and re-deriving it from its own
 * label is a way to get it wrong.
 */
export function pickRecipe(kind, prompt, agent, intent) {
  if (kind === "chat") return chatRecipe(prompt, agent);
  if (intent) {
    const hit = AUTHORING.find((r) => r.id === intent);
    if (hit) return hit;
  }
  const p = String(prompt).toLowerCase();
  return AUTHORING.find((r) => r.match(p, agent)) ?? revise;
}
