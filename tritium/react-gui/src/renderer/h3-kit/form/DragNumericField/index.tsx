/**
 * @file h3-kit/form/DragNumericField/index.tsx
 * @description Blender-style numeric "number button": a compact field whose
 * body is dragged horizontally to change the value, single-clicked to text-edit,
 * and stepped by always-visible `<` / `>` affordances at the field edges (kept
 * visible, unlike Blender's hover-only arrows, so the field is distinguishable
 * from a plain text box).
 *
 * Drag uses the Pointer Lock API: once a press crosses a small movement
 * threshold the field requests pointer lock, so the OS cursor disappears and
 * `mousemove` keeps delivering `movementX` past the screen edges -- the value
 * can be changed without bound regardless of screen width (the only visual
 * feedback is the field's own number, mirroring Blender). Pointer lock is a
 * progressive enhancement: when `requestPointerLock` is unavailable (e.g. jsdom
 * under test) the same `movementX` accumulation still drives the value.
 *
 * `step` is a SNAP granularity (the value is forced to a multiple of it during
 * a drag), not an increment. Modifiers change the active snap:
 *   - no modifier -> snap to `step`        (normal)
 *   - Shift       -> snap to the fine snap   (default `step / 10`)
 *   - Ctrl / Cmd  -> snap to the coarse snap (default `step * 10`)
 * The fine / coarse snaps default to `step / 10` and `step * 10` but can be set
 * explicitly via `fineSnap` / `coarseSnap` when the desired granularity is not a
 * 10th / 10x of `step` (e.g. step 0.05 with a fine snap of 0.01).
 * The drag sensitivity is derived from the field's own range and width:
 * sweeping across three quarters of the widget takes the value from `min` to
 * `max`. The same gesture therefore spans the same PROPORTION of the range
 * whatever the numbers are, which is what keeps a 0-1 opacity and a 0-100
 * percentage equally controllable -- with a fixed value-per-pixel rate one of
 * them always ends up either impossible to nudge or impossible to sweep. A
 * field with no finite range, or an explicit `pxPerStep`, keeps the fixed
 * `step / pxPerStep` rate instead.
 *
 * Shift is therefore a full precision mode, not only a finer snap: it divides
 * the rate by the same factor, and while it is held the value is shown to the
 * fine snap's precision even on a field that pins `decimals` coarser than
 * that. Snap alone was enough under the old fixed rate, where a pixel moved
 * less than one step; against a range-proportional rate a pixel can cross
 * several fine steps, which left the modifier snapping to values the drag was
 * already flying past. Ctrl / Cmd needs no such treatment -- coarsening
 * multiplies the pixels a step costs, so it shows up on its own.
 *
 * The `<` / `>` arrows, by contrast, increment / decrement by `step`
 * (independent of the drag rate), and auto-repeat while held down (one immediate
 * step, then -- after a short delay -- a steady stream of steps until release).
 * Pressing an arrow while text-editing leaves edit mode and steps relative to
 * the typed draft (or the current value when nothing valid was typed).
 *
 * The widget is focusable as a single unit (`tabIndex=0` on the root); its
 * parts (arrows, edit input) never take a separate focus ring. Keyboard
 * interaction on the focused widget is intentionally not implemented (Blender's
 * number button has no key-input focus); the edit input handles Enter / Escape,
 * plus Up / Down when `resolveStep` opts the field into keyboard stepping.
 *
 * Non-decimal values (`format` / `parse` / `resolveStep`): the display string,
 * the text-edit parser and the step granularity are all overridable, so the same
 * interaction model can drive a non-plain-number field -- e.g. the `TimeField`
 * preset, which shows `M:SS.mmm` and steps the segment under the caret. When
 * `parse` is given the edit input switches from `type="number"` to `type="text"`
 * (a timecode is not a valid number-input value).
 *
 * The step affordance is laid out either at the field's sides (`stepper="sides"`,
 * the default `<` / `>`) or stacked at its right edge (`stepper="stacked"`, an
 * up / down pair -- the spin-button shape used by time and other unit-segmented
 * values).
 *
 * Sizing/spacing/colors come entirely from `.h3-form-drag*` in `styles/_form-kit.css`
 * (driven by the `--field-*` / `--space-*` / color tokens); no size prop is
 * exposed. The widget is controlled: the displayed value is always the `value`
 * prop, so a parent must update it from `onChange`.
 *
 * When both `min` and `max` are finite (and `max > min`), the value's fraction
 * of the range is painted as a translucent-accent fill bar behind the text
 * (Blender number-button slider look), so the value's position is visible at a
 * glance. The bar is hidden while text-editing.
 *
 * Commit timing mirrors NumericField: `onChange` fires continuously (every drag
 * frame, every step tick during an arrow press, on text commit) for a live
 * draft; `onRelease` fires once at the end of an interaction (drag end, arrow
 * press release, Enter/blur) so the parent can push a single undo step. An
 * entire arrow press -- including a long auto-repeat hold -- is one interaction
 * and therefore one undo step, exactly like a drag.
 *
 * Both a drag and an arrow press drive the same lifecycle, so the realtime hooks
 * below cover holds as well as drags.
 *
 * Abandoning an interaction (Esc mid-drag, or unmount mid-interaction) emits
 * `onDragCancel` instead of `onRelease`, in either mode. With `realtime` the
 * receiver has a live preview to roll back; without it there is only a draft
 * to drop, which is why Esc must not fall through to a commit -- it would
 * write the value it was asked to discard.
 *
 * Realtime mode (`realtime`): for props that benefit from live object feedback,
 * the field also emits `onDragStart` when a drag / arrow press begins. This
 * lets a parent run a preview-while-interacting / single-commit-on-release
 * lifecycle (apply the value to the object every `onChange` without undo, then
 * commit one undo step on `onRelease`, or roll back on `onDragCancel`). Without
 * `realtime` (the default), no live preview fires: a hold only updates the
 * displayed number and the object is written once on `onRelease`.
 *
 * Keyboard field-to-field entry (opt-in): a parent that lays several fields out
 * in a column can wire `onCommitNext` / `onCommitPrev` to advance focus on
 * commit -- Enter and Tab call `onCommitNext`, Shift+Tab calls `onCommitPrev`
 * (each after committing the edit). Combined with the imperative `focusEdit()`
 * handle (exposed via ref), the next field can be put straight into edit mode
 * with its value selected, so x/y/z-style triples can be typed in sequence
 * without reaching for the mouse. All three are no-ops when unset.
 *
 * The interaction lives in three hooks beside this file -- `useDragValue`
 * (body drag), `useStepRepeat` (arrow auto-repeat) and `useNumericEdit` (text
 * entry and keyboard stepping) -- over the shared mode / draft / refs declared
 * in `types.ts`. This file owns that shared core and the render.
 *
 * @module form/DragNumericField
 */

