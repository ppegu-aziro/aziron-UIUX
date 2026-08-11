import { useMemo } from "react";

import { cn } from "@/lib/utils";

/**
 * Small markdown renderer for the editor's Preview mode.
 *
 * Hand-rolled rather than adding a dependency: this repo has no markdown
 * library, and pulling one in for a preview pane would be a heavier decision
 * than the feature warrants. It covers what an AGENT.md actually contains —
 * frontmatter, headings, lists, code, emphasis, links, quotes, rules — and
 * nothing else.
 *
 * Escapes first, then applies inline formatting to the escaped text, so a
 * file containing markup renders as text rather than as HTML.
 */

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline: code, bold, italic, links. Applied to already-escaped text. */
const inline = (t) =>
  esc(t)
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2">$1</a>',
    );

const H = ["text-xl", "text-lg", "text-base", "text-sm", "text-sm", "text-xs"];

function render(src) {
  const lines = String(src ?? "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let key = 0;

  // YAML frontmatter, shown as a distinct block rather than as body text —
  // it is configuration, and reading it as prose is how people miss it.
  if (lines[0]?.trim() === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      out.push(
        <pre
          key={`fm-${key++}`}
          className="mb-3 overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[10px] leading-5 text-muted-foreground"
        >
          {lines.slice(1, end).join("\n")}
        </pre>,
      );
      i = end + 1;
    }
  }

  let para = [];
  const flush = () => {
    if (!para.length) return;
    out.push(
      <p
        key={`p-${key++}`}
        className="mb-3 text-sm leading-6 text-foreground"
        dangerouslySetInnerHTML={{ __html: inline(para.join(" ")) }}
      />,
    );
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (/^```/.test(line.trim())) {
      flush();
      const lang = line.trim().slice(3).trim();
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++]);
      i += 1;
      out.push(
        <div key={`c-${key++}`} className="mb-3 overflow-hidden rounded-lg border border-border">
          {lang && (
            <div className="border-b border-border bg-muted/60 px-3 py-1 font-mono text-[10px] text-muted-foreground">
              {lang}
            </div>
          )}
          <pre className="overflow-x-auto bg-muted/30 p-3 font-mono text-[11px] leading-5 text-foreground">
            {body.join("\n")}
          </pre>
        </div>,
      );
      continue;
    }

    if (/^\s*$/.test(line)) {
      flush();
      i += 1;
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      const Tag = `h${level}`;
      out.push(
        <Tag
          key={`h-${key++}`}
          className={cn("mt-4 mb-2 font-semibold tracking-tight text-foreground first:mt-0", H[level - 1])}
          dangerouslySetInnerHTML={{ __html: inline(h[2]) }}
        />,
      );
      i += 1;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flush();
      out.push(<hr key={`hr-${key++}`} className="my-4 border-border" />);
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flush();
      const body = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(
        <blockquote
          key={`q-${key++}`}
          className="mb-3 border-l-2 border-primary/40 pl-3 text-sm leading-6 text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: inline(body.join(" ")) }}
        />,
      );
      continue;
    }

    const bullet = /^\s*[-*+]\s+/;
    const ordered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || ordered.test(line)) {
      flush();
      const isOrdered = ordered.test(line);
      const re = isOrdered ? ordered : bullet;
      const items = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ""));
      const Tag = isOrdered ? "ol" : "ul";
      out.push(
        <Tag
          key={`l-${key++}`}
          className={cn("mb-3 space-y-1 pl-5 text-sm leading-6 text-foreground", isOrdered ? "list-decimal" : "list-disc")}
        >
          {items.map((t, n) => (
            <li key={n} dangerouslySetInnerHTML={{ __html: inline(t) }} />
          ))}
        </Tag>,
      );
      continue;
    }

    para.push(line.trim());
    i += 1;
  }

  flush();
  return out;
}

export default function MarkdownPreview({ source, className }) {
  const nodes = useMemo(() => render(source), [source]);
  if (!String(source ?? "").trim()) {
    return (
      <div className={cn("flex h-full items-center justify-center p-8", className)}>
        <p className="text-xs text-muted-foreground">Nothing to preview yet.</p>
      </div>
    );
  }
  return <div className={cn("px-4 py-3", className)}>{nodes}</div>;
}
