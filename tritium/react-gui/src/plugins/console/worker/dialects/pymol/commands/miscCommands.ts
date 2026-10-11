/**
 * @file plugins/console/worker/dialects/pymol/commands/miscCommands.ts
 * @description `png`, `undo`, `redo`, `help` and `quit`.
 *
 * `undo` and `redo` carry a flag rather than a body: a transaction is open
 * around the whole submission, and undoing inside it would unwind edits the
 * caller is still holding. The runner executes them itself, outside the
 * transaction (`runCommand.ts`).
 */

import * as path from 'path'
import {
  exportScene,
  getAvailableSceneExporters,
  getSceneExportInfo,
} from '@renderer/worker/server/services/scene/exportImage'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { closeLog, currentLog, openLog, writeLog } from '@plugins/console/worker/runtime/commandLog'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { isDefaulted, resolvePath, toNumber } from './helpers'
import { rayToFile, writeLastRay } from './rayCommands'
import { quitCommand } from '@plugins/console/worker/runtime/quitCommand'

/** A `png` size argument: pixels, or inches / centimetres needing a dpi. */
function pixelsOf(raw: string, dpi: number): number | null {
  const v = raw.trim().toLowerCase()
  if (v === '' || v === '0') return 0
  const unit = /^([0-9.]+)\s*(in|cm)$/.exec(v)
  if (unit) {
    if (dpi <= 0) return null
    const size = Number(unit[1])
    const inches = unit[2] === 'cm' ? size / 2.54 : size
    return Math.round(inches * dpi)
  }
  const n = toNumber(v)
  return n !== null && n >= 0 ? Math.round(n) : null
}

const png: PymCommand = {
  name: 'png',
  params: [
    { name: 'filename' },
    { name: 'width', default: '0' },
    { name: 'height', default: '0' },
    { name: 'dpi', default: '-1.0' },
    { name: 'ray', default: '0' },
    // PyMOL's order (exporting.py png): quiet comes before prior.
    { name: 'quiet', default: '1' },
    { name: 'prior', default: '0' },
    { name: 'format', default: '0' },
  ],
  mode: 'strict',
  mutates: false,
  summary: 'Write the view to a PNG file (the ray-traced one, after ray).',
  async run(ctx, args, cc) {
    for (const [name, def] of [
      ['prior', '0'],
      ['format', '0'],
    ] as const) {
      if (!isDefaulted(args[name], def)) cc.warn(`png: ${name} is ignored (not supported)`)
    }
    let filePath = resolvePath(cc.cwd, args.filename)
    if (path.extname(filePath) === '') filePath += '.png'
    // ray=1: render now, on the ray tracer job (the view stays live and Stop
    // cancels it), rather than the blocking exporter.
    if (!isDefaulted(args.ray, '0')) {
      const dpi = toNumber(args.dpi) ?? -1
      const w = pixelsOf(args.width, dpi)
      const h = pixelsOf(args.height, dpi)
      if (w === null || h === null) return { ok: false, error: 'Error: a size in in/cm needs a dpi' }
      const res = await rayToFile(ctx, cc, filePath, w, h)
      if (res.ok) cc.print(` png: wrote ${filePath}`)
      return res
    }
    // After `ray`, PyMOL's png saves the rendered image.
    if (isDefaulted(args.width, '0') && isDefaulted(args.height, '0') && writeLastRay(ctx, cc, filePath)) {
      cc.print(` png: wrote ${filePath} (ray-traced)`)
      return { ok: true }
    }
    return writePng(ctx, cc, {
      filename: args.filename,
      width: args.width,
      height: args.height,
      dpi: args.dpi,
      ray: args.ray,
    })
  },
}

/** What `png` (and `save x.png`) writes: PyMOL's png arguments. */
export interface PngRequest {
  filename: string
  width: string
  height: string
  dpi: string
  ray: string
}

/**
 * Write the view to a PNG.
 *
 * Given only one of width and height, the other follows the view's aspect
 * ratio, as in PyMOL. `ray=1` renders with the ray tracer (umbreon) when the
 * build has it.
 */
