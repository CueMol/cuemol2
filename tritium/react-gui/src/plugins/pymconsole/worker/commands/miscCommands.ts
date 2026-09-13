/**
 * @file plugins/pymconsole/worker/commands/miscCommands.ts
 * @description `png`, `undo`, `redo`, `help` and `quit`.
 *
 * `undo` and `redo` carry a flag rather than a body: a transaction is open
 * around the whole submission, and undoing inside it would unwind edits the
 * caller is still holding. The runner executes them itself, outside the
 * transaction (`runCommand.ts`).
 */

import * as path from 'path'
import { exportScene, getSceneExportInfo } from '@renderer/worker/server/services/scene/exportImage'
import type { PymCommand } from './types'
import { isDefaulted, resolvePath, toNumber } from './helpers'

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
    { name: 'prior', default: '0' },
    { name: 'format', default: '0' },
  ],
  mode: 'strict',
  mutates: false,
  summary: 'Write the view to a PNG file.',
  run(ctx, args, cc) {
    for (const [name, def] of [
      ['ray', '0'],
      ['prior', '0'],
      ['format', '0'],
    ] as const) {
      if (!isDefaulted(args[name], def)) cc.warn(`png: ${name} is ignored (not supported)`)
    }
    const info = getSceneExportInfo(ctx, { sceneId: cc.sceneId, viewId: cc.viewId })
    if (!info.ok) return { ok: false, error: 'Error: no active view' }

    const dpi = toNumber(args.dpi) ?? -1
    const width = pixelsOf(args.width, dpi)
    const height = pixelsOf(args.height, dpi)
    if (width === null || height === null) {
      return { ok: false, error: 'Error: a size in in/cm needs a dpi' }
    }

    let filePath = resolvePath(cc.cwd, args.filename)
    if (path.extname(filePath) === '') filePath += '.png'

    const res = exportScene(ctx, {
      sceneId: cc.sceneId,
      viewId: cc.viewId,
      filePath,
      exporterName: 'png',
      width: width > 0 ? width : info.width,
      height: height > 0 ? height : info.height,
      ...(dpi > 0 ? { resoln: dpi } : {}),
    })
    if (!res.ok) return { ok: false, error: `Error: could not write ${filePath}` }
    cc.print(` png: wrote ${filePath}`)
    return { ok: true }
  },
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

const quit: PymCommand = {
  name: 'quit',
  params: [],
  mode: 'strict',
  mutates: false,
  summary: 'Not available: close the window instead.',
  run(_ctx, _args, cc) {
    cc.warn('quit: use the window close button')
    return { ok: true }
  },
}

export const MISC_COMMANDS: PymCommand[] = [
  png,
  undoStackCommand('undo'),
  undoStackCommand('redo'),
  quit,
]
