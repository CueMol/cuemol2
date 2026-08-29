/**
 * @file components/inspector/schema/types.ts
 * @description What a renderer's Properties page is, as data.
 *
 * A page is sections of rows, and a row names a property, a label and the
 * control to edit it with. The engine (`SchemaSection`) turns that into the
 * same row components the hand-written sections use, so a schema describes a
 * page rather than implementing one.
 *
 * Rows read their value from the live property list at render time -- a
 * `PropRowDef` carries no value. That is what separates this from `PropDef`
 * (`data/rendererProperties.ts`), which the Render Settings editor uses: a
 * `PropDef` owns its value and commits on every change, while these rows
 * mirror the C++ property bridge and commit on release.
 */

import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

/**
 * What a row can consult while the page renders: the live property list, and
 * which node it belongs to.
 *
 * Built once per render of the page rather than per row -- the hand-written
 * sections each declared their own `const get = (key) => entries.find(...)`.
 */
export interface PropCtx {
  entries: GenericPropEntry[]
  /** The row for `key`, or undefined when the renderer does not expose it. */
  get(key: string): GenericPropEntry | undefined
  /** The current value of `key`, or undefined when it is not exposed. */
  value(key: string): string | number | boolean | undefined
  /** Renderer `type_name`; a few rows read it (the common page's edge lines). */
  rendererType: string
  sceneId: number | undefined
  nodeId: number | undefined
}

/**
 * A condition on the page's current state.
 *
 * Gating is half of what the sections do -- a junction's arrow parameters
 * apply only to the arrow type, tube's sharpness only to a squared section --
 * so it is part of the row definition rather than something a component
 * decides.
 */
export type Predicate = (ctx: PropCtx) => boolean

/** What every row has, whichever control it renders. */
interface RowBase {
  /** Property name; a dot-path (`section.width`) for a nested object's child. */
  key: string
  label: string
  /**
   * Render the row only when this holds. A row whose property the renderer
   * does not expose is dropped regardless -- that is not a gate, it is
   * absence.
   */
  visibleWhen?: Predicate
  /** Render the row, but not editable. */
  disabledWhen?: Predicate
}

/**
 * A numeric property edited by dragging, with arrow steps and typed entry.
 *
 * `realtime` previews the value on the renderer during the drag and commits
 * one undo step on release; without it the renderer sees nothing until
 * release.
 */
export interface NumRowDef extends RowBase {
  kind: 'num'
  min: number
  max: number
  step: number
  /** Fine drag snap (Shift). Defaults to `step / 10`. */
  fineSnap?: number
  /** Coarse drag snap (Ctrl / Cmd). Defaults to `step * 10`. */
  coarseSnap?: number
  unit?: string
  decimals?: number
  realtime?: boolean
}

/** A row of a Properties page. */
export type PropRowDef = NumRowDef

/** One accordion of a Properties page. */
export interface SchemaSectionDef {
  /** Stable id, used as the React key. */
  key: string
  /** Accordion title; also identifies it within the tab's exclusive group. */
  title: string
  defaultExpanded?: boolean
  rows: PropRowDef[]
  /** Render the section only when this holds. */
  visibleWhen?: Predicate
  /** Render it, with every row disabled. */
  disabledWhen?: Predicate
  /** Drop the section when none of its rows survive (absence or a gate). */
  hideWhenEmpty?: boolean
}

/** Build the context a page's rows read from. */
export function makePropCtx(
  entries: GenericPropEntry[],
  rendererType: string,
  sceneId: number | undefined,
  nodeId: number | undefined,
): PropCtx {
  const byKey = new Map(entries.map((e) => [e.key, e]))
  return {
    entries,
    get: (key) => byKey.get(key),
    value: (key) => byKey.get(key)?.value,
    rendererType,
    sceneId,
    nodeId,
  }
}
