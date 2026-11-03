/**
 * @file plugins/console/worker/dialects/chimerax/commands/displayCommands.ts
 * @description `show`, `hide`, `cartoon`, `cartoon hide` and `style`.
 *
 * Each reads the selections of the molecule's `chx:` renderers, combines
 * the specification in (show adds, hide takes away, as PyMOL's flags and
 * ChimeraX's display flags do), and writes them back with
 * `set_renderer_selection` (`display.ts`).
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome } from '../../../runtime/types'
import { BoolArg, EnumOf, ListOf, SpecArg, StringArg } from '../cli/argTypes'
import { chxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import {
  atomRenderers,
  cartoonRenderers,
  ensureOwned,
  intersect,
  minus,
  readSel,
  runOp,
  targetsOf,
  union,
  writeSel,
} from '../display'
import type { AtomStyle, Target } from '../display'
import { warnIgnored } from './warn'

/** What `show` / `hide` can act on (cli.py `WhatArg`). */
const WHAT = ['atoms', 'bonds', 'pseudobonds', 'pbonds', 'cartoons', 'ribbons', 'surfaces', 'models']

/** The parts a `target` string's letters name (`show.py` `TargetArg`). */
type Part = 'atoms' | 'cartoons' | 'models' | 'surfaces' | 'pseudobonds'

const LETTERS: Readonly<Record<string, Part>> = {
  a: 'atoms', b: 'atoms', c: 'cartoons', r: 'cartoons', m: 'models', s: 'surfaces', p: 'pseudobonds',
}

/** The parts a `what` list or `target` letters name; atoms when neither is given. */
function partsOf(what: string, target: string): { ok: true; parts: Set<Part> } | { ok: false; error: string } {
  const parts = new Set<Part>()
  for (const w of what === '' ? [] : what.split(',')) {
    if (w === 'atoms' || w === 'bonds') parts.add('atoms')
    else if (w === 'cartoons' || w === 'ribbons') parts.add('cartoons')
    else if (w === 'models') parts.add('models')
    else if (w === 'surfaces') parts.add('surfaces')
    else parts.add('pseudobonds')
  }
  for (const ch of target) {
    const p = LETTERS[ch]
    if (!p) return { ok: false, error: `Error: "${ch}" in target is not one of a b c m p r s` }
    parts.add(p)
  }
  if (parts.size === 0) parts.add('atoms')
  return { ok: true, parts }
}

/** Show or hide `parts` of each target. */
async function showHide(ctx: WorkerContext, cc: CmdContext, targets: readonly Target[], parts: Set<Part>, show: boolean): Promise<CmdOutcome> {
  if (parts.has('surfaces')) cc.warn(`${show ? 'show' : 'hide'}: surfaces are not supported yet; ignored`)
  if (parts.has('pseudobonds')) cc.warn(`${show ? 'show' : 'hide'}: pseudobonds are not supported yet; ignored`)
  for (const t of targets) {
    if (parts.has('models')) {
      const res = await runOp(ctx, cc, 'set_visible', { nodeId: t.obj.uid, nodeType: 'object', visible: show })
      if (!res.ok) return res
    }
    if (!parts.has('atoms') && !parts.has('cartoons')) continue
    const owned = await ensureOwned(ctx, cc, t.obj)
    if (!owned.ok) return owned
    if (parts.has('atoms')) {
      const r = atomRenderers(owned.ids)
      const sel = (id: number) => readSel(ctx, cc.sceneId, id)
      const writes: [number, string][] = show
        // New atoms come in as sticks; atoms already shown keep their style.
        ? [[r.stick, union(sel(r.stick), minus(t.sel, union(sel(r.ball), sel(r.sphere))))]]
        : [r.stick, r.ball, r.sphere].map((id) => [id, minus(sel(id), t.sel)])
      for (const [id, next] of writes) {
        const w = await writeSel(ctx, cc, id, next)
        if (!w.ok) return w
      }
    }
    if (parts.has('cartoons')) {
      for (const c of cartoonRenderers(owned.ids)) {
        const cur = readSel(ctx, cc.sceneId, c.id)
        const next = show ? union(cur, intersect(t.sel, c.scope)) : minus(cur, t.sel)
        const w = await writeSel(ctx, cc, c.id, next)
        if (!w.ok) return w
      }
    }
  }
  return { ok: true }
}

