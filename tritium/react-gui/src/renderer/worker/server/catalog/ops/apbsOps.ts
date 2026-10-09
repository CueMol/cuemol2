/**
 * @file worker/server/catalog/ops/apbsOps.ts
 * @description The electrostatic potential of a molecule, through APBS:
 * Tools > Calculate Electrostatic Potential as a command.
 *
 * The same job the dialog starts (pdb2pqr, then apbs, as external programs),
 * with the dialog's defaults and the executable paths and force field from
 * Settings (`services/apbs/defaults.ts`). The op waits for the job, so the
 * new map is in the scene when it returns; Stop kills the programs.
 */

import { calcApbsCancel, calcApbsStart } from '@renderer/worker/server/services/apbs/run'
import { waitForApbsJob } from '@renderer/worker/server/services/apbs/jobs'
import { apbsDefaults } from '@renderer/worker/server/services/apbs/defaults'
import { PDB2PQR_FORCE_FIELDS } from '@renderer/worker/shared/apbsTypes'
import { defineOp } from '../op'
import { boolean, enumOf, moleculeId, optional, real, selection, string } from '../params'

// The dialog's defaults (UXP XUL).
const TEMPERATURE = 298.15
const GRID_SPACING = 1.0
const WATER_DIELEC = 78.54
const PROT_DIELEC = 2.0

export const calcElepot = defineOp({
  name: 'calc_elepot',
  description:
    'Calculate the electrostatic potential of a molecule with APBS, as a new potential map ' +
    'object (to colour a surface by). Charges and radii come from pdb2pqr with a force field, or ' +
    'from CueMol itself (internal). Takes seconds to minutes. Returns the new object\'s uid.',
  params: {
    molId: moleculeId('Uid of the molecule.'),
    selection: optional(selection('Only these atoms. Null uses the whole molecule.')),
    name: optional(string('Name for the map object. Null picks pot_<molecule>.')),
    method: optional(enumOf(['pdb2pqr', 'internal'], 'Charge assignment. Null is pdb2pqr.')),
    forceField: optional(enumOf(PDB2PQR_FORCE_FIELDS, 'pdb2pqr force field. Null uses the one in Settings.')),
    gridSpacing: optional(real(`Target grid spacing in angstroms. Null uses ${GRID_SPACING}.`)),
    nonLinear: optional(boolean('Solve the non-linear Poisson-Boltzmann equation. Null is false (linear).')),
  },
  mutates: true,
  expose: { tool: false, console: true, mcp: true },
  group: 'surfaces',
  async run(ctx, args, oc) {
    const defaults = apbsDefaults()
    const started = calcApbsStart(ctx, {
      sceneId: oc.sceneId,
      objId: args.molId,
      selStr: args.selection ?? '',
      elepotName: args.name ?? '',
      chargeMethod: args.method ?? 'pdb2pqr',
      forceField: args.forceField ?? defaults.forceField,
      useHydrogen: false,
      useNpbe: args.nonLinear ?? false,
      temperature: TEMPERATURE,
      gridSpacing: args.gridSpacing ?? GRID_SPACING,
      waterDielec: WATER_DIELEC,
      protDielec: PROT_DIELEC,
      binaries: defaults.binaries,
    })
    if (!started.ok) {
      const hint = /executable not found/.test(started.error ?? '') ? ' Set the path in Settings > Tools > APBS / PDB2PQR.' : ''
      return { ok: false, error: `${started.error ?? 'APBS could not be started.'}${hint}` }
    }
    const end = await waitForApbsJob(
      started.jobId,
      () => oc.cancelled?.() ?? false,
      () => { calcApbsCancel(ctx, { jobId: started.jobId }) },
    )
    if (end.type === 'error') return { ok: false, error: end.error }
    return { ok: true, data: { objectId: end.newObjId, name: end.newObjName, seconds: Math.round(end.elapsedSec) } }
  },
})

export const APBS_OPS = [calcElepot]
