/**
 * Writing into a YAML document without rewriting it.
 *
 * The only module allowed to change preparation.yaml, and it changes it one
 * byte range at a time. It deliberately exports nothing that serialises a whole
 * document, because doing that destroys the file.
 *
 * That is measured, not assumed. Round-tripping the six real preparation
 * documents through yaml's `Document.toString()` reflows all six at default
 * options, and tuned options are worse — they unwrap the hand-wrapped `>-`
 * scalars an author deliberately laid out. One of those files is 309 lines with
 * 28 comments explaining why each check exists. The comments technically
 * survive; the diff is unreviewable, which is the same betrayal.
 *
 * Three things in here look like fussiness and are not. Each was measured
 * against the real corpus, and each is invisible in a hand-written test that
 * only uses top-level single-line maps:
 *
 *   anchorColumn, not leading whitespace — 113 of 222 maps in the corpus (51%)
 *   sit inside a sequence item, where `- id: aws-cli` has four spaces of indent
 *   but the key starts at column six. Inserting at the indent produces a
 *   document that no longer parses.
 *
 *   ownsEol — a block map's value range INCLUDES its terminating newline and a
 *   flow sequence's does not. Assume wrong and the next key is welded onto the
 *   end of the value you just wrote.
 *
 *   renderScalar delegates to yaml — a hand-rolled quoter converted every
 *   double-quoted value in the corpus to single quotes.
 */

import { Document, Scalar, isScalar } from "yaml";

/**
 * The line ending the document uses, from the FIRST one.
 *
 * Not "does a CRLF appear anywhere": a mostly-LF file with one stray CRLF would
 * then have every inserted line written in the wrong ending. The contract
 * fixtures are entirely CRLF and the authored skills entirely LF, so either
 * answer has to be right for a whole file.
 */
export function eolOf(text) {
  const i = String(text ?? "").indexOf("\n");
  return i > 0 && text[i - 1] === "\r" ? "\r\n" : "\n";
}

/** Column of an offset within its line. */
export const colOf = (text, offset) =>
  offset - (String(text ?? "").lastIndexOf("\n", Math.max(0, offset - 1)) + 1);

/**
 * The column a sibling should be written at.
 *
 * The column of an existing key, never the line's leading whitespace. Half the
 * maps in the corpus are sequence items, where those two numbers differ by the
 * width of the `- ` that opened the item.
 */
export function anchorColumn(text, doc, segments) {
  const parent = safeGet(doc, segments.slice(0, -1));
  const first = parent?.items?.[0];
  const key = first?.key?.range ? first.key.range[0] : first?.range?.[0];
  if (key != null) return colOf(text, key);
  const self = safeGet(doc, segments) ?? parent;
  return self?.range ? colOf(text, self.range[0]) + 2 : 2;
}

/**
 * Whether a node's value range already ends with the document's line ending.
 *
 * A block collection's range runs to the start of the next line; a flow one
 * stops at its closing bracket. The replacement has to end the same way or the
 * following key is joined onto it.
 */
export const ownsEol = (text, start, valueEnd) =>
  valueEnd > start && text[valueEnd - 1] === "\n";

/**
 * A value as YAML, in the style the author used.
 *
 * Delegated to yaml's own serialiser rather than hand-rolled, because a
 * hand-rolled quoter gets this wrong in both directions: it converted every
 * double-quoted value in the corpus to single quotes, and it has to
 * independently rediscover that `true`, `run # now` and a trailing space all
 * need quoting while `2.0.0` and `-dash` do not.
 *
 * `lineWidth: 0` is not optional — the default of 80 re-wraps long values,
 * which is the reflow this whole module exists to avoid.
 */
export function renderScalar(value, hint) {
  const node = new Scalar(value);
  const v = typeof value === "string" ? value : "";
  // A single-line style cannot hold a newline; letting yaml choose is the only
  // safe answer, and the UI does not offer multi-line editing anyway.
  const single = hint === "PLAIN" || hint === "QUOTE_SINGLE" || hint === "QUOTE_DOUBLE";
  if (hint && !(single && /[\n\r]/.test(v))) node.type = hint;
  return new Document(node).toString({ lineWidth: 0 }).replace(/\r?\n$/, "");
}

/** Scalars this module refuses to rewrite in place. */
export const isBlockScalar = (node) =>
  node?.type === "BLOCK_FOLDED" || node?.type === "BLOCK_LITERAL";

/**
 * Replace a scalar's value.
 *
 * Splices `[range[0], range[1])` — the value's own bytes. `range[1]..range[2]`
 * holds the trailing spaces, the same-line comment and the newline, so a line
 * written `prompt: Set up now?   # asked once` keeps its comment for free.
 *
 * @returns {{text: string, caret: number}|null} null when it cannot be done safely.
 */
export function replaceScalar(text, doc, segments, value) {
  const node = safeGet(doc, segments);
  if (!node || !isScalar(node) || !node.range) return null;
  // An anchored value is referenced elsewhere by `*name`; rewriting it here
  // would change every one of those without showing them.
  if (node.anchor) return null;
  // A folded or literal block spans indented lines. Rewriting it means
  // reflowing them, which is the thing this module exists not to do.
  if (isBlockScalar(node)) return null;

  const [start, end] = node.range;
  const eol = eolOf(text);
  const rendered = renderScalar(value, node.type) + (ownsEol(text, start, end) ? eol : "");
  return {
    text: text.slice(0, start) + rendered + text.slice(end),
    caret: start + rendered.length,
  };
}

