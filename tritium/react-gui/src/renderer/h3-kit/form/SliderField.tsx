/**
 * @file h3-kit/form/SliderField.tsx
 * @description Canonical "label + Blueprint Slider + numeric input + custom
 * stepper" row, with an optional unit suffix and a stored<->shown `scale`
 * transform. This is the form-kit home for what used to be the standalone
 * `h3-kit/SliderNumericField` (now a thin back-compat re-export of this).
 *
 * Sizing/spacing/colors come entirely from `.h3-form-sliderfield*` in
 * `styles/_form-kit.css` (driven by the `--field-*` / color tokens); no size
 * prop is exposed, matching every other catalog control.
 *
 * Commit timing:
 *   - Slider: commit on release (`onCommit` via `onRelease`); drag updates the
 *     local draft only (live preview without an undo step per frame).
 *   - Numeric input typing: commit on blur or Enter; mid-typing stays local.
 *   - Stepper buttons: commit immediately on click. The native browser steppers
 *     on `<input type="number">` are hidden via CSS so we own the click event
 *     and apply step-precision rounding (avoiding IEEE-754 drift like
 *     `0.2 + 0.1 = 0.30000000000000004`).
 *
 * Validation: typed / slider / stepper values are CLAMPED into `[min, max]`
 * (via `clampAndQuantize`). This is distinct from the reject-and-revert
 * semantics of `RejectNumberInput`; pick the slider field when clamping is the
 * desired behaviour (e.g. the coloring panel's Rainbow Start/End/Bri/Sat).
 *
 * Empty-field guard: while the numeric input is being edited it shows the user's
 * literal keystrokes (`editText`), so momentarily clearing the field does NOT
 * snap the value to 0 -- blurring an empty field reverts to the current value
 * instead of committing 0.
 *
 * @module form/SliderField
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Slider } from '@blueprintjs/core';
import { AppIcon } from '../../components/AppIcon';
import { clampAndQuantize, quantize } from './numericMath';

void React; // classic JSX runtime (vitest)

export interface SliderFieldProps {
    /** Label text shown to the left of the slider. */
    label: string;
    /** Stored value (post-`scale` division). */
    value: number;
    min: number;
    max: number;
    /** Slider / spinbox step. Defaults to 1. */
    step?: number;
    /**
     * Optional unit suffix (e.g. "deg", "%"). When omitted the suffix span is
     * not rendered, so consumers wanting raw numbers get no empty right gutter.
     */
    unit?: string;
    /**
     * Ratio between the displayed value and the stored value
     * (`displayed = stored * scale`). Defaults to 1. Use 100 when the widget
     * should show e.g. 0-100 % but the underlying property is stored as 0-1.
     */
    scale?: number;
    onCommit: (next: number) => void;
    disabled?: boolean;
    /** Extra class applied to the outer row (layout only -- never sizing). */
    className?: string;
}

/**
 * Slider + numeric input + custom stepper row. Commits the STORED value via
 * `onCommit(storedValue)` (post-`scale` division). See the file header for the
 * commit-timing model, clamp validation and the empty-field guard.
 */
export const SliderField: React.FC<SliderFieldProps> = ({
    label,
    value,
    min,
    max,
    step = 1,
    unit,
    scale = 1,
    onCommit,
    disabled,
    className,
}) => {
    const shown = value * scale;
    const [draft, setDraft] = useState<number>(shown);
    useEffect(() => setDraft(shown), [shown]);

    // Raw text held while the user is editing the numeric input. When null, the
    // input mirrors `draft` (step-quantized) so it follows the slider / stepper
    // / external value. When non-null, the user is mid-edit and we show their
    // literal keystrokes -- this is what lets an empty field stay empty instead
    // of snapping to 0.
    const [editText, setEditText] = useState<string | null>(null);

    // Format a value to the precision implied by `step`, stripping IEEE-754
    // noise (e.g. 0.30000000000000004 -> "0.3").
    const formatNum = useCallback((n: number) => String(quantize(n, step)), [step]);

    const commit = useCallback(
        (next: number) => {
            const stored = next / scale;
            if (stored !== value) onCommit(stored);
        },
        [scale, value, onCommit],
    );

    // --- Slider handlers ---
    // Blueprint `Slider`'s `onChange` fires continuously while dragging;
    // `onRelease` fires when the user lets go. Drive the live preview off
    // `onChange`, commit on `onRelease`. Quantize the raw slider value so the
    // input display stays step-aligned.
    const handleSliderChange = useCallback(
        (v: number) => {
            setDraft(quantize(v, step));
            setEditText(null);
        },
        [step],
    );
    const handleSliderRelease = useCallback(
        (v: number) => {
            commit(quantize(v, step));
        },
        [commit, step],
    );

    // --- Numeric input handlers (typing path) ---
    // Mid-typing stays local as a raw string; commit on blur / Enter.
    const handleNumericChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setEditText(e.target.value);
        },
        [],
    );
    const handleNumericBlur = useCallback(() => {
        if (editText !== null) {
            const parsed = Number(editText);
            if (editText.trim() !== '' && Number.isFinite(parsed)) {
                const next = clampAndQuantize(parsed, min, max, step);
                setDraft(next);
                commit(next);
            }
            setEditText(null);
        }
    }, [editText, min, max, step, commit]);
    const handleNumericKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') e.currentTarget.blur();
        },
        [],
    );

    // --- Stepper handlers ---
    // Custom +/- buttons (native HTML steppers are hidden via CSS). Each click
    // both updates the draft (so the slider follows along) and commits
    // immediately, step-aligned to avoid float drift.
    const stepBy = useCallback(
        (sign: 1 | -1) => {
            const next = clampAndQuantize(draft + sign * step, min, max, step);
            if (next === draft) return;
            setDraft(next);
            setEditText(null);
            commit(next);
        },
        [draft, step, min, max, commit],
    );
    const handleStepUp = useCallback(() => {
        stepBy(1);
    }, [stepBy]);
    const handleStepDown = useCallback(() => {
        stepBy(-1);
    }, [stepBy]);

    return (
        <div className={`h3-form-sliderfield-row ${className ?? ''}`}>
            <label className="h3-form-sliderfield-label">{label}</label>
            <Slider
                min={min}
                max={max}
                stepSize={step}
                value={draft}
                onChange={handleSliderChange}
                onRelease={handleSliderRelease}
                disabled={disabled}
                labelRenderer={false}
                className="h3-form-sliderfield-slider"
            />
            <input
                type="number"
                className="h3-form-sliderfield-number"
                min={min}
                max={max}
                step={step}
                value={editText ?? formatNum(draft)}
                disabled={disabled}
                onChange={handleNumericChange}
                onBlur={handleNumericBlur}
                onKeyDown={handleNumericKeyDown}
            />
            <div className="h3-form-sliderfield-stepper">
                <button
                    type="button"
                    className="h3-form-sliderfield-stepper-btn"
                    disabled={disabled || draft >= max}
                    onClick={handleStepUp}
                    aria-label="Increment"
                    tabIndex={-1}
                >
                    <AppIcon name="ui.caretUp" size={10} aria-hidden />
                </button>
                <button
                    type="button"
                    className="h3-form-sliderfield-stepper-btn"
                    disabled={disabled || draft <= min}
                    onClick={handleStepDown}
                    aria-label="Decrement"
                    tabIndex={-1}
                >
                    <AppIcon name="ui.caretDown" size={10} aria-hidden />
                </button>
            </div>
            {unit && <span className="h3-form-sliderfield-unit">{unit}</span>}
        </div>
    );
};
