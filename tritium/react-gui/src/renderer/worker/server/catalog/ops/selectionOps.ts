/**
 * @file worker/server/catalog/ops/selectionOps.ts
 * @description Ops for building and checking selection expressions.
 */

import {
  getMolChains,
  getMolResidues,
} from '@renderer/worker/server/services/select/getMolStructure'
import { getSelHitCount } from '@renderer/worker/server/services/select/getSelHitCount'
import { validateSelection } from '@renderer/worker/server/services/select/validateSelection'
import {
  applyMolSelString,
  centerMolSelection,
  zoomMolSelection,
} from '@renderer/worker/server/services/select/applyMolSelString'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { defineOp } from '../op'
import { boolean, integer, moleculeId, optional, selection, string } from '../params'
import { wrapList } from '../consoleFormat'

/** Residues returned before the tail is summarised away. */
const MAX_RESIDUES = 200

export const getMolChainsOp = defineOp({
  name: 'get_mol_chains',
  description: 'List the chain names of one molecule. Use before writing a chain-based selection.',
  params: {
    molId: moleculeId('Uid of the molecule object, from get_scene_state.'),
  },
  mutates: false,
  expose: { tool: 'core', console: true },
  run(ctx, args, oc) {
    const result = getMolChains(ctx, { sceneId: oc.sceneId, molId: args.molId })
    return normalizeServiceResult(result, 'No molecule with that id, or it has no chains.')
  },
})

export const getMolResiduesOp = defineOp({
  name: 'get_mol_residues',
  description:
    'List the residues of one chain: index, three-letter name, and one-letter code. ' +
    'The index is a STRING because it may carry an insertion code (for example "20A"), ' +
    'so use it verbatim in a selection.',
  params: {
    molId: moleculeId('Uid of the molecule object.'),
    chain: string('Chain name, from get_mol_chains.'),
    offset: optional(integer('Skip this many residues. Null starts at the beginning.')),
  },
  mutates: false,
  expose: { tool: 'core', console: true },
  format(data) {
    const d = data as {
      total: number
      offset: number
      residues: { index: string; name: string }[]
      truncated: boolean
    }
    const shown = d.residues.length
    return [
      `${d.total} residues${d.offset > 0 || d.truncated ? ` (showing ${d.offset + 1}-${d.offset + shown})` : ''}`,
      ...wrapList(d.residues.map((r) => `${r.index}${r.name}`), '  ', ' '),
    ]
  },
  run(ctx, args, oc) {
    const result = getMolResidues(ctx, {
      sceneId: oc.sceneId,
      molId: args.molId,
      chainName: args.chain,
    })
    if (!result.ok) {
      return { ok: false, error: 'No molecule with that id, or no such chain.' }
    }
    const offset = args.offset ?? 0
    const page = result.residues.slice(offset, offset + MAX_RESIDUES)
    return {
      ok: true,
      data: {
        total: result.residues.length,
        offset,
        residues: page.map((r) => ({ index: r.index, name: r.name, single: r.single })),
        truncated: offset + page.length < result.residues.length,
      },
    }
  },
})

export const checkSelection = defineOp({
  name: 'check_selection',
  description:
    'Compile a selection expression and count the atoms it matches in one molecule. ' +
    'Do this before using an expression anywhere else: an expression can be valid and ' +
    'still match nothing, which looks like a renderer that did not work.',
  params: {
    molId: moleculeId('Uid of the molecule to count against.'),
    selection: selection('The selection expression to check.'),
  },
  mutates: false,
  expose: { tool: 'core', console: true },
  run(ctx, args, oc) {
    // An empty string compiles as "everything" but means "no expression",
    // which is never what the caller intended to write.
    if (args.selection.trim() === '') {
      return { ok: false, error: 'The selection expression is empty.' }
    }
    const valid = validateSelection(ctx, { selStr: args.selection, sceneId: oc.sceneId })
    if (!valid.ok) {
      return { ok: false, error: 'The selection expression does not compile. Check the syntax.' }
    }
    const hits = getSelHitCount(ctx, {
      sceneId: oc.sceneId,
      molId: args.molId,
      selStr: args.selection,
    })
    if (hits.count === null) {
      return { ok: false, error: 'The expression compiles but could not be counted against that molecule.' }
    }
    return { ok: true, data: { valid: true, atomCount: hits.count } }
  },
})

export const setMolSelection = defineOp({
  name: 'set_mol_selection',
  description:
    "Set one molecule's current selection, which is what the user sees highlighted. " +
    'An empty expression clears it. This does not change what any renderer draws; ' +
    'use set_renderer_selection for that.',
  params: {
    molId: moleculeId('Uid of the molecule object.'),
    selection: selection('Selection expression. Empty string clears the selection.'),
  },
  mutates: true,
  expose: { tool: 'core', console: true },
  verbs: [{ verb: 'select', summary: "Set a molecule's current selection." }],
  run(ctx, args, oc) {
    const result = applyMolSelString(ctx, {
      sceneId: oc.sceneId,
      molId: args.molId,
      selStr: args.selection,
    })
    return normalizeServiceResult(
      result,
      'The selection could not be applied. Check the molecule id and the expression.',
    )
  },
})

export const centerView = defineOp({
  name: 'center_view',
  description:
    'Move the camera to a selection. Note the side effect: this also SETS the molecule\'s ' +
    'current selection to the expression given, the same as set_mol_selection.',
  params: {
    molId: moleculeId('Uid of the molecule object.'),
    selection: optional(
      selection("Selection expression to centre on. Null uses the molecule's current selection."),
    ),
    zoom: boolean('True also zooms to fit the selection; false only recentres.'),
  },
  mutates: true,
  expose: { tool: 'core', console: true },
  verbs: [
    { verb: 'zoom', fixed: { zoom: true }, summary: 'Centre the view on a selection and zoom to fit it.' },
    { verb: 'center', fixed: { zoom: false }, summary: 'Centre the view on a selection.' },
  ],
  run(ctx, args, oc) {
    const svcArgs = {
      sceneId: oc.sceneId,
      viewId: oc.viewId,
      molId: args.molId,
      selStr: args.selection ?? '',
    }
    const result = args.zoom ? zoomMolSelection(ctx, svcArgs) : centerMolSelection(ctx, svcArgs)
    return normalizeServiceResult(
      result,
      'The view could not be centred. Check the molecule id and the expression.',
    )
  },
})

export const SELECTION_OPS = [
  getMolChainsOp,
  getMolResiduesOp,
  checkSelection,
  setMolSelection,
  centerView,
]
