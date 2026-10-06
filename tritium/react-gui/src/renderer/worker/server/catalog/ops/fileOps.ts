/**
 * @file worker/server/catalog/ops/fileOps.ts
 * @description Ops that bring structures into the scene.
 */

import {
  streamLoadFromUrl,
} from '@renderer/worker/server/services/file/streamLoadFromUrl'
import { loadObject } from '@renderer/worker/server/services/file/loadObject'
import {
  getCompatibleRendererNames,
} from '@renderer/worker/server/services/file/getCompatibleRendererNames'
import { pickCoordUrl } from '@renderer/worker/shared/pdbUrls'
import { buildHeadlessFileOpenOptions } from '@renderer/worker/server/services/file/headlessOpen'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { defineOp } from '../op'
import { enumOf, optional, path, rendererType, selection, string } from '../params'

/** A CueMol scene file, which opens as a scene rather than loading into one. */
const SCENE_FILE_RE = /\.qsc$/i

/** A four-character PDB accession code. */
const PDB_ID_RE = /^[0-9][0-9a-z]{3}$/i

export const fetchPdb = defineOp({
  name: 'fetch_pdb',
  description:
    'Download a structure from the RCSB PDB by its four-character accession code and add it ' +
    'to the scene. Creates a new object AND a default renderer, so call get_scene_state ' +
    'afterwards to learn their ids. This one takes a few seconds.',
  params: {
    pdbId: string('Four-character PDB accession code, for example 1CRN.'),
    format: enumOf(['mmcif', 'pdb'], 'Which file to fetch. Prefer mmcif.'),
    rendererType: optional(
      rendererType("Renderer to create for it, for example cartoon. Null uses the reader's default."),
    ),
    selection: optional(selection('Draw only this selection. Null draws everything.')),
  },
  mutates: true,
  expose: { tool: 'core', console: true },
  verbs: [
    {
      verb: 'fetch',
      defaults: { format: 'mmcif' },
      order: ['pdbId', 'rendererType', 'selection', 'format'],
      summary: 'Download a structure from the PDB by its accession code.',
    },
  ],
  async run(ctx, args, oc) {
    const pdbId = args.pdbId.trim().toLowerCase()
    if (!PDB_ID_RE.test(pdbId)) {
      return { ok: false, error: `"${args.pdbId}" is not a PDB accession code (four characters, first a digit).` }
    }
    const spec = pickCoordUrl(pdbId, args.format === 'pdb' ? 'RCSB_PDB' : 'RCSB_CIF')
    const options = buildHeadlessFileOpenOptions(ctx, {
      readerName: spec.readerName,
      objectName: pdbId,
      rendererType: args.rendererType,
      selection: args.selection,
    })

    // Registered with the caller so that stopping it aborts this download
    // rather than leaving it running.
    const reqId = oc.streamId('fetch')
    oc.noteStream(reqId)

    const result = await streamLoadFromUrl(ctx, {
      reqId,
      url: spec.url,
      readerName: spec.readerName,
      objectName: pdbId,
      sceneId: oc.sceneId,
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
})

export const loadFile = defineOp({
  name: 'load_file',
  description:
    'Open a structure file already on this computer and add it to the scene. Only use a path ' +
    'the user gave you. Creates a new object AND a default renderer, so call get_scene_state ' +
    'afterwards to learn their ids.',
  params: {
    path: path('Absolute path of the file to open.'),
    rendererType: optional(rendererType("Renderer to create for it. Null uses the reader's default.")),
    selection: optional(selection('Draw only this selection. Null draws everything.')),
  },
  mutates: true,
  expose: { tool: 'core', console: true },
  verbs: [{ verb: 'load', summary: 'Open a structure file, or a .qsc scene.' }],
  outsideTxn: (raw) => SCENE_FILE_RE.test((raw.path ?? '').trim()),
  run(ctx, args, oc) {
    const filePath = args.path
    if (SCENE_FILE_RE.test(filePath)) {
      // A scene is opened by the UI the way File > Open does it -- into the
      // current tab when that is new and empty, otherwise a new one.
      if (!oc.openScene) {
        return { ok: false, error: `"${filePath}" is a scene file; open it with File > Open.` }
      }
      oc.openScene(filePath)
      return { ok: true, data: { scene: filePath } }
    }
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
      rendererType: args.rendererType,
      selection: args.selection,
    })

    const result = loadObject(ctx, {
      filePath,
      sceneId: oc.sceneId,
      options,
      contentFirst: false,
      readerName: compat.readerName,
    })
    return normalizeServiceResult(result, `"${filePath}" could not be opened.`)
  },
})

export const FILE_OPS = [fetchPdb, loadFile]
