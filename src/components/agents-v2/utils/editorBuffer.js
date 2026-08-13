/**
 * Whether the editor's local overlay still describes the file underneath it.
 *
 * The editor keeps keystrokes out of global state by holding them in a buffer
 * and flushing shortly after typing stops. That buffer goes on shadowing the
 * file after it commits, on purpose: AGENT.json is generated, so its canonical
 * text will not match what somebody typed the moment they reformat it, and
 * redrawing the textarea from the projection would rewrite their document
 * under the caret.
 *
 * The bug that came out of that is the one this function exists to prevent:
 * nothing ever took the shadow away. Once a file had been edited by hand, a
 * later write by anyone else — the assistant filling a field, a proposal being
 * applied — landed in the record, redrew the form beside it, and left the text
 * frozen on the version the user had typed. One file, two panes, two answers.
 *
 * So the overlay is valid for exactly one version of the file, and the record
 * is the truth the moment they disagree:
 *
 *   uncommitted            → always kept. That is somebody mid-keystroke, and
 *                            their text is the one thing never to discard.
 *   committed, echo unset  → adopt what this commit produced. The projection is
 *                            re-serialised on the render AFTER the patch, so
 *                            the result cannot be known at commit time.
 *   committed, echo stale  → dropped. Something else wrote, and it wins.
 *
 * Returns the SAME reference when nothing needs to change, so a caller may
 * apply it during render without looping.
 *
 * @param {{path: string, value: string, committed: boolean, echo: string|null}|null} buffer
 * @param {{path: string, content: string}|null|undefined} file the file on screen
 */
export function reconcileBuffer(buffer, file) {
  if (!buffer || !file) return buffer;
  // A buffer for a different file is not shadowing anything: switching away
  // simply stops it matching, which is how it gets cleaned up.
  if (buffer.path !== file.path) return buffer;
  if (!buffer.committed) return buffer;
  if (buffer.echo === null || buffer.echo === undefined) return { ...buffer, echo: file.content };
  return buffer.echo === file.content ? buffer : null;
}
