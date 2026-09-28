/**
 * @file plugins/pymconsole/worker/commands/saveCommands.ts
 * @description `save`: a molecule (or part of one) to PDB / SDF, or the scene.
 *
 * PyMOL writes whatever the selection covers into one file, across objects.
 * CueMol's writers take one object, so a save here names one molecule; the
 * selection limits the atoms through the writer's own `sel` property.
 *
 * Unlike File > Save As, the object is not re-pointed at the new file
 * (`convToLink` is left off): a partial save is not the object, and PyMOL
 * does not re-point anything either.
 *
 * Saving a `.qsc` resets the undo history and renames the scene after the
 * file, so it runs outside the submission's transaction (`outsideTxn`).
 */

import { saveScene } from '@renderer/worker/server/services/scene/saveScene'
import { exportScene, getSceneExportInfo } from '@renderer/worker/server/services/scene/exportImage'
import { writePng } from './miscCommands'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'
import { getSelHitCount } from '@renderer/worker/server/services/select/getSelHitCount'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdOutcome, PymCommand } from './types'
import { isDefaulted, resolveMolSelection, resolvePath } from './helpers'

/** Object writer categories, as the StreamManager numbers them. */
const OBJ_WRITER_CATEGORY = 1

/** File formats this console can write, by the format name PyMOL uses. */
const MOL_WRITERS: Readonly<Record<string, string>> = {
  pdb: 'pdb',
  sdf: 'sdf',
  mol: 'sdf',
  pqr: 'pqr',
}

/**
 * Formats that are the scene drawn to a file rather than a molecule written
 * out: PyMOL's save routes .png to png, and writes .pov / .stl from the view
 * (exporting.py savefunctions).
 */
const SCENE_EXPORTERS: Readonly<Record<string, string>> = {
  pov: 'pov',
  stl: 'stl',
}

/** The formats PyMOL writes that have no writer here, with the reason. */
const UNSUPPORTED_FORMATS: Readonly<Record<string, string>> = {
  cif: 'CueMol has no mmCIF writer; save as .pdb',
  pse: 'a .pse is a PyMOL session; save the scene as .qsc',
}

/** The file format a name and an explicit `format` argument ask for. */
function formatOf(filePath: string, format: string): string {
  const explicit = format.trim().toLowerCase()
  if (explicit !== '') return explicit
  const m = /\.([A-Za-z0-9]+)(\.gz)?$/.exec(filePath)
  if (!m) return ''
  const ext = m[1].toLowerCase()
  return ext === 'ent' ? 'pdb' : ext
}

interface ObjWriter {
  setPath(path: string): void
  sel: unknown
  convToLink: boolean
  attach(obj: unknown): void
  write(): void
  detach(): void
}

/** Write one molecule, or the part `selStr` covers, with `writerName`. */
function writeMolecule(
  ctx: WorkerContext,
  sceneId: number,
  objId: number,
  selStr: string,
  writerName: string,
  filePath: string,
): CmdOutcome {
  const scene = getSceneOrNull(ctx, sceneId)
  const obj = scene?.getObject(objId)
  if (!obj) return { ok: false, error: 'Error: the molecule is gone' }

  let writer: ObjWriter | null
  try {
    writer = ctx.strMgr.createHandler(writerName, OBJ_WRITER_CATEGORY) as unknown as ObjWriter | null
  } catch {
    writer = null
  }
  if (!writer) return { ok: false, error: `Error: no ${writerName} writer in this build` }

  let attached = false
  try {
    writer.setPath(filePath)
    if (selStr !== '*') {
      const sel = makeSel(ctx, selStr, sceneId)
      if (!sel) return { ok: false, error: 'Error: the selection did not compile' }
      writer.sel = sel
    }
    writer.convToLink = false
    writer.attach(obj)
    attached = true
    writer.write()
  } catch (e) {
    return { ok: false, error: `Error: cannot write ${filePath}: ${e instanceof Error ? e.message : String(e)}` }
  } finally {
    if (attached) {
      try { writer.detach() } catch { /* already detached */ }
    }
  }
  return { ok: true }
}

const save: PymCommand = {
  name: 'save',
  params: [
    { name: 'filename' },
    { name: 'selection', default: '(all)' },
    { name: 'state', default: '-1' },
    { name: 'format', default: '' },
    { name: 'ref', default: '' },
    { name: 'ref_state', default: '-1' },
    { name: 'quiet', default: '1' },
    { name: 'partial', default: '0' },
  ],
  mode: 'strict',
  mutates: false,
  summary: 'Write a molecule (or part of one) to .pdb / .sdf / .pqr, the scene to .qsc, or the view to .png / .pov / .stl.',
  completions: [null, { source: 'selections', description: 'selection', suffix: ', ' }],
  outsideTxn: (args) => formatOf(args.filename ?? '', args.format ?? '') === 'qsc',
  run(ctx, args, cc) {
    const filePath = resolvePath(cc.cwd, args.filename.trim())
    const format = formatOf(filePath, args.format)
    if (!isDefaulted(args.state, '-1')) cc.warn('save: state is ignored (the current coordinates are written)')

    if (format === 'qsc') {
      const res = saveScene(ctx, { sceneId: cc.sceneId, viewId: cc.viewId, filePath })
      if (!res.ok) return { ok: false, error: `Error: cannot save the scene to ${filePath}` }
      cc.print(` Save: wrote "${filePath}".`)
      return { ok: true }
    }

    if (format === 'png') {
      return writePng(ctx, cc, { filename: filePath, width: '0', height: '0', dpi: '-1', ray: '0' })
    }
    const exporter = SCENE_EXPORTERS[format]
    if (exporter !== undefined) {
      const info = getSceneExportInfo(ctx, { sceneId: cc.sceneId, viewId: cc.viewId })
      if (!info.ok) return { ok: false, error: 'Error: no active view' }
      const res = exportScene(ctx, {
        sceneId: cc.sceneId,
        viewId: cc.viewId,
        filePath,
        exporterName: exporter,
        width: info.width,
        height: info.height,
      })
      if (!res.ok) return { ok: false, error: `Error: cannot write ${filePath}` }
      cc.print(` Save: wrote "${filePath}".`)
      return { ok: true }
    }

    const unsupported = UNSUPPORTED_FORMATS[format]
    if (unsupported !== undefined) return { ok: false, error: `Error: ${format}: ${unsupported}` }
    const writerName = MOL_WRITERS[format]
    if (writerName === undefined) {
      // PyMOL raises on an extension it does not know (exporting.py save).
      return {
        ok: false,
        error: `Error: Unrecognized file format${format ? ` "${format}"` : ''} (one of .pdb, .sdf, .mol, .pqr, .qsc, .png, .pov, .stl)`,
      }
    }

    const target = resolveMolSelection(ctx, cc.sceneId, args.selection, cc.warn)
    if (!target.ok) return target
    if (target.target.selStr !== '*') {
      // An empty file would look like a successful save.
      const hits = getSelHitCount(ctx, { sceneId: cc.sceneId, molId: target.target.obj.uid, selStr: target.target.selStr })
      if (hits.count === null) return { ok: false, error: 'Error: the selection did not compile' }
      if (hits.count === 0) return { ok: false, error: `Error: "${args.selection}" matched no atoms; nothing written` }
    }
    const res = writeMolecule(ctx, cc.sceneId, target.target.obj.uid, target.target.selStr, writerName, filePath)
    if (!res.ok) return res
    cc.print(` Save: wrote "${filePath}".`)
    return { ok: true }
  },
}

export const SAVE_COMMANDS: PymCommand[] = [save]
