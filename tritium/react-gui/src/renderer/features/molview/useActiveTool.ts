/**
 * @file features/molview/useActiveTool.ts
 * @description Global active-tool state for the 3D viewport.
 *
 * This hook is the single source of truth for which interaction mode
 * (navigate / select / measure / ...) is currently active. It must be
 * instantiated once at the App level and the result threaded down to
 * any component that needs to read or mutate the tool state
 * (ViewportToolPalette, StatusBar, viewport mouse handlers).
 *
 * Keyboard shortcuts:
 *
 * A global keydown listener is installed while the hook is mounted.
 * When a plain single letter matches a tool's shortcut, that tool is
 * activated. The listener is skipped in three cases:
 *
 *   1. A text input / textarea / select is focused (typing convenience).
 *   2. A contentEditable element is focused.
 *   3. Any modifier key (ctrl / meta / alt) is pressed -- avoids
 *      clobbering reload, devtools, and OS-level accelerators.
 *
 * @module features/molview/useActiveTool
 */

import { useCallback, useEffect, useState } from "react";
import { TOOLS, TOOL_BY_ID, type ToolId, type ToolDef } from "@renderer/data/viewportTools";

export interface UseActiveToolResult {
  activeTool: ToolId;
  activeDef: ToolDef;
  setActiveTool: (id: ToolId) => void;
}

export function useActiveTool(defaultTool: ToolId = "navigate"): UseActiveToolResult {
  const [activeTool, setActiveToolState] = useState<ToolId>(defaultTool);

  const setActiveTool = useCallback((id: ToolId) => {
    setActiveToolState(id);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const match = TOOLS.find(
        (t) => t.shortcut.toLowerCase() === e.key.toLowerCase(),
      );
      if (match) {
        setActiveToolState(match.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return {
    activeTool,
    activeDef: TOOL_BY_ID[activeTool],
    setActiveTool,
  };
}
