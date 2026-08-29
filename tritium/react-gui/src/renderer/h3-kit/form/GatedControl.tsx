/**
 * @file h3-kit/form/GatedControl.tsx
 * @description A checkbox that turns a control on and off, both sharing one
 * field row: `Label [x] [ control ]`.
 *
 * Use it for a property whose "off" state is a value rather than a separate
 * flag -- a C++ property where a negative number means "not set", say. The
 * checkbox and the control edit the SAME property, so they belong in one row:
 * the row then carries a single modified bar and a single reset, and the pair
 * cannot drift apart visually.
 *
 * Pick the plain `CheckboxField` in its own inline `Field` instead when the
 * toggle gates a whole block below it (the dialogs' "Use selection"); this one
 * is for a single value on a single line.
 *
 * Layout comes from `.h3-form-gated-control` in `styles/_form-kit.css`; no size
 * props are exposed.
 *
 * @module form/GatedControl
 */

import React from 'react';
import { CheckboxField } from './CheckboxField';

export interface GatedControlProps {
    /** Whether the value is set (the control is live). */
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    /** Disables the checkbox as well as leaving the control to its own prop. */
    disabled?: boolean;
    /**
     * Accessible name for the checkbox. The row label names the value, so the
     * box needs its own name to say what ticking it does.
     */
    ariaLabel: string;
    /** The control the checkbox gates; stretches to fill the rest of the row. */
    children: React.ReactNode;
}

export const GatedControl: React.FC<GatedControlProps> = ({
    checked,
    onCheckedChange,
    disabled,
    ariaLabel,
    children,
}) => (
    <div className="h3-form-gated-control">
        <CheckboxField
            checked={checked}
            onChange={onCheckedChange}
            disabled={disabled}
            ariaLabel={ariaLabel}
        />
        {children}
    </div>
);
