/**
 * @file worker/server/catalog/ops/editOps.ts
 * @description GUI edits that had no command: resetting properties, the undo
 * data, residue numbers, renderer groups and surfaces, the interaction list,
 * paint entries, other export formats, map re-centring, bonds, crystal
 * symmetry and electrostatic surface colouring.
 *
 * Each runs the service its dialog, context menu or panel commits through,
 * so a command leaves the same undo steps as the GUI. Console and MCP only
 * (`tool: false, mcp: true`): the agent's short tool list leaves them out.
 * Lists are numbered from 1, as the console's other lists are.
 */

import type { MolAnlManager } from '@cuemol/core/src/wrappers/MolAnlManager'
import type { MolAtom } from '@cuemol/core/src/wrappers/MolAtom'
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord'
import { getGenericProps } from '@renderer/worker/server/services/props/read'
import { resetGenericProps } from '@renderer/worker/server/services/props/write'
import { clearUndoData } from '@renderer/worker/server/services/undo/undo'
import { changeResidueIndex } from '@renderer/worker/server/services/molops/changeResidueIndex'
import { createRendererGroup } from '@renderer/worker/server/services/rend/createRendererGroup'
import { generateRendererSurfObj } from '@renderer/worker/server/services/rend/generateRendererSurfObj'
import { getMolSurfRegenInfo, regenMolSurf } from '@renderer/worker/server/services/molops/regenMolSurf'
import { listAtomIntrDefs, removeAtomIntrDefs } from '@renderer/worker/server/services/rend/atomIntrEdit'
import { getRendererColoringState } from '@renderer/worker/server/services/coloring/deckState'
import type { PaintEntryDto } from '@renderer/worker/server/services/coloring/types'
import { movePaintEntry, removePaintEntry, updatePaintEntry } from '@renderer/worker/server/services/coloring/paintCrud'
import { setRendererColoring } from '@renderer/worker/server/services/coloring/applyColoring'
import { setRendererElepotProp } from '@renderer/worker/server/services/coloring/elepotWriter'
import { exportScene, getSceneExportInfo } from '@renderer/worker/server/services/scene/exportImage'
import { redrawMapCenter } from '@renderer/worker/server/services/map/props'
import { MAP_RENDERER_TYPES } from '@renderer/worker/server/services/map/types'
import { changeSymmetryInfo } from '@renderer/worker/server/services/molops/symmetryPanelOps'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { withUndoTxn } from '@renderer/worker/server/services/withUndoTxn'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { resolvePropPath } from '../refs'
import { defineOp } from '../op'
import type { OpOutcome } from '../op'
import { atoms, boolean, enumOf, integer, moleculeId, objectId, optional, path, propPath, real, rendererId, selection, string } from '../params'
import type { AtomSpec } from '../params'
import { outputPath } from '../outputFile'

const EXPOSE = { tool: false, console: true, mcp: true } as const

// --- Properties and undo ---

export const resetProp = defineOp({
  name: 'reset_prop',
  description:
    'Put a property back to its default, named by its path as set_prop takes it ' +
    '(1crn/cartoon1.width, bgcolor). End the path in .* to reset every changed property of ' +
    'the node at once (Reset all in the inspector).',
  params: { path: propPath('The property, or node.* for all of them.') },
  mutates: true,
  expose: EXPOSE,
  format: () => [],
  run(ctx, args, oc) {
    const target = resolvePropPath(ctx, oc.sceneId, args.path)
    if (!target.ok) return { ok: false, error: target.error }
    const node = { sceneId: oc.sceneId, nodeId: target.nodeId, nodeType: target.nodeType }
    let names = [target.prop]
    if (target.prop === '*') {
      const props = getGenericProps(ctx, node)
      if (!props.ok) return { ok: false, error: 'The properties could not be read.' }
      names = props.entries.filter((e) => !e.isContainer && !e.readonly && e.hasdefault && !e.isdefault).map((e) => e.key)
      if (names.length === 0) return { ok: true }
    }
    const res = resetGenericProps(ctx, { ...node, propNames: names })
    return res.ok ? { ok: true } : { ok: false, error: `${args.path} could not be reset (does it have a default?).` }
  },
})

