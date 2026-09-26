/**
 * @file plugins/pymconsole/worker/commands/fileCommands.ts
 * @description Getting structures in and out: load, fetch, delete, set_name,
 * and the shell commands that decide what a relative path means.
 *
 * `load` and `fetch` build the options the File Open dialog would have
 * produced (`buildHeadlessFileOpenOptions`) and hand them to the same
 * services the dialog uses, so a file opened from the console is the same
 * object as one opened from the menu.
 */

import * as fs from 'fs'
import * as path from 'path'
import { getCompatibleRendererNames } from '@renderer/worker/server/services/file/getCompatibleRendererNames'
import { buildHeadlessFileOpenOptions } from '@renderer/worker/server/services/file/headlessOpen'
import { loadObject } from '@renderer/worker/server/services/file/loadObject'
import { streamLoadFromUrl } from '@renderer/worker/server/services/file/streamLoadFromUrl'
import { deleteNode, renameNode } from '@renderer/worker/server/services/sceneTree/sceneOps'
import { OBJREADER_CATEGORY } from '@renderer/worker/server/services/helpers/pickReaderName'
import { isHiddenObjReader } from '@renderer/worker/server/services/helpers/readerFilter'
import { pickCoordUrl } from '@renderer/worker/shared/pdbUrls'
import type { CoordServerType } from '@renderer/worker/shared/pdbUrls'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import type { PymCommand } from './types'
import {
  fileStem,
  isDefaulted,
  resolveObjects,
  resolveOneObject,
  resolvePath,
  resolveRenderers,
} from './helpers'

/** Arguments PyMOL's `load` takes that have no counterpart here. */
const LOAD_IGNORED: ReadonlyArray<[string, string]> = [
  ['state', '0'],
  ['discrete', '-1'],
  ['multiplex', ''],
  ['partial', '0'],
  ['mimic', '1'],
]

/**
 * PyMOL's format names, as the CueMol reader each one means.
 *
 * From `modules/pymol/constants.py`'s `loadable`; only the formats both
 * programs read are listed. A name CueMol already uses for a reader is not
 * listed, because `readerNames` accepts those directly -- `format=mmcifmap`
 * works without an entry here.
 *
 * PyMOL has no name for a structure-factor CIF: its `cif` covers both, and
 * its parser decides which it got. So the way to ask for one here is the
 * CueMol reader name, `mmcifmap`.
 */
const FORMAT_ALIASES: Readonly<Record<string, string>> = {
  cif: 'mmcif',
  ent: 'pdb',
  ccp4: 'ccp4map',
  map: 'ccp4map',
  mrc: 'ccp4map',
  xplor: 'xplormap',
  mol: 'sdf',
  top: 'amberprm',
}

/**
 * PyMOL's own default representation, as a CueMol renderer type.
 *
 * `auto_show_lines` is on by default there, so a molecule that has just been
 * loaded is drawn as lines.
 */
const PYMOL_DEFAULT_REP = 'simple'

/**
 * The renderer to give a freshly loaded object.
 *
 * Without one the shared default is `simple`, a molecule renderer, whatever
 * the object is -- and C++ `Object::createRenderer` does not check
 * compatibility (`isCompatibleObj` only builds the list the GUI offers), so a
 * density map came back carrying a SimpleRenderer and drawing nothing.
 *
 * A molecule keeps `simple`, matching PyMOL. Anything else takes the first
 * type the object itself reports, which is what the File Open dialog starts
 * from: `contour` for a map, `molsurf` for a surface.
 *
 * @param types - compatible types from `getCompatibleRendererNames`, already
 *   filtered to the ones worth creating at load time.
 * @returns null when the object reports none, leaving the shared default.
 */
function initialRendererType(types: readonly string[]): string | null {
  if (types.includes(PYMOL_DEFAULT_REP)) return PYMOL_DEFAULT_REP
  return types[0] ?? null
}

