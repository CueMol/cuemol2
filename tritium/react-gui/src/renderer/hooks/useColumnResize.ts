/**
 * @file hooks/useColumnResize.ts
 * @description Custom hook that manages drag-to-resize behaviour for table
 * columns.  Returns current widths and a `startResize` handler to attach
 * to each column's drag-handle element.
 *
 * Usage:
 *   const { widths, startResize } = useColumnResize({ name: 180, type: 130, value: 140 });
 *   <div onMouseDown={(e) => startResize("name", e)}>handle</div>
 */

import { useState, useCallback, useRef, useEffect } from "react";

/** Per-column minimum width in px. */
const MIN_COL_WIDTH = 40;

export function useColumnResize<K extends string>(
  initialWidths: Record<K, number>,
  minWidth: number = MIN_COL_WIDTH
) {
  const [widths, setWidths] = useState<Record<K, number>>(initialWidths);

  // Mutable refs so mousemove/mouseup closures always see latest values.
  const dragging = useRef<{ key: K; startX: number; startW: number } | null>(
    null
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const d = dragging.current;
      if (!d) return;
      const delta = e.clientX - d.startX;
      const next = Math.max(minWidth, d.startW + delta);
      setWidths((prev) => ({ ...prev, [d.key]: next }));
    },
    [minWidth]
  );

  const handleMouseUp = useCallback(() => {
    dragging.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  // Clean up listeners on unmount.
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const startResize = useCallback(
    (key: K, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging.current = {
        key,
        startX: e.clientX,
        startW: widths[key],
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [widths, handleMouseMove, handleMouseUp]
  );

  return { widths, startResize } as const;
}
