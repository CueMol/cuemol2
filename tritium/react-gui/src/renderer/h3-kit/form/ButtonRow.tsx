/**
 * @file h3-kit/form/ButtonRow.tsx
 * @description Canonical compact form button (`FormButton`) and a wrapping row
 * (`ButtonRow`). Button height comes from `.h3-form-btn`; the row gap from
 * `.h3-form-btn-row` (see `styles/_form-kit.css`).
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
    <div className={`h3-form-btn-row${className ? ` ${className}` : ''}`}>{children}</div>
);

/**
 * A Blueprint Button locked to the canonical compact form height. Pass through
 * any Button prop (text, icon, onClick, disabled, intent, ...); the size is
 * fixed by `.h3-form-btn` and cannot be overridden by the caller.
 */
export const FormButton: React.FC<ButtonProps> = ({ className, ...rest }) => (
    <Button small className={`h3-form-btn${className ? ` ${className}` : ''}`} {...rest} />
);
