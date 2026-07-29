/**
 * @file h3-kit/form/TimeField.tsx
 * @description Canonical time editor: a `M:SS.mmm` (or `H:MM:SS.mmm`) timecode
 * on the `DragNumericField` interaction model -- drag the body to scrub, click
 * to type, and step with the spin buttons or Up / Down. The migration target for
 * the UXP `timeedit` widget; kept generic (value in ms) so any ms-based time
 * field can reuse it.
 *
 * Interaction (see also `DragNumericField`):
 *   - horizontal drag scrubs, snapping to `STEP_MS` (0.1 s); Shift snaps to
 *     1 ms (also the stored resolution, so a typed `.345` survives) and
 *     Ctrl / Cmd to 1 s;
 *   - the stacked spin buttons and Up / Down step **the segment the caret sits
 *     in** -- seconds when nothing is selected, which is what UXP's shared
 *     spinner did (`_currentField` defaults to the seconds box) -- with the
 *     milliseconds segment stepping 100 ms at a time, again as in UXP;
 *   - a whole drag or key hold commits once, so it is one undo step.
 *
 * Typed values go through `parseTimeInput`, which also takes a unit-suffixed
 * number (`250ms`, `1.5s`, `2min`) and a `+` / `-` offset from the current value
 * (`+500`, `-1:30`, `+2s`).
 *
 * Sizing/border/focus come from `.h3-form-drag` + `.h3-form-time` (see
 * `styles/_form-kit.css`); no size prop is exposed. The widget is controlled at
 * the commit level: `onCommit` fires at the end of an interaction and the parent
 * must feed the new `value` back.
 *
 * @module form/TimeField
 */

import React, { useEffect, useState } from 'react';
import { DragNumericField } from './DragNumericField';

void React; // classic JSX runtime (vitest)

/** Drag snap / default step: a tenth of a second. */
const STEP_MS = 100;
/** Shift snap, and the resolution values are stored at. */
const FINE_MS = 1;
/** Ctrl / Cmd snap. */
const COARSE_MS = 1000;
/** Pixels of drag per `STEP_MS` -- ~40 px per second. */
const PX_PER_STEP = 4;
/** Tooltip: the typed forms are not otherwise discoverable. */
const TYPING_HINT =
    'Drag to scrub, or click to type: 1:30.500 / 250ms / 1.5s / +2s / -250ms';

/** Format a millisecond value as `M:SS.mmm` (or `H:MM:SS.mmm` when >= 1h). */
export function formatMs(ms: number): string {
    const v = Math.max(0, Math.round(ms || 0));
    const mmm = v % 1000;
    const totalSec = Math.floor(v / 1000);
    const sec = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const min = totalMin % 60;
    const hour = Math.floor(totalMin / 60);
    const p2 = (n: number) => String(n).padStart(2, '0');
    const p3 = (n: number) => String(n).padStart(3, '0');
    const tail = `${p2(sec)}.${p3(mmm)}`;
    return hour > 0 ? `${hour}:${p2(min)}:${tail}` : `${min}:${tail}`;
}

/**
 * Parse `[[H:]M:]S[.frac]` into milliseconds, or null when malformed. The
 * fractional part is read as a decimal fraction of a second (`.5` -> 500ms,
 * `.05` -> 50ms), mirroring the zero-padded display. Components are not range-
 * checked (e.g. `1:90` -> 150s); the value re-normalises on the next format.
 */
export function parseTime(str: string): number | null {
    const s = str.trim();
    if (s === '') return null;
    const parts = s.split(':');
    if (parts.length > 3) return null;

    // The last colon-part holds seconds with an optional `.fraction`.
    let secStr = parts[parts.length - 1];
    let fracMs = 0;
    const dot = secStr.indexOf('.');
    if (dot >= 0) {
        const fracStr = secStr.slice(dot + 1);
        secStr = secStr.slice(0, dot);
        if (!/^\d*$/.test(fracStr)) return null;
        if (fracStr !== '') fracMs = Math.round(parseFloat(`0.${fracStr}`) * 1000);
    }

    const fields = [...parts.slice(0, -1), secStr];
    if (fields.some((f) => f === '' || !/^\d+$/.test(f))) return null;
    const nums = fields.map(Number);

    let hour = 0;
    let min = 0;
    let sec = 0;
    if (nums.length === 3) [hour, min, sec] = nums;
    else if (nums.length === 2) [min, sec] = nums;
    else [sec] = nums;

    return ((hour * 60 + min) * 60 + sec) * 1000 + fracMs;
}

/** Unit suffixes accepted in a typed value, longest first (`ms` before `m`). */
const UNIT_MS: ReadonlyArray<[string, number]> = [
    ['msec', 1],
    ['ms', 1],
    ['min', 60_000],
    ['sec', 1000],
    ['hr', 3_600_000],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1000],
];

