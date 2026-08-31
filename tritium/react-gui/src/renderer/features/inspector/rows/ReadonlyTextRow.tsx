/**
 * @file features/inspector/rows/ReadonlyTextRow.tsx
 * @description A property shown as static text rather than a control.
 *
 * The Properties pages have a second kind of value: one the C++ side RESOLVES
 * and the user only reads (a map renderer's effective map kind, an "auto"
 * setting's outcome). Rendering those as a disabled input says "you could edit
 * this, but not now", which is not what a resolved value is -- so they get
 * plain text in the muted role instead, and no modified bar or reset (there is
 * nothing to reset).
 */

import React from 'react';
import { PropertyField } from '@renderer/h3-kit/form';
import type { RowProps } from './rowProps';

interface ReadonlyTextRowProps extends Omit<RowProps, 'onSet' | 'onReset'> {
  /** Display text per raw value; a value not listed is shown as-is. */
  labels?: Record<string, string>;
}

/** Static text for a resolved, read-only property. */
export const ReadonlyTextRow: React.FC<ReadonlyTextRowProps> = ({
  entry,
  label,
  labels,
}) => {
  const raw = String(entry.value ?? '');
  return (
    <PropertyField label={label}>
      <span className="insp-prop-readonly">{labels?.[raw] ?? raw}</span>
    </PropertyField>
  );
};
