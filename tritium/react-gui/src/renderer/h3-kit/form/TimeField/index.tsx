/**
 * @file h3-kit/form/TimeField/index.tsx
 * @description Canonical time editor: a segmented `M:SS.mmm` (or `H:MM:SS.mmm`)
 * timecode in the Blender / After Effects style. One segment is always active;
 * the keys, the stepper and Ctrl+wheel act on it, a drag acts on the segment
 * under the pointer, and digits overwrite it. The migration target for the UXP
 * `timeedit` widget; kept generic (value in ms) so any ms-based time field can
 * reuse it. Independent of `DragNumericField`: a segmented field needs an
 * active segment outside edit mode, which a single value span cannot carry.
 *
 * Interaction:
 *
 *   input                       target          effect
 *   click / press on a segment  that segment    select (and focus the field)
 *   drag on a segment (> 4 px)  that segment    scrub by its unit; Shift = a
 *                                               tenth and a tenth of the rate,
 *                                               Ctrl / Cmd = ten times
 *   Up / Down (hold = one run)  active segment  +- one unit (Shift a tenth,
 *                                               Ctrl / Cmd ten times)
 *   Left / Right, Home / End    --              move the active segment
 *   0-9                         active segment  overwrite; carries (75 s ->
 *                                               1:15); moves on when full
 *   Backspace / Delete          active segment  zero it
 *   stepper (hold = one run)    active segment  +- one unit, auto-repeat,
 *                                               keeps the segment while held
 *   Ctrl / Cmd + wheel          hovered segment +- one unit per notch (Shift
 *                                               a tenth); plain wheel scrolls
 *   double-click, Enter, F2,    field           expression editor: 1:30.500 /
 *   `+`, `-`                                    250ms / 1.5s / +2s / -1:30
 *   Esc                         --              editor: discard; run: abandon
 *   Tab / blur                  --              native; releases an open run
 *
 * Shift is the precision modifier on every channel (as on `DragNumericField`
 * and in Blender), not Figma's "x10"; the bigger nudge is one segment to the
 * left.
 *
 * Commit timing is the `DragNumericField` contract so `useRealtimeDragProp`
 * plugs in unchanged: `onChange` per step, `onRelease` exactly once per
 * interaction (also when nothing changed), `onDragStart` for a run that will
 * preview (a realtime drag; always for key / digit / stepper runs), and
 * `onDragCancel` for an abandoned run in either mode. See `types.ts`.
 *
 * Sizing / border / focus come from `.h3-form-time*` in `styles/_form-kit.css`;
 * no size prop is exposed. The widget is controlled: it shows exactly `value`,
 * so a parent must update it from `onChange`.
 *
 * The gestures live in the hooks beside this file -- `useTimeRun` (the one
 * run in flight), `useSegmentDrag`, `useSegmentKeys`, `useSegmentStepper`,
 * `useTimeWheel`, `useTimeEdit` -- over the shared core declared in
 * `types.ts`; the arithmetic is in `timeMath.ts`. This file owns the shared
 * core and the render.
 *
 * @module form/TimeField
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@renderer/h3-kit/primitives';
import {
    TYPING_HINT,
    resolveUnit,
    segmentAtX,
    segmentText,
    separatorBefore,
    splitMs,
    visibleUnits,
} from './timeMath';
import type { SegmentRect, TimeUnit } from './timeMath';
import { useTimeRun } from './useTimeRun';
import { useSegmentDrag } from './useSegmentDrag';
import { useSegmentStepper } from './useSegmentStepper';
import { useTimeEdit } from './useTimeEdit';
import { useSegmentKeys } from './useSegmentKeys';
import { useTimeWheel } from './useTimeWheel';
import type { Mode, TimeCallbacks, TimeCore, TimeFieldProps } from './types';

export { formatMs, parseTime, parseTimeInput } from './timeMath';
export type { TimeUnit } from './timeMath';
export type { TimeFieldProps } from './types';

void React; // classic JSX runtime (vitest)

/** Segment the field starts on: seconds, as the UXP spinner did. */
const DEFAULT_UNIT: TimeUnit = 's';

/**
 * Segmented time editor. See the file header for the interaction model and
 * commit timing.
 */
