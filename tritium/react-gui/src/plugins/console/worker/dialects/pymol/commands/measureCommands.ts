/**
 * @file plugins/console/worker/dialects/pymol/commands/measureCommands.ts
 * @description `distance`, `angle` and `dihedral`.
 *
 * Both programs take a selection per point, and differ in what a selection
 * that matches many atoms means.
 *
 * PyMOL loops over every combination: `distance` pairs each atom of the
 * first selection with each of the second and draws one label per pair
 * within `cutoff`, and `angle` / `dihedral` do the same over triples and
 * quadruples. `dihedral` is the one that bites, because unlike `distance` it
 * has no cutoff -- only `mode=1` restricts it to bonded atoms, and the
 * default is `mode=0`, so four selections of a hundred atoms is fifty
 * million labels.
 *
 * CueMol reads a selection as its centroid (C++ `AtomIntrElem::AI_SEL`), so
 * one command draws one label whatever it matches. That is the behaviour
 * kept here: `distance d, chain A, chain B` measures between the two chains'
 * centres of mass. It is the useful reading of a group measurement, and it
 * cannot explode.
 *
 * The label is drawn by `helpers/atomintr`, so one typed here and one picked
 * with the mouse land in the same label set. The number is printed too,
 * which PyMOL does only under `quiet=0` -- on a console the answer is the
 * point of asking.
 */

import {
  appendMeasureLabelBySel,
  measureAtomCount,
} from '@renderer/worker/server/services/helpers/atomintr'
import type { MeasureMode } from '@renderer/worker/server/services/helpers/atomintr'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord'
import { analyzeInteractions } from '@renderer/worker/server/services/molops/analyzeInteractions'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { isDefaulted, moleculeSelections, resolveMolSelection, toNumber } from './helpers'
import type { MoleculeSelection } from './helpers'

/**
 * PyMOL's defaults for the arguments that follow the selections.
 *
 * Transcribed from `modules/pymol/querying.py`; `None` becomes the empty
 * string, since every argument arrives here as text.
 */
const TRAILING_DEFAULTS: Readonly<Record<string, string>> = {
  cutoff: '',
  mode: '',
  zoom: '0',
  width: '',
  length: '',
  gap: '',
  label: '1',
  quiet: '1',
  reset: '0',
  // PyMOL's ALL_STATES, which is 0.
  state: '0',
  state1: '-3',
  state2: '-3',
  state3: '-3',
  state4: '-3',
}

/** The arguments each command takes after its selections, in PyMOL's order. */
const TRAILING_ORDER: Readonly<Record<string, readonly string[]>> = {
  distance: ['cutoff', 'mode', 'zoom', 'width', 'length', 'gap', 'label', 'quiet',
             'reset', 'state', 'state1', 'state2'],
  angle: ['mode', 'label', 'reset', 'zoom', 'state', 'quiet', 'state1', 'state2', 'state3'],
  dihedral: ['mode', 'label', 'reset', 'zoom', 'state', 'quiet'],
}

function trailingParams(name: string): { name: string; default: string }[] {
  return (TRAILING_ORDER[name] ?? []).map((arg) => ({
    name: arg,
    default: TRAILING_DEFAULTS[arg] ?? '',
  }))
}

/** What PyMOL's distance mode / cutoff ask for (querying.py distance). */
type ContactMode =
  | { kind: 'centroid' }
  | { kind: 'contacts'; maxDist: number; hbondOnly: boolean }

/** The most labels one contact search draws, as the GUI's analysis caps them. */
const MAX_CONTACT_LABELS = 100

/**
 * PyMOL's default: one distance between the two selections, which for two
 * atoms is the same thing as a centroid here. Modes 0 and 3 (all pairs
 * within the cutoff) and 2 (polar contacts), or a cutoff on its own, list
 * contacts instead. Modes CueMol has nothing for are refused.
 */
export function contactMode(modeArg: string, cutoffArg: string): ContactMode | { error: string } {
  const mode = modeArg.trim()
  const cutoff = cutoffArg.trim() === '' ? null : toNumber(cutoffArg)
  if (cutoffArg.trim() !== '' && (cutoff === null || cutoff <= 0)) {
    return { error: 'Error: distance: cutoff must be a positive number' }
  }
  if (mode === '' || mode === '4') {
    if (cutoff === null) return { kind: 'centroid' }
    return { kind: 'contacts', maxDist: cutoff, hbondOnly: false }
  }
  if (mode === '0' || mode === '3') return { kind: 'contacts', maxDist: cutoff ?? 4.0, hbondOnly: false }
  // PyMOL's polar-contact cutoff (h_bond_cutoff_edge) is about 3.6 A.
  if (mode === '2') return { kind: 'contacts', maxDist: cutoff ?? 3.6, hbondOnly: true }
  return { error: `Error: distance: mode ${mode} is not available (0, 2, 3 or 4)` }
}

/**
 * distance as a contact search: one dashed label per atom pair between the
 * two selections within the cutoff, in one molecule or across two.
 */
