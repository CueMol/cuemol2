/**
 * @file components/widgets/form/SelectField.tsx
 * @description Canonical dropdown. Height/caret come from `.fk-select`
 * (see `styles/_form-kit.css`); no size prop is exposed. Pass `<option>` /
 * `<optgroup>` children, mirroring Blueprint `HTMLSelect`.
 *
 * @module form/SelectField
 */

import React from 'react';
import { HTMLSelect } from '@blueprintjs/core';

export interface SelectFieldProps {
    value: string | number | undefined;
    onChange: (value: string) => void;
    disabled?: boolean;
    fill?: boolean;
    'aria-label'?: string;
    children: React.ReactNode;
}

export const SelectField: React.FC<SelectFieldProps> = ({
    value,
    onChange,
    disabled,
    fill = true,
    children,
    ...rest
}) => (
    <HTMLSelect
        className="fk-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        fill={fill}
        aria-label={rest['aria-label']}
    >
        {children}
    </HTMLSelect>
);
