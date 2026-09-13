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
import { pickCoordUrl } from '@renderer/worker/shared/pdbUrls'
import type { CoordServerType } from '@renderer/worker/shared/pdbUrls'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import type { PymCommand } from './types'
import {
  fileStem,
  isDefaulted,
  resolveObjects,
  resolveOneObject,
  resolvePath,
} from './helpers'

/** Arguments PyMOL's `load` takes that have no counterpart here. */
const LOAD_IGNORED: ReadonlyArray<[string, string]> = [
  ['state', '0'],
  ['format', ''],
  ['discrete', '-1'],
  ['multiplex', ''],
  ['partial', '0'],
  ['mimic', '1'],
]

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
  run(ctx, args, cc) {
    for (const [name, def] of LOAD_IGNORED) {
      if (!isDefaulted(args[name], def)) cc.warn(`load: ${name} is ignored (not supported)`)
    }
    const filePath = resolvePath(cc.cwd, args.filename)
    if (!fs.existsSync(filePath)) return { ok: false, error: `Error: no such file: ${filePath}` }

    const compat = getCompatibleRendererNames(ctx, { filePath })
    if (!compat.readerName) {
      return { ok: false, error: `Error: no reader handles ${path.basename(filePath)}` }
    }
    const objectName = args.object !== '' ? args.object : fileStem(filePath)
    const options = buildHeadlessFileOpenOptions(ctx, {
      readerName: compat.readerName,
      objectName,
      rendererType: null,
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
      const res = await streamLoadFromUrl(ctx, {
        reqId: `pymconsole:${pdbId}:${Date.now()}`,
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
  summary: 'Remove objects from the scene. Wildcards and "all" are accepted.',
  completions: [{ source: 'names', description: 'name', suffix: ' ' }],
  run(ctx, args, cc) {
    const hits = resolveObjects(ctx, cc.sceneId, args.name)
    if (hits.length === 0) {
      return { ok: false, error: `Error: object "${args.name}" not found` }
    }
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

export const FILE_COMMANDS: PymCommand[] = [load, fetch, deleteCmd, setName, cd, pwd, ls]
