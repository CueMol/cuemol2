/**
 * @file plugins/agent/worker/tools/fileTools.ts
 * @description Tools that bring structures into the scene.
 */

import {
  streamLoadFromUrl,
} from '@renderer/worker/server/services/file/streamLoadFromUrl'
import { loadObject } from '@renderer/worker/server/services/file/loadObject'
import {
  getCompatibleRendererNames,
} from '@renderer/worker/server/services/file/getCompatibleRendererNames'
import { pickCoordUrl } from '@renderer/worker/shared/pdbUrls'
import { buildHeadlessFileOpenOptions } from './defaultFileOpenOptions'
import { normalizeServiceResult } from '../toolOutput'
import type { AgentTool } from './types'
import { enumStr, nullable, str, strictSchema } from './types'

/** A four-character PDB accession code. */
const PDB_ID_RE = /^[0-9][0-9a-z]{3}$/i

const fetchPdb: AgentTool = {
  name: 'fetch_pdb',
  description:
    'Download a structure from the RCSB PDB by its four-character accession code and add it ' +
    'to the scene. Creates a new object AND a default renderer, so call get_scene_state ' +
    'afterwards to learn their ids. This one takes a few seconds.',
  parameters: strictSchema({
    pdbId: str('Four-character PDB accession code, for example 1CRN.'),
    format: enumStr(['mmcif', 'pdb'], 'Which file to fetch. Prefer mmcif.'),
    rendererType: nullable(
      'string',
      "Renderer to create for it, for example cartoon. Null uses the reader's default.",
    ),
    selection: nullable('string', 'Draw only this selection. Null draws everything.'),
  }),
  mutates: true,
  async run(ctx, input, turn) {
    const pdbId = String(input.pdbId).trim().toLowerCase()
    if (!PDB_ID_RE.test(pdbId)) {
      return { ok: false, error: `"${input.pdbId}" is not a PDB accession code (four characters, first a digit).` }
    }
    const spec = pickCoordUrl(pdbId, input.format === 'pdb' ? 'RCSB_PDB' : 'RCSB_CIF')
    const options = buildHeadlessFileOpenOptions(ctx, {
      readerName: spec.readerName,
      objectName: pdbId,
      rendererType: input.rendererType === null || input.rendererType === undefined
        ? null
        : String(input.rendererType),
      selection: input.selection === null || input.selection === undefined
        ? null
        : String(input.selection),
    })

    // Namespaced by turn and call, and registered with the turn so that
    // stopping the turn aborts this download rather than leaving it running.
    const reqId = `${turn.turnId}:${turn.callId}`
    turn.noteStream(reqId)

    const result = await streamLoadFromUrl(ctx, {
      reqId,
      url: spec.url,
      readerName: spec.readerName,
      objectName: pdbId,
      sceneId: turn.sceneId,
      options,
    })
    if (!result.ok) {
      return {
        ok: false,
        error: result.error || `${pdbId.toUpperCase()} could not be downloaded.`,
      }
    }
    return { ok: true, data: { objectId: result.objId, name: pdbId } }
  },
}

const loadFile: AgentTool = {
  name: 'load_file',
  description:
    'Open a structure file already on this computer and add it to the scene. Only use a path ' +
    'the user gave you. Creates a new object AND a default renderer, so call get_scene_state ' +
    'afterwards to learn their ids.',
  parameters: strictSchema({
    path: str('Absolute path of the file to open.'),
    rendererType: nullable(
      'string',
      "Renderer to create for it. Null uses the reader's default.",
    ),
    selection: nullable('string', 'Draw only this selection. Null draws everything.'),
  }),
  mutates: true,
  run(ctx, input, turn) {
    const filePath = String(input.path)
    const compat = getCompatibleRendererNames(ctx, { filePath })
    // An unreadable file resolves to no reader at all; saying so here is more
    // useful than letting loadObject fail later on the same fact.
    if (compat.readerName === '') {
      return { ok: false, error: `No reader can handle "${filePath}". Check the path and the format.` }
    }
    const baseName = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'object'
    const options = buildHeadlessFileOpenOptions(ctx, {
      readerName: compat.readerName,
      objectName: baseName,
      rendererType: input.rendererType === null || input.rendererType === undefined
        ? null
        : String(input.rendererType),
      selection: input.selection === null || input.selection === undefined
        ? null
        : String(input.selection),
    })

    const result = loadObject(ctx, {
      filePath,
      sceneId: turn.sceneId,
      options,
      contentFirst: false,
      readerName: compat.readerName,
    })
    return normalizeServiceResult(result, `"${filePath}" could not be opened.`)
  },
}

export const FILE_TOOLS: AgentTool[] = [fetchPdb, loadFile]
