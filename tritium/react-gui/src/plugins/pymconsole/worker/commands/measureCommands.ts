/**
 * @file plugins/pymconsole/worker/commands/measureCommands.ts
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
import { translateSelection } from '../sel/translate'
import type { PymCommand } from './types'
import { isDefaulted, molecules } from './helpers'

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
      // `mode` and `cutoff` only mean something to a command that draws one
      // label per combination; against a centroid there is nothing to filter.
      if (!isDefaulted(args.mode, '')) {
        cc.warn(`${name}: mode is ignored (each selection is taken as its centroid)`)
      }
      if (!isDefaulted(args.cutoff, '')) {
        cc.warn('distance: cutoff is ignored (one label is drawn, not one per atom pair)')
      }
      for (const arg of ['zoom', 'width', 'length', 'gap', 'label', 'reset', 'state'] as const) {
        const spec = TRAILING_DEFAULTS[arg]
        if (spec !== undefined && !isDefaulted(args[arg], spec)) {
          cc.warn(`${name}: ${arg} is ignored (not supported)`)
        }
      }

      const scene = getSceneOrNull(ctx, cc.sceneId)
      if (!scene) return { ok: false, error: 'Error: no scene' }

      const sels: string[] = []
      for (let i = 0; i < count; i += 1) {
        const raw = args[`selection${i + 1}`] ?? ''
        if (raw.trim() === '') {
          return { ok: false, error: `Error: ${name} needs ${count} selections` }
        }
        const translated = translateSelection(raw)
        if (!translated.ok) return translated
        sels.push(translated.expr)
      }

      // Every selection is evaluated against one molecule, so the command
      // picks one rather than applying to each: N molecules would mean N
      // labels from one line, and the count would depend on what happens to
      // be loaded.
      const mols = molecules(ctx, cc.sceneId)
      if (mols.length === 0) return { ok: false, error: 'Error: no molecule in the scene' }
      if (mols.length > 1) {
        cc.warn(`measuring "${mols[0].name}" only: a measurement spanning objects is not supported`)
      }
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
