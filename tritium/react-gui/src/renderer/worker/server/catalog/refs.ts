/**
 * @file worker/server/catalog/refs.ts
 * @description Turning what a person types for a node, or for a property of
 * one, into what an op takes.
 *
 * An op addresses everything by uid, because that is what a model is given.
 * A person at a prompt types names, so a node is resolved from:
 *
 * - `#12` or `12` -- that uid, whatever it is;
 * - `1crn` -- the object of that name;
 * - `1crn/cartoon1` -- the renderer (or renderer group) of that name on that
 *   object. The separator is `/`, never `.`: an object is usually named
 *   after its file (`1ox1.pdb`), so a dot cannot tell the two apart;
 * - `cartoon1` -- a renderer of that name, when only one object has one.
 *
 * Where a name is shared, a path can be told apart by the node's type and,
 * failing that, its uid: `1crn/@*selection` (an unnamed selection renderer),
 * `1crn/cartoon1@cartoon`, `1crn@MolCoord`, `1crn/@*namelabel#45`. The type
 * is only read when no node has the whole text as its name. The uid picks
 * among the nodes the rest names, and is ignored when it is none of them, so
 * the path still finds its node in another session where uids differ.
 *
 * and a property from the node followed by `.` and the property name:
 * `1crn/cartoon1.width`, `1crn.visible`, or a bare `bgcolor` for the scene's
 * own.
 *
 * Names are not unique in CueMol. A name that matches more than one node is
 * refused rather than guessed, with the uids to choose between.
 *
 * A name may instead be a pattern, `*` and `?` being wildcards, to name every
 * node it matches (`resolveRefs`): `*` (every object), `1crn/*` (its
 * renderers), `cartoon*` after a `*` and a slash (every object's renderers of
 * that name). In a pattern an empty name before a type matches any name, so
 * a `*` followed by `/@cartoon` is every cartoon renderer. Only names are patterns;
 * the type after `@` is still matched exactly, since a type name may itself
 * hold a `*` (`*selection`). A text one node answers exactly is never read as
 * a pattern, so a node whose name holds a `*` stays reachable.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { Scene } from '@cuemol/core/src/wrappers/Scene'
import { getSceneTree } from '@renderer/worker/server/services/sceneTree/sceneTree'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'

/** What kind of node a parameter wants. */
export type RefKind = 'object' | 'renderer' | 'node'

/** A node as the console finds it. */
export interface SceneNodeEntry {
  id: number
  name: string
  type: 'object' | 'renderer' | 'rendGroup'
  /** The object's class or the renderer's type (`MolCoord`, `cartoon`, `*selection`). */
  typeName?: string
  /** For a renderer: the object it hangs from. */
  objName?: string
}

/** The renderers and renderer groups under one object node of the scene tree, depth first. */
export function rendererNodesOf(obj: SceneTreeNode): SceneTreeNode[] {
  const out: SceneTreeNode[] = []
  const walk = (nodes: SceneTreeNode[]): void => {
    for (const n of nodes) {
      if (n.type === 'renderer' || n.type === 'rendGroup') out.push(n)
      if (n.children.length > 0) walk(n.children)
    }
  }
  walk(obj.children)
  return out
}

/** The object nodes of the scene tree. */
export function objectNodes(ctx: WorkerContext, sceneId: number): SceneTreeNode[] {
  const tree = getSceneTree(ctx, { sceneId })
  if (!tree.ok || !tree.tree) return []
  return tree.tree.children.filter((c) => c.type === 'object')
}

/** Every object, renderer and renderer group in the scene. */
export function sceneNodes(ctx: WorkerContext, sceneId: number): SceneNodeEntry[] {
  return objectNodes(ctx, sceneId).flatMap((obj) => [
    { id: obj.id, name: obj.name, type: 'object' as const, typeName: obj.className },
    ...rendererNodesOf(obj).map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type as 'renderer' | 'rendGroup',
      typeName: n.className,
      objName: obj.name,
    })),
  ])
}

/** How a node is written back: `obj` or `obj/rend`. */
export function nodePath(n: SceneNodeEntry): string {
  return n.type === 'object' ? n.name : `${n.objName ?? ''}/${n.name}`
}

/** `nodePath` with the node's type: `obj@MolCoord`, `obj/@*selection`. */
function typedPath(n: SceneNodeEntry): string {
  return `${nodePath(n)}@${n.typeName ?? ''}`
}

/**
 * The path that finds node `id` again (module comment): its plain path when
 * no other node shares it, else with its type, else with its uid too.
 * Null only when there is no such node.
 */
