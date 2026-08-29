/**
 * @file components/inspector/SchemaSection.tsx
 * @description Renders a Properties-page section from its schema.
 *
 * The engine owns no editing behaviour: the draft, the commit timing, the
 * reset and the realtime drag all stay in the row components the
 * hand-written sections already used. What it does is decide which rows a
 * section shows -- dropping the ones the renderer does not expose, applying
 * the gates -- and hand each one its props.
 *
 * A row whose property is absent is dropped, mirroring the `if (!x) return
 * null` the hand-written sections opened with. That is not a gate: `sharp`
 * missing means this renderer has no sharpness, while `sharp` present on an
 * elliptical section means the row shows disabled.
 */

import React from 'react'
import { AccordionSection } from './AccordionSection'
import {
  AsyncSelectRow,
  BoolRow,
  ColorRow,
  DerivedNumRow,
  EnumRow,
  MappedEnumRow,
  NumInputRow,
  NumRow,
  OptionalNumRow,
  SelRow,
  SliderRow,
  TextRow,
} from './rows'
import type { RendererPropSectionProps } from './rendererPropSections'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import { DRAFT_KINDS, makePropCtx, type PropCtx, type PropRowDef, type SchemaSectionDef } from './schema/types'

type SetFn = RendererPropSectionProps['onSet']
type ResetFn = RendererPropSectionProps['onReset']
type SetManyFn = RendererPropSectionProps['onSetMany']

export interface SchemaSectionProps {
  section: SchemaSectionDef
  entries: GenericPropEntry[]
  rendererType: string
  sceneId: number | undefined
  /**
   * UID of the inspected node, for a row that has to ask the C++ side about
   * the node itself (the disorder Target lists its sibling renderers).
   */
  nodeId?: number
  /**
   * Molecule the section's selection rows count their atoms against. Only a
   * page with a `sel` row needs it.
   */
  molId?: number
  onSet: SetFn
  /**
   * Write several properties in one undo step. Only a `derivedNum` row that
   * writes more than one needs it; `PropertiesTab` always supplies it.
   */
  onSetMany?: SetManyFn
  onReset: ResetFn
}

