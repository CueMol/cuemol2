/**
 * @file h3-kit/form/RadioField.tsx
 * @description Canonical radio group: pick exactly one of a small set of named
 * alternatives. Wraps Blueprint's `RadioGroup` and locks its label scale and
 * option spacing to the form-kit (see `styles/_form-kit.css`); callers pick
 * neither the size nor the layout.
 *
 * Choosing between this and {@link SegmentField}: both express "one of N", but
 * a segmented control is a *view* switcher (it reads as a tab strip, so it
 * belongs at the top of a pane), while a radio group is a *setting* whose
 * options are read as a list. Inside a settings section, use this one -- a
 * segmented control there looks like a second row of tabs. A boolean that is
 * genuinely on/off is a `SwitchField`, not a two-option radio group.
 *
 * The options lay out in a row and wrap to further rows on their own when the
 * pane is too narrow, so no caller has to choose an orientation.
 *
 * @module form/RadioField
 */

import React from 'react';
import { RadioGroup } from '@blueprintjs/core';

/** One selectable option. */
export interface RadioFieldOption<T extends string> {
    label: string;
    value: T;
}

export interface RadioFieldProps<T extends string> {
    /** Currently selected value. */
    value: T;
    /** Fired with the newly selected value. */
    onValueChange: (value: T) => void;
    /** Ordered options. */
    options: RadioFieldOption<T>[];
    /** Grey out and ignore clicks, like the other catalog controls. */
    disabled?: boolean;
    className?: string;
}

/**
 * A radio group fixed to the catalog's canonical size. Generic over the value
 * union so `onValueChange` is typed without a cast.
 */
export function RadioField<T extends string>({
    value,
    onValueChange,
    options,
    disabled,
    className,
}: RadioFieldProps<T>): React.JSX.Element {
    return (
        <RadioGroup
            selectedValue={value}
            onChange={(e) => onValueChange((e.currentTarget as HTMLInputElement).value as T)}
            options={options}
            disabled={disabled}
            className={`h3-form-radio-group${className ? ` ${className}` : ''}`}
        />
    );
}
