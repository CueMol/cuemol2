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
import { OBJREADER_CATEGORY, pickReaderName } from '@renderer/worker/server/services/helpers/pickReaderName'
import { isHiddenObjReader } from '@renderer/worker/server/services/helpers/readerFilter'
import { pickCoordUrl, pickMapUrl } from '@renderer/worker/shared/pdbUrls'
import { streamLoadDensityMap } from '@renderer/worker/server/services/map/streamLoad'
import { deleteMolAtoms } from '@renderer/worker/server/services/molops/deleteMolAtoms'
import { getSelHitCount } from '@renderer/worker/server/services/select/getSelHitCount'
import type { CoordServerType } from '@renderer/worker/shared/pdbUrls'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import {
  matchNamedSelections,
  namedSelections,
  removeNamedSelection,
  renameNamedSelection,
} from './namedSelections'
import { repOfRendererType } from './repCommands'
import { applyRememberedToObject } from './repSettings'
import type { FileOpenOptions } from '@renderer/worker/shared/fileOpenTypes'
import {
  fileStem,
  isAllSelection,
  isDefaulted,
  molecules,
  OWNED,
  resolveObjects,
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
  ['object_props', ''],
  ['atom_props', ''],
]

/** fetch's arguments with no counterpart here, with PyMOL's defaults. */
const FETCH_IGNORED: ReadonlyArray<[string, string]> = [
  ['state', '0'],
  ['discrete', '-1'],
  ['multiplex', '-2'],
  ['file', ''],
]

/**
 * Name the renderer a load makes after the console representation it draws
 * (`pym:lines`), so `hide lines`, `as` and `color` right after a `fetch`
 * treat it as the console's own; and honour `zoom=0` (do not recentre).
 */
function consoleRendererOptions(options: FileOpenOptions, zoom: string): FileOpenOptions {
  const rep = repOfRendererType(options.renderer.rendererType)
  return {
    ...options,
    renderer: {
      ...options.renderer,
      ...(rep !== null ? { rendererName: `${OWNED}${rep}` } : {}),
      centerView: zoom.trim() !== '0',
    },
  }
}

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

/**
 * Whether a path names a scene file: CueMol's .qsc, or a PyMOL session
 * (.pse), which the C++ `psefile` scene reader opens.
 */
function isSceneFile(filePath: string): boolean {
  return /\.(qsc|pse)$/i.test(filePath.trim())
}

/** Whether a load argument is a URL rather than a path. */
function isUrl(filename: string): boolean {
  return /^https?:\/\//i.test(filename.trim())
}

