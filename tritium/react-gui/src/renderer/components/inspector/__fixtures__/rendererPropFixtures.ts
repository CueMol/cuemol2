/**
 * @file components/inspector/__fixtures__/rendererPropFixtures.ts
 * @description Property lists for the inspector's parity snapshots.
 *
 * `rendererProps.json` holds what the real C++ reports: one renderer of each
 * type was created on 1CRN (the map renderers on a DensityMap) and its
 * `getPropsJSON()` run through `parseGenericProps`, so the rows -- including
 * the dot-path children of nested objects like `helix.type` -- are exactly
 * what the Properties tab receives at runtime. Captured once and frozen; it is
 * data, not something the tests derive.
 *
 * The captured lists are one state per type: whatever a freshly created
 * renderer reports. Half of what the sections do is gate rows on a value
 * (a junction's arrow parameters appear only for the arrow type, cartoon's
 * ribbon-helix rows only when `helix_ribbon` is on), so each type also names
 * the variants that reach those rows. A variant is the captured list with a
 * few values replaced -- never a hand-written list, so it cannot drift from
 * what C++ actually exposes.
 *
 * Two captured values were not finite: an empty DensityMap has no statistics,
 * so a map renderer's level / min / max came back as `inf` / `nan`, which is
 * not JSON. They were replaced with plausible finite numbers; every other
 * value is verbatim.
 */

import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import captured from './rendererProps.json'

/** The renderer types the section registry has an entry for. */
export type FixtureRendererType = keyof typeof captured

/** A named property list: the captured one, or a gated variant of it. */
export interface RendererPropFixture {
  /** Renderer `type_name`, as `PropertiesTab` resolves its sections by. */
  rendererType: FixtureRendererType
  /** Snapshot name; identifies the gating state. */
  name: string
  entries: GenericPropEntry[]
}

const base = captured as unknown as Record<FixtureRendererType, GenericPropEntry[]>

/** The captured list for a type, with `overrides` applied by key. */
function withValues(
  type: FixtureRendererType,
  overrides: Record<string, string | number | boolean>,
): GenericPropEntry[] {
  const keys = new Set(Object.keys(overrides))
  const out = base[type].map((e) =>
    keys.has(e.key) ? { ...e, value: overrides[e.key], isdefault: false } : e,
  )
  // A typo in an override would silently produce the captured state again and
  // the snapshot would look fine, so fail loudly instead.
  const missing = [...keys].filter((k) => !base[type].some((e) => e.key === k))
  if (missing.length > 0) {
    throw new Error(`${type} fixture: no such propert${missing.length > 1 ? 'ies' : 'y'}: ${missing.join(', ')}`)
  }
  return out
}

/**
 * Gating variants, by renderer type. The captured state is always included
 * first as `default`; the entries here are the states that reach rows the
 * captured one hides (or hide rows it shows).
 */
const VARIANTS: Partial<Record<FixtureRendererType, Record<string, Record<string, string | number | boolean>>>> = {
  // Cross-section shape decides whether "Sharpness" applies.
  tube: {
    'section-roundsquare': { 'section.type': 'roundsquare' },
    'section-fancy': { 'section.type': 'fancy1' },
    'putty-scaling': { putty_mode: 'scaled1', putty_tgt: 'bfac' },
  },
  // The ribbon-helix block and its junctions are the gated part.
  cartoon: {
    'helix-ribbon-on': { helix_ribbon: true },
    'junction-smooth': { 'ribhelix_head.type': 'smooth', 'ribhelix_tail.type': 'smooth' },
    'junction-flat': { 'ribhelix_head.type': 'flat', 'ribhelix_tail.type': 'flat' },
  },
  // Four independent junctions, each gating its own arrow parameters.
  ribbon: {
    'junctions-smooth': {
      'helixhead.type': 'smooth', 'helixtail.type': 'smooth',
      'sheethead.type': 'smooth', 'sheettail.type': 'smooth',
    },
    'side-colours-on': { helix_usebackcol: true, sheet_usesidecol: true },
  },
  // Simple mode drops the tube rows; the arrow caps gate the arrow sizes; the
  // label block is gated on showlabel.
  atomintr: {
    'mode-simple': { mode: 'simple' },
    'caps-arrow': { captype_start: 'arrow', captype_end: 'arrow' },
    'labels-on': { showlabel: true },
  },
  ballstick: { 'ring-on': { ring: true } },
  nucl: { 'tube-off': { show_tube: false } },
  // The extent rows apply to a bounded region only; "full" hides them, and
  // "auto" is resolved by the map kind (the read-only resolved prop is what
  // the section actually reads).
  contour: {
    'region-full': { region_mode: 'full', region_mode_resolved: 'full' },
    'region-box': { region_mode: 'box', region_mode_resolved: 'box' },
    'level-absolute': { use_abslevel: true },
  },
  isosurf: {
    'region-full': { region_mode: 'full', region_mode_resolved: 'full' },
    'level-absolute': { use_abslevel: true },
  },
  gpu_mapmesh: {
    'region-full': { region_mode: 'full', region_mode_resolved: 'full' },
  },
}

/** Every fixture: the captured state per type, plus its gating variants. */
export const RENDERER_PROP_FIXTURES: RendererPropFixture[] = (
  Object.keys(base) as FixtureRendererType[]
).flatMap((rendererType) => [
  { rendererType, name: 'default', entries: base[rendererType] },
  ...Object.entries(VARIANTS[rendererType] ?? {}).map(([name, overrides]) => ({
    rendererType,
    name,
    entries: withValues(rendererType, overrides),
  })),
])

/** The captured list for one type, unmodified. */
export function capturedEntries(type: FixtureRendererType): GenericPropEntry[] {
  return base[type]
}
