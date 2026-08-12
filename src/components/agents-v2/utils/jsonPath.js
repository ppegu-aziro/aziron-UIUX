/**
 * Where is the caret, in JSON terms?
 *
 * Autocomplete in a JSON file cannot work off the text immediately behind the
 * caret the way `./` and `{{` do. `"web_` means a tool name inside
 * `tools.granted`, a model id inside `runtime.model`, and nothing at all inside
 * a description — the same characters, three different answers. What decides is
 * the position in the document tree, so that is what this resolves.
 *
 * A scanner rather than a parse, because the document is mid-edit and therefore
 * usually invalid: the moment you type `"` you have broken it, and that is
 * precisely the moment you want a suggestion. It reads once from the start to
 * the caret, tracking the container stack, and never throws.
 *
 * Pure, no React, no dependency on the schema — it reports the location and
 * lets the caller decide what belongs there.
 */

/**
 * @typedef {Object} JsonContext
 * @property {"key"|"value"} where     Completing a property name, or its value.
 * @property {Array<string|number>} path
 *   For "key": the path of the object being typed into. For "value": that path
 *   plus the key (or array index) the value belongs to.
 * @property {"object"|"array"|"root"} container What encloses the caret.
 * @property {string} partial   Characters typed so far, "" when the string has not been opened.
 * @property {number} start     Offset where `partial` begins, for splicing a completion in.
 * @property {number} end       Offset where `partial` ends — past the closing quote when inside one.
 * @property {boolean} inString True when the caret sits between quotes.
 * @property {string[]} siblings Keys already present in the enclosing object.
 */

/**
 * Resolve the caret's position within a JSON document.
 *
 * @param {string} text
 * @param {number} caret
 * @returns {JsonContext|null} Null where nothing is completable — inside a
 *   number, a comment, or past the end of the root value.
 */
export function jsonContextAt(text, caret) {
  const src = String(text ?? "");
  const upto = src.slice(0, Math.max(0, Math.min(caret, src.length)));

  /** @type {{kind: "object"|"array", key: string|null, index: number, via: string|number|null}[]} */
  const stack = [];
  let inString = false;
  let stringStart = -1;
  let escaped = false;
  // Set by ':' and cleared by ',' — the difference between naming a property
  // and filling one in, which is the whole question this function answers.
  let awaitingValue = false;
  let lastString = null;

  const top = () => stack[stack.length - 1] ?? null;

  for (let i = 0; i < upto.length; i += 1) {
    const c = upto[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === '"') {
        inString = false;
        lastString = upto.slice(stringStart + 1, i);
      }
      continue;
    }

    if (c === '"') {
      inString = true;
      stringStart = i;
      continue;
    }

    if (c === "{" || c === "[") {
      const parent = top();
      const via = parent ? (parent.kind === "object" ? parent.key : parent.index) : null;
      stack.push({ kind: c === "{" ? "object" : "array", key: null, index: 0, via });
      awaitingValue = false;
      lastString = null;
      continue;
    }

    if (c === "}" || c === "]") {
      stack.pop();
      // A closed container is a finished value, so what follows is a sibling,
      // not a continuation of the key that opened it.
      awaitingValue = false;
      lastString = null;
      continue;
    }

    if (c === ":") {
      const t = top();
      if (t) t.key = lastString;
      awaitingValue = true;
      continue;
    }

    if (c === ",") {
      const t = top();
      if (t) {
        if (t.kind === "array") t.index += 1;
        t.key = null;
      }
      awaitingValue = false;
      lastString = null;
    }
  }

  const t = top();
  if (!t) return null; // before `{` or after the root closed — nothing to offer

  const containerPath = stack.map((f) => f.via).filter((v) => v !== null);
  const partial = inString ? upto.slice(stringStart + 1) : "";
  // Replacing THROUGH the closing quote when there is one, so completing a
  // half-typed value cannot leave `"web_search"earch"` behind.
  const end = inString ? closingQuote(src, stringStart) : caret;
  const start = inString ? stringStart + 1 : caret;

  const base = {
    partial,
    start,
    end,
    inString,
    siblings: siblingKeys(src, containerPath),
  };

  if (t.kind === "array") {
    return { ...base, where: "value", container: "array", path: [...containerPath, t.index] };
  }

  // In an object, ':' is the divider: before it you are naming the property,
  // after it you are filling it in.
  if (awaitingValue) {
    return { ...base, where: "value", container: "object", path: [...containerPath, t.key] };
  }
  return { ...base, where: "key", container: stack.length === 1 ? "root" : "object", path: containerPath };
}

/** Offset just past the string's closing quote, or the string's end when unterminated. */
function closingQuote(src, openQuote) {
  let escaped = false;
  for (let i = openQuote + 1; i < src.length; i += 1) {
    const c = src[i];
    if (escaped) {
      escaped = false;
    } else if (c === "\\") {
      escaped = true;
    } else if (c === '"') {
      return i + 1;
    } else if (c === "\n") {
      return i; // an unterminated string ends at the line, not at the next quote
    }
  }
  return src.length;
}

/**
 * Keys already present in the object at `path`, so completion can skip what is
 * already written rather than offering a duplicate the parser would drop.
 *
 * Best-effort by design: it parses the whole document, which fails while the
 * user is mid-keystroke. An empty list then just means every key is offered,
 * which is the harmless direction to be wrong in.
 */
function siblingKeys(src, path) {
  let node;
  try {
    node = JSON.parse(src);
  } catch {
    return [];
  }
  for (const seg of path) {
    if (node === null || typeof node !== "object") return [];
    node = node[seg];
  }
  return node && typeof node === "object" && !Array.isArray(node) ? Object.keys(node) : [];
}

/**
 * Read the value at a path from a possibly-invalid document.
 *
 * Cross-field completion needs it: the models worth offering depend on the
 * provider already chosen, and the collections on the vector database. Both are
 * read out of the same half-written text the caret is in.
 *
 * @param {string} text
 * @param {Array<string|number>} path
 * @returns {*} undefined when the document does not parse or the path is absent.
 */
export function readAt(text, path) {
  let node;
  try {
    node = JSON.parse(String(text ?? ""));
  } catch {
    return undefined;
  }
  for (const seg of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[seg];
  }
  return node;
}
