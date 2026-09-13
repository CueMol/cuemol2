/**
 * @file plugins/pymconsole/worker/commands/settingCommands.ts
 * @description `set`, `get`, `unset` and `bg_color`.
 *
 * PyMOL has one flat namespace of about a thousand settings; CueMol has typed
 * properties on the scene, an object, a renderer or the view. There is no
 * table that could map one onto the other, so the rule here is: a handful of
 * PyMOL names that have an exact CueMol counterpart are aliased, and anything
 * else is tried as a CueMol property name. That way `set` reaches every
 * property the inspector shows, and the PyMOL names people actually type for
 * the overlapping settings still work.
 *
 * The property's own type decides how the typed string is read, which is why
 * the entry is fetched before the write rather than guessed at.
 */

import { getGenericProps } from '@renderer/worker/server/services/props/read'
import { resetGenericProps, setGenericProp } from '@renderer/worker/server/services/props/write'
import type { GenericPropEntry, PropTargetType } from '@renderer/worker/shared/genericProps'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, PymCommand } from './types'
import { isDefaulted, resolveOneObject, toBoolean, toNumber } from './helpers'
import { toCueMolColor } from './pymolColors'

/** A PyMOL setting name that has an exact CueMol counterpart. */
interface SettingAlias {
  /** The CueMol property name. */
  prop: string
  /** Where the property lives, when it is not the default target. */
  nodeType?: PropTargetType
  /** True when PyMOL's flag is the negation of CueMol's. */
  invert?: boolean
}

/**
 * The names worth aliasing.
 *
 * Deliberately short. A longer table would be a second, silently incomplete
 * spelling of the property list, and a name missing from it is more confusing
 * than a name that was never claimed.
 */
const SETTING_ALIASES: Readonly<Record<string, SettingAlias>> = {
  bg_rgb: { prop: 'bgcolor' },
  orthoscopic: { prop: 'perspective', nodeType: 'view', invert: true },
}

/** Where a `set` / `get` / `unset` reads or writes. */
interface Target {
  nodeId: number
  nodeType: PropTargetType
}

function resolveTarget(
  ctx: WorkerContext,
  cc: CmdContext,
  objectName: string,
  alias: SettingAlias | undefined,
): { ok: true; target: Target } | { ok: false; error: string } {
  if (alias?.nodeType === 'view') {
    return { ok: true, target: { nodeId: cc.viewId, nodeType: 'view' } }
  }
  const name = objectName.trim()
  if (name === '') return { ok: true, target: { nodeId: cc.sceneId, nodeType: 'scene' } }
  const found = resolveOneObject(ctx, cc.sceneId, name)
  if (!found.ok) return found
  return { ok: true, target: { nodeId: found.obj.uid, nodeType: 'object' } }
}

/** The property entry `propName` refers to on `target`, if there is one. */
function findEntry(
  ctx: WorkerContext,
  cc: CmdContext,
  target: Target,
  propName: string,
): GenericPropEntry | null {
  const props = getGenericProps(ctx, {
    sceneId: cc.sceneId,
    nodeId: target.nodeId,
    nodeType: target.nodeType,
  })
  if (!props.ok) return null
  return props.entries.find((e) => e.key === propName) ?? null
}

/** Read the typed string the way the property's C++ type expects. */
function coerce(
  entry: GenericPropEntry,
  raw: string,
  invert: boolean,
): string | number | boolean | null {
  switch (entry.type) {
    case 'boolean': {
      const v = toBoolean(raw)
      if (v === null) return null
      return invert ? !v : v
    }
    case 'integer': {
      const n = toNumber(raw)
      return n !== null && Number.isInteger(n) ? n : null
    }
    case 'real':
      return toNumber(raw)
    default: {
      // Strings, enums, and the object types C++ parses from a string (a
      // colour, a selection) go through unchanged.
      if (entry.enumdef && !entry.enumdef.includes(raw)) return null
      return raw
    }
  }
}

