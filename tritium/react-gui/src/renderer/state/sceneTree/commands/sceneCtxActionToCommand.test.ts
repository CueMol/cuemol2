/**
 * @file state/sceneTree/commands/sceneCtxActionToCommand.test.ts
 * @description The context menu's action-to-command table.
 *
 * Every entry the menu can return, mapped against the row it was raised on.
 * The gates matter as much as the mappings: an action that does not apply to
 * a row must resolve to nothing rather than act on the wrong thing.
 */

import { describe, it, expect } from 'vitest'
import type { SceneCtxAction } from '@shared/types/sceneCtxMenu'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import { CmdId } from '@renderer/commands/ids'
import { sceneCtxActionToCommand } from './sceneCtxActionToCommand'

const node = (partial: Partial<SceneTreeNode>): SceneTreeNode =>
  ({ children: [], visible: true, name: 'n', ...partial }) as SceneTreeNode

const scene = node({ id: 1, type: 'scene', name: 'S' })
const object = node({ id: 42, type: 'object', name: 'mol1' })
const renderer = node({ id: 100, type: 'renderer', name: 'simple1' })
const rendGroup = node({ id: 50, type: 'rendGroup', name: 'grp' })
const camera = node({ id: -3, type: 'camera', name: 'cam1' })
const cameraRoot = node({ id: -1, type: 'cameraRoot', name: 'Cameras' })
const style = node({ id: 7, type: 'style', name: 'st1', styleInfo: { scopeId: 3 } as never })
const styleRoot = node({ id: -2, type: 'styleRoot', name: 'Styles' })

const map = (n: SceneTreeNode, a: SceneCtxAction, sel?: Set<string>) =>
  sceneCtxActionToCommand(n, a, sel)

describe('sceneCtxActionToCommand - node operations', () => {
  it('maps the row operations onto the shared node commands', () => {
    expect(map(object, { kind: 'show' })).toEqual({ id: CmdId.SceneNodeSetVisible, args: { ids: ['42'] } })
    expect(map(object, { kind: 'hide' })).toEqual({ id: CmdId.SceneNodeSetVisible, args: { ids: ['42'] } })
    expect(map(object, { kind: 'delete' })).toEqual({ id: CmdId.SceneNodeDelete, args: { ids: ['42'] } })
    expect(map(object, { kind: 'copy' })).toEqual({ id: CmdId.SceneNodeCopy, args: { ids: ['42'] } })
    expect(map(object, { kind: 'paste' })).toEqual({ id: CmdId.SceneNodePaste, args: { targetId: '42' } })
    expect(map(object, { kind: 'rename' })).toEqual({ id: CmdId.SceneNodeRenameBegin, args: { id: '42' } })
    expect(map(object, { kind: 'property' })).toEqual({ id: CmdId.SceneNodeProperty, args: { id: '42' } })
  })

  it('the multi entries act on the selection, with an explicit visibility', () => {
    const sel = new Set(['42', '43'])
    expect(map(object, { kind: 'multiShow' }, sel)).toEqual({
      id: CmdId.SceneNodeSetVisible, args: { ids: ['42', '43'], visible: true },
    })
    expect(map(object, { kind: 'multiHide' }, sel)).toEqual({
      id: CmdId.SceneNodeSetVisible, args: { ids: ['42', '43'], visible: false },
    })
    expect(map(object, { kind: 'multiDelete' }, sel)).toEqual({
      id: CmdId.SceneNodeDelete, args: { ids: ['42', '43'] },
    })
    expect(map(object, { kind: 'multiCopy' }, sel)).toEqual({
      id: CmdId.SceneNodeCopy, args: { ids: ['42', '43'] },
    })
  })

  it('a single-row Show stays on that row even inside a selection', () => {
    // The per-row entries come from the single-row menu; only the multi
    // entries mean "everything selected".
    expect(map(object, { kind: 'show' }, new Set(['42', '43']))).toEqual({
      id: CmdId.SceneNodeSetVisible, args: { ids: ['42'] },
    })
  })

  it('selectMol is object-only', () => {
    expect(map(object, { kind: 'selectMol', selectKind: 'all' })).toEqual({
      id: CmdId.SceneNodeSelectMol, args: { id: '42', selectKind: 'all' },
    })
    expect(map(renderer, { kind: 'selectMol', selectKind: 'all' })).toBeNull()
  })
})