export const clearUndo = defineOp({
  name: 'clear_undo',
  description: 'Forget the scene\'s undo and redo history (Edit > Clear undo data). Cannot be undone.',
  params: {},
  mutates: false,
  expose: EXPOSE,
  // It empties the undo stack, which cannot happen inside a transaction.
  outsideTxn: () => true,
  format: () => [],
  run(ctx, _args, oc) {
    return clearUndoData(ctx, { sceneId: oc.sceneId }).ok ? { ok: true } : { ok: false, error: 'The undo data could not be cleared.' }
  },
})

// --- Molecules ---

export const changeResid = defineOp({
  name: 'change_resid',
  description:
    'Change residue numbers of a molecule (Edit > Change residue number): shift them by a ' +
    'value, or number them from a value. renumber numbers consecutively instead of keeping ' +
    'the gaps.',
  params: {
    molId: moleculeId('Uid of the molecule.'),
    mode: enumOf(['shift', 'start'], 'shift: add value to each number; start: the first becomes value.'),
    value: integer('The shift, or the first number.'),
    selection: optional(selection('Only these residues. Null changes them all.')),
    renumber: optional(boolean('Number consecutively, closing gaps. Null is false.')),
  },
  mutates: true,
  expose: EXPOSE,
  format: () => [],
  run(ctx, args, oc) {
    return normalizeServiceResult(
      changeResidueIndex(ctx, {
        sceneId: oc.sceneId,
        objId: args.molId,
        selStr: args.selection ?? '',
        bshift: args.mode === 'shift',
        value: args.value,
        renumber: args.renumber ?? false,
      }),
      'The residue numbers could not be changed.',
    )
  },
})

/** The atom `spec` names in `mol`, or null. */
function atomOf(mol: MolCoord, spec: AtomSpec): MolAtom | null {
  try {
    return mol.getAtom(spec.chain, spec.resid, spec.atomName) as MolAtom | null
  } catch {
    return null
  }
}

/** The two atoms of a bond, or why not. */
function bondAtoms(ctx: Parameters<typeof getSceneOrNull>[0], sceneId: number, molId: number, specs: AtomSpec[]):
  { mol: MolCoord; a: MolAtom; b: MolAtom; scene: NonNullable<ReturnType<typeof getSceneOrNull>> } | { error: string } {
  if (specs.length !== 2) return { error: 'Give exactly two atoms, e.g. A/20/SG A/45/SG.' }
  const scene = getSceneOrNull(ctx, sceneId)
  const mol = scene?.getObject(molId) as MolCoord | null
  if (!scene || !mol) return { error: 'No molecule with that id in this scene.' }
  const a = atomOf(mol, specs[0])
  const b = atomOf(mol, specs[1])
  if (!a || !b) return { error: 'An atom was not found; check the chain, residue and atom name.' }
  if (a.id === b.id) return { error: 'The two atoms are the same.' }
  return { mol, a, b, scene }
}

const BOND_ATOMS = 'The two atoms, chain/resid/atom each, e.g. A/20/SG A/45/SG.'

export const addBond = defineOp({
  name: 'add_bond',
  description: 'Add a bond between two atoms of a molecule (the Add bond tool).',
  params: { molId: moleculeId('Uid of the molecule.'), atoms: atoms(BOND_ATOMS) },
  mutates: true,
  expose: EXPOSE,
  format: () => [],
  run(ctx, args, oc) {
    const found = bondAtoms(ctx, oc.sceneId, args.molId, args.atoms)
    if ('error' in found) return { ok: false, error: found.error }
    try {
      const mgr = ctx.svc.getService('MolAnlManager') as MolAnlManager
      withUndoTxn(found.scene, 'Add bond', () => { mgr.makeBond(found.mol, found.a.id, found.b.id) })
    } catch {
      return { ok: false, error: 'The bond could not be added.' }
    }
    return { ok: true }
  },
})