/**
 * Parse a magnitude: either a unit-suffixed number (`250ms`, `1.5s`, `2min`)
 * or a plain timecode (`1:30.500`, `90`). Returns null when malformed.
 */
function parseMagnitude(str: string): number | null {
    const s = str.trim();
    const m = /^(\d+(?:\.\d+)?)\s*([a-z]+)$/i.exec(s);
    if (m) {
        const suffix = m[2].toLowerCase();
        const unit = UNIT_MS.find(([name]) => name === suffix);
        if (!unit) return null;
        return Math.round(parseFloat(m[1]) * unit[1]);
    }
    return parseTime(s);
}

/**
 * Parse what the user typed into the field, in milliseconds.
 *
 * Accepts a plain timecode (`parseTime`), a unit-suffixed number (`250ms`,
 * `1.5s`, `2min`, `1h`), and -- with a leading `+` / `-` -- either form as an
 * offset from `currentMs`, the nudge shorthand every timecode-based editor has
 * (After Effects, Premiere, Resolve). Returns null when malformed; the caller
 * clamps the result into range, so `-10s` from 2 s lands on the minimum.
 *
 * The magnitude grammar is the same in both modes, so an unsuffixed number is
 * seconds either way (`10` is 10 s, `+10` adds 10 s); `+10ms` nudges by a
 * millisecond amount.
 */
export function parseTimeInput(text: string, currentMs: number): number | null {
    const s = text.trim();
    if (s === '') return null;
    const rel = s[0] === '+' ? 1 : s[0] === '-' ? -1 : 0;
    const mag = parseMagnitude(rel === 0 ? s : s.slice(1));
    if (mag === null) return null;
    return rel === 0 ? mag : currentMs + rel * mag;
}

/**
 * Step granularity for the segment the caret sits in: 1 h / 1 min / 1 s for the
 * colon-separated fields and 100 ms for the fraction, mirroring UXP's
 * `_increaseOrDecrease` (which multiplies the millisecond field's step by 100).
 * With no caret -- nothing selected, or the whole draft selected on click -- it
 * falls back to seconds, the field UXP's spinner defaulted to.
 */
export function stepUnitAt(text: string, caretPos: number | null): number {
    if (caretPos === null) return 1000;
    const pos = Math.max(0, Math.min(caretPos, text.length));
    const dot = text.lastIndexOf('.');
    if (dot >= 0 && pos > dot) return 100; // .mmm

    const head = dot >= 0 ? text.slice(0, dot) : text;
    const fields = head.split(':');
    // End offset of each colon-separated field within `head`.
    let off = 0;
    const ends = fields.map((f) => {
        off += f.length;
        const end = off;
        off += 1; // the ':' itself
        return end;
    });
    let idx = ends.findIndex((end) => pos <= end);
    if (idx < 0) idx = fields.length - 1;

    // Counted from the last field, which is always seconds.
    const fromRight = fields.length - 1 - idx;
    if (fromRight <= 0) return 1000;
    if (fromRight === 1) return 60_000;
    return 3_600_000;
}

export interface TimeFieldProps {
    /** Time value in milliseconds. */
    value: number;
    /**
     * Fired once at the end of an interaction (drag release, spin / key hold
     * release, Enter or blur after typing) with the new millisecond value,
     * clamped to `min`. One call = one undo step.
     */
    onCommit: (ms: number) => void;
    /** Lower clamp in ms (default 0). */
    min?: number;
    disabled?: boolean;
    'aria-label'?: string;
}

export const TimeField: React.FC<TimeFieldProps> = ({
    value,
    onCommit,
    min = 0,
    disabled,
    'aria-label': ariaLabel,
}) => {
    // Live value during a drag / key hold; `onCommit` fires only on release, so
    // the committed `value` prop lags behind until the parent feeds it back.
    const [live, setLive] = useState(value);
    useEffect(() => {
        setLive(value);
    }, [value]);

    return (
        <DragNumericField
            className="h3-form-time"
            value={live}
            onChange={setLive}
            onRelease={(v) => {
                setLive(v);
                if (v !== value) onCommit(v);
            }}
            min={min}
            step={STEP_MS}
            fineSnap={FINE_MS}
            coarseSnap={COARSE_MS}
            pxPerStep={PX_PER_STEP}
            format={formatMs}
            // Relative offsets read from the live value, so a `+500` typed
            // after a spin / drag nudges the value the user is looking at.
            parse={(text) => parseTimeInput(text, live)}
            title={TYPING_HINT}
            stepper="stacked"
            resolveStep={(edit) => stepUnitAt(edit?.text ?? '', edit?.caretPos ?? null)}
            disabled={disabled}
            aria-label={ariaLabel}
        />
    );
};
