/**
 * @file plugins/console/worker/dialects/chimerax/commands/fileCommands.ts
 * @description `open`, `close` and `delete`.
 *
 * `open` reads a file, a `.cxc` script, or a 4-character PDB id (fetched as
 * mmCIF from the RCSB, as ChimeraX does). A molecule opens with the
 * console's renderers: the ribbon for its protein and nucleic acid, its
 * ligands as sticks -- a simple stand-in for ChimeraX's automatic styling.
 * Anything else (a map) opens as File > Open would open it.
 */

import * as fs from 'fs'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
// Read only: which renderers a file's reader can feed, to tell a molecule.
import { getCompatibleRendererNames } from '@renderer/worker/server/services/file/getCompatibleRendererNames'
import type { CmdContext, CmdOutcome } from '../../../runtime/types'
import { resolvePath } from '../../../runtime/paths'
import { FileNameArg, SpecArg, StringArg } from '../cli/argTypes'
import { chxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import { ATOM_STYLES, CARTOONS, ensureOwned, runOp, targetsOf, writeSel } from '../display'
import { isMolecule, numberedObjects } from '../models'
import type { NumberedObject } from '../models'
import { emitFor, NONE } from '../spec/emit'
import { parseSpec, SpecError } from '../spec/parse'
import { isSelector } from '../spec/selectors'
import { warnIgnored } from './warn'

/** A PDB id, alone or as `pdb:1abc` (`likely_pdb_id`: 4 characters, a leading digit). */
const PDB_ID = /^(?:pdb:)?([0-9][A-Za-z0-9]{3})$/i

/** The ribbon renderer a molecule is opened with, by the load itself. */
const OPEN_CARTOON = { rendererType: 'ribbon', rendererName: CARTOONS[0].name, selection: CARTOONS[0].scope ?? 'protein' }

/** Give a newly opened molecule the console's renderers, and say its number. */
async function adopt(ctx: WorkerContext, cc: CmdContext, before: Set<number>): Promise<CmdOutcome> {
  const added = numberedObjects(ctx, cc.sceneId).filter((o) => !before.has(o.uid))
  for (const obj of added) {
    cc.print(`Opened ${obj.name} as #${obj.model}`)
    if (!isMolecule(obj)) continue
    const owned = await ensureOwned(ctx, cc, obj)
    if (!owned.ok) return owned
    const cartoon = owned.ids.get(CARTOONS[0].name)
    if (cartoon !== undefined) {
      const styled = await runOp(ctx, cc, 'set_renderer_styles', { rendId: cartoon, styles: CARTOONS[0].styles })
      if (!styled.ok) return styled
    }
    for (const [name, sel] of [[CARTOONS[1].name, CARTOONS[1].scope ?? 'nucleic'], [ATOM_STYLES.stick.name, 'ligand']]) {
      const id = owned.ids.get(name)
      if (id === undefined) continue
      const w = await writeSel(ctx, cc, id, sel)
      if (!w.ok) return w
    }
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
    const read = parseSpec(spec, isSelector)
    if (!read) return { ok: false, error: `Error: "${spec}" is not a model specification` }
    return { ok: true, objs: all.filter((o) => emitFor(read.node, o.model) !== NONE) }
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

export const FILE_COMMANDS: Record<string, ChxCommand> = { open, close, delete: deleteAtoms }
