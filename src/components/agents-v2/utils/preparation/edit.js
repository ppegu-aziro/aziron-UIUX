/**
 * Whether a value can be edited here, and what happens when it is.
 *
 * One gateway, so the answer is the same everywhere and every refusal comes
 * with a reason. A disabled input with no explanation is the dead end this
 * whole pane exists to remove — so a field that cannot be edited says why and
 * offers the file instead.
 */

import { parsePreparation, segmentsOf } from "./document";
import { isBlockScalar, removeAt, setScalar } from "./yamlSplice";

/**
 * @typedef {Object} Editable
 * @property {boolean} ok
 * @property {"block-scalar"|"anchored"|"absent"|"unparsed"|null} reason
 * @property {string|null} why      one sentence, shown in place of the control
 * @property {number} line          for the "edit in the file" escape hatch
 */

/**
 * Can this path be edited in place?
 *
 * @param {string} text
 * @param {object} doc
 * @param {string|string[]} path
 */
export function editableAt(text, doc, path) {
  const at = Array.isArray(path) ? path : segmentsOf(path);
  if (!doc) return { ok: false, reason: "unparsed", why: "The file does not parse yet.", line: 0 };

  let node = null;
  try {
    node = doc.getIn(at, true) ?? null;
  } catch {
    node = null;
  }

  // Absent is editable: it becomes an insert rather than a replacement.
  if (!node) return { ok: true, reason: null, why: null, line: 0 };

  const line = node.range ? text.slice(0, node.range[0]).split("\n").length : 0;

  if (isBlockScalar(node)) {
    return {
      ok: false,
      reason: "block-scalar",
      why: "Written as a folded block — editing it here would re-wrap lines somebody laid out by hand.",
      line,
    };
  }
  if (node.anchor) {
    return {
      ok: false,
      reason: "anchored",
      why: "Shared through a YAML anchor, so this text appears in more than one place.",
      line,
    };
  }
  return { ok: true, reason: null, why: null, line };
}

/**
 * Apply an edit and report what it did.
 *
 * Returns the new text plus enough to describe and undo it. Undo is exact
 * rather than approximate because a splice is a (range, before, after) triple:
 * putting the old text back is the same operation in reverse.
 *
 * @returns {{text: string, before: string, ok: true}|{ok: false, why: string}}
 */
export function applyEdit(text, doc, path, value) {
  const at = Array.isArray(path) ? path : segmentsOf(path);
  const gate = editableAt(text, doc, at);
  if (!gate.ok) return { ok: false, why: gate.why };

  const result = value === null || value === "" ? removeAt(text, doc, at) : setScalar(text, doc, at, value);
  if (!result) return { ok: false, why: "That value cannot be written here." };

  // Never hand back something that does not parse. A splice that produces a
  // broken document is a bug, and the right response is to keep the file the
  // user had rather than to save the bug over it.
  const check = parsePreparation(result.text);
  if (check.fatal || check.errors.length) {
    return { ok: false, why: "That edit would break the file, so it was not applied." };
  }
  return { ok: true, text: result.text, before: text };
}

/** Apply a repair, with the same parse guard. */
export function applyRepair(repair, text) {
  const result = repair?.apply?.();
  if (!result) return { ok: false, why: "That fix no longer applies." };
  const check = parsePreparation(result.text);
  if (check.fatal || check.errors.length) {
    return { ok: false, why: "That fix would break the file, so it was not applied." };
  }
  return { ok: true, text: result.text, before: text };
}

/**
 * Insert a whole new node — a precheck, or a step in a phase.
 *
 * @param {string} yamlFragment the item body, at column zero, without `- `
 */
export function applyAppend(text, doc, seqPath, yamlFragment, appendItem) {
  const result = appendItem(text, doc, Array.isArray(seqPath) ? seqPath : segmentsOf(seqPath), yamlFragment);
  if (!result) return { ok: false, why: "There is nowhere to put that yet." };
  const check = parsePreparation(result.text);
  if (check.fatal || check.errors.length) {
    return { ok: false, why: "That would break the file, so it was not added." };
  }
  return { ok: true, text: result.text, before: text };
}
