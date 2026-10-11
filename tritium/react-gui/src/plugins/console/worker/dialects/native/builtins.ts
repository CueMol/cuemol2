/**
 * @file plugins/console/worker/dialects/native/builtins.ts
 * @description The native console's own commands: the ones about the
 * console rather than the scene, so they are not ops.
 *
 * The working directory, scripts, the log and the undo stack belong to the
 * console runtime. A model has no use for them, and an MCP client has its own
 * filesystem, so they are written here rather than added to the catalogue.
 */

import { parseBoolText } from '@renderer/worker/server/catalog/argValues'
import * as fs from 'fs'
import * as nodePath from 'path'
import { actionRows } from '@renderer/worker/server/actions/actionLog'
import { entryLine, rowsToQax } from '@renderer/worker/server/actions/export'
import { writeQax } from '@renderer/worker/server/actions/qax/codec'
import { QAX_EXT } from '@renderer/worker/server/actions/qax/model'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { closeQaxLog, currentQaxLog, noteQaxLog, openQaxLog } from '../../runtime/qaxLog'
import { resolvePath } from '../../runtime/paths'
import { quitCommand } from '../../runtime/quitCommand'
import type { CmdContext, CmdOutcome, ConsoleCommand } from '../../runtime/types'
import type { SceneRequest } from '../../../shared/consoleTypes'

/**
 * The file extension of a native console script: a qax file (CueMol
 * actions, XML). `run` also reads a plain text file of commands.
 */
export const NATIVE_SCRIPT_EXT = QAX_EXT

const cd: ConsoleCommand = {
  name: 'cd',
  group: 'console',
  params: [{ name: 'dir', default: '~' }],
  mode: 'strict',
  mutates: false,
  summary: 'Change the working directory relative paths are read from.',
  completions: [{ source: 'files', description: 'directory', files: 'dirs' }],
  run(_ctx, args, cc) {
    const dir = resolvePath(cc.cwd, args.dir)
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return { ok: false, error: `Error: no such directory: ${dir}` }
    }
    cc.setCwd(dir)
    cc.print(dir)
    return { ok: true }
  },
}

const pwd: ConsoleCommand = {
  name: 'pwd',
  group: 'console',
  params: [],
  mode: 'strict',
  mutates: false,
  summary: 'Print the working directory.',
  run(_ctx, _args, cc) {
    cc.print(cc.cwd)
    return { ok: true }
  },
}

const ls: ConsoleCommand = {
  name: 'ls',
  group: 'console',
  params: [{ name: 'dir', default: '' }],
  mode: 'strict',
  mutates: false,
  summary: 'List a directory (the working directory when none is given).',
  completions: [{ source: 'files', description: 'file' }],
  run(_ctx, args, cc) {
    const dir = resolvePath(cc.cwd, args.dir.trim() === '' ? '.' : args.dir.trim())
    let names: string[]
    try {
      names = fs.readdirSync(dir).sort()
    } catch {
      return { ok: false, error: `Error: cannot list ${dir}` }
    }
    for (const n of names) {
      let isDir = false
      try { isDir = fs.statSync(nodePath.join(dir, n)).isDirectory() } catch { /* unreadable entry */ }
      cc.print(isDir ? `${n}/` : n)
    }
    return { ok: true }
  },
}

const run: ConsoleCommand = {
  name: 'run',
  group: 'console',
  params: [{ name: 'file' }],
  mode: 'strict',
  mutates: false,
  summary: `Run a ${NATIVE_SCRIPT_EXT} file (each action its own undo step when run alone), or a text file of commands (the same as @file).`,
  completions: [{ source: 'files', description: 'script' }],
  run(_ctx, args, cc) {
    return cc.runScript(args.file.trim())
  },
}