/** Load a structure or map straight from a URL, as fetch does for an entry. */
async function loadUrl(ctx: WorkerContext, args: Record<string, string>, cc: CmdContext): Promise<CmdOutcome> {
  const url = args.filename.trim()
  let leaf: string
  try {
    leaf = path.basename(new URL(url).pathname)
  } catch {
    return { ok: false, error: `Error: not a URL: ${url}` }
  }
  if (isSceneFile(leaf) || /\.pml$/i.test(leaf)) {
    return { ok: false, error: `Error: download ${leaf} first; scenes and scripts load from a file` }
  }
  const asked = readerForFormat(ctx, args.format)
  if (!asked.ok) return asked
  let readerName = asked.name ?? ''
  if (readerName === '') {
    try {
      // By extension only: there is no file to sniff until it is downloaded.
      readerName = pickReaderName(ctx, leaf, false)
    } catch {
      readerName = ''
    }
  }
  if (readerName === '') {
    return { ok: false, error: `Error: no reader for ${leaf}; give format=<reader>` }
  }
  const objectName = args.object !== '' ? args.object : fileStem(leaf)
  const options = consoleRendererOptions(buildHeadlessFileOpenOptions(ctx, {
    readerName,
    objectName,
    rendererType: null,
    selection: null,
  }), args.zoom)
  const reqId = cc.streamId('load-url')
  cc.noteStream(reqId)
  const res = await streamLoadFromUrl(ctx, { reqId, url, readerName, objectName, sceneId: cc.sceneId, options })
  const norm = normalizeServiceResult(res, `Error: could not load ${url}`)
  if (!norm.ok) return norm
  applyRememberedToObject(ctx, cc.sceneId, objectName)
  cc.print(` load: "${url}" loaded as "${objectName}".`)
  return { ok: true }
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
    // PyMOL's order (importing.py load): quiet comes before multiplex.
    { name: 'quiet', default: '1' },
    { name: 'multiplex', default: '' },
    { name: 'zoom', default: '-1' },
    { name: 'partial', default: '0' },
    { name: 'mimic', default: '1' },
    { name: 'object_props', default: '' },
    { name: 'atom_props', default: '' },
  ],
  mode: 'strict',
  mutates: true,
  summary: 'Read a structure or map (a file or a URL), open a .qsc / .pse scene, or run a .pml.',
  // A scene file replaces or adds a scene, which later commands on the same
  // line would not expect, so it has to stand alone like `save x.qsc`.
  outsideTxn: (args) => isSceneFile(args.filename ?? ''),
  completions: [
    null,
    null,
    null,
    { source: 'readers', description: 'format', suffix: ', ' },
  ],
  async run(ctx, args, cc) {
    for (const [name, def] of LOAD_IGNORED) {
      if (!isDefaulted(args[name], def)) cc.warn(`load: ${name} is ignored (not supported)`)
    }
    if (isUrl(args.filename)) return loadUrl(ctx, args, cc)
    const filePath = resolvePath(cc.cwd, args.filename)
    if (!fs.existsSync(filePath)) return { ok: false, error: `Error: no such file: ${filePath}` }

    // PyMOL's load runs a .pml as a script (importing.py loadfunctions).
    if (/\.pml$/i.test(filePath)) return cc.runScript(filePath)

    // PyMOL loads a session (.pse) the same way; CueMol's is a .qsc. The
    // panel opens it as File > Open would: into the current scene when that
    // is new and empty, otherwise in a new tab.
    if (isSceneFile(filePath)) {
      cc.openScene(filePath)
      cc.print(` Load: opening scene "${filePath}".`)
      return { ok: true }
    }

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
    const options = consoleRendererOptions(buildHeadlessFileOpenOptions(ctx, {
      readerName: compat.readerName,
      objectName,
      rendererType: initialRendererType(compat.types),
      selection: null,
    }), args.zoom)
    const res = loadObject(ctx, {
      filePath,
      sceneId: cc.sceneId,
      options,
      contentFirst: false,
      readerName: compat.readerName,
    })
    const norm = normalizeServiceResult(res, `Error: could not load ${filePath}`)
    if (!norm.ok) return norm
    applyRememberedToObject(ctx, cc.sceneId, objectName)
    cc.print(` load: "${filePath}" loaded as "${objectName}".`)
    return { ok: true }
  },
}

/** PyMOL's `type` argument, as the server it means. */
/**
 * A fetch code as PyMOL reads it (importing.py `fetch`): four characters of
 * PDB id, then optionally a chain, which may follow a `.`, `_`, `-` or `:`
 * (`1abcA`, `1abc_A`).
 *
 * @returns null when the code is not a PDB id.
 */
export function parseFetchCode(code: string): { pdbId: string; chain: string } | null {
  const m = /^([0-9][0-9a-z]{3})(?:[._\-:]?([0-9a-z]+))?$/i.exec(code)
  if (!m) return null
  return { pdbId: m[1].toLowerCase(), chain: m[2] ?? '' }
}

/** What a fetch `type` asks for (importing.py fetch). */
type FetchKind =
  | { kind: 'coord'; server: CoordServerType }
  | { kind: 'assembly'; n: number }
  | { kind: 'map'; mapType: '2fofc' | 'fofc' }

