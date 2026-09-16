/**
 * @file plugins/pymconsole/worker/commands/viewCommands.ts
 * @description Moving the camera, and storing where it was.
 *
 * None of these are undoable, matching both PyMOL and CueMol: camera
 * manipulation is transient view state, not a scene edit (ADR-0025). `view`
 * is the exception -- storing one creates a camera, which is a scene object.
 *
 * CueMol has no "fit everything" primitive; `fitView` belongs to an object.
 * So `zoom` and `center` without an object fit the first one in the scene and
 * say so, rather than silently doing something else than PyMOL would.
 */

import type { GUIView } from '@cuemol/core/src/wrappers/GUIView'
import type { Quat } from '@cuemol/core/src/wrappers/Quat'
import {
  applyCameraToView,
  destroyCamera,
  saveViewToCamera,
} from '@renderer/worker/server/services/camera/cameraOps'
import { focusOnNode } from '@renderer/worker/server/services/sceneTree/sceneOps'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import {
  centerMolSelection,
  zoomMolSelection,
} from '@renderer/worker/server/services/select/applyMolSelString'
import { rotateView, translateView } from '@renderer/worker/server/services/view/viewXform'
import { translateSelection } from '../sel/translate'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { ALL, formatNameList, isDefaulted, molecules, resolveObjects, toNumber } from './helpers'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

/** The axis letters `turn` and `move` accept. */
type Axis = 'x' | 'y' | 'z'

function toAxis(raw: string): Axis | null {
  const a = raw.trim().toLowerCase()
  return a === 'x' || a === 'y' || a === 'z' ? a : null
}

/**
 * Fit or centre the view on what `pattern` names.
 *
 * An object name frames the object; anything else is read as a selection and
 * framed through the molecule it matches. With no argument PyMOL fits
 * everything, which CueMol has no primitive for (`fitView` belongs to an
 * object), so that becomes the first object with a warning -- an honest
 * partial beats quietly framing one object and calling it "all".
 */
function fitTo(
  ctx: WorkerContext,
  cc: CmdContext,
  pattern: string,
  mode: 'zoom' | 'center',
): CmdOutcome {
  const wanted = pattern.trim()
  const wantsAll = wanted === '' || wanted === ALL || wanted === '*'
  const named = wantsAll ? resolveObjects(ctx, cc.sceneId, 'all') : resolveObjects(ctx, cc.sceneId, wanted)

  if (named.length > 0) {
    if (wantsAll && named.length > 1) {
      cc.warn(`fitting "${named[0].name}" only: fitting every object at once is not supported`)
    }
    const res = focusOnNode(ctx, {
      sceneId: cc.sceneId,
      viewId: cc.viewId,
      nodeId: named[0].uid,
      nodeType: 'object',
    })
    if (!res.ok) return { ok: false, error: `Error: cannot fit the view to "${named[0].name}"` }
    return { ok: true }
  }
  if (wantsAll) return { ok: false, error: 'Error: the scene is empty' }

  // Not an object: read it as a selection.
  const translated = translateSelection(wanted)
  if (!translated.ok) return translated
  const mols = molecules(ctx, cc.sceneId)
  if (mols.length === 0) return { ok: false, error: 'Error: no molecule in the scene' }
  if (mols.length > 1) {
    cc.warn(`framing "${mols[0].name}" only: a selection spanning objects is not supported`)
  }
  const args = {
    sceneId: cc.sceneId,
    viewId: cc.viewId,
    molId: mols[0].uid,
    selStr: translated.expr,
  }
  const res = mode === 'zoom' ? zoomMolSelection(ctx, args) : centerMolSelection(ctx, args)
  return res.ok ? { ok: true } : { ok: false, error: `Error: "${wanted}" matched nothing` }
}

const zoom: PymCommand = {
  name: 'zoom',
  params: [
    { name: 'selection', default: 'all' },
    { name: 'buffer', default: '0.0' },
    { name: 'state', default: '0' },
    { name: 'complete', default: '0' },
    { name: 'animate', default: '0' },
  ],
  mode: 'strict',
  mutates: false,
  summary: 'Fit the view to an object or a selection.',
  completions: [{ source: 'selections', description: 'selection', suffix: '' }],
  run(ctx, args, cc) {
    for (const [name, def] of [
      ['buffer', '0.0'],
      ['state', '0'],
      ['complete', '0'],
      ['animate', '0'],
    ] as const) {
      if (!isDefaulted(args[name], def)) cc.warn(`zoom: ${name} is ignored (not supported)`)
    }
    return fitTo(ctx, cc, args.selection, 'zoom')
  },
}

const center: PymCommand = {
  name: 'center',
  params: [
    { name: 'selection', default: 'all' },
    { name: 'state', default: '0' },
    { name: 'origin', default: '1' },
    { name: 'animate', default: '0' },
  ],
  mode: 'strict',
  mutates: false,
  summary: 'Centre the view on an object or a selection.',
  completions: [{ source: 'selections', description: 'selection', suffix: '' }],
  run(ctx, args, cc) {
    for (const [name, def] of [
      ['state', '0'],
      ['origin', '1'],
      ['animate', '0'],
    ] as const) {
      if (!isDefaulted(args[name], def)) cc.warn(`center: ${name} is ignored (not supported)`)
    }
    return fitTo(ctx, cc, args.selection, 'center')
  },
}

