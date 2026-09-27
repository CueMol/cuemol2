/**
 * @file plugins/pymconsole/worker/commands/colorCommands.ts
 * @description `set_color` and `spectrum`.
 *
 * `set_color` defines a named colour in a scene-local style set called `pym`,
 * made the first time it is needed. `ColCompiler` resolves a bare name it
 * does not know as a named colour, so `color <name>, sel` finds it without
 * anything else changing.
 *
 * `spectrum` maps onto the two gradient colourings CueMol has, which colour a
 * whole renderer: `BfacColoring` (B-factor or occupancy between two colours)
 * and `RainbowColoring` (a hue sweep along the residue numbers). PyMOL
 * colours only the selected atoms and has many multi-stop palettes; what
 * does not map is refused by name rather than approximated with something
 * that would look different.
 */

import { createStyleSet } from '@renderer/worker/server/services/style/styleOps'
import { setStyleSetColor } from '@renderer/worker/server/services/style/styleSetEdit'
import {
  setColoringProp,
  setRendererColoring,
} from '@renderer/worker/server/services/coloring/applyColoring'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { isAllSelection, isDefaulted, molecules, toNumber } from './helpers'
import { PYMOL_COLORS, toCueMolColor } from './pymolColors'
import { OWNED, renderersOf } from './repCommands'

/** The scene-local style set `set_color` writes into. */
const PYM_STYLE_SET = 'pym'

/** Two-digit hex of a 0..1 channel. */
function hex2(v: number): string {
  return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')
}

/**
 * The colour a `set_color` value names, as `#rrggbb`.
 *
 * PyMOL takes `[r, g, b]`, and reads the three as 0..255 when any of them is
 * above 1 (viewing.py set_color). `#rrggbb` and `0xrrggbb` are accepted too.
 *
 * @returns null when the value is none of those.
 */
export function parseRgb(raw: string): string | null {
  const text = raw.trim()
  const hex = /^(?:#|0x)([0-9a-f]{6})$/i.exec(text)
  if (hex) return `#${hex[1].toLowerCase()}`
  const list = /^\[?\s*([^,\]]+),([^,\]]+),([^,\]]+)\]?$/.exec(text)
  if (!list) return null
  const rgb = [list[1], list[2], list[3]].map((v) => toNumber(v.trim()))
  if (rgb.some((v) => v === null || v < 0)) return null
  const values = rgb as number[]
  const scale = values.some((v) => v > 1) ? 255 : 1
  return `#${values.map((v) => hex2(v / scale)).join('')}`
}

/** The uid of the scene's `pym` style set, made if it does not exist yet. */
function pymStyleSet(ctx: WorkerContext, sceneId: number): number | null {
  const existing = ctx.styleMgr.hasStyleSet(PYM_STYLE_SET, sceneId)
  if (existing > 0) return existing
  const made = createStyleSet(ctx, { sceneId, name: PYM_STYLE_SET })
  return made.ok ? made.newId : null
}

const setColor: PymCommand = {
  name: 'set_color',
  params: [{ name: 'name' }, { name: 'rgb' }, { name: 'mode', default: '0' }],
  mode: 'strict',
  mutates: true,
  summary: 'Define a named colour, e.g. set_color mycol, [1.0, 0.5, 0.0].',
  run(ctx, args, cc) {
    const name = args.name.trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return { ok: false, error: `Error: "${name}" is not a usable colour name (letters, digits and _ only)` }
    }
    const colour = parseRgb(args.rgb)
    if (colour === null) {
      return { ok: false, error: 'Error: give the colour as [r, g, b] (0-1 or 0-255) or #rrggbb' }
    }
    if (!isDefaulted(args.mode, '0')) cc.warn('set_color: mode is ignored')
    // The console reads PyMOL's own names from its table first, so a
    // redefinition would be stored but never used.
    if (PYMOL_COLORS[name.toLowerCase()] !== undefined) {
      cc.warn(`"${name}" is a built-in PyMOL colour; color keeps using the built-in value`)
    }

    const styleSetId = pymStyleSet(ctx, cc.sceneId)
    if (styleSetId === null) return { ok: false, error: 'Error: cannot create the "pym" style set' }
    const res = setStyleSetColor(ctx, {
      sceneId: cc.sceneId,
      styleSetId,
      scopeId: cc.sceneId,
      name,
      colorStr: colour,
    })
    if (!res.ok) return { ok: false, error: `Error: cannot define colour "${name}"` }
    cc.print(` Color: "${name}" defined as ${colour}.`)
    return { ok: true }
  },
}

/** How a `spectrum` request is carried out on one renderer. */
type SpectrumPlan =
  | { kind: 'bfac'; mode: 'bfac' | 'occ'; low: string; high: string }
  | { kind: 'rainbow'; startHue: number; endHue: number }

/**
 * What `spectrum <expression>, <palette>` becomes here, or why it cannot.
 *
 * - `b` / `q` with a two-colour palette (`blue_red`, `green_white`, ...):
 *   `BfacColoring`, low to high.
 * - `count` / `resi` with `rainbow` / `rainbow_rev`: `RainbowColoring` over
 *   residue numbers (PyMOL's `count` steps per atom; here it is per residue,
 *   as with `byres=1`).
 *
 * Everything else is refused: CueMol's gradients have two colours, or a hue
 * range, and a three-colour palette or a rainbow over B-factors would come
 * out as something else.
 */
