/**
 * @file plugins/pymconsole/worker/commands/helpers.ts
 * @description The lookups and conversions the commands share.
 *
 * Two things recur. PyMOL addresses everything by name and supports `*`
 * wildcards (`delete measure*`), while every worker service takes a uid, so
 * one place turns a pattern into the objects it matches. And PyMOL's
 * arguments arrive as strings, so one place turns them into numbers, flags,
 * and paths without each command inventing its own rules.
 */

import * as os from 'os'
import * as path from 'path'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { getSceneTree } from '@renderer/worker/server/services/sceneTree/sceneTree'
import { listSceneObjects } from '@renderer/worker/server/services/scene/listSceneObjects'
import type { SceneObjectEntry } from '@renderer/worker/server/services/scene/listSceneObjects'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import { selectionNames, translateSelection } from '../sel/translate'

/** PyMOL's name for every object at once. */
export const ALL = 'all'

/** Turn a PyMOL name pattern into a matcher. `*` and `?` are wildcards. */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
}

/**
 * The objects in the scene whose names match `pattern`.
 *
 * `all` (and `*`) mean every object, as in PyMOL. An exact name is matched
 * exactly, so an object whose name contains a `*` is still reachable.
 */
export function resolveObjects(
  ctx: WorkerContext,
  sceneId: number,
  pattern: string,
): SceneObjectEntry[] {
  const { objects } = listSceneObjects(ctx, { sceneId })
  const want = pattern.trim()
  if (want === ALL || want === '*' || want === '') return objects
  const exact = objects.filter((o) => o.name === want)
  if (exact.length > 0) return exact
  const re = globToRegExp(want)
  return objects.filter((o) => re.test(o.name))
}

/** The one object `pattern` names, or a reason it did not name exactly one. */
export function resolveOneObject(
  ctx: WorkerContext,
  sceneId: number,
  pattern: string,
): { ok: true; obj: SceneObjectEntry } | { ok: false; error: string } {
  const hits = resolveObjects(ctx, sceneId, pattern)
  if (hits.length === 0) return { ok: false, error: `Error: object "${pattern}" not found` }
  if (hits.length > 1) {
    const names = hits.map((o) => o.name).join(', ')
    return { ok: false, error: `Error: "${pattern}" matches more than one object: ${names}` }
  }
  return { ok: true, obj: hits[0] }
}

/**
 * The molecules `pattern` names, in scene order; every one by default.
 *
 * A selection only means anything against a molecule, and the class name is
 * the only thing `listSceneObjects` reports that separates one from a map or
 * a surface. `endsWith('Mol')` catches the subclasses; `MolCoord` itself is
 * spelled out because it does not end that way.
 */
export function molecules(
  ctx: WorkerContext,
  sceneId: number,
  pattern: string = ALL,
): SceneObjectEntry[] {
  return resolveObjects(ctx, sceneId, pattern).filter(
    (o) => o.className === 'MolCoord' || o.className.endsWith('Mol'),
  )
}

/** A renderer somewhere in the scene, with the object it hangs from. */
export interface SceneRendererEntry {
  rendId: number
  rendName: string
  objId: number
  objName: string
}

/**
 * Every renderer in the scene, including those inside renderer groups.
 *
 * PyMOL names things the console has to find again -- `isomesh msh, map`
 * makes an object there and a renderer here -- so a command that addresses
 * something by name has to be able to see renderers too.
 */
export function sceneRenderers(ctx: WorkerContext, sceneId: number): SceneRendererEntry[] {
  const tree = getSceneTree(ctx, { sceneId })
  if (!tree.ok || !tree.tree) return []
  const out: SceneRendererEntry[] = []
  for (const obj of tree.tree.children) {
    if (obj.type !== 'object') continue
    const walk = (nodes: SceneTreeNode[]): void => {
      for (const n of nodes) {
        if (n.type === 'renderer') {
          out.push({ rendId: n.id, rendName: n.name, objId: obj.id, objName: obj.name })
        }
        if (n.children.length > 0) walk(n.children)
      }
    }
    walk(obj.children)
  }
  return out
}

/** The renderers whose name matches `pattern`, exactly or by wildcard. */
export function resolveRenderers(
  ctx: WorkerContext,
  sceneId: number,
  pattern: string,
): SceneRendererEntry[] {
  const want = pattern.trim()
  if (want === '' || want === ALL || want === '*') return []
  const all = sceneRenderers(ctx, sceneId)
  const exact = all.filter((r) => r.rendName === want)
  if (exact.length > 0) return exact
  const re = globToRegExp(want)
  return all.filter((r) => re.test(r.rendName))
}

/** Expand a leading `~` and make a relative path absolute against `cwd`. */
export function resolvePath(cwd: string, filePath: string): string {
  const expanded = filePath.startsWith('~')
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath
  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded)
}

/** A file's name without its directory or final extension. */
export function fileStem(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath
  // `1crn.pdb.gz` is `1crn`, as in PyMOL: a compression suffix goes too.
  return base.replace(/\.(gz|bz2|xz|zip)$/i, '').replace(/\.[^.]+$/, '')
}

/** Parse a number argument, or null when it is not one. */
export function toNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/** Parse PyMOL's loose booleans (`1`/`0`, `on`/`off`, `yes`/`no`, `true`/`false`). */
export function toBoolean(raw: string): boolean | null {
  const v = raw.trim().toLowerCase()
  if (v === '1' || v === 'on' || v === 'yes' || v === 'true') return true
  if (v === '0' || v === 'off' || v === 'no' || v === 'false') return false
  return null
}

