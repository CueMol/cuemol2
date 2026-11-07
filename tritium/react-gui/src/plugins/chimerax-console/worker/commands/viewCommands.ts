/**
 * @file plugins/chimerax-console/worker/commands/viewCommands.ts
 * @description The camera: `turn`, `move`, `cofr`, `zoom`, named views and
 * `view matrix`, plus `set bgColor` and `graphics silhouettes`.
 *
 * Each move is a camera op (`set_view`, `set_projection`, the camera ops),
 * which is not an undo step (op-catalog.md). The camera is read from the
 * view (`camera.ts`), as `view` already does.
 *
 * How CueMol's camera relates to ChimeraX's, worked out on the view:
 * - world axis = R(q) x screen axis, with `forward_vec` the screen's +z
 *   (toward the viewer); ChimeraX's camera looks along its -z the same way.
 * - CueMol turns about the view centre; there is no separate centre of
 *   rotation, which is why `cofr` with a target is refused.
 * - `zoom` is the height of the view in angstroms, so a pixel is
 *   zoom / height angstroms there.
 *
 * Animation (`frames`) is not played: a finite count is applied at once,
 * multiplied in as ChimeraX repeats the step every frame (`turn y 3 30` is
 * 90 degrees), and `forever` is refused.
 */

import type { CmdOutcome, CmdContext } from '@plugins/console/worker/dialect-api'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { objectNodes, rendererNodesOf } from '@renderer/worker/server/catalog/refs'
import { getGenericProps } from '@renderer/worker/server/services/props/read'
import { AxisArg, BoolArg, ColorArg, EnumOf, FloatArg, SpecArg, StringArg } from '../cli/argTypes'
import { chxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import { splitColorArg } from '../colors'
import {
  cameraFromMatrix,
  cameraMatrix,
  framingOf,
  g5,
  pixelSize,
  readCamera,
  turnedRotation,
} from '../camera'
import type { CameraState } from '../camera'
import { runOp, targetsOf } from '../display'

// --- Helpers ---

/** An axis argument (`x`, `-y`, `1,1,0`) as a unit vector in screen coordinates. */
export function axisOf(raw: string): [number, number, number] | null {
  const named: Readonly<Record<string, [number, number, number]>> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }
  const w = raw.trim().toLowerCase()
  const neg = w.startsWith('-')
  const base = named[neg ? w.slice(1) : w]
  if (base) return neg ? [-base[0], -base[1], -base[2]] : base
  const nums = w.split(',').map(Number)
  if (nums.length !== 3 || !nums.every(Number.isFinite)) return null
  const n = Math.hypot(...nums)
  return n === 0 ? null : [nums[0] / n, nums[1] / n, nums[2] / n]
}