export function planSpectrum(expression: string, palette: string): SpectrumPlan | { error: string } {
  const expr = expression.trim().toLowerCase()
  const pal = palette.trim().toLowerCase()

  if (expr === 'b' || expr === 'q') {
    const parts = pal.split('_')
    const low = parts.length === 2 ? toCueMolColor(parts[0]) : null
    const high = parts.length === 2 ? toCueMolColor(parts[1]) : null
    if (low === null || high === null || parts.some((p) => PYMOL_COLORS[p] === undefined)) {
      return {
        error:
          `Error: spectrum ${expr}: palette "${palette}" cannot be drawn here; ` +
          'use a two-colour palette such as blue_red',
      }
    }
    return { kind: 'bfac', mode: expr === 'b' ? 'bfac' : 'occ', low, high }
  }
  if (expr === 'count' || expr === 'resi') {
    if (pal === 'rainbow') return { kind: 'rainbow', startHue: 240, endHue: 0 }
    if (pal === 'rainbow_rev') return { kind: 'rainbow', startHue: 0, endHue: 240 }
    return {
      error: `Error: spectrum ${expr}: palette "${palette}" cannot be drawn here; use rainbow or rainbow_rev`,
    }
  }
  if (expr === 'pc') return { error: 'Error: spectrum pc: CueMol keeps no partial charges' }
  return { error: `Error: unknown spectrum expression "${expression}" (one of b, q, count, resi)` }
}

/** Put `plan` on one renderer. */
function applySpectrum(
  ctx: WorkerContext,
  sceneId: number,
  rendId: number,
  plan: SpectrumPlan,
  range: { min: number | null; max: number | null },
): boolean {
  const coloringId = plan.kind === 'bfac' ? 'paint-type-bfac' : 'paint-type-rainbow'
  if (!setRendererColoring(ctx, { sceneId, rendId, coloringId, targetKind: 'renderer' }).ok) return false
  const set = (propName: string, propValue: string | number): boolean =>
    setColoringProp(ctx, { sceneId, rendId, targetKind: 'renderer', propName, propValue }).ok

  if (plan.kind === 'rainbow') {
    return set('incr_mode', 'resid') && set('start_hue', plan.startHue) && set('end_hue', plan.endHue)
  }
  let ok = set('mode', plan.mode) && set('lowcol', plan.low) && set('highcol', plan.high)
  if (range.min !== null || range.max !== null) {
    // An explicit range fixes the ends; otherwise the molecule's own range.
    ok = ok && set('auto', 'none')
    if (range.min !== null) ok = ok && set('lowpar', range.min)
    if (range.max !== null) ok = ok && set('highpar', range.max)
  } else {
    ok = ok && set('auto', 'mol')
  }
  return ok
}

const spectrum: PymCommand = {
  name: 'spectrum',
  params: [
    { name: 'expression', default: 'count' },
    { name: 'palette', default: 'rainbow' },
    { name: 'selection', default: '(all)' },
    { name: 'minimum', default: '' },
    { name: 'maximum', default: '' },
    { name: 'byres', default: '0' },
    { name: 'quiet', default: '1' },
  ],
  mode: 'strict',
  mutates: true,
  summary: 'Colour what the console draws by B-factor, occupancy or residue number.',
  completions: [null, null, { source: 'selections', description: 'selection', suffix: '' }],
  run(ctx, args, cc) {
    const plan = planSpectrum(args.expression, args.palette)
    if ('error' in plan) return { ok: false, error: plan.error }

    const range = { min: null as number | null, max: null as number | null }
    for (const key of ['minimum', 'maximum'] as const) {
      if (args[key].trim() === '') continue
      const v = toNumber(args[key])
      if (v === null) return { ok: false, error: `Error: ${key} must be a number` }
      range[key === 'minimum' ? 'min' : 'max'] = v
    }
    if (plan.kind === 'rainbow' && (range.min !== null || range.max !== null)) {
      cc.warn('spectrum: minimum / maximum apply to b and q only here')
    }
    if (!isDefaulted(args.byres, '0')) cc.warn('spectrum: byres is ignored (colouring is per renderer)')

    return colourOwnedRenderers(ctx, cc, args.selection, (rendId) =>
      applySpectrum(ctx, cc.sceneId, rendId, plan, range))
  },
}

/**
 * Apply `paint` to the console's renderers of the molecules `selection`
 * names: one object by name, or every molecule. A selection expression
 * cannot narrow a whole-renderer colouring, so it is refused with that
 * reason rather than quietly colouring more than was asked for.
 */
function colourOwnedRenderers(
  ctx: WorkerContext,
  cc: CmdContext,
  selection: string,
  paint: (rendId: number) => boolean,
): CmdOutcome {
  const all = molecules(ctx, cc.sceneId)
  if (all.length === 0) return { ok: false, error: 'Error: no molecule in the scene' }
  let targets = all
  if (!isAllSelection(selection)) {
    targets = molecules(ctx, cc.sceneId, selection.trim())
    if (targets.length === 0) {
      return {
        ok: false,
        error: 'Error: spectrum colours whole representations; give an object name or all, not a selection',
      }
    }
  }
  let coloured = 0
  for (const obj of targets) {
    for (const rend of renderersOf(ctx, cc.sceneId, obj.uid)) {
      if (!rend.name.startsWith(OWNED)) continue
      if (paint(rend.id)) coloured += 1
    }
  }
  if (coloured === 0) return { ok: false, error: 'Error: nothing to colour -- show a representation first' }
  return { ok: true }
}

export const COLOR_COMMANDS: PymCommand[] = [setColor, spectrum]