const reset: PymCommand = {
  name: 'reset',
  params: [{ name: 'object', default: '' }],
  mode: 'strict',
  mutates: false,
  summary: 'Reset the camera rotation and fit the view.',
  run(ctx, args, cc) {
    const view = ctx.sceMgr.getView(cc.viewId) as GUIView | null
    if (!view) return { ok: false, error: 'Error: no active view' }
    const quat = ctx.svc.createObj('Quat') as unknown as Quat | null
    if (!quat) return { ok: false, error: 'Error: could not reset the rotation' }
    quat.a = 1
    quat.x = 0
    quat.y = 0
    quat.z = 0
    ;(view as unknown as { setRotQuat: (q: unknown) => void }).setRotQuat(quat)
    return fitTo(ctx, cc, args.object, 'zoom')
  },
}

const turn: PymCommand = {
  name: 'turn',
  params: [{ name: 'axis' }, { name: 'angle' }],
  mode: 'strict',
  mutates: false,
  summary: 'Rotate the camera about an axis, in degrees.',
  run(ctx, args, cc) {
    const axis = toAxis(args.axis)
    if (axis === null) return { ok: false, error: `Error: axis must be x, y or z: "${args.axis}"` }
    const angle = toNumber(args.angle)
    if (angle === null) return { ok: false, error: `Error: angle must be a number: "${args.angle}"` }
    const res = rotateView(ctx, {
      viewId: cc.viewId,
      rotX: axis === 'x' ? angle : 0,
      rotY: axis === 'y' ? angle : 0,
      rotZ: axis === 'z' ? angle : 0,
    })
    return res.ok ? { ok: true } : { ok: false, error: 'Error: no active view' }
  },
}

const move: PymCommand = {
  name: 'move',
  params: [{ name: 'axis' }, { name: 'distance' }],
  mode: 'strict',
  mutates: false,
  summary: 'Translate the camera along an axis.',
  run(ctx, args, cc) {
    const axis = toAxis(args.axis)
    if (axis === null) return { ok: false, error: `Error: axis must be x, y or z: "${args.axis}"` }
    const dist = toNumber(args.distance)
    if (dist === null) {
      return { ok: false, error: `Error: distance must be a number: "${args.distance}"` }
    }
    const res = translateView(ctx, {
      viewId: cc.viewId,
      dx: axis === 'x' ? dist : 0,
      dy: axis === 'y' ? dist : 0,
      dz: axis === 'z' ? dist : 0,
    })
    return res.ok ? { ok: true } : { ok: false, error: 'Error: no active view' }
  },
}

/** The camera names stored in the scene, sorted. */
export function storedCameraNames(ctx: WorkerContext, sceneId: number): string[] {
  const scene = getSceneOrNull(ctx, sceneId)
  if (!scene) return []
  try {
    const raw = JSON.parse(scene.getCameraInfoJSON()) as { name?: string }[]
    return raw
      .map((c) => c.name ?? '')
      .filter((n) => n !== '')
      .sort()
  } catch {
    return []
  }
}

const view: PymCommand = {
  name: 'view',
  params: [
    { name: 'key' },
    { name: 'action', default: 'recall' },
    { name: 'animate', default: '-1' },
  ],
  mode: 'strict',
  // Storing or clearing writes a camera to the scene; recalling does not.
  mutates: false,
  summary: 'Store, recall and clear named camera views.',
  completions: [
    { source: 'cameras', description: 'view', suffix: '' },
    { source: 'viewActions', description: 'view action', suffix: '' },
  ],
  run(ctx, args, cc) {
    if (!isDefaulted(args.animate, '-1')) cc.warn('view: animate is ignored (not supported)')
    const action = args.action.trim().toLowerCase()
    const key = args.key.trim()

    if (key === '*') {
      if (action === 'clear') {
        for (const name of storedCameraNames(ctx, cc.sceneId)) {
          destroyCamera(ctx, { sceneId: cc.sceneId, name })
        }
        cc.markMutated()
        return { ok: true }
      }
      cc.print(' view: stored views:')
      cc.print(formatNameList(storedCameraNames(ctx, cc.sceneId)))
      return { ok: true }
    }

    switch (action) {
      case 'store':
      case 'update': {
        const res = saveViewToCamera(ctx, {
          sceneId: cc.sceneId,
          viewId: cc.viewId,
          name: key,
        })
        if (!res.ok) return { ok: false, error: `Error: could not store view "${key}"` }
        cc.markMutated()
        cc.print(` view: "${key}" stored.`)
        return { ok: true }
      }
      case 'recall': {
        const res = applyCameraToView(ctx, { sceneId: cc.sceneId, viewId: cc.viewId, name: key })
        if (!res.ok) return { ok: false, error: `Error: no view named "${key}"` }
        cc.print(` view: "${key}" recalled.`)
        return { ok: true }
      }
      case 'clear': {
        const res = destroyCamera(ctx, { sceneId: cc.sceneId, name: key })
        if (!res.ok) return { ok: false, error: `Error: no view named "${key}"` }
        cc.markMutated()
        return { ok: true }
      }
      default:
        return { ok: false, error: `Error: action must be store, recall or clear: "${action}"` }
    }
  },
}

const refresh: PymCommand = {
  name: 'refresh',
  params: [],
  mode: 'strict',
  mutates: false,
  summary: 'Redraw the view.',
  run(ctx, _args, cc) {
    const guiView = ctx.sceMgr.getView(cc.viewId) as GUIView | null
    if (!guiView) return { ok: false, error: 'Error: no active view' }
    guiView.invalidate()
    return { ok: true }
  },
}

export const VIEW_COMMANDS: PymCommand[] = [zoom, center, reset, turn, move, view, refresh]
