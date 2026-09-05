/**
 * @file h3-kit/form/TimeField/timeMath.ts
 * @description Pure time arithmetic for the segmented `TimeField`: the
 * ms <-> `[H:]MM:SS.mmm` conversions, the typed-input grammar, and the
 * segment model (which units are visible, what one step of a unit is under
 * each modifier, how a digit buffer or a drag rewrites one unit).
 *
 * Everything here is side-effect free so it can be unit-tested without a
 * React tree. Values are milliseconds and are kept integral: the field's
 * resolution is 1 ms.
 *
 * @module form/TimeField/timeMath
 */

/** One segment of the timecode. */
export type TimeUnit = 'h' | 'm' | 's' | 'ms';

/** Step modifier: none, Shift (finer), Ctrl / Cmd (coarser). */
export type StepModifier = 'normal' | 'fine' | 'coarse';

/** Milliseconds in one unit. */
export const UNIT_MS: Record<TimeUnit, number> = {
    h: 3_600_000,
    m: 60_000,
    s: 1000,
    ms: 1,
};

/** Digits a typed buffer holds before it is complete and moves on. */
export const SEGMENT_DIGITS: Record<TimeUnit, number> = { h: 2, m: 2, s: 2, ms: 3 };

/**
 * Pixels of horizontal drag per unit of the dragged segment. 4 px per second
 * on the seconds segment (with Shift, 4 px per 100 ms -- what the whole body
 * used to scrub at).
 */
export const PX_PER_UNIT = 4;

/** Tooltip: the typed forms are not otherwise discoverable. */
export const TYPING_HINT =
    'Click a segment and type, drag it, or press Enter to type: 1:30.500 / 250ms / 1.5s / +2s / -250ms';

/** Factor between a unit and its fine (Shift) / coarse (Ctrl) step. */
const STEP_FACTOR = 10;

const ALL_UNITS: ReadonlyArray<TimeUnit> = ['h', 'm', 's', 'ms'];

/** A timecode split into its segments. */
export interface TimeParts {
    h: number;
    m: number;
    s: number;
    ms: number;
}

// --- Display / parse (the pre-segment contract, unchanged) ---