/** The names `load`'s `format` accepts, for completion and for errors. */
export function loadFormatNames(ctx: WorkerContext): string[] {
  const names = readerNames(ctx)
  const aliases = Object.keys(FORMAT_ALIASES).filter((a) => names.includes(FORMAT_ALIASES[a]))
  return [...new Set([...names, ...aliases])].sort()
}

/** The reader nicknames this build has, as `pickReaderName` sees them. */
function readerNames(ctx: WorkerContext): string[] {
  try {
    const info = JSON.parse(ctx.strMgr.getInfoJSON2()) as Array<{
      name: string
      category: number
    }>
    return info
      .filter((e) => e.category === OBJREADER_CATEGORY && !isHiddenObjReader(e.name))
      .map((e) => e.name)
  } catch {
    return []
  }
}

/**
 * The reader PyMOL's `format` argument asks for.
 *
 * Read fresh from the registry rather than checked against a hard-coded
 * list, so a reader added to C++ is accepted here without this file
 * changing, and the error can name what this build actually has.
 *
 * @returns null when no format was given, and the caller should sniff.
 */
function readerForFormat(
  ctx: WorkerContext,
  format: string,
): { ok: true; name: string | null } | { ok: false; error: string } {
  const want = format.trim().toLowerCase()
  if (want === '') return { ok: true, name: null }

  const names = readerNames(ctx)
  const direct = names.find((n) => n.toLowerCase() === want)
  if (direct) return { ok: true, name: direct }

  const alias = FORMAT_ALIASES[want]
  if (alias && names.includes(alias)) return { ok: true, name: alias }

  return {
    ok: false,
    error: `Error: unknown format "${format}" (one of ${loadFormatNames(ctx).join(', ')})`,
  }
}

const load: PymCommand = {
  name: 'load',
  params: [
    { name: 'filename' },
    { name: 'object', default: '' },
    { name: 'state', default: '0' },
    { name: 'format', default: '' },
    { name: 'finish', default: '1' },
    { name: 'discrete', default: '-1' },
    { name: 'multiplex', default: '' },
    { name: 'zoom', default: '-1' },
    { name: 'partial', default: '0' },
    { name: 'mimic', default: '1' },
  ],
  mode: 'strict',
  mutates: true,
  summary: 'Read a structure or map file into the scene.',
  completions: [
    null,
    null,
    null,
    { source: 'readers', description: 'format', suffix: ', ' },
  ],
  run(ctx, args, cc) {
    for (const [name, def] of LOAD_IGNORED) {
      if (!isDefaulted(args[name], def)) cc.warn(`load: ${name} is ignored (not supported)`)
    }
    const filePath = resolvePath(cc.cwd, args.filename)
    if (!fs.existsSync(filePath)) return { ok: false, error: `Error: no such file: ${filePath}` }

    // An explicit format skips the extension / content lookup, which is the
    // only way to read a file the sniff gets wrong -- a structure-factor CIF
    // being the one that bites, since it shares its extension with a
    // coordinate CIF.
    const asked = readerForFormat(ctx, args.format)
    if (!asked.ok) return asked

    const compat = getCompatibleRendererNames(ctx, {
      filePath,
      ...(asked.name === null ? {} : { readerName: asked.name }),
    })
    if (!compat.readerName) {
      return { ok: false, error: `Error: no reader handles ${path.basename(filePath)}` }
    }
    const objectName = args.object !== '' ? args.object : fileStem(filePath)
    const options = buildHeadlessFileOpenOptions(ctx, {
      readerName: compat.readerName,
      objectName,
      rendererType: initialRendererType(compat.types),
      selection: null,
    })
    const res = loadObject(ctx, {
      filePath,
      sceneId: cc.sceneId,
      options,
      contentFirst: false,
      readerName: compat.readerName,
    })
    const norm = normalizeServiceResult(res, `Error: could not load ${filePath}`)
    if (!norm.ok) return norm
    cc.print(` load: "${filePath}" loaded as "${objectName}".`)
    return { ok: true }
  },
}

