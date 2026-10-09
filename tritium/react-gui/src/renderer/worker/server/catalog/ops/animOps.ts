/**
 * @file worker/server/catalog/ops/animOps.ts
 * @description Editing the scene's animation (the Animation panel) as
 * commands: list the elements, add, remove and reorder them, set their
 * timing and properties, and the loop / start camera.
 *
 * Each runs the service the panel or the element inspector commits through,
 * so a command and the panel leave the same undo steps. An element is named
 * by its number in `list_anims` (from 1), `#uid`, or its name. Times are in
 * milliseconds, relative to the element it follows (`timeRefName`), as the
 * inspector shows them. `animate` plays it.
 */

import {
  addElement,
  moveElement,
  removeElement,
} from '@renderer/worker/server/services/anim/edit'
import { setAnimElementProp } from '@renderer/worker/server/services/anim/detail'
import { listTimeline } from '@renderer/worker/server/services/anim/timeline'
import { setLoop, setStartCam } from '@renderer/worker/server/services/anim/transport'
import type { AnimElementPropKey } from '@renderer/worker/server/services/anim/types'
import type { AnimAddType, AnimElement, AnimTimeline } from '@renderer/worker/shared/animTypes'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { parseBoolText, parseNumberText } from '../argValues'
import { checkPosition, findBySpec, numbered } from '@renderer/worker/shared/numbered'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { defineOp } from '../op'
import { boolean, enumOf, integer, optional, real, string } from '../params'

/** The element types `add_anim` takes, by the word typed. */
const ADD_TYPES: Readonly<Record<string, AnimAddType>> = {
  spin: 'SimpleSpin',
  camera: 'CamMotion',
  show: 'ShowAnim',
  hide: 'HideAnim',
  slidein: 'SlideInAnim',
  slideout: 'SlideOutAnim',
  mol: 'MolAnim',
  wait: 'NoopAnimObj',
}
const ADD_TYPE_NAMES = Object.keys(ADD_TYPES) as [string, ...string[]]

/** The properties `set_anim_prop` writes, by the kind of value each takes. */
const BOOL_PROPS = ['disabled', 'ignorerotate', 'ignorecenter', 'ignorezoom', 'ignoreslab', 'hide', 'fade'] as const
const NUMBER_PROPS = ['quadric', 'angle', 'tgtAlpha', 'direction', 'distance', 'startValue', 'endValue'] as const
const TEXT_PROPS = ['name', 'timeRefName', 'endcam', 'rend', 'mol'] as const
const SET_PROPS = [...TEXT_PROPS, ...BOOL_PROPS, ...NUMBER_PROPS, 'axis'] as const

/** What a failed edit says when the service gives no reason. */
const ANIM_FAILED = 'The animation could not be changed.'

const ELEMENT_DESC = 'The element: its number in list_anims (from 1), #uid, or its name.'

/** The element `spec` names, or why it names none. */
export function findElement(elements: readonly AnimElement[], spec: string): AnimElement | string {
  return findBySpec(elements, spec, { uid: (e) => e.uid, name: (e) => e.name, noun: 'animation element', listCmd: 'list_anims' })
}

function timeline(ctx: WorkerContext, sceneId: number): AnimTimeline {
  return listTimeline(ctx, { sceneId })
}

/** Resolve the element, or fail the op. */
function element(ctx: WorkerContext, sceneId: number, spec: string): AnimElement | { error: string } {
  const found = findElement(timeline(ctx, sceneId).elements, spec)
  return typeof found === 'string' ? { error: found } : found
}

/** `list_anims`'s lines: the manager, then one element per line. */
function timelineLines(t: AnimTimeline): string[] {
  const m = t.mgr
  const lines = [
    `length ${m.lengthMs} ms, ${m.playState}${m.loop ? ', loop' : ''}${m.startcam ? `, start camera ${m.startcam}` : ''}`,
  ]
  if (t.elements.length === 0) lines.push('no elements; add one with add_anim')
  t.elements.forEach((e, i) => {
    const after = e.timeRefName ? ` after ${e.timeRefName}` : ''
    const off = e.disabled ? '  (disabled)' : ''
    const bad = e.resolveError ? `  [${e.resolveError}]` : ''
    lines.push(`${i + 1}  ${e.name}  ${e.type}  #${e.uid}  ${e.absStartMs}-${e.absEndMs} ms (${e.startMs}-${e.endMs}${after})${off}${bad}`)
  })
  if (t.resolveError) lines.push(`Cannot play: ${t.resolveError}`)
  return lines
}

