/**
 * Starting points for adding a check or a step.
 *
 * A catalogue first, a blank form second. Someone who only ever picks from this
 * list never has to learn the schema, which is the point — and every recipe
 * here is asserted to pass the validator in the test suite, because this
 * codebase has already shipped five hand-written preparation literals and every
 * one of them was invalid.
 *
 * Harvested from the real documents rather than invented.
 */

import { GOOS } from "./preparationSchema";

/** A check that probes for something. `vars` are the blanks the form asks for. */
export const CHECK_RECIPES = [
  {
    id: "binary",
    title: "A program is on PATH",
    hint: "The commonest one. Passes when the program can be found.",
    kind: "binary",
    ask: { key: "value", label: "Program name", placeholder: "git", mono: true },
    label: (v) => `${v} installed`,
    build: (v) => ({ kind: "binary", value: v }),
  },
  {
    id: "version",
    title: "A program, at least version N",
    hint: "Presence is not enough — an old version passes a plain check and then fails everything.",
    kind: "command",
    ask: { key: "argv", label: "Command", placeholder: "aws --version", mono: true, chips: true },
    extra: { key: "min_version", label: "At least version", placeholder: "2.0.0" },
    label: (v) => `${String(v).split(/\s+/)[0]} installed`,
    build: (v, extra) => ({
      kind: "command",
      argv: String(v).split(/\s+/).filter(Boolean),
      timeout_seconds: 10,
      expect: { min_version: extra || "1.0.0", version_from: String.raw`(\d+\.\d+\.\d+)` },
    }),
  },
  {
    id: "env",
    title: "An environment variable is set",
    hint: "Passes when the variable has a value on the machine.",
    kind: "env",
    ask: { key: "value", label: "Variable name", placeholder: "AWS_PROFILE", mono: true },
    label: (v) => `${v} is set`,
    build: (v) => ({ kind: "env", value: v }),
  },
  {
    id: "file",
    title: "A file exists",
    hint: "Passes when the path is there.",
    kind: "file",
    ask: { key: "value", label: "Path", placeholder: "~/.aws/config", mono: true },
    label: (v) => `${String(v).split("/").pop()} exists`,
    build: (v) => ({ kind: "file", value: v }),
  },
  {
    id: "signed-in",
    title: "A CLI is signed in",
    hint: "Runs a command that only succeeds when authenticated.",
    kind: "command",
    ask: { key: "argv", label: "Command", placeholder: "gh auth status", mono: true, chips: true },
    label: (v) => `${String(v).split(/\s+/)[0]} is signed in`,
    build: (v) => ({
      kind: "command",
      argv: String(v).split(/\s+/).filter(Boolean),
      timeout_seconds: 20,
      // The output names an account. Naming it is enough; reading it is not.
      sensitive_output: true,
    }),
  },
];

/** A step that changes the machine. Every one ends in an unconditional option. */
export const STEP_RECIPES = [
  {
    id: "install",
    title: "Install a tool with a package manager",
    hint: "A ladder — the first manager that is present wins, and a manual note catches the rest.",
    phase: "commands",
    ask: { key: "tool", label: "Tool name", placeholder: "awscli", mono: true },
    label: (v) => `Install ${v}`,
    build: (v, _extra, goos) => ({
      ways: LADDER[goos]?.(v) ?? LADDER.darwin(v),
      lastResort: `Install ${v} by hand, then run preparation again.`,
    }),
  },
  {
    id: "signin",
    title: "Sign in to a CLI",
    hint: "Only a human can do this, so it runs before anything that needs it.",
    phase: "prerequisites",
    ask: { key: "cmd", label: "Command", placeholder: "gh auth login", mono: true },
    label: (v) => `Sign in with ${String(v).split(/\s+/)[0]}`,
    build: (v) => ({
      ways: [{ id: "interactive", requires: [], argv: String(v).split(/\s+/).filter(Boolean), interactive: true }],
      lastResort: null,
    }),
  },
  {
    id: "envfile",
    title: "Write an env file",
    hint: "Asks for values and writes them where the agent will look.",
    phase: "configure",
    ask: { key: "path", label: "File path", placeholder: "~/.aziron/agent.env", mono: true },
    label: () => "Record the settings",
    build: () => ({ ways: [], lastResort: "Write the file by hand, then run preparation again." }),
  },
  {
    id: "manual",
    title: "Tell the user what to do",
    hint: "For anything that cannot be automated. Always available.",
    phase: "commands",
    ask: { key: "message", label: "What to tell them", placeholder: "Ask IT to install the VPN client." },
    label: () => "Manual setup",
    build: (v) => ({ ways: [], lastResort: v }),
  },
];

/** Per-machine package managers, for the install ladder. */
const LADDER = {
  darwin: (tool) => [{ id: "homebrew", requires: ["brew"], argv: ["brew", "install", tool] }],
  linux: (tool) => [
    { id: "apt", requires: ["apt-get"], argv: ["apt-get", "install", "-y", tool], elevation: "may-prompt" },
    { id: "dnf", requires: ["dnf"], argv: ["dnf", "install", "-y", tool], elevation: "may-prompt" },
  ],
  windows: (tool) => [
    { id: "winget", requires: ["winget"], argv: ["winget", "install", "--id", tool, "--exact"] },
  ],
};

/**
 * The item body a recipe produces, ready for `renderFragment`.
 *
 * The last resort is appended here rather than left to the form, so the
 * no-dead-end rule cannot be violated by anything that goes through this
 * function — including a recipe added later by somebody who has not read it.
 */
// `phase` is not taken here: it decides WHERE the item is inserted, not what
// the item contains.
export function buildStep({ id, label, when, ways, lastResort, platformKey }) {
  const strategies = ways.map((w) => ({
    id: w.id,
    ...(w.requires?.length ? { requires: w.requires } : {}),
    actions: [
      {
        kind: "command",
        argv: w.argv,
        ...(w.interactive ? { interactive: true } : {}),
        ...(w.elevation ? { elevation: w.elevation } : {}),
      },
    ],
  }));

  if (lastResort) {
    strategies.push({
      id: "manual",
      actions: [{ kind: "instructions", message: lastResort }],
    });
  }

  return {
    id,
    label,
    ...(when?.precheck ? { when: { precheck: when.precheck } } : {}),
    platforms: { [platformKey]: { strategies } },
  };
}

/** The item body for a check. */
export function buildCheck({ id, label, check, platformKey }) {
  return { id, label, platforms: { [platformKey]: { check } } };
}

/**
 * The platforms key a set of chosen machines writes to.
 *
 * Picking all three writes `all` rather than three identical keys — the same
 * thing to a machine, and one place to change when it changes.
 */
export function platformKeyFor(machines) {
  if (!machines?.length || machines.length === GOOS.length) return "all";
  return GOOS.filter((g) => machines.includes(g)).join(",");
}