const logOpen: ConsoleCommand = {
  name: 'open_log',
  group: 'console',
  params: [{ name: 'file', default: `log${NATIVE_SCRIPT_EXT}` }, { name: 'mode', default: 'w' }],
  mode: 'strict',
  mutates: false,
  summary: `Record what each console submission does from now on, as the native ops it ran, to a ${NATIVE_SCRIPT_EXT} file.`,
  completions: [{ source: 'files', description: 'file' }, { source: 'enum:w|a', description: 'mode' }],
  run(ctx, args, cc) {
    const mode = args.mode.trim()
    if (mode !== 'w' && mode !== 'a') {
      return { ok: false, error: 'Error: mode must be "w" (new file) or "a" (append)' }
    }
    const filePath = resolvePath(cc.cwd, args.file.trim())
    const problem = openQaxLog(ctx, filePath, mode)
    if (problem !== null) return { ok: false, error: `Error: cannot open log file: ${problem}` }
    cc.print(`logging to ${filePath}`)
    return { ok: true }
  },
}

const logClose: ConsoleCommand = {
  name: 'close_log',
  group: 'console',
  params: [],
  mode: 'strict',
  mutates: false,
  summary: 'Stop recording to the log file.',
  run(_ctx, _args, cc) {
    const was = currentQaxLog()
    closeQaxLog()
    if (was !== null) cc.print('log closed')
    return { ok: true }
  },
}

const logLine: ConsoleCommand = {
  name: 'log',
  group: 'console',
  params: [{ name: 'text', default: '' }],
  mode: 'literal1',
  mutates: false,
  summary: 'Write a note to the open log file.',
  run(_ctx, args) {
    if (args.text !== '') noteQaxLog(args.text)
    return { ok: true }
  },
}

// --- Actions ---
// The scene's undo steps with the native ops each ran (the action log).

/** A row number as `list_actions` shows it, 1 = the oldest. */
function rowNumber(text: string, count: number, fallback: number): number | string {
  const t = text.trim()
  if (t === '') return fallback
  const n = Number(t)
  if (!Number.isInteger(n) || n < 1 || n > count) return `no action ${t} (there ${count === 1 ? 'is 1' : `are ${count}`})`
  return n
}

const listActions: ConsoleCommand = {
  name: 'list_actions',
  group: 'edit',
  params: [],
  mode: 'strict',
  mutates: false,
  summary: "List the scene's undo steps with the commands each ran, oldest first; (undone) marks the redo side.",
  run(ctx, _args, cc) {
    const rows = actionRows(getSceneOrNull(ctx, cc.sceneId), cc.sceneId)
    if (rows.length === 0) {
      cc.print('(no actions)')
      return { ok: true }
    }
    rows.forEach((row, i) => {
      cc.print(`${i + 1}  [${row.source ?? '?'}] ${row.label}${row.undone ? '  (undone)' : ''}`)
      if (row.entries.length === 0) cc.print('     # no op recorded for this edit')
      for (const e of row.entries) cc.print(`     ${entryLine(e)}`)
    })
    return { ok: true }
  },
}

const exportActions: ConsoleCommand = {
  name: 'export_actions',
  group: 'edit',
  params: [{ name: 'file' }, { name: 'first', default: '' }, { name: 'last', default: '' }],
  mode: 'strict',
  mutates: false,
  summary: `Write actions (by their list_actions numbers, all by default) to a ${NATIVE_SCRIPT_EXT} file, to run again with run.`,
  completions: [{ source: 'files', description: 'file' }, { source: 'none', description: 'first' }, { source: 'none', description: 'last' }],
  run(ctx, args, cc) {
    const rows = actionRows(getSceneOrNull(ctx, cc.sceneId), cc.sceneId)
    if (rows.length === 0) return { ok: false, error: 'Error: the scene has no actions' }
    const first = rowNumber(args.first, rows.length, 1)
    if (typeof first === 'string') return { ok: false, error: `Error: ${first}` }
    const last = rowNumber(args.last, rows.length, args.first.trim() === '' ? rows.length : first)
    if (typeof last === 'string') return { ok: false, error: `Error: ${last}` }
    if (last < first) return { ok: false, error: 'Error: last comes before first' }
    let filePath = resolvePath(cc.cwd, args.file.trim())
    if (!filePath.toLowerCase().endsWith(NATIVE_SCRIPT_EXT)) filePath += NATIVE_SCRIPT_EXT
    try {
      fs.writeFileSync(filePath, writeQax(rowsToQax(rows.slice(first - 1, last))))
    } catch {
      return { ok: false, error: `Error: cannot write ${filePath}` }
    }
    cc.print(`wrote ${last - first + 1} action${last === first ? '' : 's'} to ${filePath}`)
    return { ok: true }
  },
}