export function fetchKind(type: string): FetchKind | null {
  const t = type.trim().toLowerCase()
  if (t === '' || t === 'cif' || t === 'mmcif') return { kind: 'coord', server: 'RCSB_CIF' }
  if (t === 'pdb') return { kind: 'coord', server: 'RCSB_PDB' }
  // pdb1, pdb2, ...: the biological assemblies RCSB serves as PDB files.
  const assembly = /^pdb([1-9][0-9]*)$/.exec(t)
  if (assembly) return { kind: 'assembly', n: Number(assembly[1]) }
  if (t === '2fofc' || t === 'fofc') return { kind: 'map', mapType: t }
  return null
}

/**
 * Leave only `chain` in the molecule just fetched, as PyMOL's one-chain
 * fetch does (it removes the rest, and fails when the chain is not there,
 * keeping what it loaded).
 */
function keepChain(ctx: WorkerContext, cc: CmdContext, objectName: string, chain: string): CmdOutcome {
  // The newest object of that name is the one just loaded.
  const mol = molecules(ctx, cc.sceneId, objectName).at(-1)
  if (!mol) return { ok: false, error: `Error: "${objectName}" is not a molecule` }
  const selStr = `chain ${chain}`
  const hits = getSelHitCount(ctx, { sceneId: cc.sceneId, molId: mol.uid, selStr })
  if (!hits.count) return { ok: false, error: `Error: no such chain: ${chain}` }
  const res = deleteMolAtoms(ctx, { sceneId: cc.sceneId, objId: mol.uid, selStr: `not (${selStr})` })
  if (!res.ok) return { ok: false, error: `Error: could not remove the other chains of "${objectName}"` }
  return { ok: true }
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
    // PyMOL's `async_`, spelled as its command line takes it. A fetch here
    // always finishes before the next command, which is what async=0 asks.
    { name: 'async', default: '0' },
    { name: 'path', default: '' },
    { name: 'file', default: '' },
    { name: 'quiet', default: '1' },
  ],
  mode: 'strict',
  mutates: true,
  summary: 'Download an entry from RCSB (coordinates, an assembly, or a density map) and load it.',
  async run(ctx, args, cc) {
    if (!isDefaulted(args.path, '')) cc.warn('fetch: path is ignored (not supported)')
    for (const [name, def] of FETCH_IGNORED) {
      if (!isDefaulted(args[name], def)) cc.warn(`fetch: ${name} is ignored (not supported)`)
    }
    const kind = fetchKind(args.type)
    if (kind === null) {
      return { ok: false, error: `Error: unsupported fetch type "${args.type}" (cif, pdb, pdb1.., 2fofc or fofc)` }
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
      const parsed = parseFetchCode(code)
      if (!parsed) return { ok: false, error: `Error: "${code}" is not a PDB id` }
      const { pdbId, chain } = parsed
      if (chain !== '' && kind.kind === 'map') {
        return { ok: false, error: `Error: a map cannot be fetched for one chain: ${code}` }
      }
      // Registered with the run, so Stop cancels the download rather than
      // waiting for it to finish.
      const reqId = cc.streamId(`fetch-${pdbId}`)
      cc.noteStream(reqId)

      if (kind.kind === 'map') {
        // The Get PDB dialog's path; PyMOL names the map object the same way.
        const spec = pickMapUrl(pdbId, 'RCSB_CIF', kind.mapType)
        const objectName = args.name !== '' ? args.name : `${pdbId}_${kind.mapType}`
        const res = await streamLoadDensityMap(ctx, {
          reqId,
          url: spec.url,
          readerName: spec.readerName,
          gzip: spec.gzip,
          mapType: kind.mapType,
          objectName,
          sceneId: cc.sceneId,
          viewId: cc.viewId,
        })
        const norm = normalizeServiceResult(res, `Error: could not fetch the ${kind.mapType} map of ${pdbId}`)
        if (!norm.ok) {
          // RCSB publishes map coefficients only for entries deposited with
          // structure factors; older ones (1crn, 4hhb) have none.
          if (/\b404\b/.test(norm.error)) {
            return { ok: false, error: `Error: RCSB has no ${kind.mapType} map for ${pdbId} (no structure factors were deposited)` }
          }
          return norm
        }
        cc.print(` fetch: "${objectName}" fetched.`)
        continue
      }

      const spec = kind.kind === 'coord'
        ? pickCoordUrl(pdbId, kind.server)
        : { url: `https://files.rcsb.org/download/${pdbId}.pdb${kind.n}`, readerName: 'pdb' }
      // PyMOL names a one-chain fetch after the code as typed (1abcA).
      const objectName = args.name !== '' ? args.name : chain !== '' ? code : pdbId
      const options = consoleRendererOptions(buildHeadlessFileOpenOptions(ctx, {
        readerName: spec.readerName,
        objectName,
        rendererType: null,
        selection: null,
      }), args.zoom)
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
      if (chain !== '') {
        const kept = keepChain(ctx, cc, objectName, chain)
        if (!kept.ok) return kept
      }
      applyRememberedToObject(ctx, cc.sceneId, objectName)
      cc.print(` fetch: "${objectName}" fetched.`)
    }
    return { ok: true }
  },
}

