/**
 * Unit tests — the editor's local overlay.
 *
 * These exist because the failure was invisible in every other test: the
 * record was correct, the form beside it was correct, and only the textarea
 * was wrong. Nothing that asserts over the store can catch a stale view.
 */
import { describe, expect, it } from "vitest";

import { reconcileBuffer } from "@/components/agents-v2/utils/editorBuffer";

const FILE = { path: "a.md", content: "canonical" };

describe("reconcileBuffer", () => {
  it("keeps an uncommitted buffer, whatever the file says", () => {
    // Somebody is typing. Their text is the one thing never to discard --
    // including when the assistant writes to the same file underneath them.
    const b = { path: "a.md", value: "half-typed", committed: false, echo: null };
    expect(reconcileBuffer(b, FILE)).toBe(b);
    expect(reconcileBuffer(b, { path: "a.md", content: "written by someone else" })).toBe(b);
  });

  it("adopts what its own commit produced", () => {
    const b = { path: "a.md", value: "mine", committed: true, echo: null };
    expect(reconcileBuffer(b, FILE)).toEqual({ ...b, echo: "canonical" });
  });

  it("keeps the user's formatting once it has adopted", () => {
    // The reason the overlay survives its own commit at all: agent.json is
    // generated, so its canonical text never equals hand-typed JSON.
    const b = { path: "a.md", value: "mine  spaced", committed: true, echo: "canonical" };
    expect(reconcileBuffer(b, FILE)).toBe(b);
  });

  it("drops itself when something else writes the file", () => {
    const b = { path: "a.md", value: "mine", committed: true, echo: "canonical" };
    expect(reconcileBuffer(b, { path: "a.md", content: "changed by the assistant" })).toBeNull();
  });

  it("leaves a buffer for a different file alone", () => {
    const b = { path: "other.md", value: "mine", committed: true, echo: "was" };
    expect(reconcileBuffer(b, FILE)).toBe(b);
  });

  it("is stable — reconciling twice changes nothing the second time", () => {
    const b = { path: "a.md", value: "mine", committed: true, echo: null };
    const once = reconcileBuffer(b, FILE);
    expect(reconcileBuffer(once, FILE)).toBe(once);
  });

  it("survives a missing buffer or a missing file", () => {
    expect(reconcileBuffer(null, FILE)).toBeNull();
    expect(reconcileBuffer({ path: "a.md", value: "", committed: true, echo: null }, null)).toBeTruthy();
  });

  it("reaches agreement in one step after an outside write", () => {
    // The whole point: record wins, and it wins immediately rather than
    // leaving the two panes disagreeing until the user clicks something.
    let b = { path: "a.md", value: "mine", committed: true, echo: "canonical" };
    const moved = { path: "a.md", content: "new truth" };
    b = reconcileBuffer(b, moved);
    expect(b).toBeNull();
    // With no overlay the editor renders the file itself.
    expect(reconcileBuffer(b, moved)).toBeNull();
  });
});
