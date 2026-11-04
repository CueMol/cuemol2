/**
 * @file plugins/chimerax-console/worker/autoStyle.ts
 * @description How a molecule is drawn when `open` reads it, after ChimeraX's
 * automatic styling (`atomic/structure.py` `apply_auto_styling`).
 *
 * The molecule is sized up as ChimeraX does (its polymer chains, atoms and
 * polymer residues, with ChimeraX's thresholds), and the console's
 * renderers get the selections and colours of that style:
 *
 * - non-polymer, or a small polymer with 10 residues or fewer: every atom
 *   as a stick, the model colour with heteroatoms by element.
 * - small polymer: the cartoon, the ligands and metals with the residues
 *   within 3.6 A of them as sticks (metals and ions as spheres), hydrogens
 *   on carbon hidden, the model colour with heteroatoms by element.
 * - medium polymer: every atom as a sphere, ligands as sticks, solvent as
 *   balls; coloured by chain when all chains have one sequence, ligands and
 *   solvent by element.
 * - large polymer: every atom as a sphere in the model colour.
 *
 * Where CueMol cannot tell what ChimeraX tells, the console comes close:
 * - ions are halide and metal atoms (ChimeraX: one-atom residues);
 * - a hydrogen on carbon is told by its name (ChimeraX: by its bond);
 * - medium and large polymers with several sequences keep the model colour
 *   (ChimeraX colours each sequence with a seeded random colour), and say so.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome } from '@plugins/console/worker/dialect-api'
import { chainColor, modelColor } from './colorSchemes'
import { ATOM_STYLES, CARTOONS, ensureOwned, forEachAtom, minus, writeSel } from './display'
import type { NumberedObject } from './models'
import { NONE } from './spec/emit'
import { elementEntries, paintTarget } from './commands/colorCommands'
import type { PaintEntry } from './commands/colorCommands'

/** ChimeraX's size thresholds (`atomic/structure.py`). */
const SMALL_THRESHOLD = 200_000
const MEDIUM_THRESHOLD = 1_000_000
const MIN_RIBBON_THRESHOLD = 10
const MAX_RIBBON_THRESHOLD = 5000

const POLYMER = '(protein or nucleic)'

/** Metal elements found in structures. */
const METALS = [
  'Li', 'Na', 'K', 'Rb', 'Cs', 'Be', 'Mg', 'Ca', 'Sr', 'Ba', 'Al', 'Ga', 'In', 'Tl', 'Sn', 'Pb', 'Bi',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Y', 'Zr', 'Mo', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd',
  'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'La', 'Ce', 'Eu', 'Gd', 'Tb', 'Yb', 'Lu', 'U',
]

/** Metal atoms. */
export const METAL = `elem ${METALS.join(',')}`

/** Ions that are not metals (halides), as ligands. */
const HALIDE_ION = 'ligand and elem F,Cl,Br,I'

/** Ligands, metals included, ions that are not metals left out (`ligand_like_atoms` with the metals). */
export const LIGAND = `ligand and not (${HALIDE_ION})`

/** Hydrogens on N, O or S in the standard residues, by name. */
const POLAR_H = [
  'name H,H1,H2,H3,HN',
  'resn ARG and name HE,HH11,HH12,HH21,HH22',
  'resn ASN and name HD21,HD22',
  'resn GLN and name HE21,HE22',
  'resn HIS and name HD1,HE2',
  'resn TRP and name HE1',
  'resn LYS and name HZ1,HZ2,HZ3',
  'resn SER,CYS and name HG',
  'resn THR and name HG1',
  'resn TYR and name HH',
].map((s) => `(${s})`).join(' or ')

/** Hydrogens on carbon in proteins (ChimeraX's IDATM type HC), told by name. */
export const NONPOLAR_H = `protein and hydrogen and not (${POLAR_H})`

/** The atoms the small-polymer style shows: the residues within 3.6 A of a ligand or metal. */
export const SMALL_SHOWN = minus(`byres ((${LIGAND}) expand 3.6)`, NONPOLAR_H)

export type AutoStyle = 'non-polymer' | 'small polymer' | 'medium polymer' | 'large polymer'

/** What decides the style: polymer chains, atoms, polymer residues, and whether all chains share one sequence. */
export interface MoleculeSize {
  chains: number
  atoms: number
  residues: number
  oneSequence: boolean
}

