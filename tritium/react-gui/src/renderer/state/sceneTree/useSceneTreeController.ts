/**
 * @file state/sceneTree/useSceneTreeController.ts
 * @description The Explorer's scene-tree behaviour on top of `useSceneTree`.
 *
 * Owns the inline-rename editor state, defines the toolbar / keyboard /
 * double-click handlers, registers the Edit-menu clipboard scope, and drives
 * `useSceneContextMenu`. `SceneTreeProvider` hands the result out as the
 * actions context; `ScenePane` and the ctxmenu reach it from there.
 *
 * Every action reads the selection and the tree through refs, so the bundle
 * this returns is identity-stable for the provider's lifetime: a selection
 * change re-renders the rows through the state context, not through a new
 * set of callbacks.
 */

import { useCallback, useMemo, useState } from "react";
import type { AsyncCueMol } from "../../worker/client/AsyncCueMol";
import type { SceneTreeNode } from "../../worker/shared/sceneTreeTypes";
import type { UseSceneTreeResult } from "../../hooks/useSceneTree";
import type { MoveSceneNodeArgs } from "../../components/panes/sceneTreeDnd";
import { useSceneContextMenu } from "../../hooks/useSceneContextMenu";
import { useClipboardScope } from "../../hooks/useClipboardScope";
import { useLatestRef } from "../../hooks/react/useLatestRef";
import { findTypedNode } from "../../hooks/sceneTree/sceneTreeNodeUtils";
import { useShowErrorAlert } from "../../components/dialogs/ErrorAlertDialogProvider";

export interface UseSceneTreeControllerArgs {
  /** The `useSceneTree` result, passed in whole. */
  scene: UseSceneTreeResult;
  cm: AsyncCueMol | null;
  /** Active scene UID -- drives the ctxmenu pre-fetch. */
  activeSceneId: number | undefined;
  /** Active molview UID -- drives focus / camera-apply / new-camera flows. */
  activeMolViewId: number | undefined;
  /** Open the property inspector for a scene-tree node id. */
  showProperty: (id: string) => void;
}

/** Everything the tree UI can do; identity-stable. */
export interface SceneTreeActions {
  select: (id: string) => void;
  /** Cmd/Ctrl+click: toggle `id` in the multi-selection. */
  toggleSelect: (id: string) => void;
  /** Shift+click: range-select up to `id` over the drawn row order. */
  selectRange: (id: string, visibleIds: string[], additive?: boolean) => void;
  toggleVisibility: (id: string) => void;
  /** Open the property inspector for a row. */
  showProperty: (id: string) => void;
  /** Toolbar Focus / F key: centre the active view on a row. */
  focusSelected: (id: string) => void;
  /** Toolbar Delete / Delete key: the whole multi-selection when there is one. */
  deleteSelected: (id: string) => void;
  /** Toolbar Add: New Renderer or New Camera by the selected row's type. */
  addSelected: () => void;
  /** Double-click: apply a camera, or open the inspector. */
  nodeDoubleClick: (node: SceneTreeNode) => void;
  beginInlineRename: (id: string) => void;
  cancelInlineRename: () => void;
  commitInlineRename: (node: SceneTreeNode, newName: string) => void;
  showContextMenu: (node: SceneTreeNode, x: number, y: number) => void;
  moveNode: (args: MoveSceneNodeArgs) => unknown;
  /** Row expand / collapse; persisted into C++ `ui_collapsed`. */
  nodeExpandChange: (node: SceneTreeNode, collapsed: boolean) => void;
}

export interface UseSceneTreeControllerResult {
  /** Row showing the inline-rename editor, or null. */
  editingNodeId: string | null;
  actions: SceneTreeActions;
}

