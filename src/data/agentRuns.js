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

import { PREPARATION_PATH, SEED } from "@/data/preparationSchema";
import {
  ALL_TOOLS,
  API_TOKENS,
  CATEGORIES,
  KNOWLEDGE_SOURCES,
  PROVIDERS,
  VECTOR_DBS,
} from "@/data/agentsV2";
import {
  done,
  field,
  folder,
  propose,
  quote,
  say,
  set,
  statedIn,
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

/**
 * The section to APPEND, not the document with it appended.
 *
 * write(path, body, {from}) streams `body` on to the end of `from`, so handing
 * it a whole document that already contains `from` writes the file out twice.
 * It did: every fallback turn doubled AGENT.md, heading and all, and the copy
 * looked enough like the original to read as a rendering glitch rather than a
 * write.
 */
const sectionFor = (prompt) =>
  `\n\n## ${titleOf(prompt)}\n\nApply this when it is relevant to the request.\n`;

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

/**
 * A section spliced into the MIDDLE of an existing file.
 *
 * Deliberately a `set` rather than a stream. A streamed chunk only ever extends
 * the end of a file -- the player computes `prev + text` -- so a mid-file edit
 * is not expressible in that vocabulary at all. `set` is also the only write
 * with an exact undo, which matters more here than the typing animation does:
 * this one changes something the user already wrote.
 */
const addSection = {
  id: "add-section",
  title: "add a section to a file",
  match: (prompt) => /\b(add|insert|new)\b.{0,20}\bsection\b/.test(prompt) && /\b(after|under|below)\b/.test(prompt),
  build: (prompt, a) => {
    // headingsOf, not sectionsOf. The retrieval index drops a heading with no
    // body under it, correctly — there is nothing there to quote. As an anchor
    // index that is wrong: an empty section is a perfectly good place to insert
    // after, and "make it shorter" leaves several behind. Measured on a real
    // record whose "## How to answer" had been emptied by an earlier run.
    const anchor = headingsOf(a).find((s) => statedIn(prompt, s.heading));
    if (!anchor) {
      return [
        think("looking for that heading in this agent's files"),
        ...say(
          "I could not find a heading by that name, so I changed nothing. Name one exactly as it appears in the file — I match the words, not the meaning.",
        ),
        ...headingsOf(a).slice(0, 5).map((s) => step("file", s.heading, s.file)),
      ];
    }
    const file = a.files.find((f) => f.path === anchor.file);
    /*
     * What the new section is ABOUT, which is not what is left over after the
     * instruction words are removed.
     *
     * "add a section after X about escalation" strips down to "a" if you take
     * the leftovers, because the subject sits past the anchor phrase — and the
     * file then gets a heading called "A". So the subject is read from "about
     * …" when it is there, and only otherwise from what remains once the
     * quoted anchor and the instruction words are gone.
     */
    const subject =
      (/\babout\s+(.+)$/i.exec(prompt)?.[1] ?? "").trim() ||
      String(prompt)
        .replace(/["“][^"”]*["”]/g, "")
        .replace(/\b(add|insert|new|an?|the|section|after|under|below|to)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    const title = titleOf(subject) || "New section";
    const block = [
      ``,
      `## ${title}`,
      ``,
      `${title}.`,
      ``,
      `Spliced in after “${anchor.heading}” by a scripted recipe, from the words`,
      `in your prompt — no model read this file. Replace this paragraph with the`,
      `actual instruction; the agent reads the file, not this note.`,
      ``,
    ].join("\n");
    const next = file.content.slice(0, anchor.end) + block + file.content.slice(anchor.end);
    return [
      think(`reading ${anchor.file} — ${headingsOf(a).length} headings`),
      ...say(
        `Splicing it in after “${anchor.heading}” rather than appending at the end. Everything before and after that point stays byte-identical.`,
      ),
      set(anchor.file, file.content, next),
      done(
        "A wholesale replacement, so the undo above puts the file back exactly. Streaming could not have done this — a chunk only ever extends the end.",
      ),
    ];
  },
};

const addPreparation = {
  id: "add-preparation",
  title: "add machine setup",
  match: (prompt) => /\bprepar|setup|set up|install|dependenc|precheck\b/.test(prompt),
  build: (prompt, a) => {
    /*
     * Refuse rather than overwrite.
     *
     * This streamed SEED from an empty starting point, which on an agent that
     * already HAS a preparation document meant addFile no-opped, every chunk's
     * `prev` disagreed with the store, and the run abandoned the file while
     * reporting that the user had edited it. Silently replacing it would have
     * been worse: that file is hand-written and its bytes are the truth.
     */
    const existing = a?.files?.find((f) => f.path === PREPARATION_PATH);
    if (existing) {
      const lines = existing.content.split("\n").length;
      return [
        think("checking whether this folder already declares its setup"),
        ...say(
          `There is already a preparation document here — ${lines} lines of it — and it is hand-written, so I am not replacing it. Open it and the setup pane will let you add a check or a step with the schema in front of you.`,
        ),
        step("file", PREPARATION_PATH, `${lines} lines, left alone`),
        done("Its bytes are the truth for that file, which is why nothing here rewrites them wholesale."),
      ];
    }
    return [
      think("`.aziron/` already holds the generated settings file"),
      ...say(
        "Adding a preparation document beside it. It declares what a machine needs before the agent runs — and the last strategy declares no requirements, so preparation can never dead-end.",
      ),
      ...write(PREPARATION_PATH, SEED),
      done(
        "Open it and the setup pane takes over from the text editor. That pane commits into the file itself — preparation.yaml's truth is its own bytes.",
      ),
    ];
  },
};

/**
 * The value the user typed, when they typed one.
 *
 * Quoted first, because a quoted string is unambiguous and is what people reach
 * for when the value contains the words that would otherwise end the phrase.
 * Then whatever follows the verb, up to a full stop.
 */
/** Case and punctuation dropped, so a catalogue name matches how people type it. */
const flatten = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const FILLER = /^(it|this|that|the agent|something|anything|whatever|please)$/i;

const quotedOrAfter = (prompt, verbs) => {
  const quoted = /["“”'‘’](.+?)["“”'‘’]/.exec(prompt);
  const re = new RegExp(String.raw`\b(?:${verbs})\s+(?:it\s+)?(?:to\s+|as\s+)?(.+)`, "i");
  const raw = quoted ? quoted[1] : (re.exec(prompt)?.[1] ?? "");
  const value = raw.trim().replace(/[.!?]+$/, "").replace(/^["'“‘]|["'”’]$/g, "").trim();
  // "rename it" leaves "it" behind — and "it" passes the stated check, because
  // it genuinely is in the prompt. That would name somebody's agent "it". A
  // request with no value in it is a request to be asked, not a value.
  if (!value || FILLER.test(value) || !/[a-z0-9]/i.test(value)) return "";
  return value;
};

const rename = {
  id: "rename",
  title: "rename it",
  match: (prompt) => /\b(call it|rename|name it|change the name)\b/.test(prompt),
  build: (prompt, a) => {
    const name = quotedOrAfter(prompt, "call it|rename(?: it)?(?: to)?|name it|change the name to");
    if (!name) {
      return [
        think("looking for a name in that"),
        ...say(
          "I could not find a name in that. Put it in quotes — `call it \"Leave Desk\"` — and I will set it and the heading together.",
        ),
      ];
    }
    const entry = entryOf(a);
    // The heading goes with it. Leaving `# Old Name` at the top of a file whose
    // agent is now called something else is a contradiction the reader has to
    // notice and fix by hand, and a rename that only half-lands is worse than
    // one that asks first.
    const rewritten = /^# .*/m.test(entry.content)
      ? entry.content.replace(/^# .*/m, `# ${name}`)
      : null;
    return [
      think(`renaming — the slug and the install path come off this too`),
      ...say(
        `Setting it to “${name}”. You said it, so there is nothing for me to propose — I only ask when the name is my guess rather than yours.`,
      ),
      field("package.name", name, { stated: true }),
      rewritten && rewritten !== entry.content ? set("AGENT.md", entry.content, rewritten) : null,
      done(
        `The slug is derived rather than stored, so the install path moved with it — \`${name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}\`. Anyone who already installed it keeps the old one until they update.`,
      ),
    ];
  },
};

const describe = {
  id: "describe",
  title: "change the description",
  match: (prompt) => /\b(describe|description|summar(y|ise|ize)|tagline)\b/.test(prompt),
  build: (prompt) => {
    const text = quotedOrAfter(prompt, "describe(?: it)?(?: as)?|description(?: to)?|summary(?: to)?|tagline(?: to)?");
    if (!text) {
      return [
        think("looking for a description in that"),
        ...say(
          'I could not find the wording in that. Put it in quotes — `describe it as "answers leave questions from the handbook"`.',
        ),
      ];
    }
    return [
      think("the description is what the catalog shows and what routing reads"),
      ...say(`Replacing it with that.`),
      field("package.description", text, { stated: true }),
      done(
        "This is the sentence the catalog lists it under and the one used to decide when it is relevant, so it is worth being specific in.",
      ),
    ];
  },
};

/* ── tools and knowledge ─────────────────────────────────────────────────── */

/** Tool ids the prompt actually names, in catalogue order rather than typing order. */
const toolsNamedIn = (prompt) => {
  const p = String(prompt).toLowerCase();
  return ALL_TOOLS.filter((t) => p.includes(t));
};

/** Sources the prompt names, matched on the catalogue's own spelling. */
const sourcesNamedIn = (prompt) => {
  const p = flatten(prompt);
  return KNOWLEDGE_SOURCES.filter((s) => p.includes(flatten(s.name))).map((s) => s.name);
};

/**
 * A database only counts as named when the sentence is about databases.
 *
 * The catalogue calls one of them "Engineering", which is also a category, a
 * team and a word people use in passing — "add a reference file about
 * engineering" is not a request to attach a vector store. So the name has to
 * arrive with something that says which kind of thing is meant.
 */
const dbNamedIn = (prompt) => {
  if (!/\bvector|database|\bdbs?\b|collections?\b/i.test(prompt)) return null;
  const p = flatten(prompt);
  return VECTOR_DBS.find((d) => p.includes(flatten(d.name)) || p.includes(flatten(d.id))) ?? null;
};

/** What a request implies when it names no tool at all. */
const READ_ONLY = ["vector_search", "get_file_content"];

const grantTools = {
  id: "grant-tools",
  title: "grant tools",
  /*
   * Decided by what the sentence NAMES, and only then by how it is worded.
   *
   * The two vocabularies overlap badly — "give it some knowledge" is a tool
   * request by keyword and a corpus request by meaning, and `vector_search` is
   * a tool whose name contains the other recipe's strongest keyword. So a
   * named tool settles it outright, and the loose wording only applies when
   * the sentence names no corpus to contradict it.
   */
  match: (prompt) =>
    toolsNamedIn(prompt).length > 0 ||
    (/\b(grant|tools?|permission|can call|let it (use|call|run))\b/.test(prompt) &&
      !sourcesNamedIn(prompt).length &&
      !dbNamedIn(prompt)),
  build: (prompt, a) => {
    const named = toolsNamedIn(prompt);
    const already = a.tools === "scoped" ? (a.granted ?? []) : [];
    const wanted = [...new Set([...already, ...(named.length ? named : READ_ONLY)])];
    const unknown = (String(prompt).toLowerCase().match(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g) ?? []).filter(
      (w) => !ALL_TOOLS.includes(w),
    );

    /*
     * Whether this can be set outright turns on the POSTURE, not on the words.
     *
     * `granted` is hidden by the schema until the posture is scoped, so on an
     * agent that holds no tools there is nothing to fill — the list would be
     * written where the form does not draw it and the next save would drop it.
     * That case is a chip that does both in one click, and it is a chip even
     * when the tools were named outright, because turning a no-tools agent into
     * a tool-using one is a change of kind rather than a change of value.
     */
    const scoped = a.tools === "scoped";

    return [
      think(
        named.length
          ? `matching what you named against the ${ALL_TOOLS.length} tools in the catalogue`
          : "no tool named — reading is the smallest useful grant",
      ),
      ...say(
        !named.length
          ? `You didn't name a tool, so I am not picking permissions for you. Here is the smallest grant that is actually useful — reading — as something to accept or ignore.`
          : scoped
            ? `Granting ${named.join(", ")}. You named ${named.length === 1 ? "it" : "them"}, so there is nothing for me to guess at — adding to what it already holds rather than replacing it.`
            : `${named.join(", ")}, then. This agent holds no tools at all right now, so that is a change of kind rather than a value — one click below turns it on and grants exactly those.`,
      ),
      unknown.length
        ? step("wrench", unknown.join(", "), `not in the catalogue, so ${unknown.length === 1 ? "it was" : "they were"} left out`)
        : null,
      // Already scoped and named outright: the user's own words, set rather
      // than asked about.
      scoped && named.length ? field("package.tools.granted", wanted, { stated: true, statedBy: named }) : null,
      scoped && named.length
        ? null
        : propose(
            "package.tools",
            named.length ? `Grant ${named.join(" and ")}` : `Scope it to ${READ_ONLY.join(" and ")}`,
            named.length
              ? `switches it from “${a.tools}” to a scoped allow-list holding exactly ${named.length === 1 ? "that one" : `those ${named.length}`}`
              : "it can read, and nothing else",
            [
              ["package.tools.posture", "scoped"],
              ["package.tools.granted", named.length ? wanted : READ_ONLY],
            ],
          ),
      done(
        `Tools are an Aziron-side grant: they say what this agent may call while it runs here. A released copy gets whatever its host allows instead, so this list does not travel with it.`,
      ),
    ];
  },
};

const attachKnowledge = {
  id: "attach-knowledge",
  title: "attach knowledge",
  match: (prompt) =>
    sourcesNamedIn(prompt).length > 0 ||
    Boolean(dbNamedIn(prompt)) ||
    (/\b(knowledge|hub|corpus|attach|retriev|rag|index)\b/.test(prompt) && !toolsNamedIn(prompt).length),
  build: (prompt, a) => {
    const named = sourcesNamedIn(prompt);
    const db = dbNamedIn(prompt);
    const already = a.knowledge ?? [];
    const wanted = [...new Set([...already, ...named])];

    if (!named.length && !db) {
      return [
        think(`${KNOWLEDGE_SOURCES.length} hubs and ${VECTOR_DBS.length} databases are available here`),
        ...say(
          `Nothing in that names one of them, and attaching a corpus decides what this agent can read — so I will not pick. Name one and I will attach it.`,
        ),
        ...KNOWLEDGE_SOURCES.slice(0, 4).map((s) => step("book", s.name, s.meta)),
        done("Say the name as it appears above and I will attach it outright, without asking twice."),
      ];
    }

    return [
      think("attaching reads it into this workspace only — it does not travel in a release"),
      ...say(
        named.length
          ? `Attaching ${named.join(" and ")}.${already.length ? " Keeping what was already there." : ""}`
          : `Attaching the ${db.name} database.`,
      ),
      ...named.map((n) => {
        const meta = KNOWLEDGE_SOURCES.find((s) => s.name === n);
        return step("book", n, meta?.meta ?? "");
      }),
      named.length ? field("knowledge.sources", wanted, { stated: true, statedBy: named }) : null,
      db ? step("book", db.name, `${db.collections.length} collections`) : null,
      db ? field("knowledge.vectorDb", db.id, { stated: true, statedBy: db.name }) : null,
      // Gated on a database existing, so on an agent without one this rides
      // along with the database rather than being written where nothing shows it.
      db ? field("knowledge.collections", db.collections, { into: "knowledge" }) : null,
      done(
        "Attached inside Aziron only. A released copy has no access to any of this — it reads the files in its own folder, which is why those matter more than this list does.",
      ),
    ];
  },
};

/** Numbers people actually type, with the units they type them in. */
const numberFor = (prompt, re) => {
  const hit = re.exec(prompt);
  return hit ? Number(hit[1]) : null;
};

const configure = {
  id: "configure",
  title: "change the settings",
  match: (prompt) =>
    /\bset (it )?up for|make it (careful|strict|fast|public|private)|use (anthropic|openai)|temperature|max tokens|iterations|category|careful|deterministic|creative|model\b/.test(
      prompt,
    ),
  build: (prompt, a) => {
    const p = String(prompt).toLowerCase();
    const temp = numberFor(p, /temperature\s*(?:to|=|of)?\s*([0-9]*\.?[0-9]+)/);
    const tokens = numberFor(p, /max ?tokens?\s*(?:to|=|of)?\s*([0-9]+)/);
    const iters = numberFor(p, /(?:max )?iterations?\s*(?:to|=|of)?\s*([0-9]+)/);
    const category = CATEGORIES.find((c) => new RegExp(`\\b${c.toLowerCase()}\\b`).test(p));
    const wantsPublic = /\b(public|publish|share it with the org)\b/.test(p);

    // Inferred, not stated — so it stays subject to the ordinary policy.
    const mood = /\bdeterministic|careful|strict|precise\b/.test(p)
      ? 0.1
      : /\bcreative|loose|varied\b/.test(p)
        ? 0.9
        : null;

    const explicit = [
      temp != null ? field("runtime.temperature", temp, { stated: true, into: "runtime" }) : null,
      tokens != null ? field("runtime.maxTokens", tokens, { stated: true, into: "runtime" }) : null,
      iters != null ? field("runtime.maxIterations", iters, { stated: true, into: "runtime" }) : null,
      category ? field("package.category", category, { stated: true }) : null,
      temp == null && mood != null ? field("runtime.temperature", mood, { into: "runtime" }) : null,
    ].filter(Boolean);

    const provider = providerFrom(p);
    const model = modelFrom(p);
    /*
     * The chip is offered whenever a model is asked for — and ALSO whenever
     * there is no runtime at all, because every field above is gated on one.
     *
     * Without that second condition "set temperature to 0.1" on an unbound
     * agent demotes both numbers into a proposal this recipe never emits, and
     * they vanish while the run says it set them. compileRun refuses to build
     * that now, which is how this was found.
     */
    const wantsModel = /\buse (anthropic|openai)|model|bind\b/.test(p) || !a.runtime;

    return [
      think("this one only touches settings — no files change"),
      ...say(
        explicit.length
          ? "Setting the ones you named. Anything that binds a credential or publishes stays a question, however plainly it was asked."
          : "Nothing in that names a value I can set, so here is what I can offer instead.",
      ),
      ...explicit,
      wantsModel
        ? propose("runtime", `Bind ${provider} · ${model}`, `also binds the “${tokenLabelFor(provider)}” credential`, [
            ["runtime.provider", provider],
            ["runtime.model", model],
          ])
        : null,
      // Asked for outright and still refused, with the reason. A mock that
      // quietly ignores half a request teaches the audience it was understood.
      wantsPublic
        ? done(
            `I did not make it public. Visibility is the one setting that changes who else can see this, so it is not mine to write even when you ask plainly — it is two clicks away under ${a.name || "the agent"} → Settings.`,
          )
        : done(
            "Temperature, token and iteration limits are Aziron-only — a released copy runs on whatever model its host provides and ignores all three.",
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
      ...write("AGENT.md", sectionFor(prompt), { from: entry.content.replace(/\s+$/, "") }),
      done(
        "If that wasn't what you wanted, it is the honest answer rather than a better-looking wrong one. Try “add a reference file”, “add a script”, “make it shorter”, or describe what it should do from scratch.",
      ),
    ];
  },
};

export const AUTHORING = [
  createFromIntent,
  // Before the file recipes: "call it X" and "describe it as X" are about the
  // record, and both contain words the looser file matchers would claim.
  rename,
  describe,
  // Before add-reference: "add a section after X" edits a file that already
  // exists, and the reference matcher would claim it and write a new one.
  addSection,
  // And before `configure`, whose "model" and "set up for" both appear in
  // sentences that are really about tools or a corpus.
  grantTools,
  attachKnowledge,
  configure,
  addReference,
  addScript,
  addPreparation,
  tighten,
  revise,
];

/** Suggestion chips map straight onto recipe ids, so a chip cannot mis-fire. */
export const SUGGESTIONS = [
  { id: "add-reference", label: "Add a reference file" },
  { id: "add-preparation", label: "Add machine setup" },
  { id: "tighten", label: "Make it shorter" },
];

/**
 * Prompts that show the record changing rather than the folder.
 *
 * Written as complete sentences with the value in them, because the value has
 * to be IN the prompt for the assistant to set it outright rather than ask —
 * and a chip that demonstrates the rule teaches it faster than a sentence
 * about the rule would.
 */
export const RECORD_EXAMPLES = [
  'call it "Leave Desk"',
  'describe it as "answers leave and benefits questions from the handbook"',
  "grant vector_search and web_fetch",
  "attach Employee Handbook 2026 and Benefits FAQ",
  "set temperature to 0.1 and max iterations to 4",
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

/**
 * Every heading in the agent's markdown, with the byte range it governs.
 *
 * Kept separate from `sectionsOf` because the two want different things from
 * the same scan. Retrieval wants sections with something in them — a heading
 * with no body has nothing to quote, and offering it as a match would mean
 * answering a question with a title. Splicing wants every heading, because an
 * empty section is a perfectly ordinary place to insert after and "make it
 * shorter" leaves them behind by design.
 */
export function headingsOf(agent) {
  const out = [];
  for (const file of agent?.files ?? []) {
    if (!/\.(md|markdown|txt)$/i.test(file.path)) continue;
    const lines = file.content.split("\n");
    let at = 0;
    let open = null;
    for (const line of lines) {
      if (/^#{1,2} /.test(line)) {
        if (open) open.end = at;
        open = { file: file.path, heading: line.replace(/^#+ /, "").trim(), start: at, end: file.content.length };
        out.push(open);
      }
      at += line.length + 1;
    }
  }
  return out;
}

/** Every `#`/`##` section of every file in the agent's folder, as a corpus. */
export function sectionsOf(agent) {
  const out = [];
  for (const file of agent?.files ?? []) {
    if (!/\.(md|markdown|txt)$/i.test(file.path)) continue;
    const lines = file.content.split("\n");
    let heading = null;
    let body = [];
    let at = 0; // character offset of the line being read
    let start = 0; // where the current section's heading begins
    let end = 0; // and where it ends, which is where a splice goes
    // `file` stays the PATH string. retrieve() and the chat recipes render it
    // as text, and making it an object here prints [object Object] in a quote.
    const flush = () => {
      if (heading && body.join("").trim()) {
        out.push({ file: file.path, heading, body: body.join("\n").trim(), start, end });
      }
      body = [];
    };
    for (const line of lines) {
      if (/^#{1,2} /.test(line)) {
        end = at;
        flush();
        heading = line.replace(/^#+ /, "").trim();
        start = at;
      } else if (heading) {
        body.push(line);
      }
      at += line.length + 1;
    }
    end = file.content.length;
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
