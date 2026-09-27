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
import { translateSelection } from '../sel/translate'

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
  return base.replace(/\.[^.]+$/, '')
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
export interface MolSelection {
  obj: SceneObjectEntry
  /** CueMol expression; `*` for the whole molecule. */
  selStr: string
}

/**
 * The molecule and selection a PyMOL argument names, for a command that
 * works on one molecule at a time (`save`, `align`).
 *
 * Read in this order: an object name (the whole molecule); `<object> and
 * <selection>` (that part of it -- the only way to say "chain A of 1abc"
 * here, since a CueMol expression is evaluated against one molecule rather
 * than naming objects); `all` when the scene has exactly one molecule; any
 * other expression against the first molecule, with a warning when there is
 * more than one -- the rule `zoom` and the measurements follow.
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
  const text = raw.trim()

  const named = mols.find((m) => m.name === text)
  if (named) return { ok: true, target: { obj: named, selStr: '*' } }

  const scoped = /^(\S+)\s+and\s+(.+)$/i.exec(text)
  const scopedObj = scoped ? mols.find((m) => m.name === scoped[1]) : undefined
  if (scoped && scopedObj) {
    const translated = translateSelection(scoped[2])
    if (!translated.ok) return translated
    return { ok: true, target: { obj: scopedObj, selStr: translated.expr } }
  }

  if (isAllSelection(text)) {
    if (mols.length > 1) {
      return {
        ok: false,
        error: `Error: name one molecule (${mols.map((m) => m.name).join(', ')}); this works on one at a time`,
      }
    }
    return { ok: true, target: { obj: mols[0], selStr: '*' } }
  }

  const translated = translateSelection(text)
  if (!translated.ok) return translated
  if (mols.length > 1) {
    warn(`using "${mols[0].name}" only: write "<object> and <selection>" to pick another`)
  }
  return { ok: true, target: { obj: mols[0], selStr: translated.expr } }
}
