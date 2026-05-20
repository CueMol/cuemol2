/**
 * @file hooks/useSceneTreeController.ts
 * @description Aggregates all scene-tree wiring for the Explorer sidebar.
 *
 * `App` previously destructured ~40 callbacks out of `useSceneTree` and
 * re-assembled most of them into the `useSceneContextMenu` argument, owned
 * the inline-rename state, and defined ~8 scene-tree action handlers. This
 * hook absorbs that wiring: it takes the `useSceneTree` result whole, owns
 * the inline-rename controller, defines the scene-tree handlers, drives
 * `useSceneContextMenu`, and returns one bundle ready to spread onto
 * `<SidePanel>`. New ctxmenu actions now only touch `useSceneTree` /
 * `useSceneContextMenu` — they no longer ripple through `App`.
 *
 * `showGeneric` (open the property inspector) is passed in rather than
 * resolved here: it comes from `useInspectorState`, which itself depends
 * on `scene.tree`, so the controller cannot own that hook without a cycle.
 */

import { useCallback, useState } from "react";
import type { AsyncCueMol } from "../worker/client/AsyncCueMol";
import type { SceneTreeNode } from "../worker/shared/sceneTreeTypes";
import type { UseSceneTreeResult } from "./useSceneTree";
import { useSceneContextMenu } from "./useSceneContextMenu";

export interface UseSceneTreeControllerArgs {
  /** The `useSceneTree` result, owned by `App` and passed in whole. */
  scene: UseSceneTreeResult;
  cm: AsyncCueMol | null;
  /** Active scene UID — drives the ctxmenu pre-fetch. */
  activeSceneId: number | undefined;
  /** Active molview UID — drives focus / camera-apply / new-camera flows. */
  activeMolViewId: number | undefined;
  /** Open the generic property inspector for a scene-tree node id. */
  showGeneric: (id: string) => void;
}

export function useSceneTreeController({
  scene,
  cm,
  activeSceneId,
  activeMolViewId,
  showGeneric,
}: UseSceneTreeControllerArgs) {
  const {
    tree,
    selectedId,
    selectedIds,
    selectedHasOps,
    setSelectedId,
    toggleInSelection,
    toggleVisibility,
    moveSceneNode,
    focusNode,
    deleteNode,
    renameNode,
    renameCamera,
    applyCameraToView,
  } = scene;

  // --- Inline-rename controller ---
  // Owned here so the F2 keypath (started in ScenePane) and the ctxmenu
  // Rename action (started in useSceneContextMenu) route through one piece
  // of state. The targeted row id is null when no editor is open.
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const beginInlineRename = useCallback((id: string) => {
    setEditingNodeId(id);
  }, []);
  const cancelInlineRename = useCallback(() => {
    setEditingNodeId(null);
  }, []);

  // --- Scene-tree toolbar handlers (UXP workspace_panel onBtn*Cmd) ---

  const handleFocus = useCallback(
    (id: string) => {
      if (activeMolViewId === undefined) return;
      focusNode(activeMolViewId, id).catch((err: unknown) => {
        console.warn("focusSceneNode failed:", err);
      });
    },
    [activeMolViewId, focusNode],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteNode(id).catch((err: unknown) => {
        console.warn("deleteSceneNode failed:", err);
      });
    },
    [deleteNode],
  );

  // Inline-rename commit: camera rows go through renameCamera (cameras have
  // no in-place name setter once registered), everything else through the
  // generic renameNode worker. Also clears the editor.
  const handleCommitInlineRename = useCallback(
    (node: SceneTreeNode, newName: string) => {
      setEditingNodeId(null);
      if (node.type === "camera") {
        void renameCamera(node.name, newName).catch((err: unknown) => {
          console.warn("inline rename camera failed:", err);
        });
      } else {
        void renameNode(String(node.id), newName).catch((err: unknown) => {
          console.warn("inline rename failed:", err);
        });
      }
    },
    [renameCamera, renameNode],
  );

  // --- Context menu + shared New Renderer / New Camera flows ---

  const { openContextMenu, openNewRendererFlow, openNewCameraFlow } =
    useSceneContextMenu({
      ...scene,
      cm,
      sceneId: activeSceneId,
      showProperty: showGeneric,
      beginInlineRename,
      activeViewId: activeMolViewId,
    });

  const handleShowContextMenu = useCallback(
    (node: SceneTreeNode, x: number, y: number) => {
      void openContextMenu(node, x, y).catch((err: unknown) => {
        console.warn("scene context menu failed:", err);
      });
    },
    [openContextMenu],
  );

  // Tree row double-click — UXP `onTreeItemClick` detail==2: camera rows
  // apply the camera to the active view (with vis flags); other rows open
  // the generic property inspector. cameraRoot / styleRoot are no-ops.
  const handleNodeDoubleClick = useCallback(
    (node: SceneTreeNode) => {
      if (node.type === "camera") {
        if (activeMolViewId === undefined) return;
        void applyCameraToView(activeMolViewId, node.name, true).catch(
          (err: unknown) => {
            console.warn("dblclick applyCameraToView failed:", err);
          },
        );
        return;
      }
      if (node.type === "cameraRoot" || node.type === "styleRoot") return;
      showGeneric(String(node.id));
    },
    [activeMolViewId, applyCameraToView, showGeneric],
  );

  // Toolbar Add button — UXP `onNewCmd` dispatches by selected row type:
  // object / renderer / rendGroup → New Renderer flow;
  // camera / cameraRoot → New Camera flow. Other selections are no-ops.
  const handleAdd = useCallback(() => {
    const numId = Number(selectedId);
    if (!Number.isFinite(numId)) return;
    const walk = (n: SceneTreeNode | null): SceneTreeNode | null => {
      if (!n) return null;
      if (n.id === numId) return n;
      for (const c of n.children) {
        const found = walk(c);
        if (found) return found;
      }
      return null;
    };
    const node = walk(tree);
    if (!node) return;
    if (node.type === "camera" || node.type === "cameraRoot") {
      void openNewCameraFlow().catch((err: unknown) => {
        console.warn("new-camera toolbar add failed:", err);
      });
      return;
    }
    void openNewRendererFlow(node).catch((err: unknown) => {
      console.warn("new-renderer toolbar add failed:", err);
    });
  }, [selectedId, tree, openNewRendererFlow, openNewCameraFlow]);

  // Single bundle spread onto <SidePanel> by App.
  return {
    sceneTree: tree,
    sceneSelected: selectedId,
    sceneSelectedIds: selectedIds,
    onSceneSelect: setSelectedId,
    onSceneToggleSelect: toggleInSelection,
    onToggleVisibility: toggleVisibility,
    onShowProperty: showGeneric,
    onFocusSelected: handleFocus,
    onDeleteSelected: handleDelete,
    onAddSelected: handleAdd,
    onSceneNodeDoubleClick: handleNodeDoubleClick,
    sceneEditingNodeId: editingNodeId,
    onBeginInlineRename: beginInlineRename,
    onCancelInlineRename: cancelInlineRename,
    onCommitInlineRename: handleCommitInlineRename,
    onShowSceneContextMenu: handleShowContextMenu,
    onMoveSceneNode: moveSceneNode,
    sceneOpsEnabled: selectedHasOps,
  };
}
