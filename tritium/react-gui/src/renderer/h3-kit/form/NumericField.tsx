/**
 * @file h3-kit/form/NumericField.tsx
 * @description Canonical numeric editor: an optional slider plus a compact
 * numeric input. Sizing comes from `.h3-form-numeric-row` / `.h3-form-slider` /
 * `.h3-form-numeric` (see `styles/_form-kit.css`); no size prop is exposed.
 *
 * @module form/NumericField
 */

import React, { useCallback } from 'react';
import { NumericInput, Slider } from '@blueprintjs/core';

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
    const handleSlider = useCallback((v: number) => onChange(v), [onChange]);
    const handleNumeric = useCallback(
        (_vn: number, vs: string) => {
            const parsed = parseFloat(vs);
            if (!isNaN(parsed)) onChange(parsed);
        },
        [onChange],
    );
    const commit = useCallback(() => onRelease?.(value), [onRelease, value]);

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
            <NumericInput
                small
                value={value}
                onValueChange={handleNumeric}
                min={min}
                max={max}
                stepSize={step}
                minorStepSize={null}
                majorStepSize={null}
                disabled={disabled}
                className="h3-form-numeric"
                fill={false}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                }}
            />
            {unit != null && <span className="h3-form-unit">{unit}</span>}
        </div>
    );
};