export const removeBond = defineOp({
  name: 'remove_bond',
  description: 'Remove the bond between two atoms of a molecule.',
  params: { molId: moleculeId('Uid of the molecule.'), atoms: atoms(BOND_ATOMS) },
  mutates: true,
  expose: EXPOSE,
  format: () => [],
  run(ctx, args, oc) {
    const found = bondAtoms(ctx, oc.sceneId, args.molId, args.atoms)
    if ('error' in found) return { ok: false, error: found.error }
    try {
      const mgr = ctx.svc.getService('MolAnlManager') as MolAnlManager
      withUndoTxn(found.scene, 'Remove bond(s)', () => { mgr.removeBond(found.mol, found.a.id, found.b.id) })
    } catch {
      return { ok: false, error: 'There is no bond to remove between those atoms.' }
    }
    return { ok: true }
  },
})

export const setSymmetry = defineOp({
  name: 'set_symmetry',
  description: 'Set the crystal symmetry of a molecule: the unit cell and the space group number.',
  params: {
    molId: moleculeId('Uid of the molecule.'),
    a: real('Cell a, in angstroms.'),
    b: real('Cell b, in angstroms.'),
    c: real('Cell c, in angstroms.'),
    alpha: real('Cell alpha, in degrees.'),
    beta: real('Cell beta, in degrees.'),
    gamma: real('Cell gamma, in degrees.'),
    spaceGroup: integer('Space group number, e.g. 19 for P 21 21 21.'),
  },
  mutates: true,
  expose: EXPOSE,
  format: () => [],
  run(ctx, args, oc) {
    return normalizeServiceResult(
      changeSymmetryInfo(ctx, {
        sceneId: oc.sceneId, objId: args.molId,
        a: args.a, b: args.b, c: args.c, alpha: args.alpha, beta: args.beta, gamma: args.gamma,
        nsg: args.spaceGroup,
      }),
      'The symmetry could not be set.',
    )
  },
})

// --- Renderers and surfaces ---

export const createGroup = defineOp({
  name: 'create_group',
  description: 'Make an empty renderer group on an object, to gather its renderers (New Group in the scene tree).',
  params: {
    objId: objectId('Uid of the object.'),
    name: optional(string('Name of the group. Null picks group1, group2, ...')),
  },
  mutates: true,
  expose: EXPOSE,
  run(ctx, args, oc) {
    const res = createRendererGroup(ctx, { sceneId: oc.sceneId, objId: args.objId, name: args.name ?? undefined })
    if (!res.ok) return { ok: false, error: 'The group could not be made (is the name taken?).' }
    return { ok: true, data: { rendererId: res.newRendId, name: res.newName } }
  },
})

export const genSurfaceObj = defineOp({
  name: 'gen_surface_obj',
  description: 'Turn the contour surface of a density map (an isosurf renderer) into a surface object of its own (Generate surface obj).',
  params: { rendId: rendererId('Uid of the isosurf renderer.') },
  mutates: true,
  expose: EXPOSE,
  run(ctx, args, oc) {
    const res = generateRendererSurfObj(ctx, { sceneId: oc.sceneId, rendId: args.rendId })
    if (!res.ok) return { ok: false, error: 'Only a map contour drawn as a surface (an isosurf renderer) can make a surface object.' }
    return { ok: true, data: { objectId: res.newObjId, name: res.newObjName } }
  },
})