export function recordedPath(nodes: SceneNodeEntry[], id: number): string | null {
  const node = nodes.find((n) => n.id === id)
  if (!node) return null
  const plain = nodePath(node)
  if (nodes.filter((n) => nodePath(n) === plain).length === 1) return plain
  if (!node.typeName) return `${plain}#${id}`
  const typed = typedPath(node)
  return nodes.filter((n) => typedPath(n) === typed).length === 1 ? typed : `${typed}#${id}`
}

/** The nodes `text` names by name, or by `name@type` when none has the whole text as its name. */
function named(text: string, candidates: SceneNodeEntry[]): SceneNodeEntry[] {
  const exact = candidates.filter((n) => n.name === text)
  const at = text.lastIndexOf('@')
  if (exact.length > 0 || at < 0) return exact
  const name = text.slice(0, at)
  const typeName = text.slice(at + 1)
  return candidates.filter((n) => n.name === name && n.typeName === typeName)
}

/** Split a trailing `#uid` off a path (`obj/rend#45`); a bare `#45` is a uid on its own. */
function uidHint(text: string): { rest: string; uid: number | null } {
  const m = /^(.+)#(\d+)$/.exec(text)
  return m ? { rest: m[1], uid: Number(m[2]) } : { rest: text, uid: null }
}

/** The one of `hits` the uid hint picks, or all of them when it picks none. */
function byHint(hits: SceneNodeEntry[], uid: number | null): SceneNodeEntry[] {
  const hit = uid === null ? undefined : hits.find((n) => n.id === uid)
  return hit ? [hit] : hits
}

/** The objects a path names (`1crn`, `1crn@MolCoord`, `1crn#42`). */
function objectsNamed(nodes: SceneNodeEntry[], text: string): SceneNodeEntry[] {
  const { rest, uid } = uidHint(text)
  return byHint(named(rest, nodes.filter((n) => n.type === 'object')), uid)
}

/** The resolved node, or why the text does not name one. */
export type RefResult = { ok: true; node: SceneNodeEntry } | { ok: false; error: string }

function accepts(kind: RefKind, n: SceneNodeEntry): boolean {
  if (kind === 'object') return n.type === 'object'
  if (kind === 'renderer') return n.type !== 'object'
  return true
}

function one(text: string, hits: SceneNodeEntry[]): RefResult {
  if (hits.length === 1) return { ok: true, node: hits[0] }
  if (hits.length === 0) return { ok: false, error: `nothing named "${text}" in the scene` }
  const which = hits.map((h) => `#${h.id} (${typedPath(h)})`).join(', ')
  return { ok: false, error: `"${text}" names more than one node: ${which}; give the uid instead` }
}

/**
 * Whether the object `objId` is of the `.qif` class `objClass` or derives from
 * it (an `AnimMol` is a `MolCoord`).
 *
 * The C++ side reports only the nearest scriptable class of an object
 * (`getClassName`), not its ancestry, so the derivation is answered by the
 * generated wrapper classes, which extend each other as the `.qif` classes do
 * (`ctx.svc.isInstanceOf`). An exact class-name match is accepted on its own.
 */
export function isObjectOfClass(ctx: WorkerContext, sceneId: number, objId: number, objClass: string): boolean {
  try {
    const scene = ctx.sceMgr.getScene(sceneId) as Scene | null
    const obj = scene?.getObject(objId) as { getClassName?: () => string } | null | undefined
    if (!obj) return false
    if (obj.getClassName?.() === objClass) return true
    return ctx.svc?.isInstanceOf?.(obj, objClass) ?? false
  } catch {
    return false
  }
}

/**
 * The node `text` names.
 *
 * @param kind - what the parameter accepts; an object name does not answer a
 *   renderer parameter, so `cartoon1` is looked up among renderers only.
 * @param objClass - for an object parameter, the `.qif` class the object must
 *   be or derive from (`Param.objClass`).
 */
export function resolveRef(
  ctx: WorkerContext,
  sceneId: number,
  text: string,
  kind: RefKind,
  objClass?: string,
): RefResult {
  const res = findRef(ctx, sceneId, text, kind)
  if (!res.ok || objClass === undefined || res.node.type !== 'object') return res
  if (isObjectOfClass(ctx, sceneId, res.node.id, objClass)) return res
  return { ok: false, error: `"${text.trim()}" is not a ${objClass} object` }
}