export function useSceneTreeController({
  scene,
  cm,
  activeSceneId,
  activeMolViewId,
  showProperty,
}: UseSceneTreeControllerArgs): UseSceneTreeControllerResult {
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

  // --- Context menu + shared New Renderer / New Camera flows ---

  const { openContextMenu, openNewRendererFlow, openNewCameraFlow } =
    useSceneContextMenu({
      ...scene,
      cm,
      sceneId: activeSceneId,
      showProperty,
      beginInlineRename,
      activeViewId: activeMolViewId,
    });

  const showErrorAlert = useShowErrorAlert();

  // Everything an action needs, read at call time. The bundle below closes
  // over this one ref and is created once, so a selection change or a tree
  // refetch never hands the rows a new set of callbacks.
  const live = useLatestRef({
    scene,
    activeMolViewId,
    showProperty,
    showErrorAlert,
    openContextMenu,
    openNewRendererFlow,
    openNewCameraFlow,
  });

  /**
   * Copy the selection to the OS clipboard.
   *
   * A multi-selection goes through `bulkCopyNodes`, which refuses a mixed
   * set and multiple objects exactly as UXP did; surface those the same way
   * the ctxmenu's multiCopy does.
   *
   * @returns whether anything reached the clipboard (Cut needs to know).
   */
  const copySelection = useCallback(async (): Promise<boolean> => {
    const { scene: s, showErrorAlert: alert } = live.current;
    if (s.selectedIds.size > 1) {
      const res = await s.bulkCopyNodes(s.selectedIds);
      if (res.ok) return true;
      if (res.reason === "mixed") {
        await alert({
          title: "Copy",
          message: "Multiple items with different types selected.",
        });
      } else if (res.reason === "objectUnsupported") {
        await alert({
          title: "Copy",
          message: "Multiple copy of object: not supported.",
        });
      }
      return false;
    }
    if (!s.selectedId) return false;
    const found = findTypedNode(s.tree, s.selectedId);
    if (!found) return false;
    return s.copyNode(found.node);
  }, [live]);

  /**
   * Cut: copy, then delete -- but only once the payload is actually on the
   * clipboard, so a failed copy never destroys the selection. The delete
   * carries its own undo transaction, so one Cmd+Z brings the nodes back.
   *
   * This has no UXP counterpart (the legacy app had no Cut for scene nodes);
   * it exists because Cmd+X is expected to work wherever Cmd+C does.
   */
  const cutSelection = useCallback(async (): Promise<void> => {
    const { scene: s } = live.current;
    const ids = s.selectedIds.size > 1 ? new Set(s.selectedIds) : null;
    const id = s.selectedId;
    if (!(await copySelection())) return;
    if (ids) {
      await s.bulkDeleteNodes(ids);
      return;
    }
    if (id) await s.deleteNode(id);
  }, [live, copySelection]);

  /**
   * Paste onto the selected row -- the ctxmenu Paste, by keyboard.
   *
   * The empty-selection check is explicit because `Number('')` is 0, which
   * resolves to the scene root: without it a stray Cmd+V with nothing
   * selected would paste into the scene.
   */
  const pasteOntoSelection = useCallback(async (): Promise<void> => {
    const { scene: s } = live.current;
    if (!s.selectedId) return;
    const found = findTypedNode(s.tree, s.selectedId);
    if (!found) return;
    await s.pasteNode(found.node);
  }, [live]);

  // --- Edit-menu clipboard (Cmd+C / X / V over the scene tree) ---
  //
  // The same three operations the context menu offers, reached by keyboard.
  // `ScenePane` marks its scroll wrapper `data-clipboard-scope="scene-tree"`,
  // and `utils/editClipboard.ts` routes here only when the tree -- not a text
  // field -- is where the user is working.
  useClipboardScope("scene-tree", {
    cut: () => {
      void cutSelection().catch((err: unknown) =>
        console.warn("scene cut failed:", err),
      );
    },
    copy: () => {
      void copySelection().catch((err: unknown) =>
        console.warn("scene copy failed:", err),
      );
    },
    paste: () => {
      void pasteOntoSelection().catch((err: unknown) =>
        console.warn("scene paste failed:", err),
      );
    },
  });

  const actions = useMemo<SceneTreeActions>(
    () => ({
      select: (id) => live.current.scene.setSelectedId(id),
      toggleSelect: (id) => live.current.scene.toggleInSelection(id),
      selectRange: (id, visibleIds, additive) =>
        live.current.scene.selectRangeTo(id, visibleIds, additive),
      toggleVisibility: (id) => live.current.scene.toggleVisibility(id),
      showProperty: (id) => live.current.showProperty(id),
      moveNode: (args) => live.current.scene.moveSceneNode(args),

      // --- Scene-tree toolbar handlers (UXP workspace_panel onBtn*Cmd) ---

      focusSelected: (id) => {
        const { scene: s, activeMolViewId: viewId } = live.current;
        if (viewId === undefined) return;
        s.focusNode(viewId, id).catch((err: unknown) => {
          console.warn("focusSceneNode failed:", err);
        });
      },

      /**
       * Delete from the toolbar button / Delete key.
       *
       * Deletes the whole multi-selection under a single undo transaction
       * when more than one row is selected -- UXP's `onDeleteCmd` drove the
       * same button through the same multi loop, and `useSceneTree`
       * deliberately leaves `delete` enabled while multi-selected. Falls
       * back to the single-node path (which also covers cameras and styles)
       * otherwise.
       */
      deleteSelected: (id) => {
        const { scene: s } = live.current;
        if (s.selectedIds.size > 1) {
          s.bulkDeleteNodes(new Set(s.selectedIds)).catch((err: unknown) => {
            console.warn("bulkDeleteSceneNodes failed:", err);
          });
          return;
        }
        s.deleteNode(id).catch((err: unknown) => {
          console.warn("deleteSceneNode failed:", err);
        });
      },

      // Toolbar Add button -- UXP `onNewCmd` dispatches by selected row type:
      // object / renderer / rendGroup -> New Renderer flow;
      // camera / cameraRoot -> New Camera flow. Other selections are no-ops.
      addSelected: () => {
        const { scene: s, openNewCameraFlow: newCamera, openNewRendererFlow: newRenderer } = live.current;
        const found = findTypedNode(s.tree, s.selectedId);
        if (!found) return;
        const node = found.node;
        if (node.type === "camera" || node.type === "cameraRoot") {
          void newCamera().catch((err: unknown) => {
            console.warn("new-camera toolbar add failed:", err);
          });
          return;
        }
        void newRenderer(node).catch((err: unknown) => {
          console.warn("new-renderer toolbar add failed:", err);
        });
      },

      // Tree row double-click -- UXP `onTreeItemClick` detail==2: camera rows
      // apply the camera to the active view (with vis flags); other rows open
      // the generic property inspector. cameraRoot / styleRoot are no-ops.
      nodeDoubleClick: (node) => {
        const { scene: s, activeMolViewId: viewId, showProperty: show } = live.current;
        if (node.type === "camera") {
          if (viewId === undefined) return;
          void s.applyCameraToView(viewId, node.name, true).catch(
            (err: unknown) => {
              console.warn("dblclick applyCameraToView failed:", err);
            },
          );
          return;
        }
        if (node.type === "cameraRoot" || node.type === "styleRoot") return;
        show(String(node.id));
      },

      beginInlineRename,
      cancelInlineRename,

      // Inline-rename commit: camera rows go through renameCamera (cameras
      // have no in-place name setter once registered), everything else
      // through the generic renameNode worker. Also clears the editor.
      commitInlineRename: (node, newName) => {
        const { scene: s } = live.current;
        setEditingNodeId(null);
        if (node.type === "camera") {
          void s.renameCamera(node.name, newName).catch((err: unknown) => {
            console.warn("inline rename camera failed:", err);
          });
        } else {
          void s.renameNode(String(node.id), newName).catch((err: unknown) => {
            console.warn("inline rename failed:", err);
          });
        }
      },

      showContextMenu: (node, x, y) => {
        void live.current.openContextMenu(node, x, y).catch((err: unknown) => {
          console.warn("scene context menu failed:", err);
        });
      },

      // Tree row expand/collapse -- persist into C++ `ui_collapsed` so the
      // state survives a qsc save/load (UXP onTwistyClick parity). Only real
      // C++ rows qualify; synthesised rows (cameraRoot / styleRoot, negative
      // ids) and camera / style rows are no-ops.
      nodeExpandChange: (node, collapsed) => {
        if (node.type !== "object" && node.type !== "rendGroup") return;
        if (node.id < 0) return;
        live.current.scene.setNodeUiCollapsed(String(node.id), collapsed);
      },
    }),
    [live, beginInlineRename, cancelInlineRename],
  );

  return { editingNodeId, actions };
}
