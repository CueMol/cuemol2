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
