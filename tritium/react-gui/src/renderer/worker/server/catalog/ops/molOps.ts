/**
 * @file worker/server/catalog/ops/molOps.ts
 * @description Ops that change a molecule or derive a new object from one:
 * superposition, molecular surfaces, editing atoms and chains, secondary
 * structure, crystal symmetry, and named selections.
 */

import { superposeMol } from '@renderer/worker/server/services/molops/superposeMol'
import { makeMolSurf, proposeMolSurfName } from '@renderer/worker/server/services/molops/makeMolSurf'
import { deleteMolAtoms } from '@renderer/worker/server/services/molops/deleteMolAtoms'
import { changeChainName } from '@renderer/worker/server/services/molops/changeChainName'
import { mergeMol } from '@renderer/worker/server/services/molops/mergeMol'
import { reassignProt2ndry } from '@renderer/worker/server/services/molops/reassignProt2ndry'
import { showSymmRenderer, showUnitCellRenderer } from '@renderer/worker/server/services/molops/symmetryPanelOps'
import { saveSelDef } from '@renderer/worker/server/services/select/saveSelDef'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { defineOp } from '../op'
import { boolean, enumOf, moleculeId, optional, real, selection, string } from '../params'

/** The GUI dialog's defaults (`MakeMolSurfDialog`). */
const SURF_DENSITY = 2
const SURF_PROBE = 1.4

/** Secondary structure kinds, in `MolAnlManager.setProt2ndry` order. */
const SEC_TYPES = ['coil', 'strand', 'helix', 'helix310', 'helixpi'] as const

export const superpose = defineOp({
  name: 'superpose',
  description:
    'Move one molecule onto another by superposing selected atoms. SSM matches by secondary ' +
    'structure and needs no alignment (proteins); LSQ fits the selected atoms in order, so the ' +
    'two selections must pair up atom for atom (e.g. the same residues\' CA atoms). The moving ' +
    'molecule\'s coordinates change.',
  params: {
    movId: moleculeId('Uid of the molecule to move.'),
    refId: moleculeId('Uid of the reference molecule, which stays put.'),
    movSel: optional(selection('Atoms of the moving molecule to fit. Null uses all (SSM) or CA atoms (LSQ).')),
    refSel: optional(selection('Atoms of the reference to fit. Null as movSel.')),
    algo: optional(enumOf(['SSM', 'LSQ'], 'SSM (default) or LSQ.')),
  },
  mutates: true,
  expose: { tool: 'molops', console: true },
  async run(ctx, args, oc) {
    const algo = args.algo ?? 'SSM'
    const dflt = algo === 'LSQ' ? 'name CA' : '*'
    const res = await superposeMol(ctx, {
      sceneId: oc.sceneId,
      viewId: oc.viewId,
      algo,
      refObjId: args.refId,
      refSel: args.refSel ?? dflt,
      movObjId: args.movId,
      movSel: args.movSel ?? dflt,
      useprop: false,
      autoRecenter: false,
    })
    return normalizeServiceResult(res, 'The superposition failed. Check the ids and selections.')
  },
})

export const makeSurface = defineOp({
  name: 'make_surface',
  description:
    'Compute the molecular (solvent excluded) surface of a molecule, or of a selection of it, as ' +
    'a new surface object with a renderer. Returns the new object\'s uid.',
  params: {
    molId: moleculeId('Uid of the molecule.'),
    selection: optional(selection('Only these atoms. Null uses the whole molecule.')),
    name: optional(string('Name for the surface object. Null picks an unused one.')),
    probeRadius: optional(real(`Probe radius in angstroms. Null uses ${SURF_PROBE}.`)),
    density: optional(real(`Points per angstrom. Null uses ${SURF_DENSITY}; higher is finer and slower.`)),
  },
  mutates: true,
  expose: { tool: 'molops', console: true },
  aliases: [{ name: 'surface', summary: 'Make a molecular surface: surface 1crn' }],
  run(ctx, args, oc) {
    const name = args.name ?? proposeMolSurfName(ctx, { sceneId: oc.sceneId, objId: args.molId }).name
    const res = makeMolSurf(ctx, {
      sceneId: oc.sceneId,
      objId: args.molId,
      selStr: args.selection ?? '',
      surfName: name,
      density: args.density ?? SURF_DENSITY,
      probeRadius: args.probeRadius ?? SURF_PROBE,
    })
    if (!res.ok) return { ok: false, error: res.error || 'The surface could not be made.' }
    return { ok: true, data: { objectId: res.newObjId, name: res.newObjName } }
  },
})

export const deleteAtoms = defineOp({
  name: 'delete_atoms',
  description: 'Delete the atoms a selection matches from a molecule. Undoable, but only use it when the user asked to remove atoms.',
  params: {
    molId: moleculeId('Uid of the molecule.'),
    selection: selection('The atoms to delete, e.g. resn HOH.'),
  },
  mutates: true,
  expose: { tool: 'molops', console: true },
  run(ctx, args, oc) {
    if (args.selection.trim() === '') return { ok: false, error: 'Give a selection; it would delete every atom.' }
    return normalizeServiceResult(
      deleteMolAtoms(ctx, { sceneId: oc.sceneId, objId: args.molId, selStr: args.selection }),
      'The atoms could not be deleted.',
    )
  },
})

