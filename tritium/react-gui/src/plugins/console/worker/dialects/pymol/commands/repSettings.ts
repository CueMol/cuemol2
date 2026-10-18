/**
 * @file plugins/console/worker/dialects/pymol/commands/repSettings.ts
 * @description PyMOL settings that belong to one representation, such as
 * `stick_radius` or `cartoon_transparency`.
 *
 * In PyMOL these are settings with a global value and optional per-object
 * values, read whenever a representation is drawn. In CueMol the same
 * quantity is a property of the renderer that draws that representation.
 * The console owns one renderer per object per representation (`pym:<rep>`,
 * see repCommands.ts), so a setting maps onto a property of those renderers:
 *
 *   set stick_radius, 0.3, obj  ->  bondw of obj's pym:sticks
 *   set stick_radius, 0.3       ->  bondw of every pym:sticks, and of the
 *                                   ones made later in this scene
 *
 * The second form is why a global value is remembered per scene: a PyMOL
 * script sets its settings first and shows the representations afterwards.
 * The remembered value lives only in this session; what reaches the file
 * is the renderer property it was written to.
 *
 * Only settings whose CueMol property means the same quantity in the same
 * unit are listed.
 */

import { getGenericProps } from '@renderer/worker/server/services/props/read'
import { resetGenericProps, setGenericProp } from '@renderer/worker/server/services/props/write'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome } from './types'
import { OWNED, molecules, renderersOf, toNumber } from './helpers'
import { parseRgb } from './colorCommands'
import { toCueMolColor } from './pymolColors'

/** A PyMOL setting carried by the console renderer of one representation. */
export interface RepSetting {
  /** The console representation (`pym:<rep>`) whose renderer carries it. */
  rep: string
  /** The renderer property. */
  prop: string
  /** Further properties written with the same value. */
  alsoProps?: readonly string[]
  /** How the typed value is read. */
  kind: 'real' | 'transparency' | 'positive' | 'color'
}

/**
 * The settings, by PyMOL name.
 *
 * PyMOL's transparency is CueMol's alpha the other way round. A PyMOL stick
 * has no ball (`stick_ball` is off): its joints are capped at the stick
 * radius, so `stick_radius` sets the ball radius too and the balls never
 * end up thinner than the sticks. `label_size`
 * is in points in both, except that a negative PyMOL size means angstroms,
 * which CueMol has no counterpart for, so only a positive size is taken.
 */
export const REP_SETTINGS: Readonly<Record<string, RepSetting>> = {
  stick_radius: { rep: 'sticks', prop: 'bondw', alsoProps: ['sphr'], kind: 'positive' },
  stick_transparency: { rep: 'sticks', prop: 'alpha', kind: 'transparency' },
  line_width: { rep: 'lines', prop: 'width', kind: 'positive' },
  sphere_transparency: { rep: 'spheres', prop: 'alpha', kind: 'transparency' },
  cartoon_transparency: { rep: 'cartoon', prop: 'alpha', kind: 'transparency' },
  transparency: { rep: 'surface', prop: 'alpha', kind: 'transparency' },
  solvent_radius: { rep: 'surface', prop: 'proberad', kind: 'positive' },
  label_size: { rep: 'labels', prop: 'font_size', kind: 'positive' },
  label_color: { rep: 'labels', prop: 'color', kind: 'color' },
}

/** Every property a setting writes. */
function propsOf(setting: RepSetting): string[] {
  return [setting.prop, ...(setting.alsoProps ?? [])]
}

/** A value ready for the renderer property. */
type PropValue = number | string

/** The global values set in each scene, by PyMOL name. */
const remembered = new Map<number, Map<string, PropValue>>()

/** Read the typed value as the property value, or null when it is not one. */
export function toPropValue(setting: RepSetting, raw: string): PropValue | null {
  if (setting.kind === 'color') return parseRgb(raw) ?? toCueMolColor(raw)
  const n = toNumber(raw)
  if (n === null) return null
  switch (setting.kind) {
    case 'transparency':
      return n >= 0 && n <= 1 ? 1 - n : null
    case 'positive':
      return n > 0 ? n : null
    default:
      return n
  }
}

/** Show a property value the way PyMOL states the setting. */
function fromPropValue(setting: RepSetting, value: unknown): string {
  if (setting.kind === 'transparency' && typeof value === 'number') {
    // 1 - 0.7 is 0.30000000000000004; the setting was typed with a few digits.
    return String(Number((1 - value).toFixed(6)))
  }
  return String(value)
}

/** The property's C++ type on a renderer, for the write. */
function propType(ctx: WorkerContext, sceneId: number, rendId: number, prop: string): string | null {
  const props = getGenericProps(ctx, { sceneId, nodeId: rendId, nodeType: 'renderer' })
  if (!props.ok) return null
  return props.entries.find((e) => e.key === prop)?.type ?? null
}