/** Replace, or insert the key when it is not there yet. */
export function setScalar(text, doc, segments, value) {
  if (safeGet(doc, segments)) return replaceScalar(text, doc, segments, value);

  const parent = safeGet(doc, segments.slice(0, -1));
  if (!parent?.items || !parent.range) return null;

  const eol = eolOf(text);
  const col = anchorColumn(text, doc, [...segments.slice(0, -1), "•"]);
  const at = beforeTrailingEol(text, parent.range[1]);
  const line = `${eol}${" ".repeat(col)}${segments[segments.length - 1]}: ${renderScalar(value)}`;
  return { text: text.slice(0, at) + line + text.slice(at), caret: at + line.length };
}

/**
 * Append an item to a block sequence, creating the sequence when absent.
 *
 * @param {string} fragment the item body as YAML, without the `- ` and with its
 *   own lines at column zero. It is re-indented to sit under the dash.
 */
export function appendItem(text, doc, segments, fragment) {
  const eol = eolOf(text);
  const seq = safeGet(doc, segments);

  if (seq?.items && seq.range && text[seq.range[0]] !== "[") {
    const col = seq.items.length ? colOf(text, seq.range[0]) : anchorColumn(text, doc, segments);
    const at = beforeTrailingEol(text, seq.range[1]);
    const body = reindent(fragment, col + 2, eol);
    const line = `${eol}${" ".repeat(col)}- ${body.trimStart()}`;
    return { text: text.slice(0, at) + line + text.slice(at), caret: at + line.length };
  }
  if (seq) return null; // a flow sequence: not appended to in place

  const parent = safeGet(doc, segments.slice(0, -1));
  if (!parent?.range) return null;
  const col = anchorColumn(text, doc, [...segments.slice(0, -1), "•"]);
  const at = beforeTrailingEol(text, parent.range[1]);
  const body = reindent(fragment, col + 4, eol);
  const block =
    `${eol}${" ".repeat(col)}${segments[segments.length - 1]}:` +
    `${eol}${" ".repeat(col + 2)}- ${body.trimStart()}`;
  return { text: text.slice(0, at) + block + text.slice(at), caret: at + block.length };
}

/**
 * Remove a key and its value, or a sequence item, and the line it sat on.
 *
 * Takes whole lines so nothing is left behind, and takes `range[2]` so the
 * value's own trailing comment goes with it — that comment was about the thing
 * being removed.
 */
export function removeAt(text, doc, segments) {
  const node = safeGet(doc, segments);
  if (!node?.range) return null;

  const key = segments[segments.length - 1];
  const parent = safeGet(doc, segments.slice(0, -1));

  // For a map key the node is the VALUE, so the removal starts at the key.
  let start = node.range[0];
  if (parent?.items && typeof key === "string") {
    const pair = parent.items.find((p) => p.key?.value === key);
    if (pair?.key?.range) start = pair.key.range[0];
  }
  start = text.lastIndexOf("\n", start - 1) + 1;

  let end = node.range[2];
  if (text[end - 1] !== "\n") {
    const nl = text.indexOf("\n", end);
    end = nl === -1 ? text.length : nl + 1;
  }
  return { text: text.slice(0, start) + text.slice(end), caret: start };
}

/**
 * Render a brand-new subtree.
 *
 * Only for content that has never been in the file, so there is nothing
 * authored to preserve. Never called on anything parsed out of the user's own
 * document — `cloneSpan` is what duplicates that.
 */
export function renderFragment(value, eol = "\n") {
  const lines = [];

  const emit = (head, key, v, depth) => {
    if (Array.isArray(v)) {
      if (!v.length) return;
      lines.push(`${head}${key}:`);
      seq(v, depth);
    } else if (v && typeof v === "object") {
      lines.push(`${head}${key}:`);
      map(v, depth);
    } else if (v !== undefined && v !== null && v !== "") {
      lines.push(`${head}${key}: ${renderScalar(v)}`);
    }
  };

  const map = (obj, depth) => {
    const p = " ".repeat(depth);
    for (const k of Object.keys(obj)) emit(p, k, obj[k], depth + 2);
  };

  const seq = (list, depth) => {
    const p = " ".repeat(depth);
    for (const item of list) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        Object.keys(item).forEach((k, i) => emit(i === 0 ? `${p}- ` : `${p}  `, k, item[k], depth + 4));
      } else {
        lines.push(`${p}- ${renderScalar(item)}`);
      }
    }
  };

  if (Array.isArray(value)) seq(value, 0);
  else if (value && typeof value === "object") map(value, 0);
  else return renderScalar(value);
  return lines.join(eol);
}

/** A node's bytes, verbatim — the only safe way to duplicate authored content. */
export function cloneSpan(text, doc, segments) {
  const node = safeGet(doc, segments);
  return node?.range ? text.slice(node.range[0], node.range[2]) : null;
}

/* ── internals ───────────────────────────────────────────────────────────── */

function safeGet(doc, segments) {
  if (!doc) return null;
  // An empty path is the document's own root map, which is a real target — it
  // is where a missing top-level `schema:` gets inserted.
  if (!segments?.length) return doc.contents ?? null;
  try {
    return doc.getIn(segments, true) ?? null;
  } catch {
    return null;
  }
}

/** Back up over the newline a block's range includes, so an insert precedes it. */
function beforeTrailingEol(text, at) {
  let i = at;
  while (i > 0 && (text[i - 1] === "\n" || text[i - 1] === "\r")) i -= 1;
  return i;
}

/** Re-indent a fragment written at column zero to sit under a new parent. */
function reindent(fragment, indent, eol) {
  const lines = String(fragment).split(/\r?\n/);
  const widths = lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length);
  const base = widths.length ? Math.min(...widths) : 0;
  return lines.map((l) => (l.trim() ? " ".repeat(indent) + l.slice(base) : "")).join(eol);
}
