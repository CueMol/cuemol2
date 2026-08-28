import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { makeRenderHook } from './helpers/testHarness';
import { useSceneTreeController } from '../hooks/useSceneTreeController';
import type { UseSceneTreeControllerArgs } from '../hooks/useSceneTreeController';
import type { SceneTreeNode } from '../worker/shared/sceneTreeTypes';

void React;

/**
 * Degrade-detection test for useSceneTreeController -- the extraction
 * of App's scene-tree wiring. Pins:
 *   - the <SidePanel> prop bundle shape + field->source mapping
 *   - inline-rename commit routing (camera->renameCamera / else->renameNode)
 *   - double-click routing (camera->applyCameraToView / else->showGeneric)
 *   - toolbar Add routing (object->New Renderer / camera->New Camera flow)
 *   - that the whole useSceneTree result is forwarded to useSceneContextMenu
 */

// Mock useSceneContextMenu so this test does not pull in the dialog-provider
// tree. The controller's contract with it is the three flow callbacks plus
// the argument object it is handed.
const mocks = vi.hoisted(() => ({
  openContextMenu: vi.fn().mockResolvedValue(undefined),
  openNewRendererFlow: vi.fn().mockResolvedValue(undefined),
  openNewCameraFlow: vi.fn().mockResolvedValue(undefined),
  ctxMenuArgs: { current: null as Record<string, unknown> | null },
  showErrorAlert: vi.fn().mockResolvedValue(undefined),
}));
// Same reason: the controller now asks for the error-alert dialog so the
// keyboard Copy can report UXP's multi-copy refusals.
vi.mock('../components/dialogs/ErrorAlertDialogProvider', () => ({
  useShowErrorAlert: () => mocks.showErrorAlert,
}));

// Capture what the controller registers as its clipboard scope, so the
// keyboard path can be driven without the DOM plumbing (covered separately
// in editClipboard.test.ts).
const registered = new Map<string, { cut: () => void; copy: () => void; paste: () => void }>();
vi.mock('../hooks/useClipboardScope', () => ({
  useClipboardScope: (
    id: string,
    handlers: { cut: () => void; copy: () => void; paste: () => void },
  ) => {
    registered.set(id, handlers);
  },
}));
vi.mock('../hooks/useSceneContextMenu', () => ({
  useSceneContextMenu: (opts: Record<string, unknown>) => {
    mocks.ctxMenuArgs.current = opts;
    return {
      openContextMenu: mocks.openContextMenu,
      openNewRendererFlow: mocks.openNewRendererFlow,
      openNewCameraFlow: mocks.openNewCameraFlow,
    };
  },
}));

const node = (partial: Partial<SceneTreeNode>): SceneTreeNode =>
  ({ children: [], ...partial } as SceneTreeNode);

