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
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'
import { getSelHitCount } from '@renderer/worker/server/services/select/getSelHitCount'
import { rotateView, translateView } from '@renderer/worker/server/services/view/viewXform'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { ALL, formatNameList, isDefaulted, moleculeSelections, resolveObjects, toNumber } from './helpers'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { camToPymol, formatViewMatrix, parseViewMatrix, pymolToCam } from './viewMatrix'
import { interpretShortcut } from '../parser/shortcut'
import type { CamState } from './viewMatrix'

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
    // `center` moves the centre only; fitting would change the zoom too.
    if (mode === 'center') {
      const mol = getSceneOrNull(ctx, cc.sceneId)?.getObject(named[0].uid) as unknown as FitMol | null
      const view = ctx.sceMgr.getView(cc.viewId) as unknown as FitView | null
      if (mol && view && typeof mol.getCenterPos === 'function') {
        view.setViewCenter(mol.getCenterPos(false))
        return { ok: true }
      }
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

  // Not an object: read it as a selection, inside the molecule it names.
  const sels = moleculeSelections(ctx, cc.sceneId, wanted)
  if (!sels.ok) return sels
  if (sels.items.length > 1) {
    cc.warn(`framing "${sels.items[0].obj.name}" only: a selection spanning objects is not supported`)
  }
  const { obj, selStr } = sels.items[0]
  const hits = getSelHitCount(ctx, { sceneId: cc.sceneId, molId: obj.uid, selStr })
  if (hits.count === null) return { ok: false, error: `Error: "${wanted}" did not compile` }
  if (hits.count === 0) return { ok: false, error: `Error: "${wanted}" matched nothing` }

  // The molecule's own selection is left alone: the GUI's zoom-to-selection
  // services set it first, which here would leave the matched atoms
  // highlighted after every zoom.
  const mol = getSceneOrNull(ctx, cc.sceneId)?.getObject(obj.uid) as unknown as FitMol | null
  const view = ctx.sceMgr.getView(cc.viewId) as unknown as FitView | null
  if (!mol || !view) return { ok: false, error: 'Error: no active view' }
  if (mode === 'zoom') {
    const sel = makeSel(ctx, selStr, cc.sceneId)
    if (!sel) return { ok: false, error: `Error: "${wanted}" did not compile` }
    mol.fitView2(view, sel)
    return { ok: true }
  }
  const center = selectionCenter(ctx, cc.sceneId, mol, selStr)
  if (!center) return { ok: false, error: `Error: "${wanted}" matched nothing` }
  view.setViewCenter(center)
  return { ok: true }
}

/** The members fitting and centring use, as the wrappers expose them. */
interface FitMol {
  fitView2(view: unknown, sel: unknown): void
  getCenterPos(fsel: boolean): unknown
}
interface FitView {
  setViewCenter(pos: unknown): void
}

interface AtomIter {
  target: unknown
  sel: unknown
  first(): void
  next(): void
  hasMore(): boolean
  get(): { pos: { x: number; y: number; z: number } }
}

/**
 * The centre of the atoms `selStr` matches, as a CueMol Vector.
 *
 * MolCoord.getCenterPos(true) reads the molecule's own selection, which
 * would have to be changed first; the atoms are averaged here instead.
 */