/**
 * `undo` / `redo`. The runtime runs a lone one outside the submission's
 * transaction; this body is reached only when one shares a line with other
 * commands, where it cannot run.
 */
function undoStack(name: 'undo' | 'redo'): ConsoleCommand {
  return {
    name,
    group: 'edit',
    params: [],
    mode: 'strict',
    mutates: false,
    summary: name === 'undo' ? 'Undo the last change.' : 'Redo the last undone change.',
    run() {
      return { ok: false, error: `Error: ${name} must be the only command on the line` }
    },
  }
}

// --- Scenes ---
// A scene is a tab, which only the panel can make or close, so these parse
// their arguments and hand the request over (CmdContext.requestScene).

const SCENE_COMPLETION = { source: 'scenes', description: 'scene' } as const

/** Hand `req` to the panel; refused inside a script. */
function handOff(name: string, req: SceneRequest, cc: CmdContext): CmdOutcome {
  if (cc.requestScene(req)) return { ok: true }
  return { ok: false, error: `Error: ${name} cannot run inside a script; put it on the command line` }
}

/** `list_scenes`, and its short form `scenes`. */
function listScenesAs(name: string, summary: string): ConsoleCommand {
  return {
    name,
    group: 'tabs',
    params: [],
    mode: 'strict',
    mutates: false,
    summary,
    run: (_ctx, _args, cc) => handOff(name, { op: 'list' }, cc),
  }
}
const listScenes = listScenesAs('list_scenes', 'List the open scenes; * marks the active one.')
const scenes = listScenesAs('scenes', 'Short for list_scenes.')

const newScene: ConsoleCommand = {
  name: 'create_scene',
  group: 'tabs',
  params: [{ name: 'name', default: '' }],
  mode: 'strict',
  mutates: false,
  summary: 'Open a new empty scene in a tab of its own and make it active.',
  completions: [{ source: 'none', description: 'name' }],
  run: (_ctx, args, cc) => handOff('create_scene', { op: 'new', name: args.name.trim() }, cc),
}

const switchScene: ConsoleCommand = {
  name: 'switch_scene',
  group: 'tabs',
  params: [{ name: 'scene' }],
  mode: 'strict',
  mutates: false,
  summary: 'Make a scene active, by its number in list_scenes, #uid or name.',
  completions: [SCENE_COMPLETION],
  run: (_ctx, args, cc) => handOff('switch_scene', { op: 'switch', scene: args.scene.trim() }, cc),
}

const closeScene: ConsoleCommand = {
  name: 'close_scene',
  group: 'tabs',
  params: [{ name: 'scene', default: '' }, { name: 'discardChanges', default: 'false' }],
  mode: 'strict',
  mutates: false,
  summary: 'Close a scene (the active one when none is named); discardChanges true closes it with unsaved changes.',
  completions: [SCENE_COMPLETION, { source: 'enum:true|false', description: 'discardChanges' }],
  run(_ctx, args, cc) {
    const discardChanges = parseBoolText(args.discardChanges)
    if (discardChanges === null) return { ok: false, error: 'Error: discardChanges must be true or false' }
    return handOff('close_scene', { op: 'close', scene: args.scene.trim(), discardChanges }, cc)
  },
}

export const NATIVE_BUILTINS: ConsoleCommand[] = [
  listScenes,
  scenes,
  newScene,
  switchScene,
  closeScene,
  cd,
  pwd,
  ls,
  run,
  logOpen,
  logClose,
  logLine,
  listActions,
  exportActions,
  undoStack('undo'),
  undoStack('redo'),
  quitCommand('quit'),
  quitCommand('exit'),
]
