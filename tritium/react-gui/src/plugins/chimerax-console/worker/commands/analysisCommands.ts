/**
 * @file plugins/chimerax-console/worker/commands/analysisCommands.ts
 * @description `distance` (with `delete`, `~distance`), `align` and
 * `matchmaker` (`mmaker`).
 *
 * `distance` measures between exactly two atoms (`measure_geometry`) and
 * draws the measurement into the first atom's molecule, on its
 * `chx:distance` renderer. ChimeraX's report for more atoms (the minimum,
 * average and maximum over the pairs) is not made.
 *
 * `align` fits atoms onto others pair by pair in order: `superpose` with
 * LSQ, the RMSD worked out from the atoms after the move. `matchmaker`
 * pairs residues by a sequence alignment in ChimeraX and drops the far
 * pairs over several rounds; CueMol has no such fit, so it superposes by
 * US-align, a structural alignment, which can pair residues differently --
 * a warning says so every time.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdOutcome } from '@plugins/console/worker/dialect-api'
import { IntArg, SpecArg, StringArg } from '../cli/argTypes'
import { chxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import { forEachAtom, ownedOn, runOp, targetsOf } from '../display'
import type { AtomView, Target } from '../display'
import { isMolecule, numberedObjects } from '../models'
import { warnIgnored } from './warn'

/** The interaction renderer `distance` draws into. */
const DISTANCE = 'chx:distance'

/** An atom with the molecule it is in. */
interface FoundAtom {
  target: Target
  atom: AtomView
}

/** The atoms of a specification, stopping after `limit`. */
function atomsOf(ctx: WorkerContext, sceneId: number, targets: readonly Target[], limit: number): FoundAtom[] {
  const out: FoundAtom[] = []
  for (const target of targets) {
    forEachAtom(ctx, sceneId, target.obj.uid, target.sel, (atom) => {
      out.push({ target, atom })
      return out.length < limit
    })
    if (out.length >= limit) break
  }
  return out
}

/** An atom as ChimeraX names it in a report: `/A ALA 10 CA`, with `#1` first when there are several models. */
function atomLabel(f: FoundAtom, withModel: boolean): string {
  const a = f.atom
  return `${withModel ? `#${f.target.obj.model}` : ''}/${a.chainName} ${a.residName} ${a.residIndex} ${a.name}`
}

/** An atom as an interaction renderer lists it (C++ `MolAtom::formatMsg`, without the alt loc). */
function intrAtomName(a: AtomView): string {
  return `${a.chainName} ${a.residName} ${a.residIndex} ${a.name}`
}

const DISTANCE_IGNORED = ['color', 'dashes', 'radius', 'symmetry', 'signed', 'monitor']

const distance = chxCommand({
  words: ['distance'],
  args: [
    { name: 'objects', type: SpecArg, role: 'required' },
    { name: 'decimalPlaces', type: IntArg, role: 'keyword', default: '3' },
    ...DISTANCE_IGNORED.map((name) => ({ name, type: StringArg, role: 'keyword' as const, ignored: true })),
  ],
  mutates: true,
  summary: 'Measure and draw the distance between two atoms.',
  async run(ctx, args, cc) {
    warnIgnored(cc, 'distance', args, DISTANCE_IGNORED)
    const found = targetsOf(ctx, cc.sceneId, args.objects)
    if (!found.ok) return found
    const atoms = atomsOf(ctx, cc.sceneId, found.targets, 3)
    if (atoms.length !== 2) {
      return { ok: false, error: `Error: distance: "${args.objects}" must be exactly two atoms (it is ${atoms.length === 3 ? 'more' : atoms.length})` }
    }
    const [a, b] = atoms
    const res = await runOp(ctx, cc, 'measure_geometry', {
      objId: a.target.obj.uid,
      atoms: atoms.map((f) => ({ chain: f.atom.chainName, resid: f.atom.residIndex, atomName: f.atom.name })),
      draw: true,
      label: DISTANCE,
      // By uid: two models can have the same name.
      atomObjects: a.target.obj.uid === b.target.obj.uid ? null : `#${b.target.obj.uid}`,
    })
    if (!res.ok) return res
    const value = (res.data as { exactValue: number }).exactValue
    const many = numberedObjects(ctx, cc.sceneId).filter(isMolecule).length > 1
    cc.print(`Distance between ${atomLabel(a, many)} and ${atomLabel(b, many)}: ${value.toFixed(Number(args.decimalPlaces))}Å`)
    return { ok: true }
  },
})

