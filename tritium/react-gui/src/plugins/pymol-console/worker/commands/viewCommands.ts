/**
 * @file plugins/pymol-console/worker/commands/viewCommands.ts
 * @description Moving the camera, and storing where it was.
 *
 * None of these are undoable, matching both PyMOL and CueMol: camera
 * manipulation is transient view state, not a scene edit (ADR-0025). `view`
 * is the exception -- storing one creates a camera, which is a scene object.
 * Each move is a camera op (`set_view`, `focus_selection`, `orient_view`, ...),
 * so a line that also edits the scene keeps the move as a step to replay.
 *
 * CueMol has no "fit everything" primitive; `fitView` belongs to an object.
 * So `zoom` and `center` without an object fit the first one in the scene and
 * say so, rather than silently doing something else than PyMOL would.
 */

import type { GUIView } from '@cuemol/core/src/wrappers/GUIView'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { getSelHitCount } from '@renderer/worker/server/services/select/getSelHitCount'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { ALL, formatNameList, isDefaulted, moleculeSelections, resolveObjects, runOp, toNumber } from './helpers'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { camToPymol, formatViewMatrix, parseViewMatrix, pymolToCam } from './viewMatrix'
import { interpretShortcut } from '@plugins/console/worker/dialect-api'
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
async function fitTo(
  ctx: WorkerContext,
  cc: CmdContext,
  pattern: string,
  mode: 'zoom' | 'center',
): Promise<CmdOutcome> {
  const wanted = pattern.trim()
  const wantsAll = wanted === '' || wanted === ALL || wanted === '*'
  const named = wantsAll ? resolveObjects(ctx, cc.sceneId, 'all') : resolveObjects(ctx, cc.sceneId, wanted)

  if (named.length > 0) {
    if (wantsAll && named.length > 1) {
      cc.warn(`fitting "${named[0].name}" only: fitting every object at once is not supported`)
    }
    // `center` moves the centre only; fitting would change the zoom too.
    if (mode === 'center') {
      const mol = getSceneOrNull(ctx, cc.sceneId)?.getObject(named[0].uid) as unknown as CenteredObject | null
      if (mol && typeof mol.getCenterPos === 'function') {
        const c = mol.getCenterPos(false)
        return moveCamera(ctx, cc, { center: [c.x, c.y, c.z] })
      }
    }
    const res = await runOp(ctx, cc, 'focus_node', { nodeId: named[0].uid, nodeType: 'object' })
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

  // focus_selection leaves the molecule's own selection alone: the GUI's
  // zoom-to-selection sets it first, which here would leave the matched
  // atoms highlighted after every zoom.
  const res = await runOp(ctx, cc, 'focus_selection', { objId: obj.uid, selection: selStr, zoom: mode === 'zoom' })
  return res.ok ? { ok: true } : res
}

/** The member `center` reads an object's centre from, as the wrappers expose it. */
interface CenteredObject {
  getCenterPos(fsel: boolean): { x: number; y: number; z: number }
}

/** The camera fields `set_view` takes; the rest are left as they are. */
interface ViewChange {
  center?: [number, number, number]
  rotation?: [number, number, number, number]
  distance?: number
  slab?: number
  zoom?: number
}

/** Move the camera through `set_view`, every field not given left as it is. */
async function moveCamera(ctx: WorkerContext, cc: CmdContext, change: ViewChange): Promise<CmdOutcome> {
  const res = await runOp(ctx, cc, 'set_view', {
    zoom: change.zoom ?? null,
    slab: change.slab ?? null,
    distance: change.distance ?? null,
    center: change.center ?? null,
    rotation: change.rotation ?? null,
    fitSlab: null,
    objId: null,
  })
  return res.ok ? { ok: true } : { ok: false, error: 'Error: no active view' }
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
  async run(ctx, args, cc) {
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
  async run(ctx, args, cc) {
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
  async run(ctx, args, cc) {
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
    const res = await runOp(ctx, cc, 'orient_view', { objId: obj.uid, selection: selStr })
    return res.ok ? { ok: true } : res
  },
}

const reset: PymCommand = {
  name: 'reset',
  params: [{ name: 'object', default: '' }],
  mode: 'strict',
  mutates: false,
  summary: 'Reset the camera rotation and fit the view.',
  async run(ctx, args, cc) {
    const turned = await moveCamera(ctx, cc, { rotation: [1, 0, 0, 0] })
    if (!turned.ok) return turned
    return fitTo(ctx, cc, args.object, 'zoom')
  },
}

const turn: PymCommand = {
  name: 'turn',
  params: [{ name: 'axis' }, { name: 'angle' }],
  mode: 'strict',
  mutates: false,
  summary: 'Rotate the camera about an axis, in degrees.',
  async run(ctx, args, cc) {
    const axis = toAxis(args.axis)
    if (axis === null) return { ok: false, error: `Error: axis must be x, y or z: "${args.axis}"` }
    const angle = toNumber(args.angle)
    if (angle === null) return { ok: false, error: `Error: angle must be a number: "${args.angle}"` }
    const res = await runOp(ctx, cc, 'rotate_view', { axis, angle })
    return res.ok ? { ok: true } : { ok: false, error: 'Error: no active view' }
  },
}

const move: PymCommand = {
  name: 'move',
  params: [{ name: 'axis' }, { name: 'distance' }],
  mode: 'strict',
  mutates: false,
  summary: 'Translate the camera along an axis.',
  async run(ctx, args, cc) {
    const axis = toAxis(args.axis)
    if (axis === null) return { ok: false, error: `Error: axis must be x, y or z: "${args.axis}"` }
    const dist = toNumber(args.distance)
    if (dist === null) {
      return { ok: false, error: `Error: distance must be a number: "${args.distance}"` }
    }
    const res = await runOp(ctx, cc, 'pan_view', {
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
  async run(ctx, args, cc) {
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
          await runOp(ctx, cc, 'delete_camera', { name })
        }
        return { ok: true }
      }
      cc.print(' view: stored views:')
      cc.print(formatNameList(storedCameraNames(ctx, cc.sceneId)))
      return { ok: true }
    }

    switch (action) {
      case 'store':
      case 'update': {
        const res = await runOp(ctx, cc, 'save_camera', { name: key, withVisibility: null })
        if (!res.ok) return { ok: false, error: `Error: could not store view "${key}"` }
        cc.print(` view: "${key}" stored.`)
        return { ok: true }
      }
      case 'recall': {
        if (!storedCameraNames(ctx, cc.sceneId).includes(key)) return { ok: false, error: `Error: no view named "${key}"` }
        const res = await runOp(ctx, cc, 'apply_camera', { name: key, withVisibility: null })
        if (!res.ok) return { ok: false, error: `Error: no view named "${key}"` }
        cc.print(` view: "${key}" recalled.`)
        return { ok: true }
      }
      case 'clear': {
        if (!storedCameraNames(ctx, cc.sceneId).includes(key)) return { ok: false, error: `Error: no view named "${key}"` }
        const res = await runOp(ctx, cc, 'delete_camera', { name: key })
        if (!res.ok) return { ok: false, error: `Error: no view named "${key}"` }
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

/**
 * Put `cam` on the active view: `set_view` (rotation, centre, distance before
 * slab, zoom) and `set_projection`.
 */
async function writeCam(ctx: WorkerContext, cc: CmdContext, cam: CamState): Promise<CmdOutcome> {
  const placed = await moveCamera(ctx, cc, {
    rotation: [cam.quat.a, cam.quat.x, cam.quat.y, cam.quat.z],
    center: cam.center,
    distance: cam.distance,
    slab: cam.slab,
    zoom: cam.zoom,
  })
  if (!placed.ok) return placed
  const projected = await runOp(ctx, cc, 'set_projection', { perspective: cam.perspective })
  return projected.ok ? { ok: true } : { ok: false, error: 'Error: no active view' }
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
  async run(ctx, args, cc) {
    const v = parseViewMatrix(args.view)
    if (!v) return { ok: false, error: 'Error: set_view needs 18 numbers, as get_view prints them' }
    if (!isDefaulted(args.animate, '0')) cc.warn('set_view: animate is ignored')
    if (!isDefaulted(args.hand, '1')) cc.warn('set_view: hand is ignored')
    if (Math.abs(v[9]) > 1e-6 || Math.abs(v[10]) > 1e-6) {
      cc.warn('the view is off-centre; it is shown the same, but turns about the screen centre')
    }
    return writeCam(ctx, cc, pymolToCam(v))
  },
}

export const VIEW_COMMANDS: PymCommand[] = [zoom, center, orient, reset, turn, move, view, refresh, getView, setView]
