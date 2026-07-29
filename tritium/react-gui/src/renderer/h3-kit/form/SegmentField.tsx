/**
 * @file h3-kit/form/SegmentField.tsx
 * @description Canonical segmented control (mode / source switcher) for the
 * form-kit catalog. Wraps Blueprint's `SegmentedControl` and locks its segment
 * height + label scale to the catalog button (`.h3-form-btn`): height comes from
 * `--field-btn-h` and font-size from `--fs-base` (see `styles/_form-kit.css`).
 * Callers pick neither the size nor the focus treatment.
 *
 * @module form/SegmentField
 */

import React from 'react';
import { SegmentedControl } from '@blueprintjs/core';

/** One selectable segment. */
export interface SegmentFieldOption<T extends string> {
    label: string;
    value: T;
}

export interface SegmentFieldProps<T extends string> {
    /** Currently selected value. */
    value: T;
    /** Fired with the newly selected value. */
    onValueChange: (value: T) => void;
    /** Ordered segments. */
    options: SegmentFieldOption<T>[];
    /** Stretch to fill the available width (default true). */
    fill?: boolean;
    /** Grey out and ignore clicks, like the other catalog controls. */
    disabled?: boolean;
    className?: string;
}

/**
 * A segmented control fixed to the catalog's canonical compact size. Generic
 * over the value union so `onValueChange` is typed without a cast.
 */
export function SegmentField<T extends string>({
    value,
    onValueChange,
    options,
    fill = true,
    disabled,
    className,
}: SegmentFieldProps<T>): React.JSX.Element {
    // Blueprint disables segments individually, not the control as a whole.
    const opts = disabled ? options.map((o) => ({ ...o, disabled: true })) : options;
    return (
        <SegmentedControl
            small
            fill={fill}
            value={value}
            onValueChange={(v) => onValueChange(v as T)}
            options={opts}
            className={`h3-form-segmented${className ? ` ${className}` : ''}`}
        />
    );
}
