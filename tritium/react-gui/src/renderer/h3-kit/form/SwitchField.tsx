/**
 * @file h3-kit/form/SwitchField.tsx
 * @description Canonical boolean toggle. Use inside an inline `Field` so the
 * Field supplies the label. Styling comes from `.h3-form-switch`.
 *
 * @module form/SwitchField
 */

import React from 'react';
import { Switch } from '@blueprintjs/core';

export interface SwitchFieldProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}

export const SwitchField: React.FC<SwitchFieldProps> = ({ checked, onChange, disabled }) => (
    <Switch
        className="h3-form-switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
    />
);
