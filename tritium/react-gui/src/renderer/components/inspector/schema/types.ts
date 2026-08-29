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
import type { AsyncNameSource } from '../rows/AsyncSelectRow'
import type { PropMultiWrite } from '../rendererPropSections'

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
  /**
   * The molecule a selection row counts its atoms against, when the inspected
   * node has one. Resolved worker-side (`getGenericProps`); undefined for a
   * node with no molecule, in which case the picker shows no hit count.
   */
  molId: number | undefined
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

/**
 * An enum property shown as a dropdown, with display text per raw value.
 *
 * The raw C++ ids stay the values; `labels` only decides what the user reads
 * ("Wireframe" for `line`). `options` both restricts and orders the choices --
 * the `enumdef` C++ reports is alphabetical, which is rarely the natural order
 * (an edge type reads none, edges, silhouette).
 */
export interface MappedEnumRowDef extends RowBase {
  kind: 'mappedEnum'
  labels: Record<string, string>
  options?: string[]
}

/**
 * An enum property shown as a dropdown reading as its raw C++ ids. Use
 * `mappedEnum` when the ids are not what a user should read; `options` still
 * fixes the order, since the `enumdef` C++ reports is alphabetical.
 */
export interface EnumRowDef extends RowBase {
  kind: 'enum'
  options?: string[]
}

/**
 * A numeric property shown as a slider, for a range meant to be swept rather
 * than dialled in (a tessellation density, say).
 */
export interface SliderRowDef extends RowBase {
  kind: 'slider'
  min: number
  max: number
  step?: number
  unit?: string
}

/** A boolean property, shown as a switch. */
export interface BoolRowDef extends RowBase {
  kind: 'bool'
}

/** A colour property, shown as a swatch that opens the picker. */
export interface ColorRowDef extends RowBase {
  kind: 'color'
}

/**
 * An integer property typed into a stepper, for a value dialled to an exact
 * number rather than swept (a subdivision count).
 */
export interface NumInputRowDef extends RowBase {
  kind: 'numInput'
  min: number
  max: number
  step: number
  unit?: string
}

/** A free-text property. */
export interface TextRowDef extends RowBase {
  kind: 'text'
  /**
   * Shown while the field is empty. Use "(default)" for a property whose empty
   * value falls back to something the C++ side resolves.
   */
  placeholder?: string
}

/**
 * A numeric property that can also be "not set", where a NEGATIVE value is
 * what the C++ side reads as unset (the disorder overlay's second loop size,
 * whose -1.0 default makes it fall back to the first). The checkbox owns
 * set / unset and the drag field the value, both writing the one property.
 */
export interface OptionalNumRowDef extends RowBase {
  kind: 'optionalNum'
  min: number
  max: number
  step: number
  fineSnap?: number
  coarseSnap?: number
  unit?: string
  decimals?: number
  realtime?: boolean
  /** Written to turn the property off; must be negative. Usually the C++ default. */
  offValue: number
  /** Written when switched on with no earlier value to restore. */
  onValue: number
  /** Names what ticking the box does, for the checkbox's accessible name. */
  gateLabel: string
}

/**
 * A numeric row whose displayed value is COMPUTED from more than one property,
 * and whose commit writes them back.
 *
 * C++ sometimes stores a size the user does not think in: a tube's
 * cross-section is a major axis plus a minor/major ratio, and a nucleic base's
 * thickness is an absolute the UXP dialog showed as a percentage of the base
 * size. This row keeps the user's unit and does the arithmetic, so editing one
 * axis does not move the other.
 *
 * `key` names the property the row's modified bar and reset belong to; `needs`
 * names the others it reads, and the row is dropped unless all of them exist.
 * `commit` returns the writes, and returning none means "nothing to write"
 * (the value did not move, or the arithmetic would divide by zero).
 */
export interface DerivedNumRowDef extends RowBase {
  kind: 'derivedNum'
  /** Other properties this row reads; absent ones drop the row. */
  needs: string[]
  /** The value to show, in the user's unit. */
  display: (ctx: PropCtx) => number
  /** The writes a committed value turns into; empty means write nothing. */
  commit: (ctx: PropCtx, value: number) => PropMultiWrite[]
  /**
   * This row can write more than one property, so it needs the multi-write
   * callback and is disabled without it (one write always goes through the
   * plain single-property one).
   */
  multiWrite?: boolean
  min: number
  max: number
  step: number
  fineSnap?: number
  coarseSnap?: number
  unit?: string
  decimals?: number
}

