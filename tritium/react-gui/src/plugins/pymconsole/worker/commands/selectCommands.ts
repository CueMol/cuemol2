/**
 * @file plugins/pymconsole/worker/commands/selectCommands.ts
 * @description `select`, `indicate`, `deselect` and `count_atoms`.
 *
 * PyMOL and CueMol disagree about what a selection is, and the disagreement
 * cannot be hidden. In PyMOL `select sele, expr` makes a named set of atoms
 * that exists in its own right, shows as dots, and can be enabled and
 * disabled. In CueMol the same idea is split in two: a name is a stored
 * *expression* (`StyleManager`'s `sel` entries), and what is selected is each
 * molecule's own `sel` property, re-evaluated per molecule.
 *
 * So `select` does both halves -- stores the name and applies the expression,
 * so something visibly happens -- and the help says the name is an alias for
 * an expression rather than a fixed set of atoms. `count_atoms sele` on a
 * name will therefore answer per molecule, not once.
 */

import { applyMolSelString } from '@renderer/worker/server/services/select/applyMolSelString'
import { getSelHitCount } from '@renderer/worker/server/services/select/getSelHitCount'
import { saveSelDef } from '@renderer/worker/server/services/select/saveSelDef'
import { getMolChains } from '@renderer/worker/server/services/select/getMolStructure'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { translateSelection } from '../sel/translate'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { isDefaulted, molecules, resolveOneObject } from './helpers'

/** Apply one expression to every molecule in the scene. */
function applyToAll(
  ctx: WorkerContext,
  cc: CmdContext,
  selStr: string,
): CmdOutcome {
  const mols = molecules(ctx, cc.sceneId)
  if (mols.length === 0) return { ok: false, error: 'Error: no molecule in the scene' }
  for (const mol of mols) {
    const res = applyMolSelString(ctx, { sceneId: cc.sceneId, molId: mol.uid, selStr })
    if (!res.ok) {
      return { ok: false, error: `Error: could not apply the selection to "${mol.name}"` }
    }
  }
  return { ok: true }
}

const select: PymCommand = {
  name: 'select',
  params: [
    { name: 'name' },
    { name: 'selection', default: '' },
    { name: 'enable', default: '-1' },
    { name: 'quiet', default: '1' },
    { name: 'merge', default: '0' },
    { name: 'state', default: '0' },
  ],
  // PyMOL's `select foo=chain A` is a name and an expression, not a named
  // argument.
  mode: 'legacy',
  mutates: true,
  summary: 'Name a selection expression, and show what it matches.',
  completions: [null, { source: 'selections', description: 'selection', suffix: '' }],
  run(ctx, args, cc) {
    for (const [name, def] of [
      ['enable', '-1'],
      ['merge', '0'],
      ['state', '0'],
    ] as const) {
      if (!isDefaulted(args[name], def)) cc.warn(`select: ${name} is ignored (not supported)`)
    }
    // PyMOL's one-argument form selects into the default name `sele`.
    const hasExpr = args.selection.trim() !== ''
    const name = hasExpr ? args.name.trim() : 'sele'
    const source = hasExpr ? args.selection : args.name
    if (name === '') return { ok: false, error: 'Error: the selection needs a name' }

    const translated = translateSelection(source)
    if (!translated.ok) return translated

    const saved = saveSelDef(ctx, { sceneId: cc.sceneId, name, expr: translated.expr })
    if (!saved.ok) return { ok: false, error: `Error: could not define "${name}"` }

    // Applying it is the visible half: a CueMol named selection on its own
    // changes nothing on screen.
    const applied = applyToAll(ctx, cc, translated.expr)
    if (!applied.ok) return applied
    cc.print(` select: "${name}" defined as ${translated.expr}`)
    return { ok: true }
  },
}

const indicate: PymCommand = {
  name: 'indicate',
  params: [{ name: 'selection', default: 'all' }],
  mode: 'strict',
  mutates: true,
  summary: 'Show what an expression matches, without naming it.',
  completions: [{ source: 'selections', description: 'selection', suffix: '' }],
  run(ctx, args, cc) {
    const translated = translateSelection(args.selection)
    if (!translated.ok) return translated
    return applyToAll(ctx, cc, translated.expr)
  },
}

const deselect: PymCommand = {
  name: 'deselect',
  params: [],
  mode: 'strict',
  mutates: true,
  summary: 'Clear the selection on every molecule.',
  run(ctx, _args, cc) {
    // An empty expression is how the service clears a molecule's selection.
    const mols = molecules(ctx, cc.sceneId)
    for (const mol of mols) {
      applyMolSelString(ctx, { sceneId: cc.sceneId, molId: mol.uid, selStr: '' })
    }
    return { ok: true }
  },
}

const countAtoms: PymCommand = {
  name: 'count_atoms',
  params: [{ name: 'selection', default: 'all' }, { name: 'state', default: '0' }],
  mode: 'strict',
  mutates: false,
  summary: 'Count the atoms an expression matches, per molecule.',
  completions: [{ source: 'selections', description: 'selection', suffix: '' }],
  run(ctx, args, cc) {
    if (!isDefaulted(args.state, '0')) cc.warn('count_atoms: state is ignored (not supported)')
    const translated = translateSelection(args.selection)
    if (!translated.ok) return translated

    const mols = molecules(ctx, cc.sceneId)
    if (mols.length === 0) return { ok: false, error: 'Error: no molecule in the scene' }
    let total = 0
    for (const mol of mols) {
      const res = getSelHitCount(ctx, {
        sceneId: cc.sceneId,
        molId: mol.uid,
        selStr: translated.expr,
      })
      if (res.count === null) {
        return { ok: false, error: `Error: "${args.selection}" did not compile` }
      }
      total += res.count
      // Per molecule, because a CueMol expression is evaluated against each
      // one rather than naming a single set of atoms.
      if (mols.length > 1) cc.print(` ${mol.name}: ${res.count}`)
    }
    cc.print(` count_atoms: ${total}`)
    return { ok: true }
  },
}

const getChains: PymCommand = {
  name: 'get_chains',
  params: [{ name: 'selection', default: 'all' }, { name: 'state', default: '0' }],
  mode: 'strict',
  mutates: false,
  summary: 'List the chain names of an object.',
  completions: [{ source: 'objects', description: 'object', suffix: '' }],
  run(ctx, args, cc) {
    if (!isDefaulted(args.state, '0')) cc.warn('get_chains: state is ignored (not supported)')
    // PyMOL takes a selection; CueMol lists the chains of one molecule, so
    // this takes an object name.
    const wantsAll = args.selection.trim() === '' || args.selection.trim() === 'all'
    const mols = wantsAll
      ? molecules(ctx, cc.sceneId)
      : (() => {
          const found = resolveOneObject(ctx, cc.sceneId, args.selection)
          return found.ok ? [found.obj] : []
        })()
    if (mols.length === 0) {
      return { ok: false, error: `Error: no molecule named "${args.selection}"` }
    }
    for (const mol of mols) {
      const res = getMolChains(ctx, { sceneId: cc.sceneId, molId: mol.uid })
      if (!res.ok) continue
      const names = res.chains.map((c) => c.name)
      cc.print(mols.length > 1 ? ` ${mol.name}: ${names.join(' ')}` : names.join(' '))
    }
    return { ok: true }
  },
}

export const SELECT_COMMANDS: PymCommand[] = [
  select,
  indicate,
  deselect,
  countAtoms,
  getChains,
]