describe('sceneCtxActionToCommand - scene and object', () => {
  it('the scene entries alias the Scene menu commands', () => {
    expect(map(scene, { kind: 'setSceneBgColor', color: 'white' })).toEqual({ id: CmdId.SceneBgWhite })
    expect(map(scene, { kind: 'setSceneBgColor', color: 'black' })).toEqual({ id: CmdId.SceneBgBlack })
    expect(map(scene, { kind: 'toggleColorProofing' })).toEqual({ id: CmdId.SceneColorProof })
    // ... and only on a scene row.
    expect(map(object, { kind: 'setSceneBgColor', color: 'white' })).toBeNull()
    expect(map(object, { kind: 'toggleColorProofing' })).toBeNull()
  })

  it('Save As names the right-clicked object, so no picker is needed', () => {
    expect(map(object, { kind: 'saveAsObject' })).toEqual({
      id: CmdId.ObjectSaveAs, args: { objId: 42 },
    })
    expect(map(renderer, { kind: 'saveAsObject' })).toBeNull()
  })

  it('the object-only entries are gated', () => {
    expect(map(object, { kind: 'regenSurface' })).toEqual({
      id: CmdId.ObjectRegenSurface, args: { objId: '42' },
    })
    expect(map(object, { kind: 'newRendGroup' })).toEqual({
      id: CmdId.RendererNewGroup, args: { objId: '42' },
    })
    expect(map(renderer, { kind: 'regenSurface' })).toBeNull()
    expect(map(renderer, { kind: 'newRendGroup' })).toBeNull()
  })
})

describe('sceneCtxActionToCommand - renderers', () => {
  it('New Renderer runs from any row the menu offers it on', () => {
    for (const n of [object, renderer, rendGroup]) {
      expect(map(n, { kind: 'newRenderer' })).toEqual({
        id: CmdId.RendererNew, args: { sourceNodeId: String(n.id) },
      })
    }
  })

  it('Paint is shared between the object and renderer menus (UXP onPaintMol)', () => {
    expect(map(object, { kind: 'paintRend', colorValue: '#f00' })).toEqual({
      id: CmdId.RendererPaint, args: { id: '42', colorValue: '#f00' },
    })
    expect(map(renderer, { kind: 'paintRend', colorValue: '#0f0' })).toEqual({
      id: CmdId.RendererPaint, args: { id: '100', colorValue: '#0f0' },
    })
    expect(map(camera, { kind: 'paintRend', colorValue: '#00f' })).toBeNull()
  })

  it('the renderer-only entries carry the row id and are gated', () => {
    expect(map(renderer, { kind: 'setRendColoring', coloringId: 'CPK' as never })).toEqual({
      id: CmdId.RendererSetColoring, args: { id: '100', coloringId: 'CPK' },
    })
    expect(map(renderer, { kind: 'applyRendStyle', styleName: 's', pattern: 'p', flags: 'f' })).toEqual({
      id: CmdId.RendererApplyStyle, args: { id: '100', styleName: 's', pattern: 'p', flags: 'f' },
    })
    expect(map(renderer, { kind: 'setRendSel', selKind: 'all' as never })).toEqual({
      id: CmdId.RendererSetSelection, args: { id: '100', selKind: 'all' },
    })
    expect(map(renderer, { kind: 'generateSurfObj' })).toEqual({
      id: CmdId.RendererGenSurfObj, args: { id: '100' },
    })
    expect(map(renderer, { kind: 'changeRendType', typeName: 'ribbon' })).toEqual({
      id: CmdId.RendererChangeType, args: { id: '100', typeName: 'ribbon' },
    })
    expect(map(renderer, { kind: 'editRendStyle' })).toEqual({
      id: CmdId.RendererEditStyle, args: { id: '100' },
    })
    expect(map(renderer, { kind: 'createRendStyle' })).toEqual({
      id: CmdId.RendererCreateStyle, args: { id: '100' },
    })
    expect(map(renderer, { kind: 'editInteractionList' })).toEqual({
      id: CmdId.RendererEditIntrList, args: { id: '100', rendName: 'simple1' },
    })
    for (const a of [
      { kind: 'setRendColoring', coloringId: 'CPK' },
      { kind: 'generateSurfObj' },
      { kind: 'editRendStyle' },
      { kind: 'editInteractionList' },
    ] as SceneCtxAction[]) {
      expect(map(object, a)).toBeNull()
    }
  })
})

