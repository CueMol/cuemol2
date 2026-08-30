/**
 * @file state/sceneTree/useSceneTreeController.ts
 * @description The Explorer's scene-tree behaviour on top of `useSceneTree`.
 *
 * Owns the inline-rename editor state and turns every gesture the tree
 * offers -- a toolbar button, a key, a double-click, a right-click -- into a
 * command dispatch. The work itself lives in the handlers under
 * `commands/`, which the context menu reaches the same way, so the two
 * entry points cannot drift apart.
 *
 * The actions this returns read the selection through one ref, so the bundle
 * is identity-stable for the provider's lifetime: a click re-renders the rows
 * through the state context, not through a new set of callbacks.
 */

import { useCallback, useMemo, useState } from "react";
import type { AsyncCueMol } from "@renderer/worker/client/AsyncCueMol";
import type { SceneTreeNode } from "@renderer/worker/shared/sceneTreeTypes";
import type { UseSceneTreeResult } from "@renderer/features/scene/useSceneTree";
import type { MoveSceneNodeArgs } from "@renderer/features/scene/sceneTreeDnd";
import { useSceneContextMenu } from "@renderer/features/scene/useSceneContextMenu";
import { useClipboardScope } from "@renderer/hooks/useClipboardScope";
import { useLatestRef } from "@renderer/hooks/react/useLatestRef";
import { useCommands } from "@renderer/commands/CommandRegistry";
import { CmdId } from "@renderer/commands/ids";

