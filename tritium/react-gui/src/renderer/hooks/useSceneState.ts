/**
 * @file hooks/useSceneState.ts
 * @description Custom hook that manages the scene-graph state and
 * scene-panel interactions (visibility toggling, selection).
 *
 * In the real application the scene tree will be maintained by the
 * backend (C++ core) and pushed to the renderer process via IPC.
 * This hook encapsulates the mock/local state so that `App.tsx`
 * does not need to know about scene-graph mutation details.
 */

import { useState, useCallback } from "react";
import type { SceneNode } from "../components/panes/ScenePane";
import { SCENE_DATA } from "../data/sampleData";

// ────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────

export function useSceneState() {
  const [scene, setScene] = useState<SceneNode>(SCENE_DATA);
  const [sceneSelected, setSceneSelected] = useState("mol1");

  /**
   * Toggle the `visible` flag for a scene object or renderer node.
   *
   * Walks the scene tree to find the matching `id` and flips the
   * boolean.  In the real application this will dispatch a command
   * to the backend, which will update the scene and re-render the
   * 3D viewport.
   */
  const handleToggleVisibility = useCallback((id: string) => {
    setScene((prev) => ({
      ...prev,
      objects: prev.objects.map((obj) => {
        if (obj.id === id) {
          return { ...obj, visible: !obj.visible };
        }
        const updChildren = obj.children.map((rend) =>
          rend.id === id ? { ...rend, visible: !rend.visible } : rend,
        );
        return { ...obj, children: updChildren };
      }),
    }));
  }, []);

  /**
   * Resolve a display name for a given scene-graph node ID.
   * Returns the `label` property of the object or renderer that
   * matches, or the raw `id` string as a fallback.
   */
  const resolveNodeName = useCallback(
    (id: string): string => {
      for (const obj of scene.objects) {
        if (obj.id === id) return obj.label;
        for (const rend of obj.children) {
          if (rend.id === id) return rend.label;
        }
      }
      return id;
    },
    [scene],
  );

  return {
    scene,
    sceneSelected,
    setSceneSelected,
    handleToggleVisibility,
    resolveNodeName,
  } as const;
}