export const regenSurface = defineOp({
  name: 'regen_surface',
  description: 'Compute a molecular surface object again from its molecule, optionally at another density.',
  params: {
    surfId: objectId('Uid of the surface object.'),
    density: optional(real('Points per angstrom. Null keeps the current density.')),
  },
  mutates: true,
  expose: EXPOSE,
  format: () => [],
  run(ctx, args, oc) {
    const info = getMolSurfRegenInfo(ctx, { sceneId: oc.sceneId, objId: args.surfId })
    if (!info.ok || !info.canRegen) {
      return { ok: false, error: info.ok && !info.origMolFound ? `Its molecule (${info.origMol}) is not in the scene.` : 'This object cannot be regenerated.' }
    }
    return normalizeServiceResult(
      regenMolSurf(ctx, { sceneId: oc.sceneId, objId: args.surfId, density: args.density ?? info.density }),
      'The surface could not be regenerated.',
    )
  },
})

const INTR_MODES: Record<number, string> = { 1: 'distance', 2: 'angle', 3: 'torsion' }

export const listInteractions = defineOp({
  name: 'list_interactions',
  description: 'List the distances, angles and torsions an interaction renderer draws, numbered from 1.',
  params: { rendId: rendererId('Uid of the interaction renderer.') },
  mutates: false,
  expose: EXPOSE,
  format: (data) => (data as { entries: { number: number; mode: string; atoms: string[] }[] }).entries.map((e) => `${e.number}  ${e.mode}  ${e.atoms.join('  ')}`),
  run(ctx, args, oc) {
    const res = listAtomIntrDefs(ctx, { sceneId: oc.sceneId, rendId: args.rendId })
    if (!res.ok) return { ok: false, error: 'That is not an interaction renderer.' }
    return { ok: true, data: { entries: res.entries.map((e, i) => ({ number: i + 1, mode: INTR_MODES[e.mode] ?? String(e.mode), atoms: e.atoms })) } }
  },
})

export const removeInteraction = defineOp({
  name: 'remove_interaction',
  description: 'Remove one distance, angle or torsion from an interaction renderer, by its number in list_interactions.',
  params: {
    rendId: rendererId('Uid of the interaction renderer.'),
    number: integer('Its number in list_interactions (from 1).'),
  },
  mutates: true,
  expose: EXPOSE,
  format: () => [],
  run(ctx, args, oc) {
    const list = listAtomIntrDefs(ctx, { sceneId: oc.sceneId, rendId: args.rendId })
    if (!list.ok) return { ok: false, error: 'That is not an interaction renderer.' }
    const entry = list.entries[args.number - 1]
    if (!entry) return { ok: false, error: `There is no interaction ${args.number}; list_interactions numbers them 1 to ${list.entries.length}.` }
    const res = removeAtomIntrDefs(ctx, { sceneId: oc.sceneId, rendId: args.rendId, ids: [entry.id] })
    return res.ok ? { ok: true } : { ok: false, error: 'The interaction could not be removed.' }
  },
})

// --- Paint entries ---

/** The renderer's paint entries, or why it has none. */
function paintEntries(ctx: Parameters<typeof getRendererColoringState>[0], sceneId: number, rendId: number): { entries: PaintEntryDto[] } | { error: string } {
  const state = getRendererColoringState(ctx, { sceneId, rendId })
  if (!state.ok) return { error: 'No renderer with that id in this scene.' }
  if (state.className !== 'PaintColoring') return { error: 'That renderer is not coloured by paint; paint_selection makes it so.' }
  return { entries: state.paintEntries }
}

export const listPaint = defineOp({
  name: 'list_paint',
  description: 'List a renderer\'s paint entries (selection and colour), numbered from 1. An atom takes the colour of the first entry that matches it.',
  params: { rendId: rendererId('Uid of the renderer.') },
  mutates: false,
  expose: EXPOSE,
  format: (data) => (data as { entries: { number: number; selStr: string; colorValue: string }[] }).entries.map((e) => `${e.number}  ${e.colorValue}  ${e.selStr}`),
  run(ctx, args, oc) {
    const p = paintEntries(ctx, oc.sceneId, args.rendId)
    if ('error' in p) return { ok: false, error: p.error }
    return { ok: true, data: { entries: p.entries.map(({ selStr, colorValue }, i) => ({ number: i + 1, selStr, colorValue })) } }
  },
})

const PAINT_NUMBER = 'The entry\'s number in list_paint (from 1).'