function selectionCenter(ctx: WorkerContext, sceneId: number, mol: unknown, selStr: string): unknown {
  const sel = makeSel(ctx, selStr, sceneId)
  const iter = ctx.svc.createObj('AtomIterator') as unknown as AtomIter | null
  const out = ctx.svc.createObj('Vector') as unknown as { x: number; y: number; z: number } | null
  if (!sel || !iter || !out) return null
  iter.target = mol
  iter.sel = sel
  let n = 0
  let x = 0
  let y = 0
  let z = 0
  for (iter.first(); iter.hasMore(); iter.next()) {
    const p = iter.get().pos
    x += p.x
    y += p.y
    z += p.z
    n += 1
  }
  if (n === 0) return null
  out.x = x / n
  out.y = y / n
  out.z = z / n
  return out
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

/**
 * `orient`: the principal axes of the atoms along the screen axes, then
 * framed. The axes are worked out by C++ (MolCoord.orientView), which the
 * GUI can use as well.
 */
const orient: PymCommand = {
  name: 'orient',
  params: [
    { name: 'selection', default: '(all)' },
    { name: 'state', default: '0' },
    { name: 'animate', default: '0' },
  ],
  mode: 'strict',
  mutates: false,
  summary: 'Turn the view to the principal axes of a selection, then fit it.',
  completions: [{ source: 'selections', description: 'selection', suffix: '' }],
  run(ctx, args, cc) {
    for (const [name, def] of [
      ['state', '0'],
      ['animate', '0'],
    ] as const) {
      if (!isDefaulted(args[name], def)) cc.warn(`orient: ${name} is ignored (not supported)`)
    }
    const sels = moleculeSelections(ctx, cc.sceneId, args.selection)
    if (!sels.ok) return sels
    if (sels.items.length === 0) return { ok: false, error: 'Error: the scene has no molecule' }
    if (sels.items.length > 1) {
      cc.warn(`orienting "${sels.items[0].obj.name}" only: a selection spanning objects is not supported`)
    }
    const { obj, selStr } = sels.items[0]
    const hits = getSelHitCount(ctx, { sceneId: cc.sceneId, molId: obj.uid, selStr })
    if (hits.count === null) return { ok: false, error: `Error: "${args.selection}" did not compile` }
    if (hits.count === 0) return { ok: false, error: `Error: "${args.selection}" matched nothing` }
    const mol = getSceneOrNull(ctx, cc.sceneId)?.getObject(obj.uid) as unknown as OrientMol | null
    const view = ctx.sceMgr.getView(cc.viewId)
    const sel = makeSel(ctx, selStr, cc.sceneId)
    if (!mol || !view) return { ok: false, error: 'Error: no active view' }
    if (!sel) return { ok: false, error: `Error: "${args.selection}" did not compile` }
    mol.orientView(view, sel)
    return { ok: true }
  },
}

/** The member `orient` uses, as the MolCoord wrapper exposes it. */
interface OrientMol {
  orientView(view: unknown, sel: unknown): void
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
    // PyMOL takes unique prefixes (`view v1, st`), as with command names.
    const asked = args.action.trim().toLowerCase()
    const found = interpretShortcut(asked, ['store', 'recall', 'clear'])
    if (found.kind === 'ambiguous') {
      return { ok: false, error: `Error: ambiguous view action "${asked}": ${found.candidates.join(', ')}` }
    }
    const action = found.kind === 'found' ? found.name : asked
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

/** The camera fields `get_view` / `set_view` use, as the view exposes them. */
interface CamView {
  zoom: number
  distance: number
  slab: number
  perspective: boolean
  center: { x: number; y: number; z: number }
  rotation: { a: number; x: number; y: number; z: number }
  setRotQuat(q: unknown): void
}

/** The active view's camera, or null when there is no view. */
function readCam(ctx: WorkerContext, viewId: number): CamState | null {
  const v = ctx.sceMgr.getView(viewId) as unknown as CamView | null
  if (!v) return null
  const r = v.rotation
  const c = v.center
  return {
    quat: { a: r.a, x: r.x, y: r.y, z: r.z },
    center: [c.x, c.y, c.z],
    distance: v.distance,
    slab: v.slab,
    zoom: v.zoom,
    perspective: Boolean(v.perspective),
  }
}

/** Put `cam` on the active view. */
function writeCam(ctx: WorkerContext, viewId: number, cam: CamState): boolean {
  const v = ctx.sceMgr.getView(viewId) as unknown as CamView | null
  if (!v) return false
  const q = ctx.svc.createObj('Quat') as unknown as CamView['rotation'] | null
  const c = ctx.svc.createObj('Vector') as unknown as CamView['center'] | null
  if (!q || !c) return false
  q.a = cam.quat.a
  q.x = cam.quat.x
  q.y = cam.quat.y
  q.z = cam.quat.z
  v.setRotQuat(q)
  c.x = cam.center[0]
  c.y = cam.center[1]
  c.z = cam.center[2]
  v.center = c
  // Distance first: the slab is clamped to twice the distance.
  v.distance = cam.distance
  v.slab = cam.slab
  v.zoom = cam.zoom
  v.perspective = cam.perspective
  return true
}

const getView: PymCommand = {
  name: 'get_view',
  params: [{ name: 'output', default: '1' }, { name: 'quiet', default: '1' }],
  mode: 'strict',
  mutates: false,
  summary: 'Print the camera as a set_view line that can be pasted back.',
  run(ctx, _args, cc) {
    const cam = readCam(ctx, cc.viewId)
    if (!cam) return { ok: false, error: 'Error: no active view' }
    for (const line of formatViewMatrix(camToPymol(cam))) cc.print(line)
    return { ok: true }
  },
}

const setView: PymCommand = {
  name: 'set_view',
  params: [
    { name: 'view' },
    { name: 'animate', default: '0' },
    { name: 'quiet', default: '1' },
    { name: 'hand', default: '1' },
  ],
  mode: 'strict',
  mutates: false,
  summary: 'Set the camera from the 18 numbers get_view prints.',
  run(ctx, args, cc) {
    const v = parseViewMatrix(args.view)
    if (!v) return { ok: false, error: 'Error: set_view needs 18 numbers, as get_view prints them' }
    if (!isDefaulted(args.animate, '0')) cc.warn('set_view: animate is ignored')
    if (!isDefaulted(args.hand, '1')) cc.warn('set_view: hand is ignored')
    if (Math.abs(v[9]) > 1e-6 || Math.abs(v[10]) > 1e-6) {
      cc.warn('the view is off-centre; it is shown the same, but turns about the screen centre')
    }
    if (!writeCam(ctx, cc.viewId, pymolToCam(v))) return { ok: false, error: 'Error: no active view' }
    return { ok: true }
  },
}

export const VIEW_COMMANDS: PymCommand[] = [zoom, center, orient, reset, turn, move, view, refresh, getView, setView]
