/**
 * @file plugins/console/worker/dialects/native/builtins.ts
 * @description The native console's own commands: the ones about the
 * console rather than the scene, so they are not ops.
 *
 * The working directory, scripts, the log and the undo stack belong to the
 * console runtime. A model has no use for them, and an MCP client has its own
 * filesystem, so they are written here rather than added to the catalogue.
 */

import * as fs from 'fs'
import * as nodePath from 'path'
import { closeLog, currentLog, openLog, writeLog } from '../../runtime/commandLog'
import { resolvePath } from '../../runtime/paths'
import type { CmdContext, CmdOutcome, ConsoleCommand } from '../../runtime/types'
import type { SceneRequest } from '../../../shared/consoleTypes'

/** The file extension of a native console script. */
export const NATIVE_SCRIPT_EXT = '.cml'

const cd: ConsoleCommand = {
  name: 'cd',
  group: 'console',
  params: [{ name: 'dir', default: '~' }],
  mode: 'strict',
  mutates: false,
  summary: 'Change the working directory relative paths are read from.',
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
  summary: `Run the commands in a ${NATIVE_SCRIPT_EXT} script (the same as @file).`,
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
  summary: 'Record the commands typed from now on to a script file.',
  run(_ctx, args, cc) {
    const mode = args.mode.trim()
    if (mode !== 'w' && mode !== 'a') {
      return { ok: false, error: 'Error: mode must be "w" (new file) or "a" (append)' }
    }
    const filePath = resolvePath(cc.cwd, args.file.trim())
    try {
      openLog(filePath, mode)
    } catch {
      return { ok: false, error: `Error: cannot open log file ${filePath}` }
    }
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
  summary: 'Stop recording commands to the log file.',
  run(_ctx, _args, cc) {
    const was = currentLog()
    closeLog()
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
  summary: 'Write a line to the open log file.',
  run(_ctx, args) {
    if (args.text !== '') writeLog(args.text)
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

const SCENE_COMPLETION = { source: 'scenes', description: 'scene', suffix: '' } as const

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
  completions: [{ source: 'none', description: 'name', suffix: '' }],
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
  params: [{ name: 'scene', default: '' }, { name: 'force', default: '' }],
  mode: 'strict',
  mutates: false,
  summary: 'Close a scene (the active one when none is named); force discards unsaved changes.',
  completions: [{ ...SCENE_COMPLETION, suffix: ', ' }, { source: 'enum:force', description: 'option', suffix: '' }],
  run(_ctx, args, cc) {
    const force = args.force.trim()
    if (force !== '' && force !== 'force') return { ok: false, error: 'Error: the second argument can only be "force"' }
    return handOff('close_scene', { op: 'close', scene: args.scene.trim(), force: force === 'force' }, cc)
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
  undoStack('undo'),
  undoStack('redo'),
]
