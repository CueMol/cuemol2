import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { makeRenderHook } from './helpers/testHarness';
import { useSceneTreeController } from '../hooks/useSceneTreeController';
import type { UseSceneTreeControllerArgs } from '../hooks/useSceneTreeController';
import type { SceneTreeNode } from '../worker/shared/sceneTreeTypes';

void React;

/**
 * Degrade-detection test for useSceneTreeController -- the Phase 4 extraction
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
