/**
 * @file worker/server/catalog/ops/propOps.ts
 * @description Reading and writing the properties of any node in the scene.
 *
 * One pair of ops over the generic property bridge -- the same path the
 * inspector panel edits through. It reaches the scene itself (background
 * colour, ambient occlusion, anti-aliasing, CMYK colour proofing), the view
 * (stereo, centre mark, mouse speeds), an object, and a renderer, so every setting a C++ class exposes is reachable without an
 * op per setting. The agent's tool list has a ceiling (see
 * plugins/agent/worker/tools/index.test.ts) that an op-per-setting design
 * would spend on the scene alone.
 *
 * A value is converted by the C++ type of the property it is written to (the
 * `.qif` type `getPropsJSON` reports), not by the op's own schema, which can
 * only say "text".
 */

import { getGenericProps } from '@renderer/worker/server/services/props/read'
import { setGenericProp } from '@renderer/worker/server/services/props/write'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type {
  GenericPropEntry,
  PropTargetType,
} from '@renderer/worker/shared/genericProps'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { defineOp } from '../op'
import type { OpContext, OpOutcome } from '../op'
import { enumOf, nodeId, optional, propName, propPath, propValue } from '../params'
import { resolvePropPath } from '../refs'
import { columns } from '../consoleFormat'

/**
 * The node kinds a caller may address.
 *
 * `renderer` covers a renderer group too: a group IS a renderer in C++ and
 * the bridge resolves both through the same lookup.
 */
const NODE_TYPES = ['scene', 'view', 'object', 'renderer'] as const

const nodeTypeParam = () =>
  enumOf(
    NODE_TYPES,
    'What kind of node to address. "scene" is the scene as a whole; "view" is the current ' +
      'view; "renderer" also covers a renderer group.',
  )

const nodeIdParam = () =>
  optional(
    nodeId(
      'Uid of the object or renderer, from get_scene_state. Null for the scene and the ' +
        'view, which have no id of their own.',
      'nodeType',
    ),
  )

/** The resolved target, or the reason the arguments did not name one. */
type NodeRef = { nodeId: number; nodeType: PropTargetType }

function nodeRefOf(
  nodeType: PropTargetType,
  id: number | null,
  oc: OpContext,
): NodeRef | string {
  // The scene and the view are the caller's; there is no id to supply, and
  // one that was invented would be ignored rather than rejected.
  if (nodeType === 'scene') return { nodeId: oc.sceneId, nodeType }
  if (nodeType === 'view') return { nodeId: oc.viewId, nodeType }
  if (id === null) {
    return `nodeId is required when nodeType is "${nodeType}".`
  }
  return { nodeId: id, nodeType }
}

/** Coerce a string into what the property's C++ type expects. */
export function coerceProp(entry: GenericPropEntry, raw: string): string | number | boolean | null {
  switch (entry.type) {
    case 'boolean': {
      const v = raw.trim().toLowerCase()
      if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true
      if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false
      return null
    }
    case 'integer': {
      const n = Number(raw)
      return Number.isInteger(n) ? n : null
    }
    case 'real': {
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    }
    default:
      // Strings, enums, and the object types that convert from a string
      // (a colour, a selection) are passed through for C++ to parse.
      return raw
  }
}

/**
 * Write one property, converted by its C++ type.
 *
 * Shared by `set_node_prop` and the console's `set`: both take the value as
 * text and must refuse the same things the same way.
 */
export function writeNodeProp(
  ctx: WorkerContext,
  oc: OpContext,
  ref: NodeRef,
  propName: string,
  raw: string,
): OpOutcome {
  const props = getGenericProps(ctx, { sceneId: oc.sceneId, ...ref })
  if (!props.ok) return { ok: false, error: 'No node with that id and type in this scene.' }
  const entry = props.entries.find((e: GenericPropEntry) => e.key === propName)
  if (!entry) {
    return {
      ok: false,
      error: `This ${ref.nodeType} has no property "${propName}". Call list_node_props for the list.`,
    }
  }
  if (entry.readonly) return { ok: false, error: `"${propName}" is read only.` }

  if (entry.enumdef && !entry.enumdef.includes(raw)) {
    return {
      ok: false,
      error: `"${raw}" is not allowed for "${propName}". Allowed: ${entry.enumdef.join(', ')}.`,
    }
  }
  const value = coerceProp(entry, raw)
  if (value === null) {
    return { ok: false, error: `"${raw}" is not a valid ${entry.type} for "${propName}".` }
  }

  const result = setGenericProp(ctx, {
    sceneId: oc.sceneId,
    ...ref,
    propName,
    op: 'set',
    valueType: entry.type,
    value,
    mode: 'commit',
  })
  return normalizeServiceResult(result, `"${propName}" could not be written.`)
}

