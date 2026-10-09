/**
 * @file worker/server/catalog/ops/fileOps.ts
 * @description Ops that bring structures into the scene.
 */

import {
  streamLoadFromUrl,
} from '@renderer/worker/server/services/file/streamLoadFromUrl'
import { PDB_ID_RE, pickCoordUrl } from '@renderer/worker/shared/pdbUrls'
import { buildHeadlessFileOpenOptions } from '@renderer/worker/server/services/file/headlessOpen'
import { defineOp } from '../op'
import { loadObjectFile, openTarget, SCENE_FILE_RE } from '../fileLoad'
import { enumOf, optional, path, rendererType, selection, string } from '../params'

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
  group: 'files',
  aliases: [
    {
      name: 'fetch',
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
    'the user gave you. The reader is picked as File > Open picks it (by extension, or by the ' +
    'content when the extension is ambiguous or unknown) and uses its default options. Creates ' +
    'a new object AND a default renderer, so call get_scene_state afterwards to learn their ids.',
  params: {
    path: path('Absolute path of the file to open.'),
    rendererType: optional(rendererType("Renderer to create for it. Null uses the reader's default.")),
    selection: optional(selection('Draw only this selection. Null draws everything.')),
    name: optional(string('Name of the new object. Null uses the file name.')),
  },
  mutates: true,
  expose: { tool: 'files', console: true },
  group: 'files',
  aliases: [{ name: 'load', summary: 'Open a structure file, or a .qsc scene.' }],
  outsideTxn: (args) => typeof args.path === 'string' && SCENE_FILE_RE.test(args.path.trim()),
  run(ctx, args, oc) {
    const target = openTarget(ctx, args.path)
    if ('error' in target) return { ok: false, error: target.error }
    if (target.scene) {
      // A scene is opened by the UI the way File > Open does it -- into the
      // current tab when that is new and empty, otherwise a new one.
      if (!oc.openScene) {
        return { ok: false, error: `"${target.filePath}" is a scene file; open it with File > Open.` }
      }
      oc.openScene(target.filePath)
      return { ok: true, data: { scene: target.filePath } }
    }
    return loadObjectFile(ctx, oc, target, args)
  },
})

export const FILE_OPS = [fetchPdb, loadFile]