/**
 * Whether an argument was left at a default that means "not asked for".
 *
 * PyMOL's defaults are sentinels as often as values (`state=0`, `dpi=-1.0`,
 * `animate=-1`), and a command should only warn about an argument it cannot
 * honour when the user actually gave one.
 */
export function isDefaulted(raw: string | undefined, defaultValue: string): boolean {
  return raw === undefined || raw.trim() === defaultValue
}

/** Render a list of names the way PyMOL prints one. */
export function formatNameList(names: readonly string[]): string {
  return `[${names.map((n) => `'${n}'`).join(', ')}]`
}

/** PyMOL's spelling of "everything": `all`, `(all)`, `*`, or nothing at all. */
export function isAllSelection(raw: string): boolean {
  const t = raw.trim().replace(/^\((.*)\)$/, '$1').trim()
  return t === '' || t === ALL || t === '*'
}

/** A molecule and the CueMol expression to apply inside it. */
export type MolSelection = MoleculeSelection

/**
 * The molecule and selection a PyMOL argument names, for a command that
 * works on one molecule at a time (`save`, `align`).
 *
 * The molecule is the one the expression names (`1abc`, `1abc and chain A`,
 * see `moleculeSelections`); naming two is refused. `all` needs the scene to
 * have exactly one molecule. An expression that names none is evaluated
 * against the first molecule, with a warning when there is more than one --
 * the rule `zoom` and the measurements follow.
 *
 * @param warn - where the "first molecule only" warning goes.
 */
export function resolveMolSelection(
  ctx: WorkerContext,
  sceneId: number,
  raw: string,
  warn: (text: string) => void,
): { ok: true; target: MolSelection } | { ok: false; error: string } {
  const mols = molecules(ctx, sceneId)
  if (mols.length === 0) return { ok: false, error: 'Error: no molecule in the scene' }
  if (isAllSelection(raw) && mols.length > 1) {
    return {
      ok: false,
      error: `Error: name one molecule (${mols.map((m) => m.name).join(', ')}); this works on one at a time`,
    }
  }
  const res = moleculeSelections(ctx, sceneId, raw)
  if (!res.ok) return res
  if (res.named && res.items.length > 1) {
    const names = res.items.map((i) => i.obj.name).join(', ')
    return { ok: false, error: `Error: the selection names more than one molecule (${names}); this works on one at a time` }
  }
  if (!res.named && res.items.length > 1) {
    warn(`using "${res.items[0].obj.name}" only: name the object in the selection to pick another`)
  }
  return { ok: true, target: res.items[0] }
}

/** One molecule and the CueMol expression a PyMOL selection means inside it. */
export interface MoleculeSelection {
  obj: SceneObjectEntry
  /** CueMol expression; `*` for the whole molecule. */
  selStr: string
}

/**
 * A PyMOL selection, as one CueMol expression per molecule.
 *
 * PyMOL evaluates a selection over the whole scene, where an object name is
 * one of the terms (`1abc and chain A`). CueMol evaluates it against one
 * molecule at a time and reads a bare word as a named selection, so an
 * object name would be refused as an undefined reference. Here each object
 * name becomes `all` inside that molecule and `none` inside the others, and
 * when the expression names any objects only those molecules are returned.
 * Names that are not objects stay as they are: named selections.
 *
 * @returns the molecules to act on, in scene order, and whether the
 *   expression named any of them.
 */
export function moleculeSelections(
  ctx: WorkerContext,
  sceneId: number,
  raw: string,
): { ok: true; items: MoleculeSelection[]; named: boolean } | { ok: false; error: string } {
  const mols = molecules(ctx, sceneId)
  if (mols.length === 0) return { ok: false, error: 'Error: no molecule in the scene' }
  if (isAllSelection(raw)) return { ok: true, items: mols.map((obj) => ({ obj, selStr: '*' })), named: false }

  const molNames = new Set(mols.map((m) => m.name))
  const mentioned = new Set(selectionNames(raw).filter((n) => molNames.has(n)))
  const targets = mentioned.size > 0 ? mols.filter((m) => mentioned.has(m.name)) : mols
  const items: MoleculeSelection[] = []
  for (const obj of targets) {
    const translated = translateSelection(raw, (n) =>
      molNames.has(n) ? (n === obj.name ? 'all' : 'none') : undefined)
    if (!translated.ok) return translated
    items.push({ obj, selStr: translated.expr })
  }
  return { ok: true, items, named: mentioned.size > 0 }
}

/** Prefix marking a renderer this console owns. */
export const OWNED = 'pym:'

/** The renderers of one object, from the scene tree. */
export function renderersOf(ctx: WorkerContext, sceneId: number, objId: number): SceneTreeNode[] {
  const tree = getSceneTree(ctx, { sceneId })
  if (!tree.ok || !tree.tree) return []
  const obj = tree.tree.children.find((c) => c.id === objId && c.type === 'object')
  if (!obj) return []
  const out: SceneTreeNode[] = []
  const walk = (nodes: SceneTreeNode[]): void => {
    for (const n of nodes) {
      if (n.type === 'renderer') out.push(n)
      if (n.children.length > 0) walk(n.children)
    }
  }
  walk(obj.children)
  return out
}