/** A `frames` count multiplied into one step; null when it is `forever` or malformed. */
function framesOf(raw: string): number | null {
  if (raw === '') return 1
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Refuse the keywords that move models or atoms, or set the centre: CueMol moves the camera only. */
function refuseGiven(cmd: string, args: Record<string, string>, names: readonly string[], why: string): CmdOutcome | null {
  const given = names.find((n) => args[n] !== undefined && args[n] !== '')
  return given ? { ok: false, error: `Error: ${cmd}: ${given} is not supported (${why})` } : null
}

/** The camera, or the error for when there is no view. */
function cameraOf(ctx: WorkerContext, cc: CmdContext): CameraState | { ok: false; error: string } {
  return readCamera(ctx, cc.viewId) ?? { ok: false, error: 'Error: no active view' }
}

/** `set_view` with only the fields given; the rest are left as they are. */
async function setView(ctx: WorkerContext, cc: CmdContext, change: Record<string, unknown>): Promise<CmdOutcome> {
  const res = await runOp(ctx, cc, 'set_view', {
    zoom: null, slab: null, distance: null, center: null, rotation: null, fitSlab: null, objId: null, ...change,
  })
  return res.ok ? { ok: true } : res
}

// --- turn / move ---

const turn = chxCommand({
  words: ['turn'],
  args: [
    { name: 'axis', type: AxisArg, role: 'optional' },
    { name: 'angle', type: FloatArg, role: 'optional' },
    { name: 'frames', type: StringArg, role: 'optional' },
    { name: 'center', type: StringArg, role: 'keyword' },
    { name: 'coordinateSystem', type: StringArg, role: 'keyword' },
    { name: 'rock', type: StringArg, role: 'keyword' },
    { name: 'wobble', type: StringArg, role: 'keyword' },
    { name: 'wobbleAspect', type: StringArg, role: 'keyword' },
    { name: 'models', type: StringArg, role: 'keyword' },
    { name: 'atoms', type: StringArg, role: 'keyword' },
  ],
  mutates: false,
  summary: 'Turn the scene about a screen axis (default y, 90 degrees).',
  async run(ctx, args, cc) {
    const refused = refuseGiven('turn', args, ['center', 'coordinateSystem', 'rock', 'wobble', 'wobbleAspect', 'models', 'atoms'],
      'the camera turns about the view centre, and models are not moved')
    if (refused) return refused
    const axis = axisOf(args.axis || 'y')
    if (!axis) return { ok: false, error: `Error: turn: "${args.axis}" is not an axis (x, y, z or three numbers)` }
    const frames = framesOf(args.frames)
    if (frames === null) return { ok: false, error: 'Error: turn: frames must be a whole number (forever is not supported)' }
    if (args.frames !== '') cc.warn('turn: frames: turned at once, not animated')
    const angle = (args.angle === '' ? 90 : Number(args.angle)) * frames
    const cam = cameraOf(ctx, cc)
    if ('ok' in cam) return cam
    return setView(ctx, cc, { rotation: turnedRotation(cam.rotation, axis, angle) })
  },
})

const move = chxCommand({
  words: ['move'],
  args: [
    { name: 'axis', type: AxisArg, role: 'required' },
    { name: 'distance', type: FloatArg, role: 'optional' },
    { name: 'frames', type: StringArg, role: 'optional' },
    { name: 'coordinateSystem', type: StringArg, role: 'keyword' },
    { name: 'models', type: StringArg, role: 'keyword' },
    { name: 'atoms', type: StringArg, role: 'keyword' },
  ],
  mutates: false,
  summary: 'Move the scene along a screen axis, in angstroms.',
  async run(ctx, args, cc) {
    const refused = refuseGiven('move', args, ['coordinateSystem', 'models', 'atoms'], 'only the camera is moved')
    if (refused) return refused
    const axis = axisOf(args.axis)
    if (!axis) return { ok: false, error: `Error: move: "${args.axis}" is not an axis (x, y, z or three numbers)` }
    const frames = framesOf(args.frames)
    if (frames === null) return { ok: false, error: 'Error: move: frames must be a whole number (forever is not supported)' }
    if (args.frames !== '') cc.warn('move: frames: moved at once, not animated')
    // With no distance ChimeraX moves by the axis as given: 1 A along x.
    const d = (args.distance === '' ? 1 : Number(args.distance)) * frames
    const cam = cameraOf(ctx, cc)
    if ('ok' in cam) return cam
    // The camera moves by -d, so the scene appears to move by +d.
    const w = (k: 'x' | 'y' | 'z') => axis[0] * cam.right[k] + axis[1] * cam.up[k] + axis[2] * cam.back[k]
    return setView(ctx, cc, { center: [cam.center.x - d * w('x'), cam.center.y - d * w('y'), cam.center.z - d * w('z')] })
  },
})

// --- cofr / zoom ---

const cofr = chxCommand({
  words: ['cofr'],
  args: [
    // The spec first: it may be empty, so a method word still reaches `method`.
    { name: 'objects', type: SpecArg, role: 'optional' },
    { name: 'method', type: EnumOf(['frontCenter', 'fixed', 'centerOfView']), role: 'optional' },
    { name: 'pivot', type: StringArg, role: 'optional' },
    { name: 'coordinateSystem', type: StringArg, role: 'keyword' },
    { name: 'showPivot', type: StringArg, role: 'keyword' },
  ],
  mutates: false,
  summary: 'Report the centre of rotation (CueMol turns about the view centre).',
  run(ctx, args, cc) {
    if (args.objects !== '' || args.pivot !== '' || args.coordinateSystem !== '' || (args.method !== '' && args.method !== 'centerOfView')) {
      return {
        ok: false,
        error: 'Error: cofr: CueMol turns about the view centre, so moving the centre of rotation would move the view; use "view <spec>" to centre on something',
      }
    }
    if (args.showPivot !== '') cc.warn('cofr: showPivot is not supported yet; ignored')
    if (args.method !== '') return { ok: true }
    const cam = cameraOf(ctx, cc)
    if ('ok' in cam) return cam
    cc.print(`Center of rotation: ${g5(cam.center.x)} ${g5(cam.center.y)} ${g5(cam.center.z)}  center of view`)
    return { ok: true }
  },
})

const zoom = chxCommand({
  words: ['zoom'],
  args: [
    { name: 'factor', type: FloatArg, role: 'optional' },
    { name: 'frames', type: StringArg, role: 'optional' },
    { name: 'pixelSize', type: FloatArg, role: 'keyword' },
  ],
  mutates: false,
  summary: 'Zoom by a factor, or to a pixel size in angstroms; alone, report the pixel size.',
  async run(ctx, args, cc) {
    const cam = cameraOf(ctx, cc)
    if ('ok' in cam) return cam
    if (args.factor === '' && args.pixelSize === '') {
      cc.print(`Pixel size at center of rotation is ${Number(pixelSize(cam).toPrecision(3))}`)
      return { ok: true }
    }
    // ChimeraX reaches the factor over all the frames, so it is not multiplied.
    if (args.frames !== '') cc.warn('zoom: frames: zoomed at once, not animated')
    let factor = args.factor === '' ? 1 : Number(args.factor)
    if (args.pixelSize !== '') factor *= pixelSize(cam) / Number(args.pixelSize)
    if (!(factor > 0)) return { ok: false, error: 'Error: zoom: the factor must be positive' }
    return setView(ctx, cc, { zoom: cam.zoom / factor })
  },
})

// --- Named views and view matrix ---

/** Names a view cannot have (ChimeraX `view_name`): its options, or a prefix of one. */
const RESERVED_VIEW_NAMES = ['clip', 'cofr', 'delete', 'frames', 'initial', 'list', 'matrix', 'orient', 'zalign', 'pad', 'position']

/** The scene's saved cameras, by name. */
async function cameraNames(ctx: WorkerContext, cc: CmdContext): Promise<string[]> {
  const res = await runOp(ctx, cc, 'list_cameras', {})
  if (!res.ok) return []
  return (res.data as { cameras: { name: string }[] }).cameras.map((c) => c.name)
}

const viewList = chxCommand({
  words: ['view', 'list'],
  args: [],
  mutates: false,
  summary: 'List the named views.',
  async run(ctx, _args, cc) {
    const names = (await cameraNames(ctx, cc)).sort()
    cc.print(names.length > 0 ? `Named views: ${names.join(', ')}` : 'No named views.')
    return { ok: true }
  },
})

const viewDelete = chxCommand({
  words: ['view', 'delete'],
  args: [{ name: 'name', type: StringArg, role: 'required' }],
  mutates: true,
  summary: 'Delete a named view, or all of them.',
  async run(ctx, args, cc) {
    const names = args.name === 'all' ? await cameraNames(ctx, cc) : [args.name]
    for (const name of names) {
      const res = await runOp(ctx, cc, 'delete_camera', { name })
      // ChimeraX says nothing about a name it does not have.
      if (!res.ok && args.name === 'all') return res
    }
    return { ok: true }
  },
})

const viewName = chxCommand({
  words: ['view', 'name'],
  args: [{ name: 'name', type: StringArg, role: 'required' }],
  mutates: true,
  summary: 'Save the camera under a name (the camera only: CueMol does not move models).',
  async run(ctx, args, cc) {
    const clash = RESERVED_VIEW_NAMES.find((r) => r.startsWith(args.name))
    if (clash) {
      return { ok: false, error: `Error: view name "${args.name}" conflicts with "${clash}" view option` }
    }
    const res = await runOp(ctx, cc, 'save_camera', { name: args.name, withVisibility: null })
    return res.ok ? { ok: true } : res
  },
})

const viewMatrix = chxCommand({
  words: ['view', 'matrix'],
  args: [
    { name: 'camera', type: StringArg, role: 'keyword' },
    { name: 'models', type: StringArg, role: 'keyword' },
    { name: 'coordinateSystem', type: StringArg, role: 'keyword' },
  ],
  mutates: false,
  summary: 'Set the camera from 12 numbers (a 3x4 matrix by rows), or report it.',
  async run(ctx, args, cc) {
    const refused = refuseGiven('view matrix', args, ['models', 'coordinateSystem'], 'CueMol objects have no positions of their own')
    if (refused) return refused
    const cam = cameraOf(ctx, cc)
    if ('ok' in cam) return cam
    if (args.camera === '') {
      cc.print(`view matrix camera ${cameraMatrix(cam).map(g5).join(',')}`)
      return { ok: true }
    }
    const m = args.camera.split(',').map(Number)
    if (m.length !== 12 || !m.every(Number.isFinite)) return { ok: false, error: 'Error: view matrix: camera takes 12 numbers' }
    // ChimeraX's camera has a position only; CueMol's turns about a centre at
    // `distance` in front of the eye, and draws a slab about it. The centre
    // goes where the line of sight passes the middle of what is shown, so the
    // scene stays inside the slab; the slab is then fitted to it.
    const back = { x: m[2], y: m[6], z: m[10] }
    const bl = Math.hypot(back.x, back.y, back.z) || 1
    const all = targetsOf(ctx, cc.sceneId, '')
    const framing = all.ok ? framingOf(ctx, cc.sceneId, cc.viewId, all.targets) : null
    let distance = cam.distance
    if (framing) {
      const ahead = -((framing.center[0] - m[3]) * back.x + (framing.center[1] - m[7]) * back.y + (framing.center[2] - m[11]) * back.z) / bl
      // A camera looking away from the scene keeps the distance it had.
      if (ahead > 0) distance = ahead
    }
    const placed = cameraFromMatrix(m, distance, cam.width / Math.max(1, cam.height))
    const set = await setView(ctx, cc, { rotation: placed.rotation, center: placed.center, zoom: placed.zoom, distance })
    if (!set.ok) return set
    const slab = await setView(ctx, cc, { fitSlab: true })
    if (!slab.ok) return slab
    // ChimeraX's camera is a perspective one; CueMol's defaults to orthographic.
    const proj = await runOp(ctx, cc, 'set_projection', { perspective: true })
    return proj.ok ? { ok: true } : proj
  },
})

/** `view <name>`: recall a named view when the word is one (called by `view`). */
export async function recallView(ctx: WorkerContext, cc: CmdContext, name: string): Promise<CmdOutcome | null> {
  if (!(await cameraNames(ctx, cc)).includes(name)) return null
  const res = await runOp(ctx, cc, 'apply_camera', { name, withVisibility: null })
  return res.ok ? { ok: true } : res
}

// --- set / graphics silhouettes ---

/** Renderer types that draw no faces, so have no outline (the Inspector's `NO_EDGE_LINE_TYPES`). */
const NO_EDGE_TYPES = new Set(['simple', 'trace', 'spline', 'contour', 'gpu_mapmesh', '*selection', '*unitcell', '*namelabel'])

/** Every renderer in the scene that can draw an outline, with its edge settings. */
function outlinedRenderers(ctx: WorkerContext, sceneId: number): { id: number; egtype: string; eglinew: number; egcolor: string }[] {
  const out: { id: number; egtype: string; eglinew: number; egcolor: string }[] = []
  for (const obj of objectNodes(ctx, sceneId)) {
    for (const r of rendererNodesOf(obj).filter((n) => n.type === 'renderer')) {
      const props = getGenericProps(ctx, { sceneId, nodeId: r.id, nodeType: 'renderer' })
      if (!props.ok) continue
      const get = (k: string) => props.entries.find((e) => e.key === k)?.value
      if (get('egtype') === undefined || NO_EDGE_TYPES.has(String(get('type_name')))) continue
      out.push({ id: r.id, egtype: String(get('egtype')), eglinew: Number(get('eglinew')), egcolor: String(get('egcolor')) })
    }
  }
  return out
}

/** ChimeraX's default silhouette width in pixels (`graphics/opengl.py` `Silhouette.thickness`). */
const SILHOUETTE_DEFAULT_PX = 1

/**
 * ChimeraX's silhouettes, which are one setting for the whole view, as the
 * outline of every renderer that can draw one. The width is in pixels
 * there and in angstroms here, so it is converted at the current zoom.
 */
export async function silhouettes(
  ctx: WorkerContext,
  cc: CmdContext,
  cmd: string,
  enable: string,
  width: string,
  color: string,
): Promise<CmdOutcome> {
  const rends = outlinedRenderers(ctx, cc.sceneId)
  const cam = cameraOf(ctx, cc)
  if ('ok' in cam) return cam
  if (enable === '' && width === '' && color === '') {
    const on = rends.some((r) => r.egtype === 'silhouette')
    const first = rends.find((r) => r.egtype === 'silhouette') ?? rends[0]
    const px = first ? first.eglinew / pixelSize(cam) : 0
    cc.print(`Silhouettes: ${on}, width ${Number(px.toPrecision(3))}, color ${first?.egcolor ?? ''}`)
    return { ok: true }
  }
  if (width !== '') cc.warn(`${cmd}: the width is converted at the current zoom (CueMol's outline width is in angstroms, so it grows as you zoom in)`)
  for (const r of rends) {
    const writes: [string, string][] = []
    if (enable !== '') writes.push(['egtype', enable === 'true' ? 'silhouette' : 'none'])
    if (width !== '') writes.push(['eglinew', String(Number(width) * pixelSize(cam))])
    // An outline turned on gets ChimeraX's default width, 1 pixel at the
    // current zoom: CueMol's default (0.01 A) is a fraction of a pixel. An
    // outline already on keeps the width it has.
    else if (enable === 'true' && r.egtype !== 'silhouette') writes.push(['eglinew', String(SILHOUETTE_DEFAULT_PX * pixelSize(cam))])
    if (color !== '') writes.push(['egcolor', splitColorArg(color).hex])
    for (const [prop, value] of writes) {
      const res = await runOp(ctx, cc, 'set_node_prop', { nodeType: 'renderer', nodeId: r.id, prop, value })
      if (!res.ok) return res
    }
  }
  return { ok: true }
}

const graphicsSilhouettes = chxCommand({
  words: ['graphics', 'silhouettes'],
  args: [
    { name: 'enable', type: BoolArg, role: 'optional' },
    { name: 'width', type: FloatArg, role: 'keyword' },
    { name: 'color', type: ColorArg, role: 'keyword' },
    { name: 'depthJump', type: FloatArg, role: 'keyword', ignored: true },
  ],
  mutates: true,
  summary: 'Outline what is drawn (silhouette edges), or report the setting.',
  async run(ctx, args, cc) {
    if (args.depthJump !== '') cc.warn('graphics silhouettes: depthJump is not supported yet; ignored')
    return silhouettes(ctx, cc, 'graphics silhouettes', args.enable, args.width, args.color)
  },
})

const set = chxCommand({
  words: ['set'],
  args: [
    { name: 'bgColor', type: ColorArg, role: 'keyword' },
    { name: 'silhouettes', type: BoolArg, role: 'keyword' },
    { name: 'silhouetteWidth', type: FloatArg, role: 'keyword' },
    { name: 'silhouetteColor', type: ColorArg, role: 'keyword' },
    { name: 'silhouetteDepthJump', type: FloatArg, role: 'keyword', ignored: true },
    { name: 'subdivision', type: StringArg, role: 'keyword', ignored: true },
    { name: 'maxFrameRate', type: StringArg, role: 'keyword', ignored: true },
    { name: 'selectionColor', type: StringArg, role: 'keyword', ignored: true },
    { name: 'selectionWidth', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: true,
  summary: 'Set the background colour (and the silhouettes); alone, report the background.',
  async run(ctx, args, cc) {
    for (const k of ['silhouetteDepthJump', 'subdivision', 'maxFrameRate', 'selectionColor', 'selectionWidth']) {
      if (args[k] !== '') cc.warn(`set: ${k} is not supported yet; ignored`)
    }
    const any = Object.values(args).some((v) => v !== '')
    if (!any) {
      const props = getGenericProps(ctx, { sceneId: cc.sceneId, nodeId: cc.sceneId, nodeType: 'scene' })
      const bg = props.ok ? props.entries.find((e) => e.key === 'bgcolor')?.value : undefined
      cc.print(`Background color: ${String(bg ?? '')}`)
      return { ok: true }
    }
    if (args.bgColor !== '') {
      const res = await runOp(ctx, cc, 'set_node_prop', { nodeType: 'scene', nodeId: null, prop: 'bgcolor', value: splitColorArg(args.bgColor).hex })
      if (!res.ok) return res
    }
    if (args.silhouettes !== '' || args.silhouetteWidth !== '' || args.silhouetteColor !== '') {
      return silhouettes(ctx, cc, 'set', args.silhouettes, args.silhouetteWidth, args.silhouetteColor)
    }
    return { ok: true }
  },
})

export const VIEW_COMMANDS: Record<string, ChxCommand> = {
  turn,
  move,
  cofr,
  zoom,
  viewList,
  viewDelete,
  viewName,
  viewMatrix,
  graphicsSilhouettes,
  set,
}
