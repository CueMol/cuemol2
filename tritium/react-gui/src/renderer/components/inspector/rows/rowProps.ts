/**
 * @file components/inspector/rows/rowProps.ts
 * @description What every property row of the Properties tab has in common.
 *
 * A row edits ONE property of the inspected node: it is handed that property's
 * live entry and the write / reset callbacks, and it decorates its
 * `PropertyField` from the entry's default state. Keeping that here is what
 * lets a row be swapped for another without the page knowing.
 */

import { isModified, isResettable, formatDefaultLabel } from '../propModel';
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps';
import type { RendererPropSectionProps } from '../rendererPropSections';

export type SetFn = RendererPropSectionProps['onSet'];
export type ResetFn = RendererPropSectionProps['onReset'];

export interface RowProps {
  entry: GenericPropEntry;
  label: string;
  onSet: SetFn;
  onReset: ResetFn;
}

/**
 * Shared PropertyField decorations for a property entry: the modified bar
 * (flag-based, from the C++ default state), the per-property reset, and the
 * hover default-value annotation. Never-reset keys (name / sel) get no bar and
 * no reset, even when modified.
 */
export function resetProps(entry: GenericPropEntry, onReset: ResetFn) {
  const resettable = isResettable(entry);
  return {
    modified: resettable && isModified(entry),
    resettable,
    defaultValueLabel: resettable ? formatDefaultLabel(entry) : undefined,
    onReset: () => onReset(entry.key),
  };
}