/** PyMOL's `type` argument, as the server it means. */
function coordServer(type: string): CoordServerType | null {
  const t = type.trim().toLowerCase()
  if (t === '' || t === 'cif' || t === 'mmcif') return 'RCSB_CIF'
  if (t === 'pdb') return 'RCSB_PDB'
  return null
}

const fetch: PymCommand = {
  name: 'fetch',
  params: [
    { name: 'code' },
    { name: 'name', default: '' },
    { name: 'state', default: '0' },
    { name: 'finish', default: '1' },
    { name: 'discrete', default: '-1' },
    { name: 'multiplex', default: '-2' },
    { name: 'zoom', default: '-1' },
    { name: 'type', default: '' },
    { name: 'path', default: '' },
  ],
  mode: 'strict',
  mutates: true,
  summary: 'Download an entry from RCSB and load it.',
  async run(ctx, args, cc) {
    if (!isDefaulted(args.path, '')) cc.warn('fetch: path is ignored (not supported)')
    const server = coordServer(args.type)
    if (server === null) {
      return { ok: false, error: `Error: unsupported fetch type "${args.type}" (cif or pdb)` }
    }
    // PyMOL accepts several codes at once.
    const codes = args.code
      .split(/[\s,]+/)
      .map((c) => c.trim())
      .filter((c) => c !== '')
    if (codes.length === 0) return { ok: false, error: 'Error: no PDB code given' }
    if (codes.length > 1 && args.name !== '') {
      return { ok: false, error: 'Error: name cannot be given with more than one code' }
    }

    for (const code of codes) {
      if (!/^[0-9][0-9a-z]{3}$/i.test(code)) {
        if (/^[0-9][0-9a-z]{3}[a-z]$/i.test(code)) {
          return { ok: false, error: `Error: chain-specific codes are not supported: ${code}` }
        }
        return { ok: false, error: `Error: "${code}" is not a PDB id` }
      }
      const pdbId = code.toLowerCase()
      const spec = pickCoordUrl(pdbId, server)
      const objectName = args.name !== '' ? args.name : pdbId
      const options = buildHeadlessFileOpenOptions(ctx, {
        readerName: spec.readerName,
        objectName,
        rendererType: null,
        selection: null,
      })
      // Registered with the run, so Stop cancels the download rather than
      // waiting for it to finish.
      const reqId = cc.streamId(`fetch-${pdbId}`)
      cc.noteStream(reqId)
      const res = await streamLoadFromUrl(ctx, {
        reqId,
        url: spec.url,
        readerName: spec.readerName,
        objectName,
        sceneId: cc.sceneId,
        options,
      })
      const norm = normalizeServiceResult(res, `Error: could not fetch ${pdbId}`)
      if (!norm.ok) return norm
      cc.print(` fetch: "${objectName}" fetched.`)
    }
    return { ok: true }
  },
}

const deleteCmd: PymCommand = {
  name: 'delete',
  params: [{ name: 'name' }],
  mode: 'strict',
  mutates: true,
  summary: 'Remove objects or renderers from the scene. Wildcards and "all" are accepted.',
  completions: [{ source: 'deletable', description: 'name', suffix: ' ' }],
  run(ctx, args, cc) {
    const hits = resolveObjects(ctx, cc.sceneId, args.name)
    if (hits.length > 0) {
      for (const obj of hits) {
        const res = deleteNode(ctx, {
          sceneId: cc.sceneId,
          nodeId: obj.uid,
          nodeType: 'object',
        })
        if (!res.ok) return { ok: false, error: `Error: could not delete "${obj.name}"` }
        cc.print(` delete: "${obj.name}" deleted.`)
      }
      return { ok: true }
    }

    // Not an object: PyMOL's `isomesh msh, map` makes one, so `delete msh`
    // removes it there. Here it made a renderer, and the name is the only
    // handle the user was given, so that is what is looked up next. Objects
    // keep priority, so a renderer sharing an object's name is unreachable
    // this way -- which is the safer way round.
    const rends = resolveRenderers(ctx, cc.sceneId, args.name)
    if (rends.length === 0) {
      return { ok: false, error: `Error: nothing named "${args.name}" in the scene` }
    }
    for (const rend of rends) {
      const res = deleteNode(ctx, {
        sceneId: cc.sceneId,
        nodeId: rend.rendId,
        nodeType: 'renderer',
      })
      if (!res.ok) return { ok: false, error: `Error: could not delete "${rend.rendName}"` }
      cc.print(` delete: "${rend.objName}/${rend.rendName}" deleted.`)
    }
    return { ok: true }
  },
}

