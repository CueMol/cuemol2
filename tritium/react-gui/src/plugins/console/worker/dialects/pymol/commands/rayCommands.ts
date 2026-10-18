/**
 * @file plugins/console/worker/dialects/pymol/commands/rayCommands.ts
 * @description PyMOL's `ray`, on CueMol's ray tracer.
 *
 * In PyMOL `ray` renders the view and a following `png` saves that rendered
 * image. Here the render runs as a job on the ray tracer (the catalog's
 * `render_image`, the same pipeline as the Rendering window), so the view
 * stays live and Stop cancels it. The image is kept until the next `png`,
 * which writes it -- unless the view or the scene has changed in between, in
 * which case `png` writes the plain view as PyMOL would.
 */

import { opContextOf } from '@plugins/console/worker/runtime/opContext'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { invokeOp } from '@renderer/worker/server/catalog'
import { renderImage } from '@renderer/worker/server/catalog/ops/renderOps'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { getSceneExportInfo } from '@renderer/worker/server/services/scene/exportImage'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { isDefaulted, toNumber } from './helpers'

/** The last `ray` image, and what the scene looked like when it was made. */
let lastRay: { file: string; signature: string } | null = null

/**
 * What would make a ray image stale: the scene's undo history (any committed
 * edit) and the camera.
 */
function stateSignature(ctx: WorkerContext, cc: CmdContext): string {
  const scene = getSceneOrNull(ctx, cc.sceneId) as unknown as { getUndoSize?: () => number } | null
  const view = ctx.sceMgr.getView(cc.viewId) as unknown as {
    zoom?: number
    slab?: number
    center?: { x: number; y: number; z: number }
    rotation?: { toString(): string }
  } | null
  const parts: unknown[] = []
  try { parts.push(scene?.getUndoSize?.()) } catch { parts.push('?') }
  try {
    parts.push(view?.zoom, view?.slab, view?.center?.x, view?.center?.y, view?.center?.z, view?.rotation?.toString())
  } catch { parts.push('?') }
  return parts.join('|')
}

/**
 * Ray-trace the view to `file`. A size of 0 means the view's own size, as in
 * PyMOL; given only one, the other follows the view's aspect.
 */
export async function rayToFile(
  ctx: WorkerContext,
  cc: CmdContext,
  file: string,
  width: number,
  height: number,
): Promise<CmdOutcome> {
  const info = getSceneExportInfo(ctx, { sceneId: cc.sceneId, viewId: cc.viewId })
  if (!info.ok || info.width <= 0 || info.height <= 0) return { ok: false, error: 'Error: no active view' }
  let w = width
  let h = height
  if (w > 0 && h <= 0) h = Math.round((w * info.height) / info.width)
  else if (h > 0 && w <= 0) w = Math.round((h * info.width) / info.height)
  else if (w <= 0 && h <= 0) {
    w = info.width
    h = info.height
  }
  const res = await invokeOp(renderImage, ctx, { fileName: file, width: w, height: h, style: null }, opContextOf(cc, 'ray'))
  if (!res.ok) return { ok: false, error: `Error: ray: ${res.error}` }
  const seconds = (res.data as { seconds?: number } | undefined)?.seconds
  cc.print(` Ray: render time: ${seconds ?? '?'} sec. (${w}x${h})`)
  return { ok: true }
}

/**
 * Write the kept `ray` image to `file`, if there is one and it still shows
 * the scene as it is.
 *
 * @returns whether it was written (false: the caller writes the plain view).
 */
export function writeLastRay(ctx: WorkerContext, cc: CmdContext, file: string): boolean {
  const kept = lastRay
  if (!kept || !fs.existsSync(kept.file)) return false
  if (kept.signature !== stateSignature(ctx, cc)) return false
  fs.copyFileSync(kept.file, file)
  return true
}

const ray: PymCommand = {
  name: 'ray',
  params: [
    { name: 'width', default: '0' },
    { name: 'height', default: '0' },
    { name: 'antialias', default: '-1' },
    { name: 'angle', default: '0.0' },
    { name: 'shift', default: '0.0' },
    { name: 'renderer', default: '-1' },
    { name: 'quiet', default: '1' },
    { name: 'async', default: '0' },
  ],
  mode: 'strict',
  mutates: false,
  summary: 'Ray-trace the view (global illumination); a following png saves it.',
  async run(ctx, args, cc) {
    for (const [name, def] of [['antialias', '-1'], ['angle', '0.0'], ['shift', '0.0'], ['renderer', '-1'], ['async', '0']] as const) {
      if (!isDefaulted(args[name], def)) cc.warn(`ray: ${name} is ignored (not supported)`)
    }
    const width = toNumber(args.width)
    const height = toNumber(args.height)
    if (width === null || height === null) return { ok: false, error: 'Error: ray: width and height must be numbers' }
    const file = path.join(os.tmpdir(), `cuemol-pym-ray-${process.pid}.png`)
    const res = await rayToFile(ctx, cc, file, width, height)
    if (!res.ok) return res
    lastRay = { file, signature: stateSignature(ctx, cc) }
    return { ok: true }
  },
}

export const RAY_COMMANDS: PymCommand[] = [ray]
