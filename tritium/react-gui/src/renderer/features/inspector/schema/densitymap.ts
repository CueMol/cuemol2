/**
 * @file features/inspector/schema/densitymap.ts
 * @description The DensityMap OBJECT's page (the map itself, not a renderer
 * that draws it).
 *
 * Object nodes carry only the common "Basic settings" page, because in UXP an
 * object had no property dialog of its own. The cryo-EM map mode broke that:
 * `map_type` decides whether the map is periodic and whether the renderers'
 * `region_mode: auto` resolves to a box or the whole map (see
 * `docs/architecture/cryo-em-map-mode.md`), which is a property of the DATA and
 * therefore belongs to the object -- and it was only reachable through the
 * Generic tab's raw property table.
 *
 * `map_type_resolved` sits under it because "Auto" alone does not say what the
 * reader decided; the pair reads as "what you asked for" / "what it is".
 */

import type { SchemaSectionDef } from './types'

/**
 * Map-kind choices, worded as in the CCP4/MRC file-open pane
 * (`dialogs/fopen-opt-dlgs/panes/Ccp4MapOptionsPane.tsx`) so the same decision
 * reads the same before and after loading.
 */
const MAP_TYPE_LABELS: Record<string, string> = {
  auto: 'Auto (from header)',
  xtal: 'Crystallographic (periodic)',
  em: 'Cryo-EM (whole map, level of detail)',
}
const MAP_TYPE_ORDER = ['auto', 'xtal', 'em']

/** What `auto` resolved to; the raw ids are not what a user should read. */
const MAP_KIND_LABELS: Record<string, string> = {
  xtal: 'Crystallographic',
  em: 'Cryo-EM',
}

export const DENSITY_MAP_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'densitymap-main',
    title: 'Density map',
    defaultExpanded: true,
    // An ElePotMap and other scalar objects reach this page too; they expose
    // neither property, and an empty accordion would read as a broken page.
    hideWhenEmpty: true,
    rows: [
      {
        kind: 'mappedEnum',
        key: 'map_type',
        label: 'Map type',
        labels: MAP_TYPE_LABELS,
        options: MAP_TYPE_ORDER,
      },
      {
        kind: 'readonlyText',
        key: 'map_type_resolved',
        label: 'Effective kind',
        labels: MAP_KIND_LABELS,
        hideWhenEmpty: true,
      },
    ],
  },
]