import React, {
    forwardRef,
    useCallback,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { AppIcon } from '../../primitives';
import { decimalsOf } from '../numericMath';
import { SNAP_FACTOR } from './dragMath';
import { useDragValue } from './useDragValue';
import { useNumericEdit } from './useNumericEdit';
import { useStepRepeat } from './useStepRepeat';
import type {
    DragCallbacks,
    DragNumericFieldHandle,
    DragNumericFieldProps,
    FieldCore,
    Mode,
} from './types';

export type { DragNumericFieldHandle, DragNumericFieldProps } from './types';

void React; // classic JSX runtime (vitest)

/**
 * Blender-style draggable numeric field. See the file header for the drag /
 * click / step interaction model and commit timing.
 *
 * This component owns the state the three gestures share -- the mode, the
 * draft, and the refs the document-level listeners read -- and hands it to
 * `useDragValue`, `useStepRepeat` and `useNumericEdit`, each of which keeps its
 * own bookkeeping private. What is left here is that shared core plus the
 * render.
 */
export const DragNumericField = forwardRef<DragNumericFieldHandle, DragNumericFieldProps>(({
    value,
    onChange,
    onRelease,
    min = -Infinity,
    max = Infinity,
    step = 1,
    pxPerStep,
    fineSnap,
    coarseSnap,
    decimals,
    unit,
    disabled,
    realtime = false,
    onDragStart,
    onDragCancel,
    onCommitNext,
    onCommitPrev,
    format: formatProp,
    parse,
    stepper = 'sides',
    resolveStep,
    'aria-label': ariaLabel,
    title,
    className,
}, ref) => {
    const [mode, setMode] = useState<Mode>('idle');
    const [draft, setDraft] = useState('');
    // True while the precision modifier is held during a drag. Only the
    // display reads it: a field that pins `decimals` coarser than its fine
    // snap would otherwise round away every value Shift can reach, so the
    // modifier would slow the drag down to no visible effect.
    const [fineDrag, setFineDrag] = useState(false);

    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Finest resolution the value can take (the Shift snap); drives both
    // storage quantization and the default display precision. The coarse snap
    // (Ctrl / Cmd) is the largest. Both default to a 10th / 10x of `step`.
    const fineStep = fineSnap ?? step / SNAP_FACTOR;
    const coarseStep = coarseSnap ?? step * SNAP_FACTOR;
    const dispDecimals =
        fineDrag ? decimalsOf(fineStep) : (decimals ?? decimalsOf(fineStep));
    const format = useCallback(
        (v: number) => (formatProp ? formatProp(v) : v.toFixed(dispDecimals)),
        [formatProp, dispDecimals],
    );

    /** Read a typed draft, or null when it is empty / malformed. */
    const parseDraft = useCallback(
        (text: string): number | null => {
            if (parse) return parse(text);
            const n = Number(text);
            return text.trim() !== '' && Number.isFinite(n) ? n : null;
        },
        [parse],
    );

    // The global mousemove closure must see the latest committed value (for the
    // onRelease commit) without re-subscribing the listener.
    const valueRef = useRef(value);
    valueRef.current = value;

    // The global mouseup closure reads the formatter through a ref so that a
    // changing `format` (e.g. when the active unit's decimal places change)
    // does NOT recreate the mouseup handler. If it did, the reference-stable
    // teardown would keep removing a stale handler and leak the document
    // mouseup listener -- a later stray mouseup would then re-enter edit mode
    // and swallow clicks meant for other widgets.
    const formatRef = useRef(format);
    formatRef.current = format;

    // Stable ref to the props the global listeners use, so the listeners
    // attached once at mousedown always reach current behavior.
    const cbRef = useRef<DragCallbacks>({
        onChange, onRelease, min, max, step, pxPerStep, fineStep, coarseStep,
        realtime, onDragStart, onDragCancel,
    });
    cbRef.current = {
        onChange, onRelease, min, max, step, pxPerStep, fineStep, coarseStep,
        realtime, onDragStart, onDragCancel,
    };

    const core: FieldCore = {
        mode, setMode, draft, setDraft,
        rootRef, inputRef, valueRef, formatRef, cbRef,
        parseDraft, format, disabled, min, max, fineStep,
    };

    const { onMouseDown } = useDragValue(core, value, {
        onFineDragChange: setFineDrag,
    });
    const { onStepButtonDown, isPressing } = useStepRepeat(core, { resolveStep });
    const { commitEdit, onEditKeyDown, endKeyStep } = useNumericEdit(core, {
        step, onChange, onRelease, onCommitNext, onCommitPrev, resolveStep, isPressing,
    });

    // Imperative handle: a parent can drop a sibling field straight into edit
    // mode (value selected) to chain x/y/z-style entry. See the file header.
    useImperativeHandle(
        ref,
        () => ({
            focusEdit: () => {
                if (disabled) return;
                setDraft(format(valueRef.current));
                setMode('editing');
            },
        }),
        [disabled, format],
    );

    // --- Render ---
    const rootClass = [
        'h3-form-drag',
        mode === 'dragging' && 'h3-form-drag-active',
        mode === 'editing' && 'h3-form-drag-editing',
        disabled && 'h3-form-drag-disabled',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    // Value-fill fraction (0-100), or null when the range is not finite so no
    // meaningful position can be shown. Hidden while text-editing.
    const fillPct =
        Number.isFinite(min) && Number.isFinite(max) && max > min
            ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
            : null;

    const stacked = stepper === 'stacked';

    /** One step affordance; `stacked` only changes the glyph and its class. */
    const stepButton = (sign: 1 | -1) => (
        <button
            type="button"
            className={
                stacked
                    ? `h3-form-drag-spin h3-form-drag-spin-${sign > 0 ? 'up' : 'down'}`
                    : `h3-form-drag-arrow h3-form-drag-arrow-${sign > 0 ? 'right' : 'left'}`
            }
            tabIndex={-1}
            disabled={disabled || (sign > 0 ? value >= max : value <= min)}
            aria-label={sign > 0 ? 'Increment' : 'Decrement'}
            onMouseDown={(e) => onStepButtonDown(e, sign)}
        >
            <AppIcon
                name={
                    stacked
                        ? sign > 0
                            ? 'ui.caretUp'
                            : 'ui.caretDown'
                        : sign > 0
                          ? 'ui.caretRight'
                          : 'ui.caretLeft'
                }
                size={10}
                aria-hidden
            />
        </button>
    );

    return (
        <div
            ref={rootRef}
            className={rootClass}
            tabIndex={disabled ? -1 : 0}
            aria-label={ariaLabel}
            title={title}
            onMouseDown={onMouseDown}
            onMouseEnter={() => mode === 'idle' && setMode('hover')}
            onMouseLeave={() => mode === 'hover' && setMode('idle')}
        >
            {fillPct !== null && mode !== 'editing' && (
                <div
                    className="h3-form-drag-fill"
                    style={{ width: `${fillPct}%` }}
                    aria-hidden="true"
                />
            )}
            {!stacked && stepButton(-1)}

            {mode === 'editing' ? (
                <input
                    ref={inputRef}
                    type={parse ? 'text' : 'number'}
                    inputMode="numeric"
                    className="h3-form-drag-input"
                    value={draft}
                    step={parse ? undefined : fineStep}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onEditKeyDown}
                    onKeyUp={endKeyStep}
                    onBlur={commitEdit}
                />
            ) : (
                <span className="h3-form-drag-value">
                    {format(value)}
                    {unit != null && <span className="h3-form-drag-unit">{unit}</span>}
                </span>
            )}

            {stacked ? (
                <div className="h3-form-drag-spinner">
                    {stepButton(1)}
                    {stepButton(-1)}
                </div>
            ) : (
                stepButton(1)
            )}
        </div>
    );
});

DragNumericField.displayName = 'DragNumericField';