export const renameChain = defineOp({
  name: 'rename_chain',
  description: 'Change the chain name of the atoms a selection matches (e.g. a whole chain).',
  params: {
    molId: moleculeId('Uid of the molecule.'),
    selection: selection('The atoms to rename, e.g. chain A.'),
    chain: string('The new chain name.'),
  },
  mutates: true,
  expose: { tool: 'molops', console: true },
  run(ctx, args, oc) {
    return normalizeServiceResult(
      changeChainName(ctx, { sceneId: oc.sceneId, objId: args.molId, selStr: args.selection, chainName: args.chain }),
      'The chain could not be renamed.',
    )
  },
})

export const mergeMolecules = defineOp({
  name: 'merge_molecules',
  description:
    'Move (or copy) the atoms a selection matches from one molecule into another, e.g. a ' +
    'ligand into the protein it binds.',
  params: {
    fromId: moleculeId('Uid of the molecule the atoms come from.'),
    toId: moleculeId('Uid of the molecule they go into.'),
    selection: optional(selection('Which atoms. Null takes all of them.')),
    copy: optional(boolean('True copies and leaves the source as it is; false (default) moves.')),
  },
  mutates: true,
  expose: { tool: 'molops', console: true },
  run(ctx, args, oc) {
    return normalizeServiceResult(
      mergeMol(ctx, {
        sceneId: oc.sceneId,
        fromObjId: args.fromId,
        toObjId: args.toId,
        selStr: args.selection ?? '*',
        copy: args.copy ?? false,
      }),
      'The atoms could not be merged.',
    )
  },
})

export const setSecondaryStructure = defineOp({
  name: 'set_secondary_structure',
  description:
    'Recompute a protein\'s secondary structure from its coordinates (no selection given), or ' +
    'assign one type to the residues a selection matches.',
  params: {
    molId: moleculeId('Uid of the molecule.'),
    selection: optional(selection('Residues to assign. Null recomputes the whole molecule.')),
    type: optional(enumOf(SEC_TYPES, 'With a selection: the type to assign.')),
    ignoreBulge: optional(boolean('Recomputing: ignore beta bulges. Null is false.')),
    helixGapAngle: optional(real('Recomputing: fill gaps in a helix up to this angle in degrees (the dialog offers 120). Null or 0 does not fill.')),
  },
  mutates: true,
  expose: { tool: 'molops', console: true },
  run(ctx, args, oc) {
    if (args.selection === null) {
      return normalizeServiceResult(
        reassignProt2ndry(ctx, {
          sceneId: oc.sceneId,
          objId: args.molId,
          mode: 'recalc',
          ...(args.ignoreBulge !== null ? { ignBulge: args.ignoreBulge } : {}),
          ...(args.helixGapAngle !== null ? { helixGapAngle: args.helixGapAngle } : {}),
        }),
        'The secondary structure could not be computed.',
      )
    }
    if (args.type === null) return { ok: false, error: 'With a selection, give the type to assign.' }
    return normalizeServiceResult(
      reassignProt2ndry(ctx, {
        sceneId: oc.sceneId,
        objId: args.molId,
        mode: 'assign',
        selStr: args.selection,
        secType: SEC_TYPES.indexOf(args.type),
      }),
      'The secondary structure could not be assigned.',
    )
  },
})

export const showSymmetry = defineOp({
  name: 'show_symmetry',
  description:
    'For a crystal structure: draw its symmetry mates within a distance of the view centre, ' +
    'or fill the unit cell, and optionally the unit cell box.',
  params: {
    molId: moleculeId('Uid of the molecule (it must carry crystal information).'),
    extent: optional(real('Draw mates within this many angstroms. Null fills the unit cell.')),
    unitCell: optional(boolean('True also draws the unit cell box.')),
  },
  mutates: true,
  expose: { tool: 'xtal', console: true },
  run(ctx, args, oc) {
    const res = showSymmRenderer(ctx, {
      sceneId: oc.sceneId,
      objId: args.molId,
      viewId: oc.viewId,
      extent: args.extent ?? 'unitcell',
    })
    const norm = normalizeServiceResult(res, 'Symmetry could not be shown; does the molecule have crystal information?')
    if (!norm.ok || !args.unitCell) return norm
    return normalizeServiceResult(showUnitCellRenderer(ctx, { sceneId: oc.sceneId, objId: args.molId }), 'The unit cell could not be drawn.')
  },
})

export const saveSelection = defineOp({
  name: 'save_selection',
  description:
    'Give a selection expression a name, usable in any later selection (and listed by ' +
    'get_scene_state). The name stands for the expression, re-evaluated each time it is used.',
  params: {
    name: string('The name, e.g. site1.'),
    selection: selection('The expression it stands for.'),
  },
  mutates: true,
  expose: { tool: 'selection', console: true },
  aliases: [{ name: 'define', summary: 'Name a selection: define site1, resid 10:20' }],
  run(ctx, args, oc) {
    return normalizeServiceResult(
      saveSelDef(ctx, { sceneId: oc.sceneId, name: args.name, expr: args.selection }),
      'The selection could not be named. Check the name and the expression.',
    )
  },
})

export const MOL_OPS = [
  superpose,
  makeSurface,
  deleteAtoms,
  renameChain,
  mergeMolecules,
  setSecondaryStructure,
  showSymmetry,
  saveSelection,
]
