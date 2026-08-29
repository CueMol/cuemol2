/**
 * @file state/sceneTree/useSceneTreeController.test.tsx
 * @description What the Explorer's gestures do.
 *
 * The controller is the tree's UI layer: it owns the inline-rename editor
 * and turns a toolbar click, a key or a double-click into a command
 * dispatch. These pin which command each gesture reaches and with what
 * arguments -- the context menu reaches the same ones, which is the point of
 * routing them this way -- plus the two things the controller still does
 * itself: the rename commit and the collapse persistence.
 *
 * They also pin that the action bundle keeps its identity while the
 * selection changes, which is what lets the rows be memoized.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { makeRenderHook } from '../../__test__/helpers/testHarness';
import { useSceneTreeController } from './useSceneTreeController';
import type { UseSceneTreeControllerArgs } from './useSceneTreeController';
import type { SceneTreeNode } from '../../worker/shared/sceneTreeTypes';
import { CmdId } from '../../commands/ids';

void React;

const dispatch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const ctxMenu = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(undefined), opts: null as any }));
const scope = new Map<string, { cut: () => void; copy: () => void; paste: () => void }>();

vi.mock('../../commands/CommandRegistry', () => ({ useCommands: () => ({ dispatch }) }));
vi.mock('../../hooks/useSceneContextMenu', () => ({
  useSceneContextMenu: (opts: unknown) => {
    ctxMenu.opts = opts;
    return { openContextMenu: ctxMenu.open };
  },
}));
// Capture what the controller registers as its clipboard scope, so the
// keyboard path can be driven without the DOM plumbing (covered separately
// in editClipboard.test.ts).
vi.mock('../../hooks/useClipboardScope', () => ({
  useClipboardScope: (
    id: string,
    handlers: { cut: () => void; copy: () => void; paste: () => void },
  ) => {
    scope.set(id, handlers);
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
    selectRangeTo: vi.fn(),
    refetch: vi.fn(),
    setNodeUiCollapsed: vi.fn(),
    moveSceneNode: vi.fn(),
    focusNode: vi.fn().mockResolvedValue(true),
    renameNode: vi.fn().mockResolvedValue(true),
    renameCamera: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

type Scene = ReturnType<typeof makeScene>;

/**
 * Mount the controller. The molview id is a rest tuple rather than a default
 * parameter because `undefined` is a meaningful value here (no molview open)
 * and a default would silently replace it.
 */
function renderController(scene: Scene, ...molView: [] | [number | undefined]) {
  const args = {
    scene: scene as unknown as UseSceneTreeControllerArgs['scene'],
    cm: null,
    activeSceneId: 7,
    activeMolViewId: molView.length ? molView[0] : 5,
  };
  return makeRenderHook(() => useSceneTreeController(args));
}

beforeEach(() => {
  vi.clearAllMocks();
  scope.clear();
  ctxMenu.opts = null;
});

describe('useSceneTreeController bundle', () => {
  it('routes the selection gestures straight to useSceneTree', () => {
    const scene = makeScene({ tree: node({ id: 1, type: 'scene', name: 'S' }) });
    const h = renderController(scene);
    const a = h.result.actions;
    a.select('1');
    expect(scene.setSelectedId).toHaveBeenCalledWith('1');
    a.toggleSelect('2');
    expect(scene.toggleInSelection).toHaveBeenCalledWith('2');
    a.selectRange('3', ['1', '2', '3'], true);
    expect(scene.selectRangeTo).toHaveBeenCalledWith('3', ['1', '2', '3'], true);
    const move = { kind: 'object', sourceId: 1, targetId: 2, ori: 1 };
    a.moveNode(move as never);
    expect(scene.moveSceneNode).toHaveBeenCalledWith(move);
    expect(h.result.editingNodeId).toBeNull();
    h.unmount();
  });

  it('keeps the bundle identity while the selection changes', () => {
    // The actions context must not re-render every row on a click: the
    // handlers read the selection through a ref instead of capturing it.
    const scene = makeScene({ tree: node({ id: 1, type: 'scene', name: 'S' }), selectedId: '' });
    const h = renderController(scene);
    const first = h.result.actions;
    scene.selectedId = '1';
    scene.selectedIds = new Set(['1']);
    h.rerender();
    expect(h.result.actions).toBe(first);
    h.unmount();
  });

  it('hands the context menu the live selection', () => {
    const selectedIds = new Set(['42', '43']);
    const scene = makeScene({ selectedIds });
    const h = renderController(scene);
    expect(ctxMenu.opts).toMatchObject({ sceneId: 7, selectedIds });
    act(() => h.result.actions.showContextMenu(node({ id: 42, type: 'object' }), 1, 2));
    expect(ctxMenu.open).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), 1, 2);
    h.unmount();
  });
});