/** ChimeraX's choice of style from a molecule's size. */
export function autoStyleOf(m: MoleculeSize): AutoStyle {
  if (m.chains === 0) return 'non-polymer'
  if (m.chains < 5 && m.atoms < SMALL_THRESHOLD && m.residues < MAX_RIBBON_THRESHOLD) return 'small polymer'
  if (m.chains < 250 && m.atoms < MEDIUM_THRESHOLD) return 'medium polymer'
  return 'large polymer'
}

/** A molecule's size, read from its atoms. */
function sizeOf(ctx: WorkerContext, sceneId: number, objUid: number): MoleculeSize & { chainIds: string[] } {
  let atoms = 0
  forEachAtom(ctx, sceneId, objUid, '*', () => { atoms++ })
  const seqs = new Map<string, string[]>()
  let lastKey = ''
  forEachAtom(ctx, sceneId, objUid, POLYMER, (a) => {
    const key = `${a.chainName}:${a.residIndex}`
    if (key === lastKey) return
    lastKey = key
    const s = seqs.get(a.chainName) ?? []
    s.push(a.residName)
    seqs.set(a.chainName, s)
  })
  const sequences = new Set([...seqs.values()].map((s) => s.join(' ')))
  return {
    chains: seqs.size,
    atoms,
    residues: [...seqs.values()].reduce((n, s) => n + s.length, 0),
    oneSequence: sequences.size <= 1,
    chainIds: [...seqs.keys()].sort(),
  }
}

/** The selections of the console's renderers a style draws. */
interface Shown {
  stick: string
  ball: string
  sphere: string
  cartoon: string
  nucl: string
}

/** Style a molecule just opened, as ChimeraX's automatic styling would. */
export async function applyAutoStyle(ctx: WorkerContext, cc: CmdContext, obj: NumberedObject): Promise<CmdOutcome> {
  const owned = await ensureOwned(ctx, cc, obj)
  if (!owned.ok) return owned
  const size = sizeOf(ctx, cc.sceneId, obj.uid)
  const style = autoStyleOf(size)
  const model = modelColor(obj.model)
  if (!model.exact) cc.warn(`open: #${obj.model} is past ChimeraX's model colours; its colour differs from ChimeraX's`)
  const none = NONE
  let shown: Shown
  // Paint entries per target letters, painted in order (a later entry wins).
  let paints: [string, PaintEntry[]][]
  if (style === 'non-polymer' || (style === 'small polymer' && size.residues <= MIN_RIBBON_THRESHOLD)) {
    shown = { stick: '*', ball: none, sphere: none, cartoon: none, nucl: none }
    paints = [['ac', [['*', model.hex]]], ['a', elementEntries('*', false)]]
  } else if (style === 'small polymer') {
    const spheres = `(${SMALL_SHOWN}) and (${METAL} or ${HALIDE_ION})`
    shown = { stick: minus(SMALL_SHOWN, spheres), ball: none, sphere: spheres, cartoon: 'protein', nucl: 'nucleic' }
    paints = [['ac', [['*', model.hex]]], ['a', elementEntries('*', false)]]
  } else if (style === 'medium polymer') {
    shown = { stick: LIGAND, ball: 'water', sphere: minus('*', `(${LIGAND}) or water`), cartoon: none, nucl: none }
    if (!size.oneSequence) cc.warn('open: chains with different sequences keep the model colour (ChimeraX colours each sequence)')
    const byChain: PaintEntry[] = size.oneSequence ? size.chainIds.map((c) => [`chain ${c}`, chainColor(c).hex]) : []
    paints = [['ac', [['*', model.hex], ...byChain]], ['a', elementEntries(`(${LIGAND}) or water`, false)]]
  } else {
    shown = { stick: none, ball: none, sphere: '*', cartoon: none, nucl: none }
    if (!size.oneSequence) cc.warn('open: chains with different sequences keep the model colour (ChimeraX colours each sequence)')
    paints = [['ac', [['*', model.hex]]]]
  }
  const ids = owned.ids
  const writes: [string, string][] = [
    [ATOM_STYLES.stick.name, shown.stick],
    [ATOM_STYLES.ball.name, shown.ball],
    [ATOM_STYLES.sphere.name, shown.sphere],
    [CARTOONS[0].name, shown.cartoon],
    [CARTOONS[1].name, shown.nucl],
  ]
  for (const [name, sel] of writes) {
    const id = ids.get(name)
    if (id === undefined) continue
    const w = await writeSel(ctx, cc, id, sel)
    if (!w.ok) return w
  }
  // Painted in order, each entry first in the table: the later ones win.
  for (const [target, entries] of paints) {
    const res = await paintTarget(ctx, cc, { obj, sel: '*' }, target, entries)
    if (!res.ok) return res
  }
  return { ok: true }
}
