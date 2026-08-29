/**
 * @file state/sceneTree/commands/sceneCtxActionToCommand.ts
 * @description Turn a context-menu action into a command.
 *
 * `SceneCtxAction` stays the wire type of the menu itself (main builds the
 * template from it and hands one back), but it stops being a second dispatch
 * table: this resolves the action against the row it was raised on and
 * returns the command to run, with its arguments already resolved. Every
 * entry point -- the menu, the tree toolbar, the keyboard -- then lands on
 * the same handler.
 *
 * Pure and synchronous. The node-type gates live here, so an action that
 * does not apply to the row (a `selectMol` on a renderer, a camera action on
 * a style) returns null and nothing is dispatched.
 */

import type { SceneCtxAction } from '@shared/types/sceneCtxMenu'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import { CmdId } from '@renderer/commands/ids'
import type { CommandArgs, CommandKey } from '@renderer/commands/CommandMap'

/** A command and the arguments to dispatch it with. */
export type CommandInvocation = {
  [K in CommandKey]: CommandArgs<K> extends void
    ? { id: K; args?: undefined }
    : { id: K; args: CommandArgs<K> }
}[CommandKey]

/** Build the invocation for `action` on `node`, or null when it does not apply. */
export function sceneCtxActionToCommand(
  node: SceneTreeNode,
  action: SceneCtxAction,
  selectedIds?: Set<string>,
): CommandInvocation | null {
  const id = String(node.id)
  const type = node.type
  /** The style-set reference a style row carries. */
  const styleRef = () =>
    type === 'style' && node.styleInfo?.scopeId !== undefined
      ? { id, scopeId: node.styleInfo.scopeId, name: node.name }
      : null

  switch (action.kind) {
    // --- Node operations (also reachable from the toolbar and the keyboard) ---
    // Show / Hide flip the row's own flag; the multi variants set an explicit
    // one across the selection.
    case 'show':
    case 'hide':
      return { id: CmdId.SceneNodeSetVisible, args: { ids: [id] } }
    case 'multiShow':
      return { id: CmdId.SceneNodeSetVisible, args: { ids: [...(selectedIds ?? [])], visible: true } }
    case 'multiHide':
      return { id: CmdId.SceneNodeSetVisible, args: { ids: [...(selectedIds ?? [])], visible: false } }
    case 'delete':
      return { id: CmdId.SceneNodeDelete, args: { ids: [id] } }
    case 'multiDelete':
      return { id: CmdId.SceneNodeDelete, args: { ids: [...(selectedIds ?? [])] } }
    case 'copy':
      return { id: CmdId.SceneNodeCopy, args: { ids: [id] } }
    case 'multiCopy':
      return { id: CmdId.SceneNodeCopy, args: { ids: [...(selectedIds ?? [])] } }
    case 'paste':
      return { id: CmdId.SceneNodePaste, args: { targetId: id } }
    case 'rename':
      return { id: CmdId.SceneNodeRenameBegin, args: { id } }
    case 'property':
      return { id: CmdId.SceneNodeProperty, args: { id } }
    case 'selectMol':
      return type === 'object'
        ? { id: CmdId.SceneNodeSelectMol, args: { id, selectKind: action.selectKind } }
        : null

    // --- Scene ---
    case 'setSceneBgColor':
      if (type !== 'scene') return null
      return { id: action.color === 'white' ? CmdId.SceneBgWhite : CmdId.SceneBgBlack }
    case 'toggleColorProofing':
      return type === 'scene' ? { id: CmdId.SceneColorProof } : null

    // --- Object ---
    case 'saveAsObject':
      return type === 'object' ? { id: CmdId.ObjectSaveAs, args: { objId: node.id } } : null
    case 'regenSurface':
      return type === 'object' ? { id: CmdId.ObjectRegenSurface, args: { objId: id } } : null
    case 'newRendGroup':
      return type === 'object' ? { id: CmdId.RendererNewGroup, args: { objId: id } } : null

    // --- Renderers ---
    case 'newRenderer':
      return { id: CmdId.RendererNew, args: { sourceNodeId: id } }
    case 'setRendColoring':
      return type === 'renderer'
        ? { id: CmdId.RendererSetColoring, args: { id, coloringId: action.coloringId } }
        : null
    // UXP's `onPaintMol` is shared between the object and renderer Paint
    // menus; the handler branches on the row type.
    case 'paintRend':
      return type === 'object' || type === 'renderer'
        ? { id: CmdId.RendererPaint, args: { id, colorValue: action.colorValue } }
        : null
    case 'applyRendStyle':
      return type === 'renderer'
        ? {
            id: CmdId.RendererApplyStyle,
            args: { id, styleName: action.styleName, pattern: action.pattern, flags: action.flags },
          }
        : null
    case 'setRendSel':
      return type === 'renderer'
        ? { id: CmdId.RendererSetSelection, args: { id, selKind: action.selKind } }
        : null
    case 'generateSurfObj':
      return type === 'renderer' ? { id: CmdId.RendererGenSurfObj, args: { id } } : null
    case 'changeRendType':
      return type === 'renderer'
        ? { id: CmdId.RendererChangeType, args: { id, typeName: action.typeName } }
        : null
    case 'editRendStyle':
      return type === 'renderer' ? { id: CmdId.RendererEditStyle, args: { id } } : null
    case 'createRendStyle':
      return type === 'renderer' ? { id: CmdId.RendererCreateStyle, args: { id } } : null
    case 'editInteractionList':
      return type === 'renderer'
        ? { id: CmdId.RendererEditIntrList, args: { id, rendName: node.name } }
        : null

    // --- Style sets ---
    case 'newStyle':
      return type === 'style' || type === 'styleRoot' ? { id: CmdId.StyleNew } : null
    case 'styleLoad':
      return { id: CmdId.StyleLoadFromFile }
    case 'styleReload':
      return { id: CmdId.StyleReload }
    case 'editStyle': {
      const ref = styleRef()
      return ref ? { id: CmdId.StyleEdit, args: ref } : null
    }
    case 'styleToggleReadOnly': {
      const ref = styleRef()
      return ref ? { id: CmdId.StyleToggleReadOnly, args: { id: ref.id, scopeId: ref.scopeId } } : null
    }
    case 'styleSave': {
      const ref = styleRef()
      return ref ? { id: CmdId.StyleSave, args: ref } : null
    }
    case 'styleSaveAs': {
      const ref = styleRef()
      return ref ? { id: CmdId.StyleSaveAs, args: ref } : null
    }

    // --- Cameras ---
    case 'newCamera':
      return type === 'camera' || type === 'cameraRoot' ? { id: CmdId.CameraNew } : null
    case 'cameraLoad':
      return { id: CmdId.CameraLoadFromFile }
    case 'cameraReload':
      return type === 'camera' ? { id: CmdId.CameraReload, args: { name: node.name } } : null
    case 'cameraSave':
      return type === 'camera' ? { id: CmdId.CameraSave, args: { name: node.name } } : null
    case 'cameraSaveAs':
      return type === 'camera' ? { id: CmdId.CameraSaveAs, args: { name: node.name } } : null
    case 'cameraSaveFromView':
      return type === 'camera'
        ? { id: CmdId.CameraSaveFromView, args: { name: node.name, withVisFlags: action.withVisFlags } }
        : null
    case 'cameraApplyToView':
      return type === 'camera'
        ? { id: CmdId.CameraApplyToView, args: { name: node.name, withVisFlags: action.withVisFlags } }
        : null
    case 'cameraEditVisFlags':
      return type === 'camera' ? { id: CmdId.CameraEditVisFlags, args: { name: node.name } } : null
    case 'cameraClearVisFlags':
      return type === 'camera' ? { id: CmdId.CameraClearVisFlags, args: { name: node.name } } : null
  }
}