export interface UseSceneTreeControllerArgs {
  /** The `useSceneTree` result, passed in whole. */
  scene: UseSceneTreeResult;
  cm: AsyncCueMol | null;
  /** Active scene UID -- drives the ctxmenu pre-fetch. */
  activeSceneId: number | undefined;
  /** Active molview UID -- drives focus and camera-apply. */
  activeMolViewId: number | undefined;
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
  /** Toolbar Focus: centre the active view on a row. */
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
}: UseSceneTreeControllerArgs): UseSceneTreeControllerResult {
  // --- Inline-rename controller ---
  // Owned here so the F2 keypath (started in ScenePane) and the ctxmenu
  // Rename action (which dispatches SceneNodeRenameBegin) route through one
  // piece of state. The targeted row id is null when no editor is open.
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const beginInlineRename = useCallback((id: string) => {
    setEditingNodeId(id);
  }, []);
  const cancelInlineRename = useCallback(() => {
    setEditingNodeId(null);
  }, []);

  const { dispatch } = useCommands();
  const { openContextMenu } = useSceneContextMenu({
    cm,
    sceneId: activeSceneId,
    selectedIds: scene.selectedIds,
  });

  // Everything an action needs, read at call time. The bundle below closes
  // over this one ref and is created once, so a selection change or a tree
  // refetch never hands the rows a new set of callbacks.
  const live = useLatestRef({ scene, activeMolViewId, dispatch, openContextMenu });

  /** Run a command, reporting a failure rather than losing it. */
  const run = useCallback(
    (label: string, fn: () => Promise<unknown>) => {
      void fn().catch((err: unknown) => console.warn(`${label} failed:`, err));
    },
    [],
  );

  // --- Edit-menu clipboard (Cmd+C / X / V over the scene tree) ---
  //
  // The same three operations the context menu offers, reached by keyboard,
  // and through the same commands. `ScenePane` marks its scroll wrapper
  // `data-clipboard-scope="scene-tree"`, and `utils/editClipboard.ts` routes
  // here only when the tree -- not a text field -- is where the user is
  // working.

  const copySelection = useCallback(async (): Promise<void> => {
    const { scene: s, dispatch: d } = live.current;
    const ids = s.selectedIds.size > 1 ? [...s.selectedIds] : s.selectedId ? [s.selectedId] : [];
    if (ids.length === 0) return;
    await d(CmdId.SceneNodeCopy, { ids });
  }, [live]);

  /**
   * Cut: copy, then delete -- but only once the copy has actually landed on
   * the clipboard, which is what Copy's return value reports. Losing the
   * selection to a clipboard write that never happened would be
   * unrecoverable. The delete carries its own undo transaction, so one Cmd+Z
   * brings the nodes back.
   *
   * This has no UXP counterpart (the legacy app had no Cut for scene nodes);
   * it exists because Cmd+X is expected to work wherever Cmd+C does.
   */
  const cutSelection = useCallback(async (): Promise<void> => {
    const { scene: s, dispatch: d } = live.current;
    const ids = s.selectedIds.size > 1 ? [...s.selectedIds] : s.selectedId ? [s.selectedId] : [];
    if (ids.length === 0) return;
    if (!(await d(CmdId.SceneNodeCopy, { ids }))) return;
    await d(CmdId.SceneNodeDelete, { ids });
  }, [live]);

  const pasteOntoSelection = useCallback(async (): Promise<void> => {
    const { scene: s, dispatch: d } = live.current;
    // The empty-selection check is explicit because `Number('')` is 0, which
    // resolves to the scene root: without it a stray Cmd+V with nothing
    // selected would paste into the scene.
    if (!s.selectedId) return;
    await d(CmdId.SceneNodePaste, { targetId: s.selectedId });
  }, [live]);

  useClipboardScope("scene-tree", {
    cut: () => run("scene cut", cutSelection),
    copy: () => run("scene copy", copySelection),
    paste: () => run("scene paste", pasteOntoSelection),
  });

  const actions = useMemo<SceneTreeActions>(
    () => ({
      select: (id) => live.current.scene.setSelectedId(id),
      toggleSelect: (id) => live.current.scene.toggleInSelection(id),
      selectRange: (id, visibleIds, additive) =>
        live.current.scene.selectRangeTo(id, visibleIds, additive),
      toggleVisibility: (id) =>
        run("show/hide", () => live.current.dispatch(CmdId.SceneNodeSetVisible, { ids: [id] })),
      showProperty: (id) =>
        run("show property", () => live.current.dispatch(CmdId.SceneNodeProperty, { id })),
      moveNode: (args) => live.current.scene.moveSceneNode(args),

      // --- Scene-tree toolbar handlers (UXP workspace_panel onBtn*Cmd) ---

      focusSelected: (id) => {
        const { scene: s, activeMolViewId: viewId } = live.current;
        if (viewId === undefined) return;
        s.focusNode(viewId, id).catch((err: unknown) => {
          console.warn("focusSceneNode failed:", err);
        });
      },

      // The toolbar button and the Delete key both land here; the command
      // deletes a multi-selection under a single undo transaction, which is
      // what UXP's `onDeleteCmd` did.
      deleteSelected: (id) => {
        const { scene: s } = live.current;
        const ids = s.selectedIds.size > 1 ? [...s.selectedIds] : [id];
        run("delete", () => live.current.dispatch(CmdId.SceneNodeDelete, { ids }));
      },

      // UXP `onNewCmd` dispatches by selected row type: object / renderer /
      // rendGroup to New Renderer, camera / cameraRoot to New Camera. Other
      // selections are no-ops.
      addSelected: () => {
        const { scene: s, dispatch: d } = live.current;
        const node = s.selectedNode;
        if (!node) return;
        if (node.type === "camera" || node.type === "cameraRoot") {
          run("new camera", () => d(CmdId.CameraNew));
          return;
        }
        if (node.type !== "object" && node.type !== "renderer" && node.type !== "rendGroup") return;
        run("new renderer", () => d(CmdId.RendererNew, { sourceNodeId: String(node.id) }));
      },

      // UXP `onTreeItemClick` detail==2: camera rows apply the camera to the
      // active view (with vis flags); other rows open the property inspector.
      // cameraRoot / styleRoot are no-ops.
      nodeDoubleClick: (node) => {
        const { dispatch: d } = live.current;
        if (node.type === "camera") {
          run("apply camera", () =>
            d(CmdId.CameraApplyToView, { name: node.name, withVisFlags: true }),
          );
          return;
        }
        if (node.type === "cameraRoot" || node.type === "styleRoot") return;
        run("show property", () => d(CmdId.SceneNodeProperty, { id: String(node.id) }));
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
        run("scene context menu", () => live.current.openContextMenu(node, x, y));
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
    [live, run, beginInlineRename, cancelInlineRename],
  );

  return { editingNodeId, actions };
}
