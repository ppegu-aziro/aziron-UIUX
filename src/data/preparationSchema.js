/**
 * What `.aziron/preparation.yaml` may contain.
 *
 * The contract itself lives in the Aziron repo under `contracts/preparation/`,
 * as a corpus of documents that must parse and documents that must be refused.
 * This file is that contract restated for the editor: the closed value sets,
 * the keys legal at each path, and one scaffold that is known-good.
 *
 * Deliberately mirrors src/data/agentJsonSchema.js in role — one description
 * per key, read by the completion, the validator and the preview alike — but
 * not in shape. agent.json is a projection of a record and its schema can
 * carry read/write functions. This is a real file whose truth is its own
 * bytes, so there is nothing to read from and nothing to write to.
 */

export const PREPARATION_PATH = ".aziron/preparation.yaml";

/**
 * The three machines, in the order the tabs show them.
 *
 * `darwin` is the platform key the document uses and "macOS" is what people
 * call it; the document's word is never shown as a tab label, and the tab's
 * word is never written into the file.
 */
export const OS_TABS = [
  { goos: "darwin", label: "macOS" },
  { goos: "linux", label: "Linux" },
  { goos: "windows", label: "Windows" },
];

export const GOOS = OS_TABS.map((t) => t.goos);

/** Legal keys in a `platforms:` map, before comma-lists are expanded. */
export const PLATFORM_KEYS = ["all", ...GOOS];

/** The phases of `preconfigure`, in the order they run. */
export const PHASES = [
  { id: "prerequisites", label: "Prerequisites", note: "Choices only a human can make." },
  { id: "commands", label: "Commands", note: "Installs what is missing." },
  { id: "configure", label: "Configure", note: "Writes settings and credentials." },
];

export const CHECK_KINDS = ["binary", "command", "env", "file", "env-file"];
export const ACTION_KINDS = ["command", "instructions", "env-file"];
export const WHEN_STATUSES = ["satisfied", "unsatisfied", "error", "any"];
export const SELECT_MODES = ["auto", "prompt"];
export const ELEVATIONS = ["none", "may-prompt", "required"];
export const PROVIDERS = ["*", "aziron", "claude", "codex", "copilot", "cursor"];

/**
 * A known-good starting document.
 *
 * There were five preparation literals scattered through this codebase and
 * every one of them was invalid against the contract — a precheck with no
 * `platforms` map, a `binary` check carrying `argv` instead of `value`, a
 * top-level `strategies` key that does not exist in the schema at all. Each
 * would be refused on release, and a validator whose very first screen is full
 * of errors it authored itself teaches people to ignore it.
 *
 * Adapted from contracts/preparation/valid/binary-only.yaml, which is the
 * smallest document in the corpus that passes.
 */
export const SEED = `schema: 1

preparation:
  prompt: Set up this machine for the agent now?

  precheck:
    - id: cli
      label: Required CLI installed
      platforms:
        all:
          check:
            kind: binary
            value: git

  preconfigure:
    commands:
      - id: install-cli
        label: Install the required CLI
        when:
          precheck: cli
        platforms:
          all:
            strategies:
              # The last strategy carries no requirements on purpose. If every
              # conditional one above is unavailable, this is what stops the
              # machine dead-ending with nothing to try.
              - id: manual
                actions:
                  - kind: instructions
                    message: Install git, then run preparation again.
`;

/* ── the key catalogue, for completion ───────────────────────────────────── */

/**
 * Keys legal at a path, described once.
 *
 * Paths use `*` for "any index" and `<platform>` for a platforms-map key, so
 * one entry covers every precheck rather than one per index. The hint is the
 * same sentence the preview shows, so the two cannot drift apart.
 */
const K = (key, hint, extra = {}) => ({ key, hint, ...extra });

