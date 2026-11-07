/**
 * @file plugins/pymol-console/worker/commands/colorCommands.ts
 * @description `set_color` and `spectrum`.
 *
 * `set_color` defines a named colour in a scene-local style set called `pym`,
 * made the first time it is needed. `ColCompiler` resolves a bare name it
 * does not know as a named colour, so `color <name>, sel` finds it without
 * anything else changing.
 *
 * `spectrum` maps onto the gradient colourings CueMol has, which colour a
 * whole renderer: `BfacColoring` (B-factor or occupancy: two colours, or a
 * multi-colour gradient for a palette of three or more) and `RainbowColoring`
 * (a hue sweep along the residue numbers). PyMOL colours only the selected
 * atoms; what does not map is refused by name rather than approximated with
 * something that would look different.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { isAllSelection, isDefaulted, molecules, runOp, toNumber } from './helpers'
import { OWNED, renderersOf } from './helpers'
import { PYMOL_COLORS, toCueMolColor } from './pymolColors'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'

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

const setColor: PymCommand = {
  name: 'set_color',
  params: [{ name: 'name' }, { name: 'rgb' }, { name: 'mode', default: '0' }],
  mode: 'strict',
  mutates: true,
  summary: 'Define a named colour, e.g. set_color mycol, [1.0, 0.5, 0.0].',
  async run(ctx, args, cc) {
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

    // define_color makes the scene's `pym` set when it has none.
    const res = await runOp(ctx, cc, 'define_color', { name, color: colour, styleSet: PYM_STYLE_SET })
    if (!res.ok) return { ok: false, error: `Error: cannot define colour "${name}"` }
    cc.print(` Color: "${name}" defined as ${colour}.`)
    return { ok: true }
  },
}

/** How a `spectrum` request is carried out on one renderer. */
type SpectrumPlan =
  | { kind: 'bfac'; mode: 'bfac' | 'occ'; low: string; high: string }
  /** Three colours or more, evenly spaced over the range (`BfacColoring.multi_grad`). */
  | { kind: 'bfacGrad'; mode: 'bfac' | 'occ'; colors: string[] }
  | { kind: 'rainbow'; startHue: number; endHue: number }

/** PyMOL's named multi-colour palettes (`viewing.py` `palette_colors_dict`). */
const PALETTE_COLORS: Readonly<Record<string, string>> = {
  rainbow_cycle: 'magenta blue cyan green yellow orange red magenta',
  rainbow_cycle_rev: 'magenta red orange yellow green cyan blue magenta',
  rainbow: 'blue cyan green yellow orange red',
  rainbow_rev: 'red orange yellow green cyan blue',
  rainbow2: 'blue cyan green yellow orange red',
  rainbow2_rev: 'red orange yellow green cyan blue',
  gcbmry: 'green cyan blue magenta red yellow',
  yrmbcg: 'yellow red magenta blue cyan green',
  cbmr: 'cyan blue magenta red',
  rmbc: 'red magenta blue cyan',
}

/**
 * What `spectrum <expression>, <palette>` becomes here, or why it cannot.
 *
 * - `b` / `q` with a two-colour palette (`blue_red`, `green_white`, ...):
 *   `BfacColoring`, low to high.
 * - `b` / `q` with three colours or more (`blue_white_red`, `rainbow`, or the
 *   colours themselves): `BfacColoring`'s multi-colour gradient, the colours
 *   evenly spaced from the minimum to the maximum and interpolated in RGB in
 *   between, as PyMOL's `spectrumany` does.
 * - `count` / `resi` with `rainbow` / `rainbow_rev`: `RainbowColoring` over
 *   residue numbers (PyMOL's `count` steps per atom; here it is per residue,
 *   as with `byres=1`).
 *
 * Everything else is refused (a palette over residue numbers other than the
 * rainbow, a colour PyMOL does not name, partial charges).
 */
