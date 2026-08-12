/**
 * Where is the caret, in YAML terms?
 *
 * A scanner rather than a parse, for the same reason jsonPath.js is one: the
 * document is mid-edit and therefore usually invalid, and that is precisely the
 * moment a suggestion is wanted. Typing `ki` under a check is not valid YAML
 * yet, and it is exactly when you want to be told the word is `kind`.
 *
 * YAML's structure is indentation, so this walks lines and keeps a stack of
 * columns. The part with no JSON analogue is `- `: a list dash both opens an
 * item and shifts the column that any inline `key: value` after it belongs to.
 */

/**
 * @typedef {Object} YamlContext
 * @property {"key"|"value"|"item"} where
 * @property {Array<string|number>} segments  path to the enclosing container
 * @property {string} partial     what has been typed of the token
 * @property {number} start       offset the token begins at
 * @property {number} end         offset it ends at
 * @property {number} indent      column the caret's line starts at
 * @property {string[]} siblings  keys already written in this container
 * @property {boolean} inFlow     inside a `[a, b]` sequence
 */

/**
 * Resolve the caret.
 *
 * @param {string} text
 * @param {number} caret
 * @returns {YamlContext|null} null where nothing is completable.
 */
export function yamlContextAt(text, caret) {
  const src = String(text ?? "");
  const at = Math.max(0, Math.min(caret, src.length));
  const before = src.slice(0, at);
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineSoFar = before.slice(lineStart);

  // Nothing is completable inside prose.
  const hash = lineSoFar.indexOf("#");
  if (hash !== -1 && !insideQuotes(lineSoFar, hash)) return null;

  const indent = lineSoFar.length - lineSoFar.trimStart().length;

  /** @type {{col: number, key: string|number}[]} */
  const stack = [];
  // Index of the sequence currently open at each column.
  const seq = new Map();
  const siblingsAt = new Map();

  const lines = before.slice(0, lineStart).split("\n");
  for (const raw of lines) {
    const body = raw.replace(/\s+#.*$/, "");
    if (!body.trim()) continue;

    let col = body.length - body.trimStart().length;
    let rest = body.trimStart();

    // A dash opens an item; anything after it on the same line sits two
    // columns further in, which is what makes `- id: winget` two levels.
    let isItem = false;
    if (rest.startsWith("- ") || rest === "-") {
      isItem = true;
      const dash = rest === "-" ? 1 : 2;
      rest = rest.slice(dash).trimStart();
      col += dash;
    }

    while (stack.length && stack[stack.length - 1].col >= col && !(isItem && stack[stack.length - 1].col === col)) {
      stack.pop();
    }

    if (isItem) {
      const parentCol = col;
      const n = seq.get(parentCol) ?? 0;
      seq.set(parentCol, n + 1);
      stack.push({ col: parentCol - 2, key: n });
    }

    const m = /^([^:\s][^:]*):(.*)$/.exec(rest);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();

    const container = stack.map((f) => f.col).join(",");
    if (!siblingsAt.has(container)) siblingsAt.set(container, []);
    siblingsAt.get(container).push(key);

    if (!value) {
      // A key with nothing after the colon opens a container.
      stack.push({ col, key });
      seq.delete(col + 2);
    }
  }

  while (stack.length && stack[stack.length - 1].col >= indent) stack.pop();

  const segments = stack.map((f) => f.key);
  const siblings = siblingsAt.get(stack.map((f) => f.col).join(",")) ?? [];

  // A flow sequence on the caret's line: `argv: ["aws", "--vers`
  const flow = /\[([^\]]*)$/.exec(lineSoFar);
  const colon = lineSoFar.indexOf(":");

  if (flow) {
    const typed = /(?:^|,)\s*"?([^",]*)$/.exec(flow[1])?.[1] ?? "";
    const key = colon > 0 ? lineSoFar.slice(0, colon).replace(/^\s*-\s*/, "").trim() : null;
    return {
      where: "value",
      segments: key ? [...segments, key] : segments,
      partial: typed,
      start: at - typed.length,
      end: at,
      indent,
      siblings,
      inFlow: true,
    };
  }

  const dash = /^\s*-\s*(.*)$/.exec(lineSoFar);

  if (colon === -1) {
    // No colon yet: a key is being typed, or a bare list item.
    const typed = (dash ? dash[1] : lineSoFar.trimStart()).trim();
    return {
      where: dash ? "item" : "key",
      segments,
      partial: typed,
      start: at - typed.length,
      end: at,
      indent,
      siblings,
      inFlow: false,
    };
  }

  if (at - lineStart <= colon) {
    const typed = lineSoFar.slice(0, colon).replace(/^\s*-\s*/, "").trim();
    return { where: "key", segments, partial: typed, start: at - typed.length, end: at, indent, siblings, inFlow: false };
  }

  const key = lineSoFar.slice(0, colon).replace(/^\s*-\s*/, "").trim();
  const typed = lineSoFar.slice(colon + 1).trimStart();
  return {
    where: "value",
    segments: [...segments, key],
    partial: typed,
    start: at - typed.length,
    end: at,
    indent,
    siblings,
    inFlow: false,
  };
}

/** True when an offset on a line falls inside a quoted run. */
function insideQuotes(line, index) {
  let single = false;
  let double = false;
  for (let i = 0; i < index; i += 1) {
    if (line[i] === "'" && !double) single = !single;
    else if (line[i] === '"' && !single) double = !double;
  }
  return single || double;
}

/**
 * True when the caret is inside a `{{prompt.` placeholder.
 *
 * Checked before the vault trigger, because the vault's own token pattern
 * matches `{{prompt` — all word characters — and would answer an argv
 * placeholder with a list of vault variables.
 */
export function insidePromptTemplate(text, caret) {
  const upto = String(text ?? "").slice(0, caret);
  return /\{\{\s*prompt\.?[A-Za-z0-9_-]*$/.test(upto);
}