function distanceContacts(
  ctx: WorkerContext,
  cc: CmdContext,
  args: Record<string, string>,
  mode: Extract<ContactMode, { kind: 'contacts' }>,
): CmdOutcome {
  if (args.selection1.trim() === '' || args.selection2.trim() === '') {
    return { ok: false, error: 'Error: distance needs 2 selections' }
  }
  const one = resolveMolSelection(ctx, cc.sceneId, args.selection1, cc.warn)
  if (!one.ok) return one
  const two = resolveMolSelection(ctx, cc.sceneId, args.selection2, cc.warn)
  if (!two.ok) return two
  const across = one.target.obj.uid !== two.target.obj.uid
  const res = analyzeInteractions(ctx, {
    sceneId: cc.sceneId,
    objId: one.target.obj.uid,
    selStr: one.target.selStr,
    useMol2: across,
    ...(across ? { objId2: two.target.obj.uid } : {}),
    useSel2: true,
    selStr2: two.target.selStr,
    minDist: 0,
    maxDist: mode.maxDist,
    maxLabels: MAX_CONTACT_LABELS,
    hbondOnly: mode.hbondOnly,
    rendName: args.name.trim() !== '' ? args.name.trim() : 'measure',
  })
  if (!res.ok) return { ok: false, error: `Error: distance: ${res.error ?? 'the contacts could not be computed'}` }
  cc.print(` distance: ${res.count ?? 0} contacts within ${mode.maxDist} angstroms${mode.hbondOnly ? ' (polar)' : ''}`)
  return { ok: true }
}

/** `distance` / `angle` / `dihedral`, which differ only in how many points. */
function measureCommand(name: 'distance' | 'angle' | 'dihedral', mode: MeasureMode): PymCommand {
  const count = measureAtomCount(mode)
  const selectionParams = Array.from({ length: count }, (_, i) => ({
    name: `selection${i + 1}`,
    default: '',
  }))
  const unit = mode === 'distance' ? 'angstroms' : 'degrees'
  return {
    name,
    // PyMOL's own signatures, transcribed: an argument this cannot honour is
    // still accepted so a line that works there does not fail here on an
    // argument count, and is warned about only when actually given.
    params: [{ name: 'name', default: '' }, ...selectionParams, ...trailingParams(name)],
    // PyMOL's `distance d, sel1, sel2` names the label first.
    mode: 'legacy',
    mutates: true,
    summary: `Measure the ${mode} between ${count} selections, and label it.`,
    completions: [
      null,
      ...selectionParams.map(() => ({
        source: 'selections' as const,
        description: 'selection',
        suffix: ', ' as const,
      })),
    ],
    run(ctx, args, cc) {
      // distance with a cutoff or an all-pairs mode draws one label per
      // contact, through the interaction analysis the GUI uses.
      if (name === 'distance') {
        const contacts = contactMode(args.mode, args.cutoff)
        if ('error' in contacts) return { ok: false, error: contacts.error }
        if (contacts.kind === 'contacts') return distanceContacts(ctx, cc, args, contacts)
      } else if (!isDefaulted(args.mode, '')) {
        cc.warn(`${name}: mode is ignored (each selection is taken as its centroid)`)
      }
      for (const arg of ['zoom', 'width', 'length', 'gap', 'label', 'reset', 'state'] as const) {
        const spec = TRAILING_DEFAULTS[arg]
        if (spec !== undefined && !isDefaulted(args[arg], spec)) {
          cc.warn(`${name}: ${arg} is ignored (not supported)`)
        }
      }

      const scene = getSceneOrNull(ctx, cc.sceneId)
      if (!scene) return { ok: false, error: 'Error: no scene' }

      // Each selection read per molecule; the measurement is taken inside
      // the molecule they name, or the first one when none is named.
      const perArg: MoleculeSelection[][] = []
      const namedUids = new Set<number>()
      for (let i = 0; i < count; i += 1) {
        const raw = args[`selection${i + 1}`] ?? ''
        if (raw.trim() === '') {
          return { ok: false, error: `Error: ${name} needs ${count} selections` }
        }
        const res = moleculeSelections(ctx, cc.sceneId, raw)
        if (!res.ok) return res
        if (res.named) res.items.forEach((it) => namedUids.add(it.obj.uid))
        perArg.push(res.items)
      }
      if (namedUids.size > 1) {
        return { ok: false, error: `Error: ${name} across molecules is not supported; name one object` }
      }
      const all = perArg[0]
      const chosen = namedUids.size === 1 ? [...namedUids][0] : all[0]?.obj.uid
      const measured = all.find((it) => it.obj.uid === chosen) ?? perArg.flat().find((it) => it.obj.uid === chosen)
      if (!measured) return { ok: false, error: 'Error: no molecule in the scene' }
      if (namedUids.size === 0 && all.length > 1) {
        cc.warn(`measuring "${measured.obj.name}" only: name the object in a selection to pick another`)
      }
      const sels: string[] = []
      for (const items of perArg) {
        const it = items.find((x) => x.obj.uid === measured.obj.uid)
        if (!it) return { ok: false, error: `Error: ${name} across molecules is not supported; name one object` }
        sels.push(it.selStr)
      }
      const mols = [measured.obj]

      const mol = scene.getObject(mols[0].uid) as unknown as MolCoord | null
      if (!mol) return { ok: false, error: `Error: could not read "${mols[0].name}"` }

      const target = args.name.trim()
      const res = appendMeasureLabelBySel(
        scene,
        mol,
        mode,
        sels,
        target === '' ? undefined : target,
      )
      if (!res.ok) return { ok: false, error: `Error: ${res.error}` }

      // Two decimals, as the coordinates themselves are given to about that.
      cc.print(` ${name}: ${res.value.toFixed(2)} ${unit}`)
      return { ok: true }
    },
  }
}

export const MEASURE_COMMANDS: PymCommand[] = [
  measureCommand('distance', 'distance'),
  measureCommand('angle', 'angle'),
  measureCommand('dihedral', 'torsion'),
]
