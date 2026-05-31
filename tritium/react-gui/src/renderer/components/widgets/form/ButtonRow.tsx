/**
 * @file components/widgets/form/ButtonRow.tsx
 * @description Canonical compact form button (`FormButton`) and a wrapping row
 * (`ButtonRow`). Button height comes from `.fk-btn`; the row gap from
 * `.fk-btn-row` (see `styles/_form-kit.css`).
 *
 * @module form/ButtonRow
 */

import React from 'react';
import { Button, type ButtonProps } from '@blueprintjs/core';

export interface ButtonRowProps {
    className?: string;
    children: React.ReactNode;
}

/** A flex row of form buttons with the canonical gap. */
export const ButtonRow: React.FC<ButtonRowProps> = ({ className, children }) => (
    <div className={`fk-btn-row${className ? ` ${className}` : ''}`}>{children}</div>
);

/**
 * A Blueprint Button locked to the canonical compact form height. Pass through
 * any Button prop (text, icon, onClick, disabled, intent, ...); the size is
 * fixed by `.fk-btn` and cannot be overridden by the caller.
 */
export const FormButton: React.FC<ButtonProps> = ({ className, ...rest }) => (
    <Button small className={`fk-btn${className ? ` ${className}` : ''}`} {...rest} />
);
