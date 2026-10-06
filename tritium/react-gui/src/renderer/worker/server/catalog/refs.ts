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
 * - `1crn.cartoon1` or `1crn/cartoon1` -- the renderer (or renderer group)
 *   of that name on that object;
 * - `cartoon1` -- a renderer of that name, when only one object has one.
 *
 * and a property from a path that ends in the property name:
 * `1crn.cartoon1.width`, `1crn/cartoon1.width`, `1crn.visible`, or a bare
 * `bgcolor` for the scene's own.
 *
 * Names are not unique in CueMol. A name that matches more than one node is
 * refused rather than guessed, with the uids to choose between.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { getSceneTree } from '@renderer/worker/server/services/sceneTree/sceneTree'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'

/** What kind of node a parameter wants. */
export type RefKind = 'object' | 'molecule' | 'renderer' | 'node'

/** A node as the console finds it. */
export interface SceneNodeEntry {
  id: number
  name: string
  type: 'object' | 'renderer' | 'rendGroup'
  /** For a renderer: the object it hangs from. */
  objName?: string
}

/** Every object, renderer and renderer group in the scene. */
export function sceneNodes(ctx: WorkerContext, sceneId: number): SceneNodeEntry[] {
  const tree = getSceneTree(ctx, { sceneId })
  if (!tree.ok || !tree.tree) return []
  const out: SceneNodeEntry[] = []
  for (const obj of tree.tree.children) {
    if (obj.type !== 'object') continue
    out.push({ id: obj.id, name: obj.name, type: 'object' })
    const walk = (nodes: SceneTreeNode[]): void => {
      for (const n of nodes) {
        if (n.type === 'renderer' || n.type === 'rendGroup') {
          out.push({ id: n.id, name: n.name, type: n.type, objName: obj.name })
        }
        if (n.children.length > 0) walk(n.children)
      }
    }
    walk(obj.children)
  }
  return out
}

/** How a node is written back: `obj` or `obj.rend`. */
export function nodePath(n: SceneNodeEntry): string {
  return n.type === 'object' ? n.name : `${n.objName ?? ''}.${n.name}`
}

/** The resolved node, or why the text does not name one. */
export type RefResult = { ok: true; node: SceneNodeEntry } | { ok: false; error: string }

function accepts(kind: RefKind, n: SceneNodeEntry): boolean {
  if (kind === 'object' || kind === 'molecule') return n.type === 'object'
  if (kind === 'renderer') return n.type !== 'object'
  return true
}

function one(text: string, hits: SceneNodeEntry[]): RefResult {
  if (hits.length === 1) return { ok: true, node: hits[0] }
  if (hits.length === 0) return { ok: false, error: `nothing named "${text}" in the scene` }
  const which = hits.map((h) => `#${h.id} (${nodePath(h)})`).join(', ')
  return { ok: false, error: `"${text}" names more than one node: ${which}; give the uid instead` }
}

/**
 * The node `text` names.
 *
 * @param kind - what the parameter accepts; an object name does not answer a
 *   renderer parameter, so `cartoon1` is looked up among renderers only.
 */
export function resolveRef(
  ctx: WorkerContext,
  sceneId: number,
  text: string,
  kind: RefKind,
): RefResult {
  const want = text.trim()
  const nodes = sceneNodes(ctx, sceneId)

  const uid = /^#?(\d+)$/.exec(want)
  if (uid) {
    const id = Number(uid[1])
    const hit = nodes.find((n) => n.id === id && accepts(kind, n))
    return hit ? { ok: true, node: hit } : { ok: false, error: `no ${kind === 'node' ? 'node' : kind} with uid ${id}` }
  }

  const slash = want.indexOf('/')
  if (slash >= 0) {
    const objName = want.slice(0, slash)
    const rendName = want.slice(slash + 1)
    return one(
      want,
      nodes.filter((n) => n.type !== 'object' && n.objName === objName && n.name === rendName && accepts(kind, n)),
    )
  }

  const objects = nodes.filter((n) => n.type === 'object' && n.name === want && accepts(kind, n))
  // An object is the likelier meaning of a bare name; a renderer is only
  // looked for when no object answers.
  if (objects.length > 0) return one(want, objects)
  const rends = nodes.filter((n) => n.type !== 'object' && n.name === want && accepts(kind, n))
  if (rends.length > 0) return one(want, rends)

  // `obj.rend`, split at whichever dot leaves an object name that exists (an
  // object name may itself contain a dot).
  for (let at = want.indexOf('.'); at > 0; at = want.indexOf('.', at + 1)) {
    const objName = want.slice(0, at)
    const rendName = want.slice(at + 1)
    const hits = nodes.filter(
      (n) => n.type !== 'object' && n.objName === objName && n.name === rendName && accepts(kind, n),
    )
    if (hits.length > 0) return one(want, hits)
  }
  return { ok: false, error: `nothing named "${want}" in the scene` }
}

/** Where a property lives, and its name there. */
export interface PropTarget {
  nodeType: 'scene' | 'object' | 'renderer'
  /** The node's uid; the scene's own uid for a scene property. */
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
 * The node is the longest prefix that names one: `obj` then, when the next
 * segment names a renderer of it and more follows, `obj.rend`. Whatever is
 * left is the property name, so a nested property (`coloring.col_C`) passes
 * through whole. A path whose first segment names no object is a property of
 * the scene.
 */
export function resolvePropPath(
  ctx: WorkerContext,
  sceneId: number,
  text: string,
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
    const objs = nodes.filter((n) => n.type === 'object' && n.name === objName)
    if (objs.length === 0) continue
    if (objs.length > 1) {
      const which = objs.map((o) => `#${o.id}`).join(', ')
      return { ok: false, error: `"${objName}" names more than one object: ${which}; give the uid instead` }
    }
    const rest = segs.slice(i)
    if (rest.length >= 2) {
      const rends = nodes.filter((n) => n.type !== 'object' && n.objName === objName && n.name === rest[0])
      if (rends.length === 1) return { ok: true, ...targetOf(rends[0]), prop: rest.slice(1).join('.') }
    }
    return { ok: true, ...targetOf(objs[0]), prop: rest.join('.') }
  }
  return { ok: true, nodeType: 'scene', nodeId: sceneId, prop: want }
}
