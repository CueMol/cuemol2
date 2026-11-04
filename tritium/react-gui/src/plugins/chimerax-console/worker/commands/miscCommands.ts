/**
 * @file plugins/chimerax-console/worker/commands/miscCommands.ts
 * @description `view`, `undo`, `redo`, `usage` and `help`.
 */

import type { ConsoleCommand } from '@plugins/console/worker/dialect-api'
import { RestOfLine, SpecArg, StringArg } from '../cli/argTypes'
import { chxCommand, isChxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import { resolveWords, usageOf } from '../cli/syntax'
import { framingOf } from '../camera'
import { runOp, targetsOf } from '../display'
import { warnIgnored } from './warn'
import { recallView } from './viewCommands'

const view = chxCommand({
  words: ['view'],
  args: [
    { name: 'objects', type: SpecArg, role: 'optional' },
    { name: 'frames', type: StringArg, role: 'optional', ignored: true },
    { name: 'pad', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: false,
  summary: 'Move the camera so that what is named (everything when nothing is) fills the view, or show a named view.',
  async run(ctx, args, cc) {
    // `view v1`: a word that is no specification lands in `frames`; a saved view by that name is shown.
    if (args.objects === '' && args.frames !== '' && !/^\d+$/.test(args.frames)) {
      const recalled = await recallView(ctx, cc, args.frames)
      return recalled ?? { ok: false, error: `Error: view: "${args.frames}" is neither an atom specification nor a named view` }
    }
    warnIgnored(cc, 'view', args, ['frames', 'pad'])
    const found = targetsOf(ctx, cc.sceneId, args.objects)
    if (!found.ok) return found
    const framing = framingOf(ctx, cc.sceneId, cc.viewId, found.targets)
    if (!framing) return { ok: false, error: 'Error: view: nothing to show' }
    const res = await runOp(ctx, cc, 'set_view', {
      zoom: framing.zoom, slab: framing.slab, distance: null, center: framing.center, fitSlab: null, objId: null,
    })
    return res.ok ? { ok: true } : res
  },
})

/**
 * `undo` / `redo`: the runtime runs a lone one outside the transaction
 * (`undoStack`); this body is reached only on a line with other commands.
 */
function undoStack(name: 'undo' | 'redo'): ChxCommand {
  return chxCommand({
    words: [name],
    args: [],
    undoStack: name,
    mutates: false,
    summary: name === 'undo' ? 'Undo the last change.' : 'Redo the last undone change.',
    run: () => ({ ok: false, error: `Error: ${name} must be the only command on the line` }),
  })
}

/** `usage` and `help` need the command list, which is made after them. */
let allCommands: () => readonly ConsoleCommand[] = () => []

/** Give `usage` / `help` the command list (`registry.ts`). */
export function setCommandList(list: () => readonly ConsoleCommand[]): void {
  allCommands = list
}

const usage = chxCommand({
  words: ['usage'],
  args: [{ name: 'commandName', type: RestOfLine, role: 'optional' }],
  mutates: false,
  summary: 'Show how a command is written.',
  run(_ctx, args, cc) {
    const commands = allCommands().filter(isChxCommand)
    if (args.commandName === '') {
      for (const c of commands) cc.print(usageOf(c))
      return { ok: true }
    }
    const r = resolveWords(args.commandName, commands)
    if ('error' in r) return { ok: false, error: r.error }
    cc.print(usageOf(r.spec))
    for (const a of r.spec.args) {
      if (a.role === 'keyword' || a.role === 'optional') {
        cc.print(`  ${a.name}: ${a.type.name || 'no value'}${a.ignored ? ' (not supported yet; ignored)' : ''}`)
      }
    }
    return { ok: true }
  },
})

const help = chxCommand({
  words: ['help'],
  args: [{ name: 'topic', type: RestOfLine, role: 'optional' }],
  mutates: false,
  summary: 'List the commands, or show how one is written.',
  run(ctx, args, cc) {
    if (args.topic !== '') return usage.run(ctx, { commandName: args.topic }, cc)
    const rows = [...allCommands()].sort((a, b) => a.name.localeCompare(b.name)).map((c) => `| \`${c.name}\` | ${c.summary} |`)
    cc.printMarkdown(['ChimeraX commands the console understands (`usage <command>` for the arguments):', '', '| Command | |', '|---|---|', ...rows].join('\n'))
    return { ok: true }
  },
})

export const MISC_COMMANDS: Record<string, ChxCommand> = {
  view,
  undo: undoStack('undo'),
  redo: undoStack('redo'),
  usage,
  help,
}
