/**
 * @file plugins/chimerax-console/worker/commands/miscCommands.ts
 * @description `view`, `undo`, `redo`, `usage` and `help`.
 */

import type { ConsoleCommand } from '@plugins/console/worker/dialect-api'
import { BoolArg, IntArg, Or, RestOfLine, SpecArg, StringArg } from '../cli/argTypes'
import type { ArgType } from '../cli/argTypes'
import { chxCommand, isChxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import { resolveWords, usageOf } from '../cli/syntax'
import { framingOf } from '../camera'
import { readSpec, runOp, targetsOf } from '../display'
import { warnIgnored } from './warn'
import { recallView } from './viewCommands'

/** A view name (cli.py `NamedViewArg`): a word that is not a specification. */
const NamedViewArg: ArgType = { ...StringArg, name: 'a view name' }

/**
 * `view [objects | name] [frames] [cofr]`. ChimeraX reads the first word as
 * a specification, else as a view name (`Or(ObjectsArg, NamedViewArg)`).
 */
const view = chxCommand({
  words: ['view'],
  args: [
    { name: 'objects', type: Or(SpecArg, NamedViewArg), role: 'optional' },
    { name: 'frames', type: IntArg, role: 'optional' },
    { name: 'cofr', type: BoolArg, role: 'keyword' },
    { name: 'pad', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: false,
  summary: 'Move the camera so that what is named (everything when nothing is) fills the view, or show a named view.',
  async run(ctx, args, cc) {
    // cofr false keeps the centre of rotation while fitting; CueMol always
    // turns about the view's centre, which the fit moves.
    if (args.cofr === 'false') {
      return { ok: false, error: 'Error: view: cofr false is not supported (CueMol turns about the centre of the view, which fitting moves)' }
    }
    const spec = args.objects.trim() === '' ? null : readSpec(ctx, cc.sceneId, args.objects)
    if (spec && !spec.ok) {
      const recalled = await recallView(ctx, cc, args.objects)
      if (!recalled) return { ok: false, error: `Error: view: "${args.objects}" is neither an atom specification nor a named view` }
      if (recalled.ok && args.frames !== '') cc.warn('view: frames is not supported (the view changes at once); ignored')
      return recalled
    }
    if (args.frames !== '') cc.warn('view: frames is not supported (the view changes at once); ignored')
    warnIgnored(cc, 'view', args, ['pad'])
    const found = targetsOf(ctx, cc.sceneId, args.objects)
    if (!found.ok) return found
    const framing = framingOf(ctx, cc.sceneId, cc.viewId, found.targets)
    if (!framing) return { ok: false, error: 'Error: view: nothing to show' }
    // Every argument of set_view is given: one left out reaches the op as undefined, not null.
    const res = await runOp(ctx, cc, 'set_view', {
      zoom: framing.zoom, slab: framing.slab, distance: null, center: framing.center, rotation: null, fitSlab: null, objId: null,
    })
    return res.ok ? { ok: true } : res
  },
})

/** `view initial [models]`: CueMol objects never move, so they are where they started. */
const viewInitial = chxCommand({
  words: ['view', 'initial'],
  args: [{ name: 'models', type: SpecArg, role: 'optional' }],
  mutates: false,
  summary: 'Put models back where they were opened (nothing to do: CueMol objects do not move).',
  run(_ctx, _args, cc) {
    cc.print('view initial: CueMol objects have no positions of their own, so they are in their initial positions')
    return { ok: true }
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
  viewInitial,
  undo: undoStack('undo'),
  redo: undoStack('redo'),
  usage,
  help,
}
