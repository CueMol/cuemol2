/**
 * @file plugins/agent/worker/tools/measureTools.ts
 * @description Measuring the geometry between named atoms.
 *
 * The measure tool in the UI is a mouse pick sequence: it hit-tests the
 * screen, so there is no way to reach it from a model that can only name
 * atoms. This tool resolves atoms by chain, residue and atom name instead,
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
import { angleOf, distanceOf, torsionOf } from '../geometry'
import type { AgentTool, ToolOutcome } from './types'
import { bool, int, str, strictSchema } from './types'

/** How the model names one atom. */
interface AtomSpec {
  chain: string
  resid: string
  atomName: string
}

/** What `measure_geometry` computes, by how many atoms it was given. */
const MODE_BY_COUNT: Record<number, MeasureMode> = {
  2: 'distance',
  3: 'angle',
  4: 'torsion',
}

function describe(spec: AtomSpec): string {
  return `${spec.chain}/${spec.resid}/${spec.atomName}`
}

/** Read the atom specs out of the model's argument, or say what is wrong. */
function parseAtoms(input: unknown): AtomSpec[] | string {
  if (!Array.isArray(input)) return 'atoms must be a list.'
  const out: AtomSpec[] = []
  for (const raw of input) {
    const a = raw as Partial<AtomSpec>
    if (typeof a?.chain !== 'string' || typeof a?.resid !== 'string' || typeof a?.atomName !== 'string') {
      return 'Each atom needs chain, resid and atomName, all as strings.'
    }
    out.push({ chain: a.chain, resid: a.resid, atomName: a.atomName })
  }
  return out
}

const measureGeometry: AgentTool = {
  name: 'measure_geometry',
  description:
    'Measure between named atoms and return the number: two atoms give a distance in ' +
    'angstroms, three give the angle at the middle atom in degrees, four give the torsion ' +
    'about the middle bond in degrees. Also draws the measurement in the 3D view as a ' +
    'labelled line, the same way the measure tool does. Use get_mol_residues to check a ' +
    'residue index first; the atom name is the PDB name, for example CA, N, C, O, CB.',
  parameters: strictSchema({
    molId: int('Uid of the molecule object the atoms belong to.'),
    atoms: {
      type: 'array',
      description:
        'Two, three or four atoms, in order. The measurement is between them in that order: ' +
        'an angle is measured at the second atom, a torsion about the second-to-third bond.',
      minItems: 2,
      maxItems: 4,
      items: {
        type: 'object',
        description: 'One atom, named the way the PDB file names it.',
        properties: {
          chain: { type: 'string', description: 'Chain name, for example A.' },
          resid: {
            type: 'string',
            description:
              'Residue index as a string, because it may carry an insertion code (for ' +
              'example "20" or "20A").',
          },
          atomName: { type: 'string', description: 'Atom name, for example CA.' },
        },
        required: ['chain', 'resid', 'atomName'],
        additionalProperties: false,
      },
    },
    draw: bool('True also draws the labelled measurement in the 3D view; false only returns the number.'),
    label: str('Name of the label set to draw into. Use "measure" unless the user asked for another.'),
  }),
  // Drawing a label changes the scene. A measurement that only reports a
  // number does not, but the flag is per tool, not per call, and treating it
  // as mutating is the safe way round: a turn that drew a label and is then
  // rolled back would take the label with it.
  mutates: true,
  run(ctx, input, turn): ToolOutcome {
    const specs = parseAtoms(input.atoms)
    if (typeof specs === 'string') return { ok: false, error: specs }

    const mode = MODE_BY_COUNT[specs.length]
    if (!mode) {
      return { ok: false, error: `Give two, three or four atoms; got ${specs.length}.` }
    }

    const scene = getSceneOrNull(ctx, turn.sceneId)
    if (!scene) return { ok: false, error: 'The scene could not be read.' }
    const molId = Number(input.molId)
    const mol = scene.getObject(molId) as MolCoord | null
    if (!mol) return { ok: false, error: 'No object with that id in this scene.' }

    // Resolve every atom before measuring anything, so a typo in the last one
    // does not leave a half-drawn label behind.
    const atoms: MolAtom[] = []
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
            'get_mol_chains and get_mol_residues, and the atom name against the PDB naming.',
        }
      }
      atoms.push(atom)
    }

    const refs: MeasureAtomRef[] = atoms.map((a) => ({ objId: molId, atomId: a.id }))
    if (hasDegenerateAtoms(mode, refs)) {
      return { ok: false, error: 'The same atom was given twice; the measurement is undefined.' }
    }

    const pos = atoms.map((a) => a.pos)
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

    if (input.draw === true) {
      const target = typeof input.label === 'string' ? input.label : ''
      appendMeasureLabel(scene, mol, mode, refs.slice(0, measureAtomCount(mode)), target)
    }

    return {
      ok: true,
      data: {
        kind: mode,
        // Two decimals: the coordinates themselves are given to about that.
        value: Math.round(value * 100) / 100,
        unit,
        atoms: specs.map(describe),
        drawn: input.draw === true,
      },
    }
  },
}

export const MEASURE_TOOLS: AgentTool[] = [measureGeometry]