/** Forget the named selections `pattern` names; how many there were. */
function deleteSelections(ctx: WorkerContext, cc: CmdContext, pattern: string): number {
  const sels = matchNamedSelections(ctx, cc.sceneId, pattern)
  for (const sel of sels) {
    if (removeNamedSelection(ctx, cc.sceneId, sel)) cc.print(` delete: selection "${sel.name}" deleted.`)
  }
  return sels.length
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
      // PyMOL's `delete all` also forgets the named selections.
      if (isAllSelection(args.name)) deleteSelections(ctx, cc, args.name)
      return { ok: true }
    }

    // Not an object: PyMOL's `isomesh msh, map` makes one, so `delete msh`
    // removes it there. Here it made a renderer, and the name is the only
    // handle the user was given, so that is what is looked up next. Objects
    // keep priority, so a renderer sharing an object's name is unreachable
    // this way -- which is the safer way round.
    const rends = resolveRenderers(ctx, cc.sceneId, args.name)
    if (rends.length === 0) {
      // Then a named selection, which PyMOL's delete also takes.
      if (deleteSelections(ctx, cc, args.name) > 0) return { ok: true }
      // `delete all` on an empty scene is how scripts start; PyMOL says
      // nothing, so neither does this.
      if (isAllSelection(args.name)) return { ok: true }
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
  summary: 'Rename an object, a renderer (e.g. an isomesh), or a named selection.',
  completions: [
    { source: 'names', description: 'name', suffix: ', ' },
    { source: 'names', description: 'name', suffix: '' },
  ],
  run(ctx, args, cc) {
    const newName = args.new_name.trim()
    if (newName === '') return { ok: false, error: 'Error: no new name given' }
    // Looked up in delete's order: object, renderer, named selection.
    const objs = resolveObjects(ctx, cc.sceneId, args.old_name).filter((o) => o.name === args.old_name.trim())
    const rends = objs.length > 0 ? [] : resolveRenderers(ctx, cc.sceneId, args.old_name)
      .filter((r) => r.rendName === args.old_name.trim())
    if (objs.length > 1 || rends.length > 1) {
      return { ok: false, error: `Error: "${args.old_name}" names more than one thing` }
    }
    if (objs.length === 1 || rends.length === 1) {
      const res = renameNode(ctx, {
        sceneId: cc.sceneId,
        nodeId: objs.length === 1 ? objs[0].uid : rends[0].rendId,
        nodeType: objs.length === 1 ? 'object' : 'renderer',
        newName,
      })
      if (!res.ok) return { ok: false, error: `Error: could not rename "${args.old_name}"` }
      return { ok: true }
    }
    const sel = namedSelections(ctx, cc.sceneId).find((s) => s.name === args.old_name.trim())
    if (!sel) return { ok: false, error: `Error: nothing named "${args.old_name}" in the scene` }
    if (!renameNamedSelection(ctx, cc.sceneId, sel, newName)) {
      return { ok: false, error: `Error: could not rename "${args.old_name}"` }
    }
    return { ok: true }
  },
}

const cd: PymCommand = {
  name: 'cd',
  params: [{ name: 'dir', default: '~' }, { name: 'complain', default: '1' }, { name: 'quiet', default: '1' }],
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