const setName: PymCommand = {
  name: 'set_name',
  params: [{ name: 'old_name' }, { name: 'new_name' }],
  mode: 'strict',
  mutates: true,
  summary: 'Rename an object.',
  completions: [
    { source: 'names', description: 'name', suffix: ', ' },
    { source: 'names', description: 'name', suffix: '' },
  ],
  run(ctx, args, cc) {
    const found = resolveOneObject(ctx, cc.sceneId, args.old_name)
    if (!found.ok) return found
    const res = renameNode(ctx, {
      sceneId: cc.sceneId,
      nodeId: found.obj.uid,
      nodeType: 'object',
      newName: args.new_name,
    })
    if (!res.ok) return { ok: false, error: `Error: could not rename "${args.old_name}"` }
    return { ok: true }
  },
}

const cd: PymCommand = {
  name: 'cd',
  params: [{ name: 'dir', default: '~' }],
  mode: 'strict',
  mutates: false,
  summary: 'Change the working directory relative paths are read from.',
  run(_ctx, args, cc) {
    const dir = resolvePath(cc.cwd, args.dir)
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return { ok: false, error: `Error: no such directory: ${dir}` }
    }
    cc.setCwd(dir)
    cc.print(` cd: now in ${dir}`)
    return { ok: true }
  },
}

const pwd: PymCommand = {
  name: 'pwd',
  params: [],
  mode: 'strict',
  mutates: false,
  summary: 'Print the working directory.',
  run(_ctx, _args, cc) {
    cc.print(cc.cwd)
    return { ok: true }
  },
}

const ls: PymCommand = {
  name: 'ls',
  params: [{ name: 'pattern', default: '' }],
  mode: 'strict',
  mutates: false,
  summary: 'List the working directory.',
  run(_ctx, args, cc) {
    const raw = args.pattern.trim()
    const target = resolvePath(cc.cwd, raw === '' ? '.' : raw)
    let names: string[] = []
    try {
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
        names = fs.readdirSync(target).sort()
      } else {
        // A pattern: match it against the entries of its directory.
        const dir = path.dirname(target)
        const glob = path.basename(target)
        const re = new RegExp(
          `^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
        )
        names = fs.readdirSync(dir).filter((n) => re.test(n)).sort()
      }
    } catch {
      names = []
    }
    if (names.length === 0) {
      cc.print(' ls: Nothing found.  Is that a valid path?')
      return { ok: true }
    }
    for (const n of names) cc.print(n)
    return { ok: true }
  },
}

/**
 * `run file.pml`: the same as `@file.pml`.
 *
 * PyMOL's `run` is for Python files and hands a `.pml` to `load`, which runs
 * it as a script (parsing.py run). Only that second half applies here.
 */
const run: PymCommand = {
  name: 'run',
  params: [{ name: 'filename' }, { name: 'namespace', default: 'global' }],
  mode: 'strict',
  mutates: false,
  summary: 'Run the commands in a .pml script (the same as @file).',
  run(_ctx, args, cc) {
    if (!/\.pml$/i.test(args.filename.trim())) {
      return {
        ok: false,
        error: 'Error: run takes a .pml script here; Python scripts are not available in this console',
      }
    }
    return cc.runScript(args.filename.trim())
  },
}

export const FILE_COMMANDS: PymCommand[] = [load, fetch, deleteCmd, setName, cd, pwd, ls, run]