export const KEYS_AT = {
  "": [
    K("schema", "Always 1. The only version this understands."),
    K("preparation", "Everything else lives under here.", { block: true }),
  ],
  preparation: [
    K("prompt", "Asked once, before anything runs."),
    K("precheck", "What is probed to decide whether setup is needed.", { seq: true }),
    K("preconfigure", "What is run when a probe says something is missing.", { block: true }),
    K("verify", "Re-probed after setup, to confirm it worked.", { seq: true }),
  ],
  "preparation.precheck.*": [
    K("id", "Referred to by depends_on and by a step's when."),
    K("label", "Shown to the user while it is checked."),
    K("dedup_key", "Shared machine-wide, so two skills needing it check once."),
    K("depends_on", "Other precheck ids. Skipped if any is unmet.", { seq: true }),
    K("providers", "Limits this to certain hosts. Omit for all.", { seq: true }),
    K("platforms", "One entry per machine, or `all`.", { block: true }),
  ],
  "preparation.precheck.*.platforms.<platform>": [
    K("check", "The probe that decides satisfied or not.", { block: true }),
  ],
  "preparation.precheck.*.platforms.<platform>.check": [
    K("kind", `One of ${CHECK_KINDS.join(", ")}.`),
    K("value", "For binary, env, file and env-file: the name or path."),
    K("argv", "For command: the program and its arguments, already split.", { seq: true }),
    K("keys", "For env-file: the variable names that must be present.", { seq: true }),
    K("timeout_seconds", "Defaults to 10."),
    K("sensitive_output", "The output is never read. Rules out expect."),
    K("expect", "Constraints on the command's output.", { block: true }),
  ],
  "preparation.precheck.*.platforms.<platform>.check.expect": [
    K("min_version", "The lowest version that counts as satisfied."),
    K("version_from", "A regex with one capture group, pulling the version out."),
    K("stdout_regex", "Output must match this."),
  ],
  preconfigure: PHASES.map((p) => K(p.id, p.note, { seq: true })),
  step: [
    K("id", "Unique across all three phases."),
    K("label", "Shown while it runs."),
    K("providers", "Limits this to certain hosts. Omit for all.", { seq: true }),
    K("when", "Which precheck result triggers this.", { block: true }),
    K("platforms", "One entry per machine, or `all`.", { block: true }),
  ],
  when: [
    K("precheck", "The id of the precheck this reacts to."),
    K("status", `Defaults to unsatisfied. One of ${WHEN_STATUSES.join(", ")}.`),
  ],
  platformBody: [
    K("select", "auto runs the first available. prompt asks."),
    K("strategies", "Tried in order. The last must need nothing.", { seq: true }),
    K("actions", "Shorthand for a single unconditional strategy.", { seq: true }),
  ],
  strategy: [
    K("id", "Names this way of doing it."),
    K("label", "Required under select: prompt — it is what the user picks from."),
    K("requires", "Bare binary names that must be on PATH.", { seq: true }),
    K("actions", "What this strategy actually does.", { seq: true }),
    K("path_hints", "Directories to add to PATH afterwards.", { seq: true }),
  ],
  action: [
    K("kind", `One of ${ACTION_KINDS.join(", ")}.`),
    K("argv", "For command: the program and its arguments, already split.", { seq: true }),
    K("message", "For instructions: what to tell the user."),
    K("path", "For env-file: where to write it."),
    K("vars", "For env-file: the variables to write.", { seq: true }),
    K("prompts", "Values to ask for, referenced as {{prompt.id}}.", { seq: true }),
    K("interactive", "Needs a terminal the user can type into."),
    K("elevation", `One of ${ELEVATIONS.join(", ")}.`),
    K("timeout_seconds", "Defaults to 60 for a command."),
  ],
};

/**
 * Closed value sets, by the key being filled in.
 *
 * Keyed on the last path segment rather than the full path, because `kind`
 * means the same thing wherever it appears and a per-path table would be six
 * copies that could disagree.
 */
export const ENUM_AT = {
  "check.kind": CHECK_KINDS,
  "action.kind": ACTION_KINDS,
  status: WHEN_STATUSES,
  select: SELECT_MODES,
  elevation: ELEVATIONS,
  platform: PLATFORM_KEYS,
  providers: PROVIDERS,
  interactive: ["true", "false"],
  sensitive_output: ["true", "false"],
};
