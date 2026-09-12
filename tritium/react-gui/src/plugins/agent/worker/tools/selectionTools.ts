/**
 * @file plugins/agent/worker/tools/selectionTools.ts
 * @description Tools for building and checking selection expressions.
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
import { normalizeServiceResult } from '../toolOutput'
import type { AgentTool } from './types'
import { bool, int, nullable, str, strictSchema } from './types'

/** Residues returned before the tail is summarised away. */
const MAX_RESIDUES = 200

const getMolChainsTool: AgentTool = {
  name: 'get_mol_chains',
  description: 'List the chain names of one molecule. Use before writing a chain-based selection.',
  parameters: strictSchema({
    molId: int('Uid of the molecule object, from get_scene_state.'),
  }),
  mutates: false,
  run(ctx, input, turn) {
    const result = getMolChains(ctx, {
      sceneId: turn.sceneId,
      molId: Number(input.molId),
    })
    return normalizeServiceResult(result, 'No molecule with that id, or it has no chains.')
  },
}

const getMolResiduesTool: AgentTool = {
  name: 'get_mol_residues',
  description:
    'List the residues of one chain: index, three-letter name, and one-letter code. ' +
    'The index is a STRING because it may carry an insertion code (for example "20A"), ' +
    'so use it verbatim in a selection.',
  parameters: strictSchema({
    molId: int('Uid of the molecule object.'),
    chain: str('Chain name, from get_mol_chains.'),
    offset: nullable('integer', 'Skip this many residues. Null starts at the beginning.'),
  }),
  mutates: false,
  run(ctx, input, turn) {
    const result = getMolResidues(ctx, {
      sceneId: turn.sceneId,
      molId: Number(input.molId),
      chainName: String(input.chain),
    })
    if (!result.ok) {
      return { ok: false, error: 'No molecule with that id, or no such chain.' }
    }
    const offset = input.offset === null || input.offset === undefined ? 0 : Number(input.offset)
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
}

const checkSelection: AgentTool = {
  name: 'check_selection',
  description:
    'Compile a selection expression and count the atoms it matches in one molecule. ' +
    'Do this before using an expression anywhere else: an expression can be valid and ' +
    'still match nothing, which looks like a renderer that did not work.',
  parameters: strictSchema({
    molId: int('Uid of the molecule to count against.'),
    selection: str('The selection expression to check.'),
  }),
  mutates: false,
  run(ctx, input, turn) {
    const selection = String(input.selection)
    // An empty string compiles as "everything" but means "no expression",
    // which is never what the model intended to write.
    if (selection.trim() === '') {
      return { ok: false, error: 'The selection expression is empty.' }
    }
    const valid = validateSelection(ctx, { selStr: selection, sceneId: turn.sceneId })
    if (!valid.ok) {
      return { ok: false, error: 'The selection expression does not compile. Check the syntax.' }
    }
    const hits = getSelHitCount(ctx, {
      sceneId: turn.sceneId,
      molId: Number(input.molId),
      selStr: selection,
    })
    if (hits.count === null) {
      return { ok: false, error: 'The expression compiles but could not be counted against that molecule.' }
    }
    return { ok: true, data: { valid: true, atomCount: hits.count } }
  },
}

const setMolSelection: AgentTool = {
  name: 'set_mol_selection',
  description:
    "Set one molecule's current selection, which is what the user sees highlighted. " +
    'An empty expression clears it. This does not change what any renderer draws; ' +
    'use set_renderer_selection for that.',
  parameters: strictSchema({
    molId: int('Uid of the molecule object.'),
    selection: str('Selection expression. Empty string clears the selection.'),
  }),
  mutates: true,
  run(ctx, input, turn) {
    const result = applyMolSelString(ctx, {
      sceneId: turn.sceneId,
      molId: Number(input.molId),
      selStr: String(input.selection),
    })
    return normalizeServiceResult(
      result,
      'The selection could not be applied. Check the molecule id and the expression.',
    )
  },
}

const centerView: AgentTool = {
  name: 'center_view',
  description:
    'Move the camera to a selection. Note the side effect: this also SETS the molecule\'s ' +
    'current selection to the expression given, the same as set_mol_selection.',
  parameters: strictSchema({
    molId: int('Uid of the molecule object.'),
    selection: nullable(
      'string',
      "Selection expression to centre on. Null uses the molecule's current selection.",
    ),
    zoom: bool('True also zooms to fit the selection; false only recentres.'),
  }),
  mutates: true,
  run(ctx, input, turn) {
    const selection = input.selection === null || input.selection === undefined
      ? ''
      : String(input.selection)
    const args = {
      sceneId: turn.sceneId,
      viewId: turn.viewId,
      molId: Number(input.molId),
      selStr: selection,
    }
    const result = input.zoom ? zoomMolSelection(ctx, args) : centerMolSelection(ctx, args)
    return normalizeServiceResult(
      result,
      'The view could not be centred. Check the molecule id and the expression.',
    )
  },
}

export const SELECTION_TOOLS: AgentTool[] = [
  getMolChainsTool,
  getMolResiduesTool,
  checkSelection,
  setMolSelection,
  centerView,
]