export const TimeField: React.FC<TimeFieldProps> = ({
    value,
    onChange,
    onRelease,
    onDragStart,
    onDragCancel,
    realtime = false,
    min = 0,
    max = Infinity,
    disabled = false,
    'aria-label': ariaLabel,
    title = TYPING_HINT,
    className,
}) => {
    const [mode, setMode] = useState<Mode>('idle');
    const [draft, setDraft] = useState('');
    const [activeUnitState, setActiveUnitState] = useState<TimeUnit>(DEFAULT_UNIT);

    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const segRefs = useRef(new Map<TimeUnit, HTMLSpanElement>());

    // The document-level listeners and timers read the latest value and
    // callbacks through refs, so they never have to be re-attached.
    const valueRef = useRef(value);
    valueRef.current = value;
    const cbRef = useRef<TimeCallbacks>({ onChange, onRelease, onDragStart, onDragCancel, min, max, realtime });
    cbRef.current = { onChange, onRelease, onDragStart, onDragCancel, min, max, realtime };
    const modeRef = useRef(mode);
    modeRef.current = mode;

    // The active segment is tracked by unit, not index, so it survives the
    // hours segment appearing or vanishing; hours fall back to minutes.
    const units = useMemo(() => visibleUnits(value), [value]);
    const activeUnit = resolveUnit(units, activeUnitState);
    const activeUnitRef = useRef(activeUnit);
    activeUnitRef.current = activeUnit;
    const setActiveUnit = useCallback((unit: TimeUnit) => {
        activeUnitRef.current = unit;
        setActiveUnitState(unit);
    }, []);

    const run = useTimeRun(valueRef, cbRef);
    const core: TimeCore = {
        rootRef, inputRef, segRefs, valueRef, cbRef,
        activeUnit, activeUnitRef, setActiveUnit, units,
        mode, modeRef, setMode, draft, setDraft, disabled, run,
    };

    const { onSegmentMouseDown } = useSegmentDrag(core);
    const { onStepButtonDown, isPressing } = useSegmentStepper(core);
    const { openEditor, commitEdit, onEditKeyDown } = useTimeEdit(core, { isPressing });
    const { onRootKeyDown, onRootKeyUp, onRootBlur, onRootDoubleClick } = useSegmentKeys(core, {
        openEditor,
    });
    useTimeWheel(core);

    // A press anywhere in the field lands on a segment: the one under the
    // pointer, else the nearest (a separator or the padding).
    const onRootMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const hit = (e.target as HTMLElement).closest?.('[data-unit]') as HTMLElement | null;
        let unit = hit?.dataset.unit as TimeUnit | undefined;
        if (!unit) {
            const rects: SegmentRect[] = [];
            segRefs.current.forEach((seg, u) => {
                const r = seg.getBoundingClientRect();
                rects.push({ unit: u, left: r.left, right: r.right });
            });
            unit = segmentAtX(rects, e.clientX) ?? activeUnit;
        }
        onSegmentMouseDown(e, unit);
    };

    // --- Render ---
    const parts = splitMs(value);
    const rootClass = [
        'h3-form-time',
        mode === 'dragging' && 'is-dragging',
        mode === 'editing' && 'is-editing',
        disabled && 'is-disabled',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    const stepButton = (sign: 1 | -1) => (
        <button
            type="button"
            className={`h3-form-time-spin h3-form-time-spin-${sign > 0 ? 'up' : 'down'}`}
            tabIndex={-1}
            disabled={disabled || (sign > 0 ? value >= max : value <= min)}
            aria-label={sign > 0 ? 'Increment' : 'Decrement'}
            onMouseDown={(e) => onStepButtonDown(e, sign)}
        >
            <AppIcon name={sign > 0 ? 'ui.caretUp' : 'ui.caretDown'} size={10} aria-hidden />
        </button>
    );

    return (
        <div
            ref={rootRef}
            className={rootClass}
            tabIndex={disabled ? -1 : 0}
            aria-label={ariaLabel}
            title={title}
            onMouseDown={onRootMouseDown}
            onDoubleClick={onRootDoubleClick}
            onKeyDown={onRootKeyDown}
            onKeyUp={onRootKeyUp}
            onBlur={onRootBlur}
        >
            {mode === 'editing' ? (
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    className="h3-form-time-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onEditKeyDown}
                    onBlur={() => commitEdit(false)}
                />
            ) : (
                <div className="h3-form-time-segs">
                    {units.map((u, i) => (
                        <React.Fragment key={u}>
                            {i > 0 && (
                                <span className="h3-form-time-sep" aria-hidden="true">
                                    {separatorBefore(u)}
                                </span>
                            )}
                            <span
                                ref={(el) => {
                                    if (el) segRefs.current.set(u, el);
                                    else segRefs.current.delete(u);
                                }}
                                data-unit={u}
                                className={`h3-form-time-seg${u === activeUnit ? ' is-active' : ''}`}
                            >
                                {segmentText(u, parts, units)}
                            </span>
                        </React.Fragment>
                    ))}
                </div>
            )}
            <div className="h3-form-time-spinner">
                {stepButton(1)}
                {stepButton(-1)}
            </div>
        </div>
    );
};