export function planSpectrum(expression: string, palette: string): SpectrumPlan | { error: string } {
  const expr = expression.trim().toLowerCase()
  const pal = palette.trim().toLowerCase()

  if (expr === 'b' || expr === 'q') {
    // A palette name (`blue_red`, `rainbow`) or the colours themselves, space
    // separated (`blue red`), as PyMOL's spectrum takes either.
    const named = pal.includes(' ') ? pal : (PALETTE_COLORS[pal] ?? pal.replace(/_/g, ' '))
    const parts = named.split(/\s+/).filter((p) => p !== '')
    const colors = parts.map((p) => (PYMOL_COLORS[p] === undefined ? null : toCueMolColor(p)))
    if (parts.length < 2 || colors.some((c) => c === null)) {
      return {
        error:
          `Error: spectrum ${expr}: palette "${palette}" cannot be drawn here; ` +
          'give two colours or more PyMOL names, or a palette such as blue_red or rainbow',
      }
    }
    const mode = expr === 'b' ? 'bfac' : 'occ'
    if (colors.length === 2) return { kind: 'bfac', mode, low: colors[0] as string, high: colors[1] as string }
    return { kind: 'bfacGrad', mode, colors: colors as string[] }
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

/**
 * The range of the B-factors (or occupancies) of `objIds`' atoms together,
 * as PyMOL takes the selection's own range when no minimum / maximum is
 * given; null when no atom has a value.
 */
function valueRange(ctx: WorkerContext, sceneId: number, objIds: number[], mode: 'bfac' | 'occ'): { min: number; max: number } | null {
  const scene = getSceneOrNull(ctx, sceneId)
  let min = Infinity
  let max = -Infinity
  for (const id of objIds) {
    try {
      const mol = scene?.getObject(id) as unknown as { getPropArray?: (p: string) => unknown } | null
      const ba = mol?.getPropArray?.(mode)
      if (!ba) continue
      const bytes = ctx.svc.copyToTypedArray(ba) as Uint8Array
      for (const v of new Float32Array(bytes.slice().buffer)) {
        if (v < min) min = v
        if (v > max) max = v
      }
    } catch {
      continue
    }
  }
  // The values are float32: round to their precision, so a record reads 3.38, not 3.380000114440918.
  const f32 = (v: number) => Number(v.toPrecision(7))
  return min <= max ? { min: f32(min), max: f32(max) } : null
}

/**
 * The gradient nodes of a multi-colour plan: the colours evenly spaced from
 * `min` to `max` (PyMOL's `spectrumany`), as `set_multigrad_nodes` takes them.
 */
export function spectrumNodes(colors: readonly string[], min: number, max: number): string {
  const n = colors.length
  return colors.map((c, i) => `${min + ((max - min) * i) / (n - 1)} ${c}`).join('; ')
}

/** Put `plan` on one renderer (`set_renderer_coloring`, then `set_coloring_prop` per property). */
async function applySpectrum(
  ctx: WorkerContext,
  cc: CmdContext,
  rendId: number,
  plan: SpectrumPlan,
  range: { min: number | null; max: number | null },
): Promise<boolean> {
  const mode = plan.kind === 'rainbow' ? 'paint-type-rainbow' : 'paint-type-bfac'
  const target = { nodeId: rendId, nodeType: 'renderer' }
  if (!(await runOp(ctx, cc, 'set_renderer_coloring', { ...target, mode, styleName: null })).ok) return false
  if (plan.kind === 'bfacGrad') {
    // `run` has filled in the range (the given one, or the atoms' own).
    if (!(await runOp(ctx, cc, 'set_coloring_prop', { ...target, prop: 'mode', value: plan.mode })).ok) return false
    const lo = range.min ?? 0
    const hi = range.max ?? 0
    if (!(hi > lo)) {
      // One value everywhere: PyMOL colours it all with the first colour.
      for (const prop of ['lowcol', 'highcol']) {
        if (!(await runOp(ctx, cc, 'set_coloring_prop', { ...target, prop, value: plan.colors[0] })).ok) return false
      }
      return true
    }
    const nodes = spectrumNodes(plan.colors, lo, hi)
    return (await runOp(ctx, cc, 'set_multigrad_nodes', { rendId, nodes, nodeType: 'renderer', gradient: 'coloring' })).ok
  }
  const props: [string, string | number][] = []
  if (plan.kind === 'rainbow') {
    props.push(['incr_mode', 'resid'], ['start_hue', plan.startHue], ['end_hue', plan.endHue])
  } else {
    props.push(['mode', plan.mode], ['lowcol', plan.low], ['highcol', plan.high])
    if (range.min !== null || range.max !== null) {
      // An explicit range fixes the ends; otherwise the molecule's own range.
      props.push(['auto', 'none'])
      if (range.min !== null) props.push(['lowpar', range.min])
      if (range.max !== null) props.push(['highpar', range.max])
    } else {
      props.push(['auto', 'mol'])
    }
  }
  for (const [prop, value] of props) {
    if (!(await runOp(ctx, cc, 'set_coloring_prop', { ...target, prop, value: String(value) })).ok) return false
  }
  return true
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
    { name: 'interpolation', default: 'rgb' },
  ],
  mode: 'strict',
  mutates: true,
  summary: 'Colour what the console draws by B-factor, occupancy or residue number.',
  completions: [null, null, { source: 'selections', description: 'selection', suffix: '' }],
  async run(ctx, args, cc) {
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

    if (plan.kind === 'bfacGrad' && (range.min === null || range.max === null)) {
      // The gradient's nodes are absolute values: the range of every molecule
      // coloured, together, where not given (PyMOL's own range).
      const objs = isAllSelection(args.selection) ? molecules(ctx, cc.sceneId) : molecules(ctx, cc.sceneId, args.selection.trim())
      const own = valueRange(ctx, cc.sceneId, objs.map((o) => o.uid), plan.mode)
      if (own === null && objs.length > 0) return { ok: false, error: 'Error: spectrum: the atoms have no values to spread the colours over' }
      if (own) {
        range.min ??= own.min
        range.max ??= own.max
      }
    }

    return colourOwnedRenderers(ctx, cc, args.selection, (rendId) =>
      applySpectrum(ctx, cc, rendId, plan, range))
  },
}

/**
 * Apply `paint` to the console's renderers of the molecules `selection`
 * names: one object by name, or every molecule. A selection expression
 * cannot narrow a whole-renderer colouring, so it is refused with that
 * reason rather than quietly colouring more than was asked for.
 */
async function colourOwnedRenderers(
  ctx: WorkerContext,
  cc: CmdContext,
  selection: string,
  paint: (rendId: number) => Promise<boolean>,
): Promise<CmdOutcome> {
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
      if (await paint(rend.id)) coloured += 1
    }
  }
  if (coloured === 0) return { ok: false, error: 'Error: nothing to colour -- show a representation first' }
  return { ok: true }
}

export const COLOR_COMMANDS: PymCommand[] = [setColor, spectrum]
