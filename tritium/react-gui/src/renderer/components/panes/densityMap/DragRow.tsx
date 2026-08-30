/**
 * @file components/panes/densityMap/DragRow.tsx
 * @description A labelled drag-number row for a map renderer property.
 *
 * The map panel writes properties by name rather than through the inspector's
 * `GenericPropEntry` plumbing, so it cannot use the inspector's `NumRow`: that
 * one takes an entry and reports back through it. This row takes the value and
 * a writer, and threads the same realtime lifecycle (preview per frame, one
 * commit on release, rollback on abort) through `useRealtimeDragProp`.
 */

import React from 'react';
import { useRealtimeDragProp } from '@renderer/hooks/react/useRealtimeDragProp';
import { FieldGridRow, DragNumericField } from '@renderer/h3-kit/form';

void React; // classic JSX runtime (vitest)

export interface MapPropWriteOpts {
    mode?: 'preview' | 'commit' | 'abort'
    originalValue?: number
    originalWasDefault?: boolean
}

/**
 * Labeled drag-to-snap numeric row for the density-map panel. Holds a local
 * draft in displayed units (stored * scale) for live feedback and commits the
 * stored value on drag end / Enter so a drag is one undo step (via
 * `useRealtimeDragProp`).
 *
 * With `realtime`, the renderer updates live during the drag: the worker
 * previews each frame without undo and commits a single step on release.
 * `onWrite` mirrors `setMapRendererProp`'s contract (stored value + optional
 * mode / originalValue).
 */
export const DragRow: React.FC<{
    label: string
    value: number
    min: number
    max: number
    step: number
    unit?: string
    scale?: number
    disabled?: boolean
    realtime?: boolean
    /** The prop's default flag (flag-based), frozen at drag start for restore. */
    committedIsDefault?: boolean
    onWrite: (stored: number, opts?: MapPropWriteOpts) => void
}> = ({
    label,
    value,
    min,
    max,
    step,
    unit,
    scale = 1,
    disabled,
    realtime,
    committedIsDefault,
    onWrite,
}) => {
    const dragProps = useRealtimeDragProp({
        committed: value * scale,
        committedIsDefault,
        realtime,
        onPreview: (v) => onWrite(v / scale, { mode: 'preview' }),
        onCommit: (original, v, wasDefault) => {
            const stored = v / scale
            if (stored === original / scale) return
            // Realtime: restore the pre-drag value (and default flag) before the
            // single undo step. Non-realtime: plain commit (current behavior).
            if (realtime)
                onWrite(stored, {
                    mode: 'commit',
                    originalValue: original / scale,
                    originalWasDefault: wasDefault,
                })
            else onWrite(stored)
        },
        onAbort: (original, wasDefault) =>
            onWrite(original / scale, { mode: 'abort', originalWasDefault: wasDefault }),
    })
    return (
        <FieldGridRow label={label}>
            <DragNumericField
                {...dragProps}
                min={min}
                max={max}
                step={step}
                unit={unit}
                disabled={disabled}
            />
        </FieldGridRow>
    )
}