/** Format a millisecond value as `M:SS.mmm` (or `H:MM:SS.mmm` when >= 1h). */
export function formatMs(ms: number): string {
    const p = splitMs(ms);
    const p2 = (n: number) => String(n).padStart(2, '0');
    const p3 = (n: number) => String(n).padStart(3, '0');
    const tail = `${p2(p.s)}.${p3(p.ms)}`;
    return p.h > 0 ? `${p.h}:${p2(p.m)}:${tail}` : `${p.m}:${tail}`;
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
const UNIT_SUFFIXES: ReadonlyArray<[string, number]> = [
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
        const unit = UNIT_SUFFIXES.find(([name]) => name === suffix);
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

// --- Segment model ---

/** Split a millisecond value (clamped at 0, rounded) into its segments. */
export function splitMs(ms: number): TimeParts {
    const v = Math.max(0, Math.round(ms || 0));
    const totalSec = Math.floor(v / 1000);
    const totalMin = Math.floor(totalSec / 60);
    return {
        h: Math.floor(totalMin / 60),
        m: totalMin % 60,
        s: totalSec % 60,
        ms: v % 1000,
    };
}

/**
 * Join segments back into milliseconds. Segments are not range-checked, which
 * is what makes a typed overflow carry: `{ m: 0, s: 75 }` is 1:15.
 */
export function joinParts(p: TimeParts): number {
    return p.h * UNIT_MS.h + p.m * UNIT_MS.m + p.s * UNIT_MS.s + p.ms;
}

/** Segments shown for a value: hours appear at one hour, as `formatMs` does. */
export function visibleUnits(ms: number): TimeUnit[] {
    return ms >= UNIT_MS.h ? ['h', 'm', 's', 'ms'] : ['m', 's', 'ms'];
}

/**
 * Text of one segment: the leading unit is unpadded, the rest are zero-padded
 * to their digit count -- so the segments joined by their separators read
 * exactly as `formatMs`.
 */
export function segmentText(unit: TimeUnit, parts: TimeParts, units: ReadonlyArray<TimeUnit>): string {
    const n = parts[unit];
    return unit === units[0] ? String(n) : String(n).padStart(SEGMENT_DIGITS[unit], '0');
}

/** Separator drawn before `unit`: `.` before the milliseconds, `:` otherwise. */
export function separatorBefore(unit: TimeUnit): string {
    return unit === 'ms' ? '.' : ':';
}

/**
 * One step of `unit` under a modifier: the unit itself, a tenth of it with
 * Shift (never below 1 ms), ten times it with Ctrl / Cmd.
 */
export function stepMs(unit: TimeUnit, mod: StepModifier): number {
    const base = UNIT_MS[unit];
    if (mod === 'fine') return Math.max(1, base / STEP_FACTOR);
    if (mod === 'coarse') return base * STEP_FACTOR;
    return base;
}

/** Read the step modifier off a mouse / keyboard / wheel event. Shift wins. */
export function modifierOf(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): StepModifier {
    if (e.shiftKey) return 'fine';
    if (e.ctrlKey || e.metaKey) return 'coarse';
    return 'normal';
}

/** Clamp into `[min, max]` and round to whole milliseconds. */
export function clampMs(ms: number, min: number, max: number): number {
    return Math.round(Math.min(max, Math.max(min, ms)));
}

/** Step `ms` by one `unit` in `sign` direction under `mod`, clamped. */
export function stepValue(
    ms: number,
    unit: TimeUnit,
    sign: 1 | -1,
    mod: StepModifier,
    min: number,
    max: number,
): number {
    return clampMs(ms + sign * stepMs(unit, mod), min, max);
}

/**
 * Overwrite one segment with the digits typed so far and re-join, so an
 * overflowing segment carries into the next (`75` seconds -> 1:15). The other
 * segments keep their values. Clamped.
 */
export function withSegmentDigits(
    ms: number,
    unit: TimeUnit,
    digits: string,
    min: number,
    max: number,
): number {
    const parts = splitMs(ms);
    parts[unit] = digits === '' ? 0 : Number(digits);
    return clampMs(joinParts(parts), min, max);
}

/** The segment `dir` steps away from `unit` among `units`, stopping at the ends. */
export function neighborUnit(units: ReadonlyArray<TimeUnit>, unit: TimeUnit, dir: 1 | -1): TimeUnit {
    const i = units.indexOf(unit);
    if (i < 0) return units[0];
    return units[Math.max(0, Math.min(units.length - 1, i + dir))];
}

/** Keep `unit` if it is shown, else the nearest shown unit (hours -> minutes). */
export function resolveUnit(units: ReadonlyArray<TimeUnit>, unit: TimeUnit): TimeUnit {
    if (units.includes(unit)) return unit;
    const i = ALL_UNITS.indexOf(unit);
    for (let j = i + 1; j < ALL_UNITS.length; j++) {
        if (units.includes(ALL_UNITS[j])) return ALL_UNITS[j];
    }
    return units[0];
}

/** Horizontal extent of one rendered segment, in the same coordinates as `x`. */
export interface SegmentRect {
    unit: TimeUnit;
    left: number;
    right: number;
}

/**
 * The segment whose centre is nearest to `x` -- what a press on a separator or
 * on the padding selects. Null when there is nothing to pick.
 */
export function segmentAtX(rects: ReadonlyArray<SegmentRect>, x: number): TimeUnit | null {
    let best: TimeUnit | null = null;
    let bestDist = Infinity;
    for (const r of rects) {
        const d = Math.abs((r.left + r.right) / 2 - x);
        if (d < bestDist) {
            bestDist = d;
            best = r.unit;
        }
    }
    return best;
}
