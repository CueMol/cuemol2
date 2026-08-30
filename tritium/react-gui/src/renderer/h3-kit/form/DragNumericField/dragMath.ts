/**
 * @file h3-kit/form/DragNumericField/dragMath.ts
 * @description Interaction constants and the two pure functions the drag field
 * needs before it has any state: how far a pixel of travel moves the value, and
 * where the caret is sitting in a partially-selected draft.
 *
 * Kept out of the hooks so both can be reasoned about (and tested) without a
 * React tree.
 */

/** Pixels of horizontal travel before a press becomes a drag (vs a click). */
export const DRAG_THRESHOLD_PX = 4;
/**
 * Pixels of horizontal travel that move the raw value by one normal `step`,
 * for a field whose range cannot be swept (see `dragValuePerPx`). Settable
 * per-field via the `pxPerStep` prop (smaller = more sensitive; e.g. 1
 * reproduces the UXP fakedial wheel's 1 unit / pixel).
 */
export const PX_PER_STEP = 8;
/**
 * Fraction of the field's width a drag crosses to span its whole range. Less
 * than 1 so the sweep is comfortably inside the widget rather than needing the
 * full width exactly.
 */
export const RANGE_DRAG_FRACTION = 0.75;

/**
 * Value units per pixel of horizontal drag.
 *
 * A field with a finite range maps that range onto a fraction of its own
 * width, so the gesture is proportional to the range rather than to the
 * numbers in it. Falls back to the fixed `step / pxPerStep` rate when there is
 * no range to map (an unbounded field) or no width to map it onto (before
 * layout, and under jsdom). An explicit `pxPerStep` opts out: the caller has
 * said what the rate should be.
 */
export function dragValuePerPx(
    min: number,
    max: number,
    step: number,
    pxPerStep: number | undefined,
    widthPx: number,
): number {
    if (pxPerStep === undefined) {
        const range = max - min;
        const travel = widthPx * RANGE_DRAG_FRACTION;
        if (Number.isFinite(range) && range > 0 && travel > 0) return range / travel;
    }
    return step / (pxPerStep ?? PX_PER_STEP);
}
/** Factor between the normal snap and the fine (Shift) / coarse (Ctrl) snaps. */
export const SNAP_FACTOR = 10;
/** Delay before a held arrow starts auto-repeating (after the first step). */
export const STEP_REPEAT_DELAY_MS = 400;
/** Interval between auto-repeat steps while an arrow is held. */
export const STEP_REPEAT_INTERVAL_MS = 60;
/**
 * Caret offset inside the edit input, or null when the whole draft is selected
 * (click-to-edit selects everything, so there is no segment to act on).
 */
export function caretPosOf(input: HTMLInputElement | null, draft: string): number | null {
    if (!input) return null;
    const start = input.selectionStart;
    if (start === null) return null;
    if (start === 0 && input.selectionEnd === draft.length) return null;
    return start;
}