describe('sceneCtxActionToCommand - style sets', () => {
  it('carries the uid, the scope and the name a style row holds', () => {
    const ref = { id: '7', scopeId: 3, name: 'st1' }
    expect(map(style, { kind: 'editStyle' })).toEqual({ id: CmdId.StyleEdit, args: ref })
    expect(map(style, { kind: 'styleSave' })).toEqual({ id: CmdId.StyleSave, args: ref })
    expect(map(style, { kind: 'styleSaveAs' })).toEqual({ id: CmdId.StyleSaveAs, args: ref })
    expect(map(style, { kind: 'styleToggleReadOnly' })).toEqual({
      id: CmdId.StyleToggleReadOnly, args: { id: '7', scopeId: 3 },
    })
  })

  it('a row without a scope resolves to nothing', () => {
    const scopeless = node({ id: 7, type: 'style', name: 'st1' })
    expect(map(scopeless, { kind: 'editStyle' })).toBeNull()
    expect(map(scopeless, { kind: 'styleSave' })).toBeNull()
  })

  it('New Style runs from a style row or the Styles root', () => {
    expect(map(style, { kind: 'newStyle' })).toEqual({ id: CmdId.StyleNew })
    expect(map(styleRoot, { kind: 'newStyle' })).toEqual({ id: CmdId.StyleNew })
    expect(map(object, { kind: 'newStyle' })).toBeNull()
  })

  it('Load and Reload need no row', () => {
    expect(map(styleRoot, { kind: 'styleLoad' })).toEqual({ id: CmdId.StyleLoadFromFile })
    expect(map(styleRoot, { kind: 'styleReload' })).toEqual({ id: CmdId.StyleReload })
  })
})

describe('sceneCtxActionToCommand - cameras', () => {
  it('addresses cameras by name (a registered camera has no uid)', () => {
    expect(map(camera, { kind: 'cameraReload' })).toEqual({ id: CmdId.CameraReload, args: { name: 'cam1' } })
    expect(map(camera, { kind: 'cameraSave' })).toEqual({ id: CmdId.CameraSave, args: { name: 'cam1' } })
    expect(map(camera, { kind: 'cameraSaveAs' })).toEqual({ id: CmdId.CameraSaveAs, args: { name: 'cam1' } })
    expect(map(camera, { kind: 'cameraSaveFromView', withVisFlags: true })).toEqual({
      id: CmdId.CameraSaveFromView, args: { name: 'cam1', withVisFlags: true },
    })
    expect(map(camera, { kind: 'cameraApplyToView', withVisFlags: false })).toEqual({
      id: CmdId.CameraApplyToView, args: { name: 'cam1', withVisFlags: false },
    })
    expect(map(camera, { kind: 'cameraEditVisFlags' })).toEqual({
      id: CmdId.CameraEditVisFlags, args: { name: 'cam1' },
    })
    expect(map(camera, { kind: 'cameraClearVisFlags' })).toEqual({
      id: CmdId.CameraClearVisFlags, args: { name: 'cam1' },
    })
  })

  it('New Camera runs from a camera row or the Cameras root; Load needs neither', () => {
    expect(map(camera, { kind: 'newCamera' })).toEqual({ id: CmdId.CameraNew })
    expect(map(cameraRoot, { kind: 'newCamera' })).toEqual({ id: CmdId.CameraNew })
    expect(map(object, { kind: 'newCamera' })).toBeNull()
    expect(map(cameraRoot, { kind: 'cameraLoad' })).toEqual({ id: CmdId.CameraLoadFromFile })
  })

  it('the camera entries are gated to camera rows', () => {
    for (const a of [
      { kind: 'cameraReload' }, { kind: 'cameraSave' }, { kind: 'cameraSaveAs' },
      { kind: 'cameraSaveFromView', withVisFlags: true },
      { kind: 'cameraApplyToView', withVisFlags: true },
      { kind: 'cameraEditVisFlags' }, { kind: 'cameraClearVisFlags' },
    ] as SceneCtxAction[]) {
      expect(map(cameraRoot, a)).toBeNull()
      expect(map(object, a)).toBeNull()
    }
  })
})