/**
 * `distance delete` / `~distance`: with no atoms, every console distance;
 * with two atoms, the distance between them.
 */
function distanceDeleteCommand(words: string[]): ChxCommand {
  return chxCommand({
    words,
    args: [{ name: 'objects', type: SpecArg, role: 'optional' }],
    mutates: true,
    summary: 'Delete distances (all of them when no atoms are given).',
    async run(ctx, args, cc): Promise<CmdOutcome> {
      const mols = numberedObjects(ctx, cc.sceneId).filter(isMolecule)
      if (args.objects.trim() === '') {
        for (const m of mols) {
          const id = ownedOn(ctx, cc.sceneId, m.uid).get(DISTANCE)
          if (id === undefined) continue
          const res = await runOp(ctx, cc, 'delete_node', { nodeId: id, nodeType: 'renderer' })
          if (!res.ok) return res
        }
        return { ok: true }
      }
      const found = targetsOf(ctx, cc.sceneId, args.objects)
      if (!found.ok) return found
      const atoms = atomsOf(ctx, cc.sceneId, found.targets, 3)
      if (atoms.length !== 2) return { ok: false, error: `Error: ~distance: "${args.objects}" must be exactly two atoms` }
      const pair = new Set(atoms.map((f) => intrAtomName(f.atom)))
      const id = ownedOn(ctx, cc.sceneId, atoms[0].target.obj.uid).get(DISTANCE)
      const listed = id === undefined ? null : await runOp(ctx, cc, 'list_interactions', { rendId: id })
      if (!listed || !listed.ok) return { ok: false, error: 'Error: ~distance: there is no distance between those atoms' }
      const entries = (listed.data as { entries: { number: number; mode: string; atoms: string[] }[] }).entries
      const hit = entries.find((e) => e.mode === 'distance' && e.atoms.length === 2 && e.atoms.every((s) => pair.has(s.replace(/:.$/, ''))))
      if (!hit) return { ok: false, error: 'Error: ~distance: there is no distance between those atoms' }
      return runOp(ctx, cc, 'remove_interaction', { rendId: id, number: hit.number })
    },
  })
}

/** The one molecule a specification is in, or why it is not one. */
function oneMolecule(targets: readonly Target[], what: string, spec: string): { ok: true; target: Target } | { ok: false; error: string } {
  if (targets.length === 1) return { ok: true, target: targets[0] }
  return { ok: false, error: `Error: ${what}: "${spec}" must be in one model (it is in ${targets.length})` }
}

/** The root mean square distance between paired positions. */
export function rmsd(a: readonly AtomView['pos'][], b: readonly AtomView['pos'][]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i].x - b[i].x) ** 2 + (a[i].y - b[i].y) ** 2 + (a[i].z - b[i].z) ** 2
  return Math.sqrt(sum / a.length)
}

/** The positions of a target's atoms, in order. */
function positions(ctx: WorkerContext, sceneId: number, t: Target): AtomView['pos'][] {
  const out: AtomView['pos'][] = []
  forEachAtom(ctx, sceneId, t.obj.uid, t.sel, (a) => {
    out.push({ x: a.pos.x, y: a.pos.y, z: a.pos.z })
  })
  return out
}

const ALIGN_REFUSED = ['each', 'matchChainIds', 'matchNumbering', 'matchAtomNames', 'cutoffDistance', 'reportMatrix']

