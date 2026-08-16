/**
 * @file h3-kit/form/CheckboxField.tsx
 * @description Canonical opt-in toggle. Use it inside an inline `Field` with
 * `controlFirst` so the row reads `[x] Label ......`, i.e. the box leads and
 * the label names what turning it on enables.
 *
 * Pick this over `SwitchField` when the toggle GATES the controls that follow
 * it (the dialogs' "Use selection", which enables the selection list below).
 * `SwitchField` stays the choice for a boolean that is a value in its own
 * right (Visible / Locked), where the row reads `Label ...... [switch]`.
 *
 * Styling comes from `.bp5-control.bp5-checkbox` in `styles/_form-kit.css`;
 * no size props are exposed.
 *
 * @module form/CheckboxField
 */

import React from 'react';
import { Checkbox } from '@blueprintjs/core';

export interface CheckboxFieldProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}

export const CheckboxField: React.FC<CheckboxFieldProps> = ({
    checked,
    onChange,
    disabled,
}) => (
    <Checkbox
        className="h3-form-checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
    />
);