/** Resolve a paint entry number to its zero-based index, or fail. */
function paintIndex(ctx: Parameters<typeof getRendererColoringState>[0], sceneId: number, rendId: number, n: number): { entry: PaintEntryDto; count: number } | { error: string } {
  const p = paintEntries(ctx, sceneId, rendId)
  if ('error' in p) return p
  const e = p.entries[n - 1]
  if (!e) return { error: `There is no paint entry ${n}; list_paint numbers them 1 to ${p.entries.length}.` }
  return { entry: e, count: p.entries.length }
}

export const updatePaint = defineOp({
  name: 'update_paint',
  description: 'Change the selection or the colour of one paint entry.',
  params: {
    rendId: rendererId('Uid of the renderer.'),
    number: integer(PAINT_NUMBER),
    selection: optional(selection('New selection. Null keeps it.')),
    color: optional(string('New colour. Null keeps it.')),
  },
  mutates: true,
  expose: EXPOSE,
  format: () => [],
  run(ctx, args, oc) {
    const at = paintIndex(ctx, oc.sceneId, args.rendId, args.number)
    if ('error' in at) return { ok: false, error: at.error }
    return normalizeServiceResult(
      updatePaintEntry(ctx, {
        sceneId: oc.sceneId, rendId: args.rendId, idx: at.entry.idx,
        selStr: args.selection ?? at.entry.selStr,
        colorValue: args.color ?? at.entry.colorValue,
      }),
      'The paint entry could not be changed.',
    )
  },
})

export const removePaint = defineOp({
  name: 'remove_paint',
  description: 'Remove one paint entry.',
  params: { rendId: rendererId('Uid of the renderer.'), number: integer(PAINT_NUMBER) },
  mutates: true,
  expose: EXPOSE,
  format: () => [],
  run(ctx, args, oc) {
    const at = paintIndex(ctx, oc.sceneId, args.rendId, args.number)
    if ('error' in at) return { ok: false, error: at.error }
    return normalizeServiceResult(
      removePaintEntry(ctx, { sceneId: oc.sceneId, rendId: args.rendId, idx: at.entry.idx }),
      'The paint entry could not be removed.',
    )
  },
})

export const movePaint = defineOp({
  name: 'move_paint',
  description: 'Move a paint entry to another number in the list (an atom takes the colour of the first entry that matches it).',
  params: {
    rendId: rendererId('Uid of the renderer.'),
    number: integer(PAINT_NUMBER),
    to: integer('The number it should have.'),
  },
  mutates: true,
  expose: EXPOSE,
  format: () => [],
  run(ctx, args, oc) {
    const at = paintIndex(ctx, oc.sceneId, args.rendId, args.number)
    if ('error' in at) return { ok: false, error: at.error }
    if (args.to < 1 || args.to > at.count) return { ok: false, error: `to must be 1 to ${at.count}.` }
    return normalizeServiceResult(
      movePaintEntry(ctx, { sceneId: oc.sceneId, rendId: args.rendId, fromIdx: at.entry.idx, toIdx: args.to - 1 }),
      'The paint entry could not be moved.',
    )
  },
})

export const colorByElepot = defineOp({
  name: 'color_by_elepot',
  description:
    'Colour a molecular surface renderer by an electrostatic potential map (made by ' +
    'calc_elepot): red for negative, blue for positive, white between, as in the Coloring panel.',
  params: {
    rendId: rendererId('Uid of the surface renderer.'),
    map: optional(string('Name of the potential map object. Null uses the one already set, or the first in the scene.')),
    low: optional(real('Potential (kT/e) drawn in the low colour. Null keeps it.')),
    high: optional(real('Potential (kT/e) drawn in the high colour. Null keeps it.')),
  },
  mutates: true,
  expose: EXPOSE,
  format: () => [],
  run(ctx, args, oc) {
    const base = { sceneId: oc.sceneId, rendId: args.rendId }
    if (!setRendererColoring(ctx, { ...base, coloringId: 'paint-type-elepot' }).ok) {
      return { ok: false, error: 'Only a molecular surface renderer (molsurf, dsurface) can be coloured by potential.' }
    }
    const writes: [string, string | number][] = []
    if (args.map !== null) writes.push(['elepot', args.map])
    if (args.low !== null) writes.push(['lowpar', args.low])
    if (args.high !== null) writes.push(['highpar', args.high])
    for (const [propName, propValue] of writes) {
      if (!setRendererElepotProp(ctx, { ...base, propName, propValue }).ok) {
        return { ok: false, error: `${propName} could not be set.` }
      }
    }
    return { ok: true }
  },
})