const set: PymCommand = {
  name: 'set',
  params: [
    { name: 'name' },
    { name: 'value', default: '1' },
    { name: 'selection', default: '' },
    { name: 'state', default: '0' },
  ],
  // PyMOL's `set ambient=0.3` is a value, not a named argument.
  mode: 'legacy',
  mutates: true,
  summary: 'Set a property on the scene or an object.',
  run(ctx, args, cc) {
    if (!isDefaulted(args.state, '0')) cc.warn('set: state is ignored (not supported)')
    const alias = SETTING_ALIASES[args.name.trim()]
    const propName = alias?.prop ?? args.name.trim()
    const target = resolveTarget(ctx, cc, args.selection, alias)
    if (!target.ok) return target

    const entry = findEntry(ctx, cc, target.target, propName)
    if (!entry) return { ok: false, error: `Error: unknown setting: "${args.name}"` }
    if (entry.readonly) return { ok: false, error: `Error: "${args.name}" is read only` }

    const value = coerce(entry, args.value, alias?.invert ?? false)
    if (value === null) {
      const allowed = entry.enumdef ? ` (one of ${entry.enumdef.join(', ')})` : ''
      return { ok: false, error: `Error: "${args.value}" is not a valid ${entry.type}${allowed}` }
    }

    const res = setGenericProp(ctx, {
      sceneId: cc.sceneId,
      nodeId: target.target.nodeId,
      nodeType: target.target.nodeType,
      propName,
      op: 'set',
      valueType: entry.type,
      value,
      mode: 'commit',
    })
    if (!res.ok) return { ok: false, error: `Error: could not set "${args.name}"` }
    return { ok: true }
  },
}

const get: PymCommand = {
  name: 'get',
  params: [{ name: 'name' }, { name: 'selection', default: '' }, { name: 'state', default: '0' }],
  mode: 'strict',
  mutates: false,
  summary: 'Print a property of the scene or an object.',
  run(ctx, args, cc) {
    if (!isDefaulted(args.state, '0')) cc.warn('get: state is ignored (not supported)')
    const alias = SETTING_ALIASES[args.name.trim()]
    const propName = alias?.prop ?? args.name.trim()
    const target = resolveTarget(ctx, cc, args.selection, alias)
    if (!target.ok) return target

    const entry = findEntry(ctx, cc, target.target, propName)
    if (!entry) return { ok: false, error: `Error: unknown setting: "${args.name}"` }
    const shown = alias?.invert && typeof entry.value === 'boolean' ? !entry.value : entry.value
    cc.print(` get: ${args.name} = ${String(shown)}`)
    return { ok: true }
  },
}

const unset: PymCommand = {
  name: 'unset',
  params: [{ name: 'name' }, { name: 'selection', default: '' }, { name: 'state', default: '0' }],
  mode: 'strict',
  mutates: true,
  summary: 'Restore a property to its default.',
  run(ctx, args, cc) {
    if (!isDefaulted(args.state, '0')) cc.warn('unset: state is ignored (not supported)')
    const alias = SETTING_ALIASES[args.name.trim()]
    const propName = alias?.prop ?? args.name.trim()
    const target = resolveTarget(ctx, cc, args.selection, alias)
    if (!target.ok) return target

    const entry = findEntry(ctx, cc, target.target, propName)
    if (!entry) return { ok: false, error: `Error: unknown setting: "${args.name}"` }
    if (!entry.hasdefault) return { ok: false, error: `Error: "${args.name}" has no default` }

    const res = resetGenericProps(ctx, {
      sceneId: cc.sceneId,
      nodeId: target.target.nodeId,
      nodeType: target.target.nodeType,
      propNames: [propName],
    })
    if (!res.ok) return { ok: false, error: `Error: could not unset "${args.name}"` }
    return { ok: true }
  },
}

const bgColor: PymCommand = {
  name: 'bg_color',
  params: [{ name: 'color', default: 'black' }],
  mode: 'strict',
  mutates: true,
  summary: 'Set the background colour.',
  run(ctx, args, cc) {
    const color = toCueMolColor(args.color)
    if (color === null) return { ok: false, error: `Error: unknown color: "${args.color}"` }
    const res = setGenericProp(ctx, {
      sceneId: cc.sceneId,
      nodeId: cc.sceneId,
      nodeType: 'scene',
      propName: 'bgcolor',
      op: 'set',
      valueType: 'object<AbstractColor>',
      value: color,
      mode: 'commit',
    })
    if (!res.ok) return { ok: false, error: 'Error: could not set the background colour' }
    return { ok: true }
  },
}

export const SETTING_COMMANDS: PymCommand[] = [set, get, unset, bgColor]