const align = chxCommand({
  words: ['align'],
  args: [
    { name: 'atoms', type: SpecArg, role: 'required' },
    { name: 'toAtoms', type: SpecArg, role: 'keyword' },
    { name: 'move', type: StringArg, role: 'keyword' },
    ...ALIGN_REFUSED.map((name) => ({ name, type: StringArg, role: 'keyword' as const })),
  ],
  mutates: true,
  summary: 'Move a model so that atoms fit onto others, pair by pair in order (least squares).',
  async run(ctx, args, cc) {
    const refused = ALIGN_REFUSED.find((k) => args[k] !== '')
    if (refused) return { ok: false, error: `Error: align: ${refused} is not supported` }
    if (args.move !== '' && !'structures'.startsWith(args.move)) return { ok: false, error: 'Error: align: only move structures is supported' }
    if (args.toAtoms === '') return { ok: false, error: 'Error: align: give the atoms to fit onto with toAtoms' }
    const mov = targetsOf(ctx, cc.sceneId, args.atoms)
    if (!mov.ok) return mov
    const ref = targetsOf(ctx, cc.sceneId, args.toAtoms)
    if (!ref.ok) return ref
    const m = oneMolecule(mov.targets, 'align', args.atoms)
    if (!m.ok) return m
    const r = oneMolecule(ref.targets, 'align', args.toAtoms)
    if (!r.ok) return r
    if (m.target.obj.uid === r.target.obj.uid) return { ok: false, error: 'Error: align: the two sets of atoms are in the same model' }
    const n = positions(ctx, cc.sceneId, m.target).length
    const nRef = positions(ctx, cc.sceneId, r.target).length
    if (n !== nRef) return { ok: false, error: `Error: align: different numbers of atoms (${n} and ${nRef})` }
    if (n < 3) return { ok: false, error: `Error: align: fitting needs at least 3 atom pairs (got ${n})` }
    const res = await runOp(ctx, cc, 'superpose', {
      movId: m.target.obj.uid, refId: r.target.obj.uid, movSel: m.target.sel, refSel: r.target.sel,
      algo: 'LSQ', pivot: null, keepAsProperty: null,
    })
    if (!res.ok) return res
    const value = rmsd(positions(ctx, cc.sceneId, m.target), positions(ctx, cc.sceneId, r.target))
    cc.print(`RMSD between ${n} atom pairs is ${value.toFixed(3)} angstroms`)
    return { ok: true }
  },
})

const MATCHMAKER_IGNORED = ['pairing', 'alg', 'matrix', 'cutoffDistance', 'showAlignment', 'bring', 'gapOpen', 'gapExtend', 'ssFraction', 'verbose']

/** `matchmaker` / `mmaker`: superpose each model of `atoms` onto `to` by US-align. */
function matchmakerCommand(word: string): ChxCommand {
  return chxCommand({
    words: [word],
    args: [
      { name: 'atoms', type: SpecArg, role: 'required' },
      { name: 'to', type: SpecArg, role: 'keyword' },
      ...MATCHMAKER_IGNORED.map((name) => ({ name, type: StringArg, role: 'keyword' as const, ignored: true })),
    ],
    mutates: true,
    summary: 'Superpose models onto a reference (by US-align structural alignment).',
    async run(ctx, args, cc) {
      warnIgnored(cc, word, args, MATCHMAKER_IGNORED)
      if (args.to === '') return { ok: false, error: `Error: ${word}: give the reference with to` }
      const ref = targetsOf(ctx, cc.sceneId, args.to)
      if (!ref.ok) return ref
      const r = oneMolecule(ref.targets, word, args.to)
      if (!r.ok) return r
      const mov = targetsOf(ctx, cc.sceneId, args.atoms)
      if (!mov.ok) return mov
      const movers = mov.targets.filter((t) => t.obj.uid !== r.target.obj.uid)
      if (movers.length === 0) return { ok: false, error: `Error: ${word}: no model to move apart from the reference` }
      for (const t of movers) {
        cc.warn(`${word}: #${t.obj.model} is superposed by US-align (a structural alignment), not ChimeraX's sequence alignment; the fit can differ`)
        const res = await runOp(ctx, cc, 'superpose', {
          movId: t.obj.uid, refId: r.target.obj.uid, movSel: t.sel, refSel: r.target.sel,
          algo: 'USalign', pivot: null, keepAsProperty: null,
        })
        if (!res.ok) return res
        cc.print(`Matched ${t.obj.name} #${t.obj.model} to ${r.target.obj.name} #${r.target.obj.model}`)
      }
      return { ok: true }
    },
  })
}

export const ANALYSIS_COMMANDS: Record<string, ChxCommand> = {
  distance,
  distanceDelete: distanceDeleteCommand(['distance', 'delete']),
  undistance: distanceDeleteCommand(['~distance']),
  align,
  matchmaker: matchmakerCommand('matchmaker'),
  mmaker: matchmakerCommand('mmaker'),
}
