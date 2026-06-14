/**
 * @file h3-kit/form/TimeField.tsx
 * @description Canonical time editor: a compact text input that shows a
 * millisecond value as `M:SS.mmm` (or `H:MM:SS.mmm` past an hour) and parses
 * the same format back, committing on blur / Enter. The migration target for
 * the UXP `timeedit` widget; kept generic (value in ms) so any ms-based time
 * field can reuse it.
 *
 * Sizing/border/focus come from `.h3-form-time` (see `styles/_form-kit.css`);
 * no size prop is exposed. The widget is controlled: the displayed value is
 * derived from the `value` prop, so a parent must update it from `onCommit`.
 *
 * @module form/TimeField
 */

import React, { useEffect, useState } from 'react';

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

export interface TimeFieldProps {
    /** Time value in milliseconds. */
    value: number;
    /** Fired on blur / Enter with the parsed millisecond value (clamped to `min`). */
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
    const [draft, setDraft] = useState(() => formatMs(value));
    // Re-sync the draft when the committed value changes from outside.
    useEffect(() => {
        setDraft(formatMs(value));
    }, [value]);

    const commit = () => {
        const ms = parseTime(draft);
        if (ms === null) {
            setDraft(formatMs(value)); // malformed -> revert to the committed value
            return;
        }
        const clamped = Math.max(min, ms);
        setDraft(formatMs(clamped));
        if (clamped !== value) onCommit(clamped);
    };

    return (
        <input
            className="h3-form-time"
            type="text"
            inputMode="numeric"
            value={draft}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
            }}
        />
    );
};
