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
import { PDB_ID_RE, pickCoordUrl } from '@renderer/worker/shared/pdbUrls'
import { buildHeadlessFileOpenOptions } from '@renderer/worker/server/services/file/headlessOpen'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { fileStem } from '@shared/fileExt'
import { defineOp } from '../op'
import { callerPath } from '../outputFile'
import { enumOf, optional, path, rendererType, selection, string } from '../params'
import { applyReaderOptionText, settableReaderOptions, withCompanionFile } from '../readerOptions'

/** A CueMol scene file, which opens as a scene rather than loading into one. */
const SCENE_FILE_RE = /\.qsc$/i


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
    'the user gave you. Creates a new object AND a default renderer, so call get_scene_state ' +
    'afterwards to learn their ids. The reader options of the File Open dialog (e.g. ' +
    'build2ndry=false for a PDB file, columnF=FWT columnPhi=PHWT for an MTZ file) go in ' +
    'options; an unknown key is answered with the list of the reader\'s options.',
  params: {
    path: path('Absolute path of the file to open.'),
    rendererType: optional(rendererType("Renderer to create for it. Null uses the reader's default.")),
    selection: optional(selection('Draw only this selection. Null draws everything.')),
    name: optional(string('Name of the new object. Null uses the file name.')),
    options: optional(string('Reader options as key=value pairs separated by spaces, e.g. "loadModel=true build2ndry=false". Null keeps the defaults.')),
    companion: optional(path('The second file of a two-file format: the .vert file of an MSMS surface, the .psf of NAMD coordinates, the coordinates of an AMBER prmtop. Null for none.')),
  },
  mutates: true,
  expose: { tool: 'files', console: true },
  group: 'files',
  aliases: [{ name: 'load', summary: 'Open a structure file, or a .qsc scene.' }],
  outsideTxn: (args) => typeof args.path === 'string' && SCENE_FILE_RE.test(args.path.trim()),
  run(ctx, args, oc) {
    const filePath = callerPath(args.path)
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
    const baseName = fileStem(filePath) || 'object'
    const options = buildHeadlessFileOpenOptions(ctx, {
      readerName: compat.readerName,
      objectName: args.name?.trim() || baseName,
      rendererType: args.rendererType,
      selection: args.selection,
    })
    if (args.options !== null) {
      const format = applyReaderOptionText(options.format, args.options)
      if ('error' in format) return { ok: false, error: format.error }
      options.format = format
    }
    if (args.companion !== null) {
      const format = withCompanionFile(options.format, callerPath(args.companion))
      if ('error' in format) return { ok: false, error: format.error }
      options.format = format
    }

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

export const readerOptions = defineOp({
  name: 'list_reader_options',
  description:
    'List the reader options load_file takes for a file (those of the File Open dialog), ' +
    'with the values a load uses when none is given.',
  params: { path: path('The file to open.') },
  mutates: false,
  expose: { tool: false, console: true, mcp: true },
  group: 'files',
  format(data) {
    const d = data as { reader: string; options: Record<string, unknown> }
    const rows = Object.entries(d.options).map(([k, v]) => `  ${k}=${String(v)}`)
    return [`reader ${d.reader}`, ...(rows.length > 0 ? rows : ['  (no options)'])]
  },
  run(ctx, args) {
    const filePath = callerPath(args.path)
    if (SCENE_FILE_RE.test(filePath)) return { ok: false, error: 'A scene file has no reader options.' }
    const compat = getCompatibleRendererNames(ctx, { filePath })
    if (compat.readerName === '') {
      return { ok: false, error: `No reader can handle "${filePath}". Check the path and the format.` }
    }
    const options = buildHeadlessFileOpenOptions(ctx, {
      readerName: compat.readerName,
      objectName: 'object',
      rendererType: null,
      selection: null,
    })
    return { ok: true, data: { reader: compat.readerName, options: settableReaderOptions(options.format) } }
  },
})

export const FILE_OPS = [fetchPdb, loadFile, readerOptions]