/** A molecular-selection property, edited through the selection picker. */
export interface SelRowDef extends RowBase {
  kind: 'sel'
}

/** A dropdown whose choices the worker supplies (see rows/AsyncSelectRow). */
export interface AsyncSelectRowDef extends RowBase {
  kind: 'asyncSelect'
  source: AsyncNameSource
  emptyOption: 'none' | 'blank'
}

/**
 * A boolean shown as a two-choice dropdown rather than a switch, for a flag
 * that reads as a choice between two things (a cartoon helix is a Cylinder or
 * a Ribbon) rather than as something being on.
 */
export interface BoolSelectRowDef extends RowBase {
  kind: 'boolSelect'
  offOption: { value: string; label: string }
  onOption: { value: string; label: string }
}

/**
 * What a row standing for SEVERAL properties has in common.
 *
 * Some controls in the UXP dialogs set more than one stored property: a
 * ribbon's section detail sets all three sections, a cartoon helix's cap
 * controls set head and tail together. `keys` lists them; the first one
 * present drives the display, and the row is dropped only when none exist.
 */
interface MultiRowBase {
  /** The properties this one control stands for, in write order. */
  keys: string[]
  label: string
  visibleWhen?: Predicate
  disabledWhen?: Predicate
}

/** Any row standing for several properties. */
export type MultiRowDef = MultiEnumRowDef | MultiNumRowDef | MultiNumInputRowDef

/** An enum dropdown written to every target (see `MultiRowBase`). */
export interface MultiEnumRowDef extends MultiRowBase {
  kind: 'multiEnum'
  labels: Record<string, string>
  options?: string[]
}

/**
 * A drag-numeric row written to every target, optionally in a unit of its own.
 *
 * The transform covers a value the user does not think in: a junction's arrow
 * height is stored as a base width and shown as a percentage. One target with
 * a transform is the percentage row; several targets without one is the plain
 * shared slider.
 */
export interface MultiNumRowDef extends MultiRowBase {
  kind: 'multiNum'
  min: number
  max: number
  step: number
  decimals?: number
  unit?: string
  /** Stored value -> displayed value (default identity). */
  toDisplay?: (stored: number) => number
  /** Displayed value -> stored value (default identity). */
  toStored?: (display: number) => number
}

/** A stepper written to every target (see `MultiRowBase`). */
export interface MultiNumInputRowDef extends MultiRowBase {
  kind: 'multiNumInput'
  min: number
  max: number
  step: number
}

/**
 * A set of rows sharing one gate.
 *
 * A page sometimes switches whole blocks rather than single rows -- the
 * cartoon Helix page is a deck showing either the cylinder controls or the
 * ribbon ones. Writing the same `visibleWhen` on a dozen rows would say the
 * same thing a dozen times and let one of them drift. The group's gate is
 * ANDed with each child's own.
 */
export interface GroupRowDef {
  kind: 'group'
  rows: PropRowDef[]
  visibleWhen?: Predicate
  disabledWhen?: Predicate
}

/** A row of a Properties page. */
export type PropRowDef =
  | NumRowDef
  | EnumRowDef
  | MappedEnumRowDef
  | SliderRowDef
  | BoolRowDef
  | ColorRowDef
  | NumInputRowDef
  | OptionalNumRowDef
  | DerivedNumRowDef
  | BoolSelectRowDef
  | MultiEnumRowDef
  | MultiNumRowDef
  | MultiNumInputRowDef
  | GroupRowDef
  | TextRowDef
  | SelRowDef
  | AsyncSelectRowDef

/**
 * Kinds whose control holds a draft of what the user is typing.
 *
 * Such a row has to be remounted when the property changes underneath it --
 * an undo, a script -- or the field goes on showing the abandoned draft. The
 * engine keys them by value so that cannot be forgotten per row, which is how
 * one of them came to be missing it.
 */
export const DRAFT_KINDS: ReadonlySet<PropRowDef['kind']> = new Set([
  'numInput',
  'multiNumInput',
  'text',
  'sel',
])

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
  molId: number | undefined,
): PropCtx {
  const byKey = new Map(entries.map((e) => [e.key, e]))
  return {
    entries,
    get: (key) => byKey.get(key),
    value: (key) => byKey.get(key)?.value,
    rendererType,
    sceneId,
    nodeId,
    molId,
  }
}