// The toolbar, the keyboard and the context menu all land on the same
// commands; only their target differs.
describe('useSceneTreeController gestures dispatch commands', () => {
  it('visibility and property act on the row they were given', () => {
    const h = renderController(makeScene());
    act(() => h.result.actions.toggleVisibility('42'));
    expect(dispatch).toHaveBeenCalledWith(CmdId.SceneNodeSetVisible, { ids: ['42'] });
    act(() => h.result.actions.showProperty('42'));
    expect(dispatch).toHaveBeenCalledWith(CmdId.SceneNodeProperty, { id: '42' });
    h.unmount();
  });

  it('Delete takes the whole multi-selection, or just the row', () => {
    const multi = makeScene({ selectedIds: new Set(['42', '43']) });
    const h = renderController(multi);
    act(() => h.result.actions.deleteSelected('42'));
    expect(dispatch).toHaveBeenCalledWith(CmdId.SceneNodeDelete, { ids: ['42', '43'] });
    h.unmount();

    dispatch.mockClear();
    const single = makeScene({ selectedIds: new Set(['42']) });
    const h2 = renderController(single);
    act(() => h2.result.actions.deleteSelected('42'));
    expect(dispatch).toHaveBeenCalledWith(CmdId.SceneNodeDelete, { ids: ['42'] });
    h2.unmount();
  });

  it('Add dispatches by the selected row type, as UXP onNewCmd did', () => {
    const onObject = makeScene({ selectedNode: node({ id: 42, type: 'object', name: 'mol1' }) });
    const h = renderController(onObject);
    act(() => h.result.actions.addSelected());
    expect(dispatch).toHaveBeenCalledWith(CmdId.RendererNew, { sourceNodeId: '42' });
    h.unmount();

    dispatch.mockClear();
    const onCamera = makeScene({ selectedNode: node({ id: -3, type: 'camera', name: 'cam1' }) });
    const h2 = renderController(onCamera);
    act(() => h2.result.actions.addSelected());
    expect(dispatch).toHaveBeenCalledWith(CmdId.CameraNew);
    h2.unmount();

    dispatch.mockClear();
    const onStyle = makeScene({ selectedNode: node({ id: 7, type: 'style', name: 'st' }) });
    const h3 = renderController(onStyle);
    act(() => h3.result.actions.addSelected());
    expect(dispatch).not.toHaveBeenCalled();
    h3.unmount();
  });

  it('a double-click applies a camera, and opens the inspector for anything else', () => {
    const h = renderController(makeScene());
    act(() => h.result.actions.nodeDoubleClick(node({ id: -3, type: 'camera', name: 'cam1' })));
    expect(dispatch).toHaveBeenCalledWith(CmdId.CameraApplyToView, {
      name: 'cam1', withVisFlags: true,
    });

    dispatch.mockClear();
    act(() => h.result.actions.nodeDoubleClick(node({ id: 42, type: 'object', name: 'mol1' })));
    expect(dispatch).toHaveBeenCalledWith(CmdId.SceneNodeProperty, { id: '42' });

    // The synthesised container rows do nothing.
    dispatch.mockClear();
    act(() => h.result.actions.nodeDoubleClick(node({ id: -1, type: 'cameraRoot', name: 'Cameras' })));
    act(() => h.result.actions.nodeDoubleClick(node({ id: -2, type: 'styleRoot', name: 'Styles' })));
    expect(dispatch).not.toHaveBeenCalled();
    h.unmount();
  });

  it('focus needs an active molview', () => {
    const scene = makeScene();
    const h = renderController(scene, 9);
    act(() => h.result.actions.focusSelected('42'));
    expect(scene.focusNode).toHaveBeenCalledWith(9, '42');
    h.unmount();

    const scene2 = makeScene();
    const h2 = renderController(scene2, undefined);
    act(() => h2.result.actions.focusSelected('42'));
    expect(scene2.focusNode).not.toHaveBeenCalled();
    h2.unmount();
  });
});

describe('useSceneTreeController inline-rename commit', () => {
  it('routes a camera row through renameCamera', () => {
    const scene = makeScene();
    const h = renderController(scene);
    act(() => {
      h.result.actions.commitInlineRename(node({ id: -3, type: 'camera', name: 'cam1' }), 'cam-new');
    });
    expect(scene.renameCamera).toHaveBeenCalledWith('cam1', 'cam-new');
    expect(scene.renameNode).not.toHaveBeenCalled();
    h.unmount();
  });

  it('routes a non-camera row through renameNode (keyed by node id)', () => {
    const scene = makeScene();
    const h = renderController(scene);
    act(() => {
      h.result.actions.commitInlineRename(node({ id: 42, type: 'object', name: 'mol1' }), 'mol-new');
    });
    expect(scene.renameNode).toHaveBeenCalledWith('42', 'mol-new');
    expect(scene.renameCamera).not.toHaveBeenCalled();
    h.unmount();
  });

  it('opens and closes the editor', () => {
    const h = renderController(makeScene());
    act(() => h.result.actions.beginInlineRename('42'));
    expect(h.result.editingNodeId).toBe('42');
    act(() => h.result.actions.cancelInlineRename());
    expect(h.result.editingNodeId).toBeNull();
    h.unmount();
  });
});