export const getNodeProps = defineOp({
  name: 'list_node_props',
  description:
    'List the writable properties of one node with their current values and, for ' +
    'enumerated ones, the allowed values. The node may be a renderer, an object, the ' +
    'scene itself -- where the background colour, ambient occlusion, anti-aliasing and ' +
    'colour proofing live -- or the view (stereo, centre mark, mouse speeds). Read this ' +
    'before set_node_prop.',
  params: {
    nodeType: nodeTypeParam(),
    nodeId: nodeIdParam(),
  },
  mutates: false,
  expose: { tool: 'core', console: true },
  group: 'properties',
  aliases: [{ name: 'props', order: ['nodeId'], summary: 'List the properties of a node, or of view (the scene when none is given).' }],
  format(data) {
    const d = data as {
      type: string
      name: string
      properties: { key: string; type: string; value: unknown; readonly: boolean }[]
    }
    const show = (v: unknown): string => {
      const t = typeof v === 'string' ? v : JSON.stringify(v) ?? ''
      return t.length > 40 ? `${t.slice(0, 40)}...` : t
    }
    return [
      `${d.name} (${d.type})`,
      ...columns(
        d.properties.map((p) => [p.key, '=', show(p.value), p.readonly ? `${p.type}, read-only` : p.type]),
        '  ',
      ),
    ]
  },
  run(ctx, args, oc): OpOutcome {
    const ref = nodeRefOf(args.nodeType, args.nodeId, oc)
    if (typeof ref === 'string') return { ok: false, error: ref }

    const result = getGenericProps(ctx, { sceneId: oc.sceneId, ...ref })
    if (!result.ok) return { ok: false, error: 'No node with that id and type in this scene.' }
    return {
      ok: true,
      data: {
        type: result.typeLabel,
        name: result.displayName,
        // Container rows are the headers of nested objects: they carry no
        // value and cannot be written, so they are noise here.
        properties: result.entries
          .filter((e: GenericPropEntry) => !e.isContainer)
          .map((e: GenericPropEntry) => ({
            key: e.key,
            type: e.type,
            value: e.value,
            readonly: e.readonly,
            ...(e.enumdef ? { allowed: e.enumdef } : {}),
          })),
      },
    }
  },
})

export const setNodeProp = defineOp({
  name: 'set_node_prop',
  description:
    'Set one property of one node. On the scene this is how to change the background ' +
    'colour ("bgcolor"), turn ambient occlusion on and tune it ("aoEnabled", "aoRadius", ' +
    '"aoIntensity", "aoSteps"), choose anti-aliasing ("aa_method", "aaJitterLevel"), and ' +
    'switch on CMYK colour proofing ("use_colproof", "icc_filename"). On the view it sets ' +
    'stereo ("stereoMode", "stereoDist", "swapStereoEyes") and the centre mark ' +
    '("centerMark"). On a renderer it ' +
    'sets a width, a detail level, or a mode. Call list_node_props first: the property ' +
    'name, its type, and the allowed values all come from there.',
  params: {
    nodeType: nodeTypeParam(),
    nodeId: nodeIdParam(),
    prop: propName('Property name, exactly as list_node_props reported it.'),
    value: propValue(
      'New value, written as text; it is converted to the property type. A colour is a ' +
        'name such as "white" or a hex code such as "#204080".',
    ),
  },
  mutates: true,
  expose: { tool: 'core', console: true },
  group: 'properties',
  run(ctx, args, oc): OpOutcome {
    const ref = nodeRefOf(args.nodeType, args.nodeId, oc)
    if (typeof ref === 'string') return { ok: false, error: ref }
    return writeNodeProp(ctx, oc, ref, args.prop, args.value)
  },
})

export const setProp = defineOp({
  name: 'set_prop',
  description:
    'Set one property, named by its path: obj/rend.prop for a renderer, ' +
    'obj.prop for an object, view.prop for the view, and a bare name for the scene.',
  params: {
    path: propPath('The property, e.g. 1crn/cartoon1.width or bgcolor.'),
    value: propValue('New value as text; converted by the property type.'),
  },
  mutates: true,
  // The model addresses nodes by uid through set_node_prop; a path of names
  // is for a person at a prompt.
  expose: { tool: false, console: true },
  group: 'properties',
  aliases: [{ name: 'set', summary: 'Set a property: set 1crn/cartoon1.width, 2 / set bgcolor, white' }],
  // The service answers with every property of the node, which is what an
  // inspector redraws from; at a prompt a write that worked says nothing.
  format: () => [],
  run(ctx, args, oc): OpOutcome {
    const target = resolvePropPath(ctx, oc.sceneId, args.path, oc.viewId)
    if (!target.ok) return { ok: false, error: target.error }
    return writeNodeProp(ctx, oc, { nodeId: target.nodeId, nodeType: target.nodeType }, target.prop, args.value)
  },
})

export const getProp = defineOp({
  name: 'get_prop',
  description: 'Read one property, named by its path as set_prop takes it.',
  params: {
    path: propPath('The property, e.g. 1crn/cartoon1.width or bgcolor.'),
  },
  mutates: false,
  expose: { tool: false, console: true },
  group: 'properties',
  aliases: [{ name: 'get', summary: 'Print a property: get 1crn/cartoon1.width / get bgcolor' }],
  format(data) {
    const d = data as { prop: string; value: unknown }
    return [`${d.prop} = ${typeof d.value === 'string' ? d.value : JSON.stringify(d.value)}`]
  },
  run(ctx, args, oc): OpOutcome {
    const target = resolvePropPath(ctx, oc.sceneId, args.path, oc.viewId)
    if (!target.ok) return { ok: false, error: target.error }
    const props = getGenericProps(ctx, { sceneId: oc.sceneId, nodeId: target.nodeId, nodeType: target.nodeType })
    if (!props.ok) return { ok: false, error: 'No node with that id and type in this scene.' }
    const entry = props.entries.find((e: GenericPropEntry) => e.key === target.prop)
    if (!entry) return { ok: false, error: `This ${target.nodeType} has no property "${target.prop}".` }
    return { ok: true, data: { prop: args.path.trim(), value: entry.value } }
  },
})

export const PROP_OPS = [getNodeProps, setNodeProp, setProp, getProp]