export const animList = defineOp({
  name: 'list_anims',
  description: 'List the scene\'s animation: its length and settings, then each element with its type and times.',
  params: {},
  mutates: false,
  expose: { tool: false, console: true, mcp: true },
  group: 'animation',
  format: (data) => timelineLines(data as AnimTimeline),
  run(ctx, _args, oc) {
    // Number the elements from 1, as the other anim_* ops take them.
    const t = timeline(ctx, oc.sceneId)
    return { ok: true, data: { ...t, elements: numbered(t.elements.map(({ index: _index, ...e }) => e)) } }
  },
})

export const animAdd = defineOp({
  name: 'add_anim',
  description:
    'Add an element to the animation: spin (rotate the view), camera (move to a camera), show / ' +
    'hide (a renderer), slidein / slideout, mol (morphing), wait (does nothing for a time). It ' +
    'follows the element before it; set what it acts on with set_anim_prop.',
  params: {
    type: enumOf(ADD_TYPE_NAMES, 'What kind of element.'),
    name: optional(string('Its name. Null picks one.')),
    before: optional(string(`Insert before this element. Null appends. ${ELEMENT_DESC}`)),
  },
  mutates: true,
  expose: { tool: false, console: true, mcp: true },
  group: 'animation',
  format(data) {
    const d = data as { uid: number; number: number; name: string }
    return [`added ${d.name} as ${d.number}  #${d.uid}`]
  },
  run(ctx, args, oc) {
    let insertIndex: number | undefined
    if (args.before !== null) {
      const at = element(ctx, oc.sceneId, args.before)
      if ('error' in at) return { ok: false, error: at.error }
      insertIndex = at.index
    }
    const added = addElement(ctx, { sceneId: oc.sceneId, type: ADD_TYPES[args.type], viewId: oc.viewId, insertIndex })
    if (!added.ok) return { ok: false, error: added.error }
    if (args.name !== null) {
      const named = setAnimElementProp(ctx, { sceneId: oc.sceneId, uid: added.uid, prop: 'name', value: args.name })
      if (!named.ok) return { ok: false, error: named.error }
    }
    const made = timeline(ctx, oc.sceneId).elements.find((e) => e.uid === added.uid)
    return { ok: true, data: { uid: added.uid, number: added.index + 1, name: made?.name ?? '' } }
  },
})

export const animRemove = defineOp({
  name: 'remove_anim',
  description: 'Remove an element from the animation.',
  params: { element: string(ELEMENT_DESC) },
  mutates: true,
  expose: { tool: false, console: true, mcp: true },
  group: 'animation',
  format: () => [],
  run(ctx, args, oc) {
    const e = element(ctx, oc.sceneId, args.element)
    if ('error' in e) return { ok: false, error: e.error }
    return normalizeServiceResult(removeElement(ctx, { sceneId: oc.sceneId, uid: e.uid }), ANIM_FAILED)
  },
})

export const animMove = defineOp({
  name: 'move_anim',
  description: 'Move an element to another place in the list (its number in list_anims, from 1).',
  params: {
    element: string(ELEMENT_DESC),
    to: integer('The number it should have.'),
  },
  mutates: true,
  expose: { tool: false, console: true, mcp: true },
  group: 'animation',
  format: () => [],
  run(ctx, args, oc) {
    const e = element(ctx, oc.sceneId, args.element)
    if ('error' in e) return { ok: false, error: e.error }
    const bad = checkPosition(args.to, timeline(ctx, oc.sceneId).elements.length, 'list_anims')
    if (bad) return { ok: false, error: bad }
    return normalizeServiceResult(moveElement(ctx, { sceneId: oc.sceneId, uid: e.uid, to: args.to - 1 }), ANIM_FAILED)
  },
})

