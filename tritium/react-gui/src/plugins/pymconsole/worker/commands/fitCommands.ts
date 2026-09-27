/**
 * @file plugins/pymconsole/worker/commands/fitCommands.ts
 * @description `align`, `super` and `pair_fit`: moving one molecule onto another.
 *
 * CueMol has two superpositions (`superposeMol`, the Superpose dialog's
 * service): SSM, which finds the structural correspondence itself, and a
 * least-squares fit of atoms paired in order. PyMOL's `align` (sequence
 * alignment, then fit) and `super` (structure-based) both map to SSM --
 * there is no sequence aligner here -- and `pair_fit` (atoms given in
 * matching order) is the least-squares fit. `cealign` has no counterpart.
 *
 * The RMSD PyMOL prints comes from `superposeSSM_rmsd` (SSM) or `calcRMSD`
 * after the fit (least squares); the C++ side only writes it to the log.
 */

import type { MolAnlManager } from '@cuemol/core/src/wrappers/MolAnlManager'
import { superposeMol } from '@renderer/worker/server/services/molops/superposeMol'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'
import { getSelHitCount } from '@renderer/worker/server/services/select/getSelHitCount'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { isDefaulted, resolveMolSelection } from './helpers'
import type { MolSelection } from './helpers'

/** The molecule and native selection an RMSD call takes. */
function nativeOf(ctx: WorkerContext, sceneId: number, t: MolSelection): { mol: unknown; sel: unknown } | null {
  const mol = getSceneOrNull(ctx, sceneId)?.getObject(t.obj.uid)
  const sel = makeSel(ctx, t.selStr, sceneId)
  return mol && sel ? { mol, sel } : null
}

/** Atoms `t` covers, or null when the expression does not compile. */
function atomCount(ctx: WorkerContext, sceneId: number, t: MolSelection): number | null {
  return getSelHitCount(ctx, { sceneId, molId: t.obj.uid, selStr: t.selStr }).count
}

/** Read the mobile and target arguments into one molecule each. */
function resolvePair(
  ctx: WorkerContext,
  cc: CmdContext,
  mobile: string,
  target: string,
): { ok: true; mob: MolSelection; ref: MolSelection } | { ok: false; error: string } {
  const mob = resolveMolSelection(ctx, cc.sceneId, mobile, cc.warn)
  if (!mob.ok) return mob
  const ref = resolveMolSelection(ctx, cc.sceneId, target, cc.warn)
  if (!ref.ok) return ref
  if (mob.target.obj.uid === ref.target.obj.uid) {
    return { ok: false, error: `Error: mobile and target are the same molecule ("${mob.target.obj.name}")` }
  }
  return { ok: true, mob: mob.target, ref: ref.target }
}

/** Run the superposition. The mobile molecule moves; the target stays. */
function superpose(
  ctx: WorkerContext,
  cc: CmdContext,
  algo: 'SSM' | 'LSQ',
  mob: MolSelection,
  ref: MolSelection,
): CmdOutcome {
  const res = superposeMol(ctx, {
    sceneId: cc.sceneId,
    viewId: cc.viewId,
    algo,
    refObjId: ref.obj.uid,
    refSel: ref.selStr,
    movObjId: mob.obj.uid,
    movSel: mob.selStr,
    useprop: false,
    autoRecenter: false,
  })
  if (!res.ok) return { ok: false, error: `Error: superposition failed: ${res.error ?? 'unknown reason'}` }
  return { ok: true }
}

/** Ignored PyMOL tuning arguments, with the defaults `align` / `super` declare. */
const TUNING_DEFAULTS: ReadonlyArray<readonly [string, string]> = [
  ['cutoff', '2.0'],
  ['cycles', '5'],
  ['object', ''],
]