/** `resolveRef` before the class check. */
function findRef(ctx: WorkerContext, sceneId: number, text: string, kind: RefKind): RefResult {
  const want = text.trim()
  const nodes = sceneNodes(ctx, sceneId)

  const uid = /^#?(\d+)$/.exec(want)
  if (uid) {
    const id = Number(uid[1])
    const hit = nodes.find((n) => n.id === id && accepts(kind, n))
    return hit ? { ok: true, node: hit } : { ok: false, error: `no ${kind === 'node' ? 'node' : kind} with uid ${id}` }
  }

  const { rest, uid: hint } = uidHint(want)
  const slash = rest.indexOf('/')
  if (slash >= 0) {
    const objName = rest.slice(0, slash)
    const rendName = rest.slice(slash + 1)
    const rends = nodes.filter((n) => n.type !== 'object' && n.objName === objName && accepts(kind, n))
    return one(want, byHint(named(rendName, rends), hint))
  }

  const objects = objectsNamed(nodes, want).filter((n) => accepts(kind, n))
  // An object is the likelier meaning of a bare name; a renderer is only
  // looked for when no object answers.
  if (objects.length > 0) return one(want, objects)
  return one(want, byHint(named(rest, nodes.filter((n) => n.type !== 'object' && accepts(kind, n))), hint))
}

// --- Patterns ---

/** Turn a name pattern into a matcher. `*` and `?` are wildcards; everything else matches itself. */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
}

const WILDCARD = /[*?]/

/** One path segment split into its name and its `@type`, if it has one. */
function splitType(seg: string): { name: string; typeName?: string } {
  const at = seg.lastIndexOf('@')
  return at < 0 ? { name: seg } : { name: seg.slice(0, at), typeName: seg.slice(at + 1) }
}

/**
 * Whether a node path is a pattern: a wildcard in a name, not in a type
 * (`1crn/@*selection` is a plain path).
 */
export function isWildcardRef(text: string): boolean {
  const { rest } = uidHint(text.trim())
  return rest.split('/').some((seg) => WILDCARD.test(splitType(seg).name))
}

/** The candidates a `name@type` segment matches as a pattern. An empty name matches any. */
function globNamed(seg: string, candidates: SceneNodeEntry[]): SceneNodeEntry[] {
  const { name, typeName } = splitType(seg)
  const re = globToRegExp(name === '' && typeName !== undefined ? '*' : name)
  return candidates.filter((n) => re.test(n.name) && (typeName === undefined || n.typeName === typeName))
}

/** The nodes a pattern names, or why it cannot name any. */
export type RefsResult = { ok: true; nodes: SceneNodeEntry[] } | { ok: false; error: string }

/** The nodes a pattern matches among `nodes`, read as `findRef` reads a path. */
function matchPattern(nodes: SceneNodeEntry[], want: string, kind: RefKind): SceneNodeEntry[] {
  const slash = want.indexOf('/')
  if (slash >= 0) {
    const objRe = globToRegExp(want.slice(0, slash))
    const rends = nodes.filter((n) => n.type !== 'object' && objRe.test(n.objName ?? '') && accepts(kind, n))
    return globNamed(want.slice(slash + 1), rends)
  }
  const objects = globNamed(want, nodes.filter((n) => n.type === 'object' && accepts(kind, n)))
  if (objects.length > 0) return objects
  return globNamed(want, nodes.filter((n) => n.type !== 'object' && accepts(kind, n)))
}

/**
 * Every node a pattern (module comment) names, in scene order; none is not an
 * error. Nodes the parameter cannot take -- of the wrong kind, or an object
 * not of `objClass` -- are left out, so `*` means every one that applies.
 */
