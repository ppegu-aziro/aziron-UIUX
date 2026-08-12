/**
 * Reading `.aziron/preparation.yaml`.
 *
 * Unlike agent.json this is a real file: its bytes are the truth, not a
 * rendering of something else. So nothing here derives the document from a
 * record, and nothing here rewrites the document wholesale — the one thing a
 * comment-carrying, hand-formatted file cannot survive.
 *
 * `yaml`'s parseDocument is used rather than a plain parse because it keeps a
 * byte range on every node. That is what lets a diagnostic point at a line and
 * a step in the preview link back to the text that produced it.
 */

import { parseDocument } from "yaml";

const MAX_BYTES = 256 * 1024;

/**
 * Parse, tolerantly.
 *
 * Never throws and always returns something usable. `js` is a best-effort tree
 * even when the document is mid-keystroke, because the preview keeps rendering
 * while you type and blanking it on every half-typed line is worse than
 * showing the last thing that made sense.
 *
 * @param {string} text
 * @returns {{doc: object|null, js: object|null, fatal: string|null,
 *            errors: Array<{message: string, line: number}>, hasAnchors: boolean}}
 */
export function parsePreparation(text) {
  const src = String(text ?? "");

  if (src.length > MAX_BYTES) {
    return { doc: null, js: null, errors: [], hasAnchors: false,
      fatal: "This file is larger than 256 KB and would be refused on release." };
  }

  let doc;
  try {
    doc = parseDocument(src, { keepSourceTokens: true });
  } catch (e) {
    return { doc: null, js: null, errors: [], hasAnchors: false,
      fatal: `This will not parse yet — ${e.message}` };
  }

  const errors = (doc.errors ?? []).map((e) => ({
    message: e.message,
    line: lineAt(src, e.pos?.[0] ?? 0),
  }));

  let js = null;
  try {
    js = doc.toJS({ maxAliasCount: 100 });
  } catch {
    js = null;
  }

  return {
    doc,
    js,
    errors,
    // Anchors mean two places in the file share one node, so an edit aimed at
    // one row lands on both. The preview refuses to offer repairs rather than
    // rewrite something the reader is not looking at.
    hasAnchors: /(^|\s)[&*][A-Za-z0-9_-]+/m.test(src),
    fatal: errors.length && js == null
      ? `This will not parse yet — line ${errors[0].line}: ${errors[0].message}`
      : null,
  };
}

/** 1-based line containing a byte offset. */
export const lineAt = (text, offset) => String(text ?? "").slice(0, Math.max(0, offset)).split("\n").length;

/**
 * A dotted path, the way the contract writes one.
 *
 * `preparation.precheck[0].platforms.darwin,linux.check` — note the comma
 * inside a segment. That is why paths are built from an array and never split
 * back apart: a platform key can legitimately contain the separator.
 */
export function docPathOf(segments) {
  return segments.reduce(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)),
    "",
  );
}

/** Segments back out of a `[i]`-bearing dotted path. Indices only — see above. */
export function segmentsOf(path) {
  const out = [];
  for (const part of String(path ?? "").split(".")) {
    const m = /^(.*?)((?:\[\d+\])*)$/.exec(part);
    if (m[1]) out.push(m[1]);
    for (const idx of m[2].match(/\d+/g) ?? []) out.push(Number(idx));
  }
  return out;
}

/**
 * The byte range of a node, or null when the path is not in the document.
 *
 * @returns {[number, number]|null} [start, end of the value]
 */
export function rangeOf(doc, segments) {
  if (!doc || !segments?.length) return null;
  let node;
  try {
    node = doc.getIn(segments, true);
  } catch {
    return null;
  }
  return node?.range ? [node.range[0], node.range[1]] : null;
}

/** 1-based line a path starts on, or 0 when it is not in the document. */
export function lineOfPath(text, doc, path) {
  const range = rangeOf(doc, Array.isArray(path) ? path : segmentsOf(path));
  return range ? lineAt(text, range[0]) : 0;
}

/**
 * The deepest node the caret sits in, as a dotted path.
 *
 * Powers the other direction of the link: put the caret in a strategy and the
 * preview highlights the row it produces. Walks the parsed tree, so it needs a
 * document that parsed — the completion has its own scanner for text that did
 * not.
 */
export function pathAt(doc, offset) {
  if (!doc?.contents) return null;
  const segments = [];

  const within = (node) => node?.range && offset >= node.range[0] && offset <= node.range[2];

  const walk = (node) => {
    if (!node?.items) return;
    for (const item of node.items) {
      // A map pair.
      if (item?.key !== undefined && item?.value !== undefined) {
        if (within(item.key) || within(item.value)) {
          segments.push(item.key.value);
          walk(item.value);
          return;
        }
        continue;
      }
      // A sequence entry.
      if (within(item)) {
        segments.push(node.items.indexOf(item));
        walk(item);
        return;
      }
    }
  };

  walk(doc.contents);
  return segments.length ? docPathOf(segments) : null;
}
