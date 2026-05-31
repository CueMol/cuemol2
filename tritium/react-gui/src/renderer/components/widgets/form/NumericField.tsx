/**
 * @file components/widgets/form/NumericField.tsx
 * @description Canonical numeric editor: an optional slider plus a compact
 * numeric input. Sizing comes from `.fk-numeric-row` / `.fk-slider` /
 * `.fk-numeric` (see `styles/_form-kit.css`); no size prop is exposed.
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
}) => {
    const handleSlider = useCallback((v: number) => onChange(v), [onChange]);
    const handleNumeric = useCallback(
        (_vn: number, vs: string) => {
            const parsed = parseFloat(vs);
            if (!isNaN(parsed)) onChange(parsed);
        },
        [onChange],
    );

    return (
        <div className="fk-numeric-row">
            {slider && (
                <Slider
                    min={min}
                    max={max}
                    stepSize={step}
                    value={value}
                    onChange={handleSlider}
                    labelRenderer={false}
                    disabled={disabled}
                    className="fk-slider"
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
                disabled={disabled}
                className="fk-numeric"
                fill={false}
            />
            {unit != null && <span className="fk-unit">{unit}</span>}
        </div>
    );
};