function makeScene(overrides: Record<string, unknown> = {}) {
  return {
    tree: null,
    selectedId: '',
    selectedIds: new Set<string>(),
    selectedNode: null,
    selectedHasOps: { focus: false, delete: false, property: false, add: false },
    setSelectedId: vi.fn(),
    toggleInSelection: vi.fn(),
    refetch: vi.fn(),
    toggleVisibility: vi.fn(),
    setNodeUiCollapsed: vi.fn(),
    moveSceneNode: vi.fn(),
    focusNode: vi.fn().mockResolvedValue(true),
    deleteNode: vi.fn().mockResolvedValue(true),
    renameNode: vi.fn().mockResolvedValue(true),
    renameCamera: vi.fn().mockResolvedValue(true),
    applyCameraToView: vi.fn().mockResolvedValue(true),
    copyNode: vi.fn().mockResolvedValue(true),
    pasteNode: vi.fn().mockResolvedValue(true),
    bulkCopyNodes: vi.fn().mockResolvedValue({ ok: true }),
    bulkDeleteNodes: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

type Scene = ReturnType<typeof makeScene>;

function renderController(
  scene: Scene,
  showGeneric: (id: string) => void = vi.fn(),
  activeMolViewId: number | undefined = 5,
) {
  const args = {
    scene: scene as unknown as UseSceneTreeControllerArgs['scene'],
    cm: null,
    activeSceneId: 7,
    activeMolViewId,
    showGeneric,
  };
  return makeRenderHook(() => useSceneTreeController(args));
}

beforeEach(() => {
  vi.clearAllMocks();
  registered.clear();
  mocks.ctxMenuArgs.current = null;
});

describe('useSceneTreeController bundle', () => {
  it('maps useSceneTree fields onto the SidePanel prop names', () => {
    const scene = makeScene({ tree: node({ id: 1, type: 'scene', name: 'S' }) });
    const showGeneric = vi.fn();
    const h = renderController(scene, showGeneric);
    const b = h.result;
    expect(b.sceneTree).toBe(scene.tree);
    expect(b.sceneSelected).toBe(scene.selectedId);
    expect(b.sceneSelectedIds).toBe(scene.selectedIds);
    expect(b.onSceneSelect).toBe(scene.setSelectedId);
    expect(b.onSceneToggleSelect).toBe(scene.toggleInSelection);
    expect(b.onToggleVisibility).toBe(scene.toggleVisibility);
    expect(b.onMoveSceneNode).toBe(scene.moveSceneNode);
    expect(b.sceneOpsEnabled).toBe(scene.selectedHasOps);
    expect(b.onShowProperty).toBe(showGeneric);
    expect(b.sceneEditingNodeId).toBeNull();
    h.unmount();
  });

  it('forwards the whole useSceneTree result + extras to useSceneContextMenu', () => {
    const scene = makeScene();
    const showGeneric = vi.fn();
    const h = renderController(scene, showGeneric);
    const args = mocks.ctxMenuArgs.current!;
    // spread-through from `scene`
    expect(args.toggleVisibility).toBe(scene.toggleVisibility);
    expect(args.deleteNode).toBe(scene.deleteNode);
    expect(args.renameNode).toBe(scene.renameNode);
    // controller-supplied extras
    expect(args.sceneId).toBe(7);
    expect(args.activeViewId).toBe(5);
    expect(args.showProperty).toBe(showGeneric);
    expect(typeof args.beginInlineRename).toBe('function');
    h.unmount();
  });
});

describe('useSceneTreeController inline-rename commit', () => {
  it('routes a camera row through renameCamera', () => {
    const scene = makeScene();
    const h = renderController(scene);
    act(() => {
      h.result.onCommitInlineRename(
        node({ id: -3, type: 'camera', name: 'cam1' }),
        'cam-new',
      );
    });
    expect(scene.renameCamera).toHaveBeenCalledWith('cam1', 'cam-new');
    expect(scene.renameNode).not.toHaveBeenCalled();
    h.unmount();
  });

  it('routes a non-camera row through renameNode (keyed by node id)', () => {
    const scene = makeScene();
    const h = renderController(scene);
    act(() => {
      h.result.onCommitInlineRename(
        node({ id: 42, type: 'object', name: 'mol1' }),
        'mol-new',
      );
    });
    expect(scene.renameNode).toHaveBeenCalledWith('42', 'mol-new');
    expect(scene.renameCamera).not.toHaveBeenCalled();
    h.unmount();
  });
});

describe('useSceneTreeController double-click', () => {
  it('applies a camera row to the active view with vis flags', () => {
    const scene = makeScene();
    const showGeneric = vi.fn();
    const h = renderController(scene, showGeneric, 5);
    act(() => {
      h.result.onSceneNodeDoubleClick(node({ id: -3, type: 'camera', name: 'cam1' }));
    });
    expect(scene.applyCameraToView).toHaveBeenCalledWith(5, 'cam1', true);
    expect(showGeneric).not.toHaveBeenCalled();
    h.unmount();
  });

  it('opens the property inspector for a non-camera row', () => {
    const scene = makeScene();
    const showGeneric = vi.fn();
    const h = renderController(scene, showGeneric, 5);
    act(() => {
      h.result.onSceneNodeDoubleClick(node({ id: 42, type: 'object', name: 'mol1' }));
    });
    expect(showGeneric).toHaveBeenCalledWith('42');
    expect(scene.applyCameraToView).not.toHaveBeenCalled();
    h.unmount();
  });
});

describe('useSceneTreeController expand/collapse persistence', () => {
  it('persists object / rendGroup rows via setNodeUiCollapsed', () => {
    const scene = makeScene();
    const h = renderController(scene);
    act(() => {
      h.result.onSceneNodeExpandChange(
        node({ id: 50, type: 'rendGroup', name: 'g1' }), true,
      );
    });
    expect(scene.setNodeUiCollapsed).toHaveBeenCalledWith('50', true);
    act(() => {
      h.result.onSceneNodeExpandChange(
        node({ id: 10, type: 'object', name: 'mol1' }), false,
      );
    });
    expect(scene.setNodeUiCollapsed).toHaveBeenCalledWith('10', false);
    h.unmount();
  });

  it('ignores synthesised rows and non-persistable node types', () => {
    const scene = makeScene();
    const h = renderController(scene);
    act(() => {
      h.result.onSceneNodeExpandChange(
        node({ id: -1, type: 'cameraRoot', name: 'Cameras' }), true,
      );
      h.result.onSceneNodeExpandChange(
        node({ id: -2, type: 'styleRoot', name: 'Styles' }), true,
      );
      // Negative-id guard also applies to otherwise-persistable types.
      h.result.onSceneNodeExpandChange(
        node({ id: -5, type: 'object', name: 'x' }), true,
      );
      h.result.onSceneNodeExpandChange(
        node({ id: 1, type: 'scene', name: 'S' }), true,
      );
    });
    expect(scene.setNodeUiCollapsed).not.toHaveBeenCalled();
    h.unmount();
  });
});

describe('useSceneTreeController toolbar handlers', () => {
  it('focus drives focusNode with the active molview id', () => {
    const scene = makeScene();
    const h = renderController(scene, vi.fn(), 9);
    act(() => {
      h.result.onFocusSelected('42');
    });
    expect(scene.focusNode).toHaveBeenCalledWith(9, '42');
    h.unmount();
  });

  it('Add on an object row runs the New Renderer flow', () => {
    const objNode = node({ id: 42, type: 'object', name: 'mol1' });
    const scene = makeScene({
      tree: node({ id: 1, type: 'scene', name: 'S', children: [objNode] }),
      selectedId: '42',
    });
    const h = renderController(scene);
    act(() => {
      h.result.onAddSelected();
    });
    expect(mocks.openNewRendererFlow).toHaveBeenCalledTimes(1);
    expect(mocks.openNewCameraFlow).not.toHaveBeenCalled();
    h.unmount();
  });

  it('Add on a camera row runs the New Camera flow', () => {
    const camNode = node({ id: 99, type: 'camera', name: 'cam1' });
    const scene = makeScene({
      tree: node({ id: 1, type: 'scene', name: 'S', children: [camNode] }),
      selectedId: '99',
    });
    const h = renderController(scene);
    act(() => {
      h.result.onAddSelected();
    });
    expect(mocks.openNewCameraFlow).toHaveBeenCalledTimes(1);
    expect(mocks.openNewRendererFlow).not.toHaveBeenCalled();
    h.unmount();
  });
});

// --- Keyboard clipboard scope (Cmd+C / X / V over the scene tree) ---

describe('useSceneTreeController clipboard scope', () => {
  /** A one-node tree so findTypedNode can resolve the selection. */
  const treeWith = (id: number) =>
    node({ id: 0, type: 'scene', children: [node({ id, type: 'renderer' })] });

  /** Mount the controller and hand back the registered scope handlers. */
  function mountScope(scene: Scene) {
    const h = renderController(scene);
    const handlers = registered.get('scene-tree');
    if (!handlers) throw new Error('scene-tree scope was not registered');
    return { h, handlers };
  }

  it('registers under the id ScenePane tags its wrapper with', () => {
    const { h } = mountScope(makeScene());
    expect(registered.has('scene-tree')).toBe(true);
    h.unmount();
  });

  it('copies the single selected node', async () => {
    const scene = makeScene({ tree: treeWith(42), selectedId: '42' });
    const { h, handlers } = mountScope(scene);
    await act(async () => { handlers.copy(); });
    expect(scene.copyNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
    );
    expect(scene.bulkCopyNodes).not.toHaveBeenCalled();
    h.unmount();
  });

  it('routes a multi-selection through bulkCopyNodes', async () => {
    const ids = new Set(['42', '43']);
    const scene = makeScene({ tree: treeWith(42), selectedId: '42', selectedIds: ids });
    const { h, handlers } = mountScope(scene);
    await act(async () => { handlers.copy(); });
    expect(scene.bulkCopyNodes).toHaveBeenCalledWith(ids);
    expect(scene.copyNode).not.toHaveBeenCalled();
    h.unmount();
  });

  it('reports UXP\'s refusals for a multi-copy', async () => {
    const scene = makeScene({
      tree: treeWith(42),
      selectedIds: new Set(['42', '43']),
      bulkCopyNodes: vi.fn().mockResolvedValue({ ok: false, reason: 'mixed' }),
    });
    const { h, handlers } = mountScope(scene);
    await act(async () => { handlers.copy(); });
    expect(mocks.showErrorAlert).toHaveBeenCalledWith({
      title: 'Copy',
      message: 'Multiple items with different types selected.',
    });
    h.unmount();
  });

  it('cuts by copying first and deleting only once the copy landed', async () => {
    const scene = makeScene({ tree: treeWith(42), selectedId: '42' });
    const { h, handlers } = mountScope(scene);
    await act(async () => { handlers.cut(); });
    expect(scene.copyNode).toHaveBeenCalled();
    expect(scene.deleteNode).toHaveBeenCalledWith('42');
    h.unmount();
  });

  it('does NOT delete when the copy failed', async () => {
    // Losing the selection to a clipboard write that never happened would
    // be unrecoverable from the user's point of view.
    const scene = makeScene({
      tree: treeWith(42),
      selectedId: '42',
      copyNode: vi.fn().mockResolvedValue(false),
    });
    const { h, handlers } = mountScope(scene);
    await act(async () => { handlers.cut(); });
    expect(scene.deleteNode).not.toHaveBeenCalled();
    h.unmount();
  });

  // The toolbar Delete button and the Delete key both land on
  // `onDeleteSelected`. UXP drove its Delete button through the same multi
  // loop, and `useSceneTree` keeps `delete` enabled while multi-selected, so
  // the bundle handler has to fan out rather than delete only the anchor.
  it('deletes the whole multi-selection from onDeleteSelected', () => {
    const ids = new Set(['42', '43']);
    const scene = makeScene({ tree: treeWith(42), selectedId: '42', selectedIds: ids });
    const showGeneric = vi.fn();
    const h = renderController(scene, showGeneric);
    act(() => { h.result.onDeleteSelected('42'); });
    expect(scene.bulkDeleteNodes).toHaveBeenCalledWith(ids);
    expect(scene.deleteNode).not.toHaveBeenCalled();
    h.unmount();
  });

  it('deletes a single row through the single-node path (cameras / styles)', () => {
    const scene = makeScene({
      tree: treeWith(42), selectedId: '42', selectedIds: new Set(['42']),
    });
    const showGeneric = vi.fn();
    const h = renderController(scene, showGeneric);
    act(() => { h.result.onDeleteSelected('42'); });
    expect(scene.deleteNode).toHaveBeenCalledWith('42');
    expect(scene.bulkDeleteNodes).not.toHaveBeenCalled();
    h.unmount();
  });

  it('cuts a multi-selection through the bulk delete', async () => {
    const ids = new Set(['42', '43']);
    const scene = makeScene({ tree: treeWith(42), selectedId: '42', selectedIds: ids });
    const { h, handlers } = mountScope(scene);
    await act(async () => { handlers.cut(); });
    expect(scene.bulkDeleteNodes).toHaveBeenCalledWith(ids);
    expect(scene.deleteNode).not.toHaveBeenCalled();
    h.unmount();
  });

  it('pastes onto the selected node, and no-ops without a selection', async () => {
    const scene = makeScene({ tree: treeWith(42), selectedId: '42' });
    const { h, handlers } = mountScope(scene);
    await act(async () => { handlers.paste(); });
    expect(scene.pasteNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
    );
    h.unmount();

    const empty = makeScene({ tree: treeWith(42), selectedId: '' });
    const m2 = mountScope(empty);
    await act(async () => { m2.handlers.paste(); });
    expect(empty.pasteNode).not.toHaveBeenCalled();
    m2.h.unmount();
  });
});