describe('useSceneTreeController expand/collapse persistence', () => {
  it('persists object / rendGroup rows via setNodeUiCollapsed', () => {
    const scene = makeScene();
    const h = renderController(scene);
    act(() => {
      h.result.actions.nodeExpandChange(node({ id: 50, type: 'rendGroup', name: 'g1' }), true);
    });
    expect(scene.setNodeUiCollapsed).toHaveBeenCalledWith('50', true);
    act(() => {
      h.result.actions.nodeExpandChange(node({ id: 10, type: 'object', name: 'mol1' }), false);
    });
    expect(scene.setNodeUiCollapsed).toHaveBeenCalledWith('10', false);
    h.unmount();
  });

  it('ignores synthesised rows and non-persistable node types', () => {
    const scene = makeScene();
    const h = renderController(scene);
    act(() => {
      h.result.actions.nodeExpandChange(node({ id: -1, type: 'cameraRoot', name: 'Cameras' }), true);
      h.result.actions.nodeExpandChange(node({ id: -2, type: 'styleRoot', name: 'Styles' }), true);
      // Negative-id guard also applies to otherwise-persistable types.
      h.result.actions.nodeExpandChange(node({ id: -5, type: 'object', name: 'x' }), true);
      h.result.actions.nodeExpandChange(node({ id: 1, type: 'scene', name: 'S' }), true);
    });
    expect(scene.setNodeUiCollapsed).not.toHaveBeenCalled();
    h.unmount();
  });
});

// --- Keyboard clipboard scope (Cmd+C / X / V over the scene tree) ---

describe('useSceneTreeController clipboard scope', () => {
  /** Mount the controller and hand back the registered scope handlers. */
  function mountScope(scene: Scene) {
    const h = renderController(scene);
    const handlers = scope.get('scene-tree');
    if (!handlers) throw new Error('scene-tree scope was not registered');
    return { h, handlers };
  }

  it('registers under the id ScenePane tags its wrapper with', () => {
    const { h } = mountScope(makeScene());
    expect(scope.has('scene-tree')).toBe(true);
    h.unmount();
  });

  it('copies the selection -- one row, or the whole multi-selection', async () => {
    const { h, handlers } = mountScope(makeScene({ selectedId: '42' }));
    await act(async () => { handlers.copy(); });
    expect(dispatch).toHaveBeenCalledWith(CmdId.SceneNodeCopy, { ids: ['42'] });
    h.unmount();

    dispatch.mockClear();
    const multi = mountScope(makeScene({ selectedId: '42', selectedIds: new Set(['42', '43']) }));
    await act(async () => { multi.handlers.copy(); });
    expect(dispatch).toHaveBeenCalledWith(CmdId.SceneNodeCopy, { ids: ['42', '43'] });
    multi.h.unmount();
  });

  it('cuts by copying first and deleting only once the copy landed', async () => {
    dispatch.mockResolvedValue(true);
    const { h, handlers } = mountScope(makeScene({ selectedId: '42' }));
    await act(async () => { handlers.cut(); });
    expect(dispatch).toHaveBeenNthCalledWith(1, CmdId.SceneNodeCopy, { ids: ['42'] });
    expect(dispatch).toHaveBeenNthCalledWith(2, CmdId.SceneNodeDelete, { ids: ['42'] });
    h.unmount();
  });

  it('does NOT delete when the copy was refused', async () => {
    // Losing the selection to a clipboard write that never happened would be
    // unrecoverable from the user's point of view.
    dispatch.mockResolvedValue(false);
    const { h, handlers } = mountScope(makeScene({ selectedId: '42' }));
    await act(async () => { handlers.cut(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(CmdId.SceneNodeCopy, { ids: ['42'] });
    h.unmount();
  });

  it('pastes onto the selected row, and no-ops without a selection', async () => {
    const { h, handlers } = mountScope(makeScene({ selectedId: '42' }));
    await act(async () => { handlers.paste(); });
    expect(dispatch).toHaveBeenCalledWith(CmdId.SceneNodePaste, { targetId: '42' });
    h.unmount();

    dispatch.mockClear();
    const empty = mountScope(makeScene({ selectedId: '' }));
    await act(async () => { empty.handlers.paste(); });
    expect(dispatch).not.toHaveBeenCalled();
    empty.h.unmount();
  });
});