// --- Maps and export ---

export const recenterMap = defineOp({
  name: 'recenter_map',
  description: 'Redraw a density map\'s contour around the centre of the view (Re-centre in the map pane).',
  params: { rendId: rendererId('Uid of the map renderer.') },
  mutates: true,
  expose: EXPOSE,
  format: () => [],
  run(ctx, args, oc) {
    const rend = getSceneOrNull(ctx, oc.sceneId)?.getRenderer(args.rendId) as { type_name?: string } | null
    let typeName = ''
    try { typeName = rend?.type_name ?? '' } catch { /* not a renderer we can read */ }
    if (!MAP_RENDERER_TYPES.has(typeName)) {
      return { ok: false, error: 'That is not a map renderer (contour or isosurf).' }
    }
    return normalizeServiceResult(
      redrawMapCenter(ctx, { sceneId: oc.sceneId, rendId: args.rendId, viewId: oc.viewId }),
      'The map could not be re-centred.',
    )
  },
})

const EXPORT_EXT = { png: '.png', pov: '.pov', stl: '.stl', mqo: '.mqo' } as const

export const exportSceneOp = defineOp({
  name: 'export_scene',
  description:
    'Export the view or the scene to a file (File > Export): png (with transparency and a DPI ' +
    'if asked), pov (POV-Ray scene), stl or mqo (3D models).',
  params: {
    path: path('The file to write.'),
    format: optional(enumOf(['png', 'pov', 'stl', 'mqo'], 'Null takes it from the file extension, else png.')),
    width: optional(integer('Width in pixels. Null uses the view\'s size.')),
    height: optional(integer('Height in pixels. Null uses the view\'s size.')),
    transparent: optional(boolean('png: a transparent background. Null is false.')),
    dpi: optional(integer('png: the resolution written in the file. Null leaves it out.')),
  },
  mutates: false,
  expose: EXPOSE,
  run(ctx, args, oc): OpOutcome {
    const ext = args.path.trim().toLowerCase().match(/\.(png|pov|stl|mqo)$/)?.[1] as keyof typeof EXPORT_EXT | undefined
    const format = args.format ?? ext ?? 'png'
    const target = outputPath(oc, args.path, EXPORT_EXT[format])
    if ('error' in target) return { ok: false, error: target.error }
    const info = getSceneExportInfo(ctx, { sceneId: oc.sceneId, viewId: oc.viewId })
    if (!info.ok) return { ok: false, error: 'The view could not be read for export.' }
    const res = exportScene(ctx, {
      sceneId: oc.sceneId,
      viewId: oc.viewId,
      filePath: target.path,
      exporterName: format,
      width: args.width ?? info.width,
      height: args.height ?? info.height,
      ...(args.transparent !== null ? { alpha: args.transparent } : {}),
      ...(args.dpi !== null ? { resoln: args.dpi } : {}),
    })
    return res.ok ? { ok: true, data: { path: target.path } } : { ok: false, error: `The ${format} file could not be written.` }
  },
})

export const EDIT_OPS = [
  resetProp, clearUndo, changeResid, addBond, removeBond, setSymmetry,
  createGroup, genSurfaceObj, regenSurface, listInteractions, removeInteraction,
  listPaint, updatePaint, removePaint, movePaint, colorByElepot, recenterMap, exportSceneOp,
]