/** Render one row, or null when the renderer does not expose its property. */
function renderRow(
  row: PropRowDef,
  ctx: PropCtx,
  sectionDisabled: boolean,
  onSet: SetFn,
  onSetMany: SetManyFn,
  onReset: ResetFn,
): React.ReactElement | null {
  if (row.visibleWhen && !row.visibleWhen(ctx)) return null
  const entry = ctx.get(row.key)
  if (!entry) return null
  // A derived row reads more than its own property and cannot be shown
  // without them (a tube's minor axis is meaningless with no ratio).
  if (row.kind === 'derivedNum' && row.needs.some((k) => ctx.get(k) === undefined))
    return null
  const disabled = sectionDisabled || (row.disabledWhen?.(ctx) ?? false)
  // A control holding a draft has to be remounted when the property changes
  // underneath it, or it keeps showing what the user abandoned typing.
  const key = DRAFT_KINDS.has(row.kind) ? `${row.key}:${String(entry.value)}` : row.key

  switch (row.kind) {
    case 'num':
      return (
        <NumRow
          key={key}
          entry={entry}
          label={row.label}
          onSet={onSet}
          onReset={onReset}
          min={row.min}
          max={row.max}
          step={row.step}
          fineSnap={row.fineSnap}
          coarseSnap={row.coarseSnap}
          unit={row.unit}
          decimals={row.decimals}
          realtime={row.realtime}
          disabled={disabled}
        />
      )

    case 'enum':
      return (
        <EnumRow
          key={key}
          entry={entry}
          label={row.label}
          onSet={onSet}
          onReset={onReset}
          options={row.options}
          disabled={disabled}
        />
      )

    case 'mappedEnum':
      return (
        <MappedEnumRow
          key={key}
          entry={entry}
          label={row.label}
          onSet={onSet}
          onReset={onReset}
          labels={row.labels}
          options={row.options}
          disabled={disabled}
        />
      )

    case 'slider':
      return (
        <SliderRow
          key={key}
          entry={entry}
          label={row.label}
          onSet={onSet}
          onReset={onReset}
          min={row.min}
          max={row.max}
          step={row.step}
          unit={row.unit}
          disabled={disabled}
        />
      )

    case 'bool':
      return (
        <BoolRow
          key={key}
          entry={entry}
          label={row.label}
          onSet={onSet}
          onReset={onReset}
          disabled={disabled}
        />
      )

    case 'color':
      return (
        <ColorRow
          key={key}
          entry={entry}
          label={row.label}
          onSet={onSet}
          onReset={onReset}
          disabled={disabled}
        />
      )

    case 'numInput':
      return (
        <NumInputRow
          key={key}
          entry={entry}
          label={row.label}
          onSet={onSet}
          onReset={onReset}
          min={row.min}
          max={row.max}
          step={row.step}
          unit={row.unit}
          disabled={disabled}
        />
      )

    case 'text':
      return (
        <TextRow
          key={key}
          entry={entry}
          label={row.label}
          onSet={onSet}
          onReset={onReset}
          placeholder={row.placeholder}
          disabled={disabled}
        />
      )

    case 'optionalNum':
      return (
        <OptionalNumRow
          key={key}
          entry={entry}
          label={row.label}
          gateLabel={row.gateLabel}
          onSet={onSet}
          onReset={onReset}
          min={row.min}
          max={row.max}
          step={row.step}
          fineSnap={row.fineSnap}
          coarseSnap={row.coarseSnap}
          unit={row.unit}
          decimals={row.decimals}
          realtime={row.realtime}
          offValue={row.offValue}
          onValue={row.onValue}
          disabled={disabled}
        />
      )

    case 'derivedNum':
      return (
        <DerivedNumRow
          key={key}
          entry={entry}
          label={row.label}
          value={row.display(ctx)}
          computeWrites={(v) => row.commit(ctx, v)}
          onSet={onSet}
          onSetMany={onSetMany}
          onReset={onReset}
          min={row.min}
          max={row.max}
          step={row.step}
          fineSnap={row.fineSnap}
          coarseSnap={row.coarseSnap}
          unit={row.unit}
          decimals={row.decimals}
          multiWrite={row.multiWrite}
          disabled={disabled}
        />
      )

    case 'sel':
      return (
        <SelRow
          key={key}
          entry={entry}
          label={row.label}
          onSet={onSet}
          onReset={onReset}
          sceneId={ctx.sceneId}
          molId={ctx.molId}
          disabled={disabled}
        />
      )

    case 'asyncSelect':
      return (
        <AsyncSelectRow
          key={key}
          entry={entry}
          label={row.label}
          onSet={onSet}
          onReset={onReset}
          source={row.source}
          emptyOption={row.emptyOption}
          sceneId={ctx.sceneId}
          nodeId={ctx.nodeId}
          disabled={disabled}
        />
      )
  }
}

/** The rows of a section that survive absence and gating. */
export function renderRows(
  section: SchemaSectionDef,
  ctx: PropCtx,
  onSet: SetFn,
  onSetMany: SetManyFn,
  onReset: ResetFn,
): React.ReactElement[] {
  const sectionDisabled = section.disabledWhen?.(ctx) ?? false
  return section.rows
    .map((row) => renderRow(row, ctx, sectionDisabled, onSet, onSetMany, onReset))
    .filter((el): el is React.ReactElement => el !== null)
}

/**
 * A section's accordion and its rows.
 *
 * Returns null when the section is gated out, or when `hideWhenEmpty` is set
 * and nothing survived -- a renderer that exposes none of a section's
 * properties should not show an empty accordion.
 */
export const SchemaSection: React.FC<SchemaSectionProps> = ({
  section,
  entries,
  rendererType,
  sceneId,
  nodeId,
  molId,
  onSet,
  onSetMany,
  onReset,
}) => {
  const ctx = makePropCtx(entries, rendererType, sceneId, nodeId, molId)
  if (section.visibleWhen && !section.visibleWhen(ctx)) return null
  const rows = renderRows(section, ctx, onSet, onSetMany, onReset)
  if (section.hideWhenEmpty && rows.length === 0) return null
  return (
    <AccordionSection title={section.title} defaultExpanded={section.defaultExpanded}>
      {rows}
    </AccordionSection>
  )
}