export function resolveRefs(
  ctx: WorkerContext,
  sceneId: number,
  text: string,
  kind: RefKind,
  objClass?: string,
): RefsResult {
  const want = text.trim()
  if (/#\d+$/.test(want)) return { ok: false, error: `"${want}": a pattern cannot carry a uid` }
  const hits = matchPattern(sceneNodes(ctx, sceneId), want, kind)
  if (objClass === undefined) return { ok: true, nodes: hits }
  return { ok: true, nodes: hits.filter((n) => n.type !== 'object' || isObjectOfClass(ctx, sceneId, n.id, objClass)) }
}

/** One node a property-path pattern names, and the path that reaches its property. */
export interface PropPathTarget {
  node: SceneNodeEntry
  /**
   * The node's recorded path and the property (`1crn/cartoon1.width`), which
   * is what an action log keeps; `#uid.prop` when that path would read back
   * to another node (a dotted object name whose prefix names an object).
   */
  path: string
  prop: string
}

/**
 * The property paths a pattern in the node part of `text` stands for, or
 * null when the node part is no pattern (`resolvePropPath` reads it then).
 *
 * The node part is read as `resolvePropPath` reads it: up to the first `.`
 * after a `/`, else a dotted prefix naming objects. A pattern can match a dot
 * (`*` against `1ox1.pdb`), so here the longest prefix that matches an object
 * is taken (`*.pdb.visible`). A wildcard in the property part keeps its own
 * meaning (`reset_prop 1crn.*`).
 */
export function expandPropPath(
  ctx: WorkerContext,
  sceneId: number,
  text: string,
): { ok: true; targets: PropPathTarget[] } | { ok: false; error: string } | null {
  const want = text.trim()
  const all = sceneNodes(ctx, sceneId)
  const pathOf = (node: SceneNodeEntry, prop: string): string => {
    const named = `${recordedPath(all, node.id)}.${prop}`
    const back = resolvePropPath(ctx, sceneId, named)
    return back.ok && back.nodeId === node.id ? named : `#${node.id}.${prop}`
  }
  const targets = (nodes: SceneNodeEntry[], prop: string) => ({
    ok: true as const,
    targets: nodes.map((node) => ({ node, path: pathOf(node, prop), prop })),
  })

  const slash = want.indexOf('/')
  if (slash >= 0) {
    const dot = want.indexOf('.', slash)
    const nodePart = want.slice(0, dot)
    if (dot < 0 || !isWildcardRef(nodePart) || resolveRef(ctx, sceneId, nodePart, 'node').ok) return null
    const res = resolveRefs(ctx, sceneId, nodePart, 'node')
    return res.ok ? targets(res.nodes, want.slice(dot + 1)) : res
  }
  if (want.startsWith('#')) return null

  const nodes = all
  const objects = nodes.filter((n) => n.type === 'object')
  const segs = want.split('.')
  // A prefix that names an object exactly is no pattern, as for a node.
  for (let i = 1; i < segs.length; i++) {
    if (objectsNamed(nodes, segs.slice(0, i).join('.')).length > 0) return null
  }
  let pattern = false
  for (let i = segs.length - 1; i >= 1; i--) {
    const prefix = segs.slice(0, i).join('.')
    if (!WILDCARD.test(splitType(prefix).name)) continue
    pattern = true
    const hits = globNamed(prefix, objects)
    if (hits.length > 0) return targets(hits, segs.slice(i).join('.'))
  }
  return pattern ? targets([], '') : null
}

/** The first segment of a property path that names the caller's view. */
export const VIEW_PREFIX = 'view'

/** Where a property lives, and its name there. */
export interface PropTarget {
  nodeType: 'scene' | 'object' | 'renderer' | 'view'
  /** The node's uid; the scene's own uid for a scene property, the view's for a view one. */
  nodeId: number
  /** The property name, possibly dotted for a nested one. */
  prop: string
}

/** The node part of a property path, read the way `resolvePropPath` reads it. */
function targetOf(node: SceneNodeEntry): Omit<PropTarget, 'prop'> {
  // A renderer group is a renderer to the property bridge.
  return { nodeType: node.type === 'object' ? 'object' : 'renderer', nodeId: node.id }
}

/**
 * Split a property path into the node and the property name.
 *
 * With a `/` (or a leading `#uid`) the node is everything up to the first
 * `.` after it: `obj/rend.prop`. Without one, the node is an object: the
 * shortest dot-separated prefix that names one (`1ox1.pdb.visible`), the rest
 * being the property. Either way the property may itself be dotted
 * (`coloring.col_C`). `view.prop` is a property of the caller's view (the
 * View > View property inspector), unless an object is named `view`. Any other
 * path whose prefix names no object is a property of the scene.
 */
export function resolvePropPath(
  ctx: WorkerContext,
  sceneId: number,
  text: string,
  viewId?: number,
): ({ ok: true } & PropTarget) | { ok: false; error: string } {
  const want = text.trim()
  if (want === '') return { ok: false, error: 'no property given' }

  // `obj/rend.prop` and `#uid.prop` name the node unambiguously up to the
  // first dot after it.
  const slash = want.indexOf('/')
  if (slash >= 0 || want.startsWith('#')) {
    const dot = want.indexOf('.', slash >= 0 ? slash : 0)
    if (dot < 0) return { ok: false, error: `"${want}" names a node but no property` }
    const ref = resolveRef(ctx, sceneId, want.slice(0, dot), 'node')
    if (!ref.ok) return ref
    return { ok: true, ...targetOf(ref.node), prop: want.slice(dot + 1) }
  }

  const nodes = sceneNodes(ctx, sceneId)
  const segs = want.split('.')
  for (let i = 1; i < segs.length; i++) {
    const objName = segs.slice(0, i).join('.')
    const objs = objectsNamed(nodes, objName)
    if (objs.length === 0) continue
    if (objs.length > 1) {
      const which = objs.map((o) => `#${o.id}`).join(', ')
      return { ok: false, error: `"${objName}" names more than one object: ${which}; give the uid instead` }
    }
    return { ok: true, ...targetOf(objs[0]), prop: segs.slice(i).join('.') }
  }
  if (segs[0] === VIEW_PREFIX && segs.length > 1 && viewId !== undefined) {
    return { ok: true, nodeType: 'view', nodeId: viewId, prop: segs.slice(1).join('.') }
  }
  return { ok: true, nodeType: 'scene', nodeId: sceneId, prop: want }
}
