/**
 * @file worker/server/catalog/ops/measureOps.ts
 * @description Measuring the geometry between named atoms.
 *
 * The measure tool in the UI is a mouse pick sequence: it hit-tests the
 * screen, so there is no way to reach it from a caller that can only name
 * atoms. This op resolves atoms by chain, residue and atom name instead,
 * returns the number, and draws the same label the mouse tool would into the
 * same label set (`helpers/atomintr`).
 */

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord'
import type { MolAtom } from '@cuemol/core/src/wrappers/MolAtom'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import {
  appendMeasureLabel,
  hasDegenerateAtoms,
  measureAtomCount,
  type MeasureAtomRef,
  type MeasureMode,
} from '@renderer/worker/server/services/helpers/atomintr'
import { angleOf, distanceOf, torsionOf } from './geometry'
import { NO_OBJECT } from '../errors'
import { defineOp } from '../op'
import type { OpOutcome } from '../op'
import type { AtomSpec } from '../params'
import { atoms, boolean, moleculeId, string } from '../params'

/** What `measure_geometry` computes, by how many atoms it was given. */
const MODE_BY_COUNT: Record<number, MeasureMode> = {
  2: 'distance',
  3: 'angle',
  4: 'torsion',
}

function describe(spec: AtomSpec): string {
  return `${spec.chain}/${spec.resid}/${spec.atomName}`
}

export const measureGeometry = defineOp({
  name: 'measure_geometry',
  description:
    'Measure between named atoms and return the number: two atoms give a distance in ' +
    'angstroms, three give the angle at the middle atom in degrees, four give the torsion ' +
    'about the middle bond in degrees. Also draws the measurement in the 3D view as a ' +
    'labelled line, the same way the measure tool does. Use list_residues to check a ' +
    'residue index first; the atom name is the PDB name, for example CA, N, C, O, CB.',
  params: {
    molId: moleculeId('Uid of the molecule object the atoms belong to.'),
    atoms: atoms(
      'Two, three or four atoms, in order. Two give a distance, three the angle at the ' +
        'second atom, four the torsion about the second-to-third bond. Any other number is ' +
        'an error.',
    ),
    draw: boolean('True also draws the labelled measurement in the 3D view; false only returns the number.'),
    label: string('Name of the label set to draw into. Use "measure" unless the user asked for another.'),
  },
  // Drawing a label changes the scene. A measurement that only reports a
  // number does not, but the flag is per op, not per call, and treating it
  // as mutating is the safe way round: a transaction that drew a label and is
  // then rolled back would take the label with it.
  mutates: true,
  expose: { tool: 'analysis', console: true },
  group: 'analysis',
  run(ctx, args, oc): OpOutcome {
    const specs = args.atoms
    const mode = MODE_BY_COUNT[specs.length]
    if (!mode) {
      return { ok: false, error: `Give two, three or four atoms; got ${specs.length}.` }
    }

    const scene = getSceneOrNull(ctx, oc.sceneId)
    if (!scene) return { ok: false, error: 'The scene could not be read.' }
    const molId = args.molId
    const mol = scene.getObject(molId) as MolCoord | null
    if (!mol) return { ok: false, error: NO_OBJECT }

    // Resolve every atom before measuring anything, so a typo in the last one
    // does not leave a half-drawn label behind.
    const found: MolAtom[] = []
    for (const spec of specs) {
      let atom: MolAtom | null = null
      try {
        atom = mol.getAtom(spec.chain, spec.resid, spec.atomName) as MolAtom | null
      } catch {
        atom = null
      }
      if (!atom) {
        return {
          ok: false,
          error:
            `No atom ${describe(spec)} in that molecule. Check the chain and residue with ` +
            'list_chains and list_residues, and the atom name against the PDB naming.',
        }
      }
      found.push(atom)
    }

    const refs: MeasureAtomRef[] = found.map((a) => ({ objId: molId, atomId: a.id }))
    if (hasDegenerateAtoms(mode, refs)) {
      return { ok: false, error: 'The same atom was given twice; the measurement is undefined.' }
    }

    const pos = found.map((a) => a.pos)
    let value: number | null
    let unit: string
    if (mode === 'distance') {
      value = distanceOf(pos[0], pos[1])
      unit = 'angstrom'
    } else if (mode === 'angle') {
      value = angleOf(pos[0], pos[1], pos[2])
      unit = 'degree'
    } else {
      value = torsionOf(pos[0], pos[1], pos[2], pos[3])
      unit = 'degree'
    }
    if (value === null || !Number.isFinite(value)) {
      return { ok: false, error: 'These atoms are collinear, so the torsion is undefined.' }
    }

    if (args.draw) {
      appendMeasureLabel(scene, mol, mode, refs.slice(0, measureAtomCount(mode)), args.label)
    }

    return {
      ok: true,
      data: {
        kind: mode,
        // Two decimals: the coordinates themselves are given to about that.
        value: Math.round(value * 100) / 100,
        unit,
        atoms: specs.map(describe),
        drawn: args.draw,
      },
    }
  },
})

export const MEASURE_OPS = [measureGeometry]
