import { useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Drag handle between two panels.
 *
 * The widths that suit reading a file and the widths that suit a conversation
 * are not the same, and they are not the same for everyone — so the split is
 * the user's to set rather than a number picked here.
 *
 * Hidden below `lg`: the panels stack there, and a vertical handle between
 * stacked rows would be a control with nothing to do.
 */
export default function Resizer({ onDrag, label, className }) {
  const startX = useRef(0);

  const begin = (e) => {
    e.preventDefault();
    startX.current = e.clientX;
    // Captured on the window so a fast drag that leaves the 4px handle keeps
    // tracking instead of stopping dead.
    const move = (ev) => onDrag(ev.clientX - startX.current);
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={begin}
      onKeyDown={(e) => {
        // Keyboard resizing, because a drag handle no one can reach by tab is
        // a control half the people using this cannot operate.
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onDrag(-24, true);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onDrag(24, true);
        }
      }}
      className={cn(
        "hidden w-1 shrink-0 cursor-col-resize bg-border/60 transition-colors hover:bg-primary/50 focus-visible:bg-primary focus-visible:outline-none lg:block",
        className,
      )}
    />
  );
}