export const animTime = defineOp({
  name: 'set_anim_time',
  description:
    'Set when an element runs, in milliseconds, relative to the end of the element it follows ' +
    '(or to the start of the animation when it follows none).',
  params: {
    element: string(ELEMENT_DESC),
    startMs: real('Start, in milliseconds.'),
    endMs: real('End, in milliseconds; after the start.'),
  },
  mutates: true,
  expose: { tool: false, console: true, mcp: true },
  group: 'animation',
  format: () => [],
  run(ctx, args, oc) {
    if (args.endMs < args.startMs) return { ok: false, error: 'The end must not be before the start.' }
    const e = element(ctx, oc.sceneId, args.element)
    if ('error' in e) return { ok: false, error: e.error }
    return normalizeServiceResult(setAnimElementProp(ctx, {
      sceneId: oc.sceneId,
      uid: e.uid,
      prop: 'timing',
      value: { startMs: args.startMs, endMs: args.endMs },
    }), ANIM_FAILED)
  },
})

/** A typed value as the property takes it, or why it is not one. */
function readPropValue(prop: (typeof SET_PROPS)[number], text: string): string | number | boolean | { x: number; y: number; z: number } | { error: string } {
  const t = text.trim()
  if ((BOOL_PROPS as readonly string[]).includes(prop)) {
    return parseBoolText(t) ?? { error: `${prop} takes true or false.` }
  }
  if ((NUMBER_PROPS as readonly string[]).includes(prop)) {
    return parseNumberText(t) ?? { error: `${prop} takes a number.` }
  }
  if (prop === 'axis') {
    const v = t.split(/\s+/).map(Number)
    if (v.length !== 3 || v.some((x) => !Number.isFinite(x))) return { error: 'axis takes three numbers separated by spaces: 0 1 0' }
    return { x: v[0], y: v[1], z: v[2] }
  }
  return t
}

export const animSet = defineOp({
  name: 'set_anim_prop',
  description:
    'Set one property of an element, as the inspector does: name, timeRefName (the element it ' +
    'follows; empty for none), disabled, quadric (easing); spin: angle, axis ("0 1 0"); camera: ' +
    'endcam and ignorerotate / ignorecenter / ignorezoom / ignoreslab; show / hide / slide: rend ' +
    '(the renderer), hide, fade, tgtAlpha, direction, distance; mol: mol, startValue, endValue.',
  params: {
    element: string(ELEMENT_DESC),
    prop: enumOf(SET_PROPS, 'The property.'),
    value: string('The new value, as text.'),
  },
  mutates: true,
  expose: { tool: false, console: true, mcp: true },
  group: 'animation',
  format: () => [],
  run(ctx, args, oc) {
    const e = element(ctx, oc.sceneId, args.element)
    if ('error' in e) return { ok: false, error: e.error }
    const value = readPropValue(args.prop, args.value)
    if (typeof value === 'object' && 'error' in value) return { ok: false, error: value.error }
    return normalizeServiceResult(setAnimElementProp(ctx, {
      sceneId: oc.sceneId,
      uid: e.uid,
      prop: args.prop as AnimElementPropKey,
      value,
    }), ANIM_FAILED)
  },
})

export const animOptions = defineOp({
  name: 'set_anim_options',
  description: 'Set whether the animation loops, and the camera it starts from (empty for none).',
  params: {
    loop: optional(boolean('Play it in a loop. Null leaves it.')),
    startCamera: optional(string('The camera it starts from; empty for none. Null leaves it.')),
  },
  mutates: true,
  expose: { tool: false, console: true, mcp: true },
  group: 'animation',
  format: () => [],
  run(ctx, args, oc) {
    if (args.loop !== null) {
      const r = setLoop(ctx, { sceneId: oc.sceneId, loop: args.loop })
      if (!r.ok) return { ok: false, error: r.error }
    }
    if (args.startCamera !== null) {
      const r = setStartCam(ctx, { sceneId: oc.sceneId, startcam: args.startCamera })
      if (!r.ok) return { ok: false, error: r.error }
    }
    return { ok: true }
  },
})

export const ANIM_OPS = [animList, animAdd, animRemove, animMove, animTime, animSet, animOptions]