/** Write a value to one renderer. */
function writeProp(ctx: WorkerContext, sceneId: number, rendId: number, prop: string, value: PropValue): boolean {
  const type = propType(ctx, sceneId, rendId, prop)
  if (type === null) return false
  return setGenericProp(ctx, {
    sceneId,
    nodeId: rendId,
    nodeType: 'renderer',
    propName: prop,
    op: 'set',
    valueType: type,
    value,
    mode: 'commit',
  }).ok
}

/** The console renderers of `rep` on the named objects, or on all of them. */
function consoleRenderers(
  ctx: WorkerContext,
  cc: CmdContext,
  rep: string,
  objectName: string,
): { ok: true; rendIds: number[] } | { ok: false; error: string } {
  const name = objectName.trim()
  const objs = molecules(ctx, cc.sceneId, name)
  if (name !== '' && objs.length === 0) return { ok: false, error: `Error: no object named "${name}"` }
  const rendIds = objs.flatMap((o) =>
    renderersOf(ctx, cc.sceneId, o.uid)
      .filter((r) => r.name === `${OWNED}${rep}`)
      .map((r) => r.id),
  )
  return { ok: true, rendIds }
}

/**
 * `set` of a representation setting: every matching console renderer now,
 * and, without an object name, the ones made later in this scene too.
 */
export function setRepSetting(
  ctx: WorkerContext,
  cc: CmdContext,
  name: string,
  setting: RepSetting,
  raw: string,
  objectName: string,
): CmdOutcome {
  const value = toPropValue(setting, raw)
  if (value === null) return { ok: false, error: `Error: "${raw}" is not a valid value for ${name}` }
  const found = consoleRenderers(ctx, cc, setting.rep, objectName)
  if (!found.ok) return found
  for (const id of found.rendIds) {
    for (const prop of propsOf(setting)) {
      if (!writeProp(ctx, cc.sceneId, id, prop, value)) {
        return { ok: false, error: `Error: could not set "${name}"` }
      }
    }
  }
  if (objectName.trim() === '') {
    const values = remembered.get(cc.sceneId) ?? new Map<string, PropValue>()
    values.set(name, value)
    remembered.set(cc.sceneId, values)
  }
  return { ok: true }
}

/**
 * `get` of a representation setting: the global value when one was set,
 * otherwise what the first matching console renderer carries.
 */
export function getRepSetting(
  ctx: WorkerContext,
  cc: CmdContext,
  name: string,
  setting: RepSetting,
  objectName: string,
): CmdOutcome {
  const global = objectName.trim() === '' ? remembered.get(cc.sceneId)?.get(name) : undefined
  if (global !== undefined) {
    cc.print(` get: ${name} = ${fromPropValue(setting, global)}`)
    return { ok: true }
  }
  const found = consoleRenderers(ctx, cc, setting.rep, objectName)
  if (!found.ok) return found
  const first = found.rendIds[0]
  const props = first === undefined ? null : getGenericProps(ctx, { sceneId: cc.sceneId, nodeId: first, nodeType: 'renderer' })
  const entry = props?.ok ? props.entries.find((e) => e.key === setting.prop) : undefined
  if (!entry) return { ok: false, error: `Error: ${name}: no ${setting.rep} shown yet` }
  cc.print(` get: ${name} = ${fromPropValue(setting, entry.value)}`)
  return { ok: true }
}

/** `unset` of a representation setting: back to the renderer default. */
export function unsetRepSetting(
  ctx: WorkerContext,
  cc: CmdContext,
  name: string,
  setting: RepSetting,
  objectName: string,
): CmdOutcome {
  const found = consoleRenderers(ctx, cc, setting.rep, objectName)
  if (!found.ok) return found
  for (const id of found.rendIds) {
    const res = resetGenericProps(ctx, {
      sceneId: cc.sceneId,
      nodeId: id,
      nodeType: 'renderer',
      propNames: propsOf(setting),
    })
    if (!res.ok) return { ok: false, error: `Error: could not unset "${name}"` }
  }
  if (objectName.trim() === '') remembered.get(cc.sceneId)?.delete(name)
  return { ok: true }
}

/** Give a console renderer just made the global values set for its representation. */
export function applyRememberedSettings(ctx: WorkerContext, sceneId: number, rep: string, rendId: number): void {
  const values = remembered.get(sceneId)
  if (!values) return
  for (const [name, value] of values) {
    const setting = REP_SETTINGS[name]
    if (setting?.rep !== rep) continue
    for (const prop of propsOf(setting)) writeProp(ctx, sceneId, rendId, prop, value)
  }
}

/** Give the console renderers of a freshly loaded object the global values set. */
export function applyRememberedToObject(ctx: WorkerContext, sceneId: number, objectName: string): void {
  if (!remembered.get(sceneId)?.size) return
  for (const obj of molecules(ctx, sceneId, objectName)) {
    for (const r of renderersOf(ctx, sceneId, obj.uid)) {
      if (r.name.startsWith(OWNED)) applyRememberedSettings(ctx, sceneId, r.name.slice(OWNED.length), r.id)
    }
  }
}
