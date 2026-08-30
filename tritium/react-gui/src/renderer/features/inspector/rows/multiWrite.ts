/**
 * @file components/inspector/rows/multiWrite.ts
 * @description Writing one value to several properties at once.
 *
 * Some controls stand for more than one stored property: a ribbon's "Section
 * detail" sets the detail of all three sections, and a cartoon helix's cap
 * controls set the head and the tail together, because that is how the UXP
 * dialogs presented them. The write has to be one undo step, or the user
 * undoes a single gesture in pieces.
 *
 * A single target routes through `onSet` rather than `onSetMany`: one property
 * is the ordinary case and keeps the ordinary wire shape.
 */

import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import type { PropMultiWrite, RendererPropSectionProps } from '@renderer/features/inspector/rendererPropSections'
import type { SetFn } from './rowProps'

type SetManyFn = RendererPropSectionProps['onSetMany']

/** Write `value` to every target, in one undo step. */
export function writeMany(
  targets: GenericPropEntry[],
  value: string | number | boolean,
  onSet: SetFn,
  onSetMany: SetManyFn,
): void {
  if (targets.length === 1) {
    onSet(targets[0].key, targets[0].type, value)
    return
  }
  const writes: PropMultiWrite[] = targets.map((t) => ({
    key: t.key,
    valueType: t.type,
    value,
  }))
  onSetMany?.(writes)
}