/** `align` and `super`: both an SSM superposition here. */
function ssmCommand(name: 'align' | 'super'): PymCommand {
  return {
    name,
    params: [
      { name: 'mobile' },
      { name: 'target' },
      ...TUNING_DEFAULTS.map(([n, d]) => ({ name: n, default: d })),
    ],
    mode: 'strict',
    mutates: true,
    summary:
      name === 'align'
        ? 'Superpose mobile onto target (SSM; there is no sequence alignment here).'
        : 'Superpose mobile onto target by structure (SSM).',
    completions: [
      { source: 'objects', description: 'object', suffix: ', ' },
      { source: 'objects', description: 'object', suffix: '' },
    ],
    run(ctx, args, cc) {
      for (const [n, d] of TUNING_DEFAULTS) {
        if (!isDefaulted(args[n], d)) cc.warn(`${name}: ${n} is ignored (SSM chooses its own)`)
      }
      const pair = resolvePair(ctx, cc, args.mobile, args.target)
      if (!pair.ok) return pair
      const fitted = superpose(ctx, cc, 'SSM', pair.mob, pair.ref)
      if (!fitted.ok) return fitted

      // Reported after the move, from the same SSM correspondence.
      const mgr = ctx.svc.getService('MolAnlManager') as MolAnlManager | null
      const ref = nativeOf(ctx, cc.sceneId, pair.ref)
      const mob = nativeOf(ctx, cc.sceneId, pair.mob)
      if (mgr && ref && mob) {
        try {
          const rmsd = mgr.superposeSSM_rmsd(ref.mol as never, ref.sel as never, mob.mol as never, mob.sel as never, false)
          cc.print(` Executive: RMSD = ${rmsd.toFixed(3).padStart(8)} (SSM, "${pair.mob.obj.name}" onto "${pair.ref.obj.name}")`)
        } catch {
          cc.warn('the RMSD could not be computed')
        }
      }
      return { ok: true }
    },
  }
}

const pairFit: PymCommand = {
  name: 'pair_fit',
  params: [{ name: 'mobile' }, { name: 'target' }],
  mode: 'strict',
  mutates: true,
  summary: 'Least-squares fit of mobile onto target, atoms paired in order.',
  completions: [
    { source: 'selections', description: 'selection', suffix: ', ' },
    { source: 'selections', description: 'selection', suffix: '' },
  ],
  run(ctx, args, cc) {
    const pair = resolvePair(ctx, cc, args.mobile, args.target)
    if (!pair.ok) return pair

    // The fit pairs atoms in order and throws when the counts differ; say so
    // with the numbers instead.
    const nMob = atomCount(ctx, cc.sceneId, pair.mob)
    const nRef = atomCount(ctx, cc.sceneId, pair.ref)
    if (nMob === null || nRef === null) return { ok: false, error: 'Error: a selection did not compile' }
    if (nMob === 0 || nRef === 0) return { ok: false, error: 'Error: a selection matched no atoms' }
    if (nMob !== nRef) {
      return { ok: false, error: `Error: atom counts differ (${nMob} vs ${nRef}); pair_fit needs matching atoms` }
    }

    const fitted = superpose(ctx, cc, 'LSQ', pair.mob, pair.ref)
    if (!fitted.ok) return fitted

    const mgr = ctx.svc.getService('MolAnlManager') as MolAnlManager | null
    const ref = nativeOf(ctx, cc.sceneId, pair.ref)
    const mob = nativeOf(ctx, cc.sceneId, pair.mob)
    if (mgr && ref && mob) {
      try {
        const rmsd = mgr.calcRMSD(ref.mol as never, ref.sel as never, mob.mol as never, mob.sel as never, '')
        cc.print(` ExecutiveRMS: RMSD = ${rmsd.toFixed(3).padStart(8)} (${nMob} to ${nRef} atoms)`)
      } catch {
        cc.warn('the RMSD could not be computed')
      }
    }
    return { ok: true }
  },
}

export const FIT_COMMANDS: PymCommand[] = [ssmCommand('align'), ssmCommand('super'), pairFit]