export function writePng(ctx: WorkerContext, cc: CmdContext, req: PngRequest): CmdOutcome {
  const info = getSceneExportInfo(ctx, { sceneId: cc.sceneId, viewId: cc.viewId })
  if (!info.ok || info.width <= 0 || info.height <= 0) return { ok: false, error: 'Error: no active view' }

  const dpi = toNumber(req.dpi) ?? -1
  let width = pixelsOf(req.width, dpi)
  let height = pixelsOf(req.height, dpi)
  if (width === null || height === null) {
    return { ok: false, error: 'Error: a size in in/cm needs a dpi' }
  }
  if (width > 0 && height <= 0) height = Math.round((width * info.height) / info.width)
  else if (height > 0 && width <= 0) width = Math.round((height * info.width) / info.height)
  else if (width <= 0 && height <= 0) {
    width = info.width
    height = info.height
  }

  let exporterName = 'png'
  if (!isDefaulted(req.ray, '0')) {
    if (getAvailableSceneExporters(ctx).names.includes('umbreon')) exporterName = 'umbreon'
    else cc.warn('png: ray is ignored (this build has no ray tracer)')
  }

  let filePath = resolvePath(cc.cwd, req.filename)
  if (path.extname(filePath) === '') filePath += '.png'

  const res = exportScene(ctx, {
    sceneId: cc.sceneId,
    viewId: cc.viewId,
    filePath,
    exporterName,
    width,
    height,
    ...(dpi > 0 ? { resoln: dpi } : {}),
  })
  if (!res.ok) return { ok: false, error: `Error: could not write ${filePath}` }
  cc.print(` png: wrote ${filePath}`)
  return { ok: true }
}

/**
 * `undo` and `redo` are recognised so the console can say why they cannot run
 * here; the runner intercepts them by name and runs them outside the
 * transaction it opened.
 */
function undoStackCommand(name: string): PymCommand {
  return {
    name,
    params: [],
    mode: 'strict',
    mutates: false,
    summary: name === 'undo' ? 'Undo the last change.' : 'Redo the last undone change.',
    run() {
      // Reached only if the runner forgot to intercept it.
      return { ok: false, error: `Error: ${name} cannot run inside a command sequence` }
    },
  }
}

const logOpen: PymCommand = {
  name: 'log_open',
  params: [{ name: 'filename', default: 'log.pml' }, { name: 'mode', default: 'w' }],
  mode: 'strict',
  mutates: false,
  summary: 'Record the commands typed from now on to a .pml file.',
  run(_ctx, args, cc) {
    const mode = args.mode.trim()
    if (mode !== 'w' && mode !== 'a') {
      return { ok: false, error: 'Error: mode must be "w" (new file) or "a" (append)' }
    }
    if (/\.(py|pym)$/i.test(args.filename.trim())) {
      return { ok: false, error: 'Error: only .pml logs can be written; this console cannot run Python back' }
    }
    const filePath = resolvePath(cc.cwd, args.filename.trim())
    try {
      openLog(filePath, mode)
    } catch {
      return { ok: false, error: `Error: unable to open log file '${filePath}'` }
    }
    // PyMOL's wording (commanding.py log_open).
    cc.print(mode === 'a' ? ` Cmd: appending to '${filePath}'.` : ` Cmd: logging to '${filePath}'.`)
    return { ok: true }
  },
}

const logClose: PymCommand = {
  name: 'log_close',
  params: [],
  mode: 'strict',
  mutates: false,
  summary: 'Stop recording commands to the log file.',
  run(_ctx, _args, cc) {
    const was = currentLog()
    closeLog()
    if (was !== null) cc.print(` Cmd: log closed.`)
    return { ok: true }
  },
}

const logLine: PymCommand = {
  name: 'log',
  params: [{ name: 'text', default: '' }, { name: 'alt_text', default: '' }],
  mode: 'strict',
  mutates: false,
  summary: 'Write a line to the open log file.',
  run(_ctx, args) {
    // PyMOL writes `alt_text` (Python) only to a .py log, which is never
    // open here, so it has nowhere to go.
    if (args.text !== '') writeLog(args.text)
    return { ok: true }
  },
}

export const MISC_COMMANDS: PymCommand[] = [
  logOpen,
  logClose,
  logLine,
  png,
  undoStackCommand('undo'),
  undoStackCommand('redo'),
  quitCommand('quit'),
  quitCommand('exit'),
]
