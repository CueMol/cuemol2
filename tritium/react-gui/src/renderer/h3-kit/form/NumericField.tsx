/**
 * @file h3-kit/form/NumericField.tsx
 * @description Canonical numeric editor: an optional slider plus a compact
 * numeric input. Sizing comes from `.h3-form-numeric-row` / `.h3-form-slider` /
 * `.h3-form-numeric` (see `styles/_form-kit.css`); no size prop is exposed.
 *
 * The numeric input is a bare `<input type="number">`, not Blueprint's
 * `NumericInput`: Blueprint's component is fully controlled by `props.value`
 * whenever it is non-null, so it always redisplays `value.toString()` and
 * ignores whatever the user just typed unless the parent's `value` changes in
 * lockstep. Since `onChange` here only fires for a parseable number, clearing
 * the field (or typing a transient state like "-" or "1.") produced no
 * `onChange`, so `value` never moved and the field snapped back to the old
 * digit(s) on every keystroke -- making it impossible to clear and retype.
 * `editText` tracks the user's literal keystrokes while editing so the field
 * can go empty; the display falls back to `value` once editing ends. Mirrors
 * the same fix already applied to `SliderField` / `RejectNumberInput` /
 * `NumberCell`.
 *
 * @module form/NumericField
 */

import React, { useCallback, useState } from 'react';
import { Slider } from '@blueprintjs/core';

export interface NumericFieldProps {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    /** Show the slider alongside the numeric input (default true). */
    slider?: boolean;
    /** Optional unit suffix shown after the numeric input (e.g. "Å", "%"). */
    unit?: string;
    disabled?: boolean;
    /**
     * Fired when an interaction commits a value: slider release, numeric-input
     * blur, or Enter. Use this (rather than `onChange`) to push a single undo
     * step instead of one per drag frame. `onChange` still fires continuously
     * so a parent draft can track the value live.
     */
    onRelease?: (value: number) => void;
}

export const NumericField: React.FC<NumericFieldProps> = ({
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    slider = true,
    unit,
    disabled,
    onRelease,
}) => {
    // Raw text held while the user is editing the numeric input. When null,
    // the input mirrors `value`. When non-null, the user is mid-edit and we
    // show their literal keystrokes -- this is what lets an empty field stay
    // empty instead of snapping back to the last committed value.
    const [editText, setEditText] = useState<string | null>(null);

    const handleSlider = useCallback((v: number) => onChange(v), [onChange]);

    const handleNumericChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const text = e.target.value;
            setEditText(text);
            const parsed = parseFloat(text);
            if (!isNaN(parsed)) onChange(parsed);
        },
        [onChange],
    );

    // Commit reads `value` (not `editText`): every parseable keystroke already
    // pushed itself through `onChange` above, so by the time blur/Enter fires
    // the prop already carries the latest valid number. An edit that was never
    // parseable (left empty, or stuck on "-" / "1.") simply reverts the
    // display -- `value` itself never moved, so there is nothing to commit.
    const commit = useCallback(() => {
        setEditText(null);
        onRelease?.(value);
    }, [onRelease, value]);

    return (
        <div className="h3-form-numeric-row">
            {slider && (
                <Slider
                    min={min}
                    max={max}
                    stepSize={step}
                    value={value}
                    onChange={handleSlider}
                    onRelease={onRelease}
                    labelRenderer={false}
                    disabled={disabled}
                    className="h3-form-slider"
                />
            )}
            <input
                type="number"
                className="h3-form-numeric"
                min={min}
                max={max}
                step={step}
                value={editText ?? String(value)}
                disabled={disabled}
                onChange={handleNumericChange}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                }}
            />
            {unit != null && <span className="h3-form-unit">{unit}</span>}
        </div>
    );
};