/** `show` / `hide`: [spec] [what], target. */
function showHideCommand(show: boolean): ChxCommand {
  const word = show ? 'show' : 'hide'
  return chxCommand({
    words: [word],
    args: [
      { name: 'objects', type: SpecArg, role: 'optional' },
      { name: 'what', type: ListOf(EnumOf(WHAT)), role: 'optional' },
      { name: 'target', type: StringArg, role: 'keyword' },
    ],
    mutates: true,
    summary: show ? 'Show atoms, cartoons or models.' : 'Hide atoms, cartoons or models.',
    async run(ctx, args, cc) {
      const parts = partsOf(args.what, args.target)
      if (!parts.ok) return parts
      const found = targetsOf(ctx, cc.sceneId, args.objects)
      if (!found.ok) return found
      return showHide(ctx, cc, found.targets, parts.parts, show)
    },
  })
}

/** `cartoon` / `cartoon hide`: [spec]. */
function cartoonCommand(show: boolean): ChxCommand {
  return chxCommand({
    words: show ? ['cartoon'] : ['cartoon', 'hide'],
    args: [
      { name: 'atoms', type: SpecArg, role: 'optional' },
      ...(show
        ? [
            { name: 'smooth', type: StringArg, role: 'keyword' as const, ignored: true },
            { name: 'suppressBackboneDisplay', type: BoolArg, role: 'keyword' as const, ignored: true },
          ]
        : []),
    ],
    mutates: true,
    summary: show ? 'Show residues as cartoon.' : 'Hide the cartoon of residues.',
    async run(ctx, args, cc) {
      warnIgnored(cc, 'cartoon', args, ['smooth', 'suppressBackboneDisplay'])
      const found = targetsOf(ctx, cc.sceneId, args.atoms)
      if (!found.ok) return found
      return showHide(ctx, cc, found.targets, new Set(['cartoons']), show)
    },
  })
}

const STYLES: readonly AtomStyle[] = ['stick', 'ball', 'sphere']

const style = chxCommand({
  words: ['style'],
  args: [
    { name: 'objects', type: SpecArg, role: 'optional' },
    { name: 'atomStyle', type: EnumOf(STYLES), role: 'optional' },
    { name: 'dashes', type: StringArg, role: 'keyword', ignored: true },
    { name: 'ringFill', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: true,
  summary: 'Draw atoms as stick, ball or sphere.',
  async run(ctx, args, cc) {
    warnIgnored(cc, 'style', args, ['dashes', 'ringFill'])
    const to = args.atomStyle as AtomStyle | ''
    if (to === '') return { ok: false, error: 'Error: style: give stick, ball or sphere' }
    const found = targetsOf(ctx, cc.sceneId, args.objects)
    if (!found.ok) return found
    for (const t of found.targets) {
      const owned = await ensureOwned(ctx, cc, t.obj)
      if (!owned.ok) return owned
      const r = atomRenderers(owned.ids)
      const others = STYLES.filter((s) => s !== to)
      const sel = (s: AtomStyle) => readSel(ctx, cc.sceneId, r[s])
      // Only atoms shown move: a hidden atom has no style to keep (display.ts).
      const moved = intersect(t.sel, union(sel(others[0]), sel(others[1])))
      const writes: [number, string][] = [
        [r[to], union(sel(to), moved)],
        ...others.map((s): [number, string] => [r[s], minus(sel(s), t.sel)]),
      ]
      for (const [id, next] of writes) {
        const w = await writeSel(ctx, cc, id, next)
        if (!w.ok) return w
      }
    }
    return { ok: true }
  },
})

export const DISPLAY_COMMANDS: Record<string, ChxCommand> = {
  show: showHideCommand(true),
  hide: showHideCommand(false),
  cartoon: cartoonCommand(true),
  cartoonHide: cartoonCommand(false),
  style,
}
