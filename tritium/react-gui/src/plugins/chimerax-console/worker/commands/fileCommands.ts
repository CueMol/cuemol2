/**
 * @file plugins/chimerax-console/worker/commands/fileCommands.ts
 * @description `open`, `close` and `delete`.
 *
 * `open` reads a file, a `.cxc` script, or a 4-character PDB id (fetched as
 * mmCIF from the RCSB, as ChimeraX does). A molecule opens with the
 * console's renderers, styled as ChimeraX's automatic styling would style
 * it (`autoStyle.ts`).
 * Anything else (a map) opens as File > Open would open it.
 *
 * `save` writes an image (`.png`), the scene (`.qsc`, CueMol's session) or
 * one molecule (`.pdb`). A ChimeraX session (`.cxs`) cannot be written.
 */

import * as fs from 'fs'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
// Read only: which renderers a file's reader can feed, to tell a molecule.
import { getCompatibleRendererNames } from '@renderer/worker/server/services/file/getCompatibleRendererNames'
import type { CmdContext, CmdOutcome } from '@plugins/console/worker/dialect-api'
import { resolvePath } from '@plugins/console/worker/dialect-api'
import { BoolArg, FileNameArg, IntArg, SpecArg, StringArg } from '../cli/argTypes'
import { chxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import { CARTOONS, emitContext, runOp, targetsOf } from '../display'
import { isMolecule, numberedObjects } from '../models'
import type { NumberedObject } from '../models'
import { emitFor, NONE } from '../spec/emit'
import { parseSpec, SpecError } from '../spec/parse'
import { isSelector, withSceneSelectors } from '../spec/selectors'
import { readCamera } from '../camera'
import { applyAutoStyle } from '../autoStyle'
import { warnIgnored } from './warn'

/** A PDB id, alone or as `pdb:1abc` (`likely_pdb_id`: 4 characters, a leading digit). */
const PDB_ID = /^(?:pdb:)?([0-9][A-Za-z0-9]{3})$/i

/** The ribbon renderer a molecule is opened with, by the load itself. */
const OPEN_CARTOON = { rendererType: 'ribbon', rendererName: CARTOONS[0].name, selection: CARTOONS[0].scope ?? 'protein' }

/** Style each newly opened molecule as ChimeraX would (`autoStyle.ts`), and say its number. */
async function adopt(ctx: WorkerContext, cc: CmdContext, before: Set<number>): Promise<CmdOutcome> {
  const added = numberedObjects(ctx, cc.sceneId).filter((o) => !before.has(o.uid))
  for (const obj of added) {
    cc.print(`Opened ${obj.name} as #${obj.model}`)
    if (!isMolecule(obj)) continue
    const styled = await applyAutoStyle(ctx, cc, obj)
    if (!styled.ok) return styled
  }
  return { ok: true }
}

const open = chxCommand({
  words: ['open'],
  args: [
    { name: 'names', type: FileNameArg, role: 'required' },
    { name: 'name', type: StringArg, role: 'keyword' },
    { name: 'format', type: StringArg, role: 'keyword', ignored: true },
    { name: 'fromDatabase', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: true,
  summary: 'Open a file, a .cxc script, or a PDB id (fetched from the RCSB).',
  completions: [{ source: 'files', description: 'file', files: 'openable' }],
  // A scene file replaces the scene: it cannot run inside the submission's transaction.
  outsideTxn: (args) => /\.qsc$/i.test(args.names ?? ''),
  async run(ctx, args, cc) {
    warnIgnored(cc, 'open', args, ['format', 'fromDatabase'])
    const name = args.names
    if (/\.cxc$/i.test(name)) return cc.runScript(name)
    const objectName = args.name === '' ? null : args.name
    const before = new Set(numberedObjects(ctx, cc.sceneId).map((o) => o.uid))
    const path = resolvePath(cc.cwd, name)
    const pdb = PDB_ID.exec(name)
    if (pdb && !fs.existsSync(path)) {
      const res = await runOp(ctx, cc, 'fetch_pdb', {
        pdbId: pdb[1], format: 'mmcif', ...OPEN_CARTOON, name: objectName, preset: null, centerView: true,
      })
      if (!res.ok) return res
      return adopt(ctx, cc, before)
    }
    if (/\.qsc$/i.test(path)) {
      return runOp(ctx, cc, 'load_file', {
        path, rendererType: null, selection: null, name: null, rendererName: null, preset: null, centerView: null, mapCenterPolicy: null,
      })
    }
    const molecule = getCompatibleRendererNames(ctx, { filePath: path }).types.includes('ribbon')
    const res = await runOp(ctx, cc, 'load_file', {
      path,
      ...(molecule ? OPEN_CARTOON : { rendererType: null, selection: null, rendererName: null }),
      name: objectName, preset: null, centerView: true, mapCenterPolicy: null,
    })
    if (!res.ok) return res
    return adopt(ctx, cc, before)
  },
})

/** The objects a model specification names (every object for none). */
function objectsOf(ctx: WorkerContext, sceneId: number, spec: string): { ok: true; objs: NumberedObject[] } | { ok: false; error: string } {
  const all = numberedObjects(ctx, sceneId)
  if (spec.trim() === '') return { ok: true, objs: all }
  try {
    const ec = emitContext(ctx, sceneId)
    const read = withSceneSelectors(ec.namedSelections, () => parseSpec(spec, isSelector))
    if (!read) return { ok: false, error: `Error: "${spec}" is not a model specification` }
    return { ok: true, objs: all.filter((o) => emitFor(read.node, o.model, ec) !== NONE) }
  } catch (e) {
    if (e instanceof SpecError) return { ok: false, error: `${spec}\n${' '.repeat(e.pos)}^ ${e.message}` }
    throw e
  }
}

const close = chxCommand({
  words: ['close'],
  args: [{ name: 'models', type: SpecArg, role: 'optional' }],
  mutates: true,
  summary: 'Close models (all of them when none are named).',
  async run(ctx, args, cc) {
    const found = objectsOf(ctx, cc.sceneId, args.models)
    if (!found.ok) return found
    for (const o of found.objs) {
      const res = await runOp(ctx, cc, 'delete_node', { nodeId: o.uid, nodeType: 'object' })
      if (!res.ok) return res
    }
    return { ok: true }
  },
})

const deleteAtoms = chxCommand({
  words: ['delete'],
  args: [
    { name: 'atoms', type: SpecArg, role: 'required' },
    { name: 'attachedHyds', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: true,
  summary: 'Delete atoms.',
  async run(ctx, args, cc) {
    warnIgnored(cc, 'delete', args, ['attachedHyds'])
    const found = targetsOf(ctx, cc.sceneId, args.atoms)
    if (!found.ok) return found
    for (const t of found.targets) {
      const res = await runOp(ctx, cc, 'delete_atoms', { objId: t.obj.uid, selection: t.sel })
      if (!res.ok) return res
    }
    return { ok: true }
  },
})

const SAVE_IGNORED = ['supersample', 'pixelSize', 'quality']
const SAVE_REFUSED = ['selectedOnly', 'displayedOnly', 'relModel', 'allCoordsets']

const save = chxCommand({
  words: ['save'],
  args: [
    { name: 'filename', type: FileNameArg, role: 'required' },
    { name: 'format', type: StringArg, role: 'keyword' },
    { name: 'models', type: SpecArg, role: 'keyword' },
    { name: 'width', type: IntArg, role: 'keyword' },
    { name: 'height', type: IntArg, role: 'keyword' },
    { name: 'transparentBackground', type: BoolArg, role: 'keyword' },
    ...SAVE_IGNORED.map((name) => ({ name, type: StringArg, role: 'keyword' as const, ignored: true })),
    ...SAVE_REFUSED.map((name) => ({ name, type: StringArg, role: 'keyword' as const })),
  ],
  mutates: false,
  summary: 'Save an image (.png), the scene (.qsc) or a model (.pdb).',
  completions: [{ source: 'files', description: 'file' }],
  // Saving the scene resets the undo stack: it cannot run inside the submission's transaction.
  outsideTxn: (args) => /\.qsc$/i.test(args.filename ?? '') || /^(qsc|session)$/i.test(args.format ?? ''),
  async run(ctx, args, cc) {
    warnIgnored(cc, 'save', args, SAVE_IGNORED)
    const refused = SAVE_REFUSED.find((k) => args[k] !== '')
    if (refused) return { ok: false, error: `Error: save: ${refused} is not supported` }
    const path = resolvePath(cc.cwd, args.filename)
    const ext = (args.format !== '' ? args.format : path.match(/\.([^./\\]+)$/)?.[1] ?? '').toLowerCase()
    if (ext === 'cxs' || ext === 'session') {
      return { ok: false, error: 'Error: save: a ChimeraX session (.cxs) cannot be written; save the scene as .qsc' }
    }
    if (ext === 'png') {
      const size = imageSize(ctx, cc, args.width, args.height)
      return runOp(ctx, cc, 'export_scene', {
        path, format: 'png', width: size.width, height: size.height,
        transparent: args.transparentBackground === '' ? null : args.transparentBackground === 'true', dpi: null,
      })
    }
    if (ext === 'qsc') return runOp(ctx, cc, 'save_scene', { path })
    if (ext === 'pdb') {
      const found = objectsOf(ctx, cc.sceneId, args.models)
      if (!found.ok) return found
      const mols = found.objs.filter(isMolecule)
      if (mols.length !== 1) return { ok: false, error: `Error: save: a .pdb file holds one model here; name it with models (${mols.length} given)` }
      return runOp(ctx, cc, 'save_object', { objId: mols[0].uid, fileName: path, selection: null, format: null, link: false })
    }
    return { ok: false, error: `Error: save: "${ext}" files are not supported (png, qsc, pdb)` }
  },
})

/**
 * The image size: the view's when neither is given, the other side in the
 * view's aspect ratio when one is (ChimeraX's rule).
 */
function imageSize(ctx: WorkerContext, cc: CmdContext, width: string, height: string): { width: number | null; height: number | null } {
  if (width !== '' && height !== '') return { width: Number(width), height: Number(height) }
  if (width === '' && height === '') return { width: null, height: null }
  const view = readCamera(ctx, cc.viewId)
  if (!view) return { width: width === '' ? null : Number(width), height: height === '' ? null : Number(height) }
  return width !== ''
    ? { width: Number(width), height: Math.round((Number(width) * view.height) / view.width) }
    : { width: Math.round((Number(height) * view.width) / view.height), height: Number(height) }
}

export const FILE_COMMANDS: Record<string, ChxCommand> = { open, close, delete: deleteAtoms, save }
