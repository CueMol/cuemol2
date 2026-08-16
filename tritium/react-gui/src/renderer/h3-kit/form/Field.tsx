/**
 * @file h3-kit/form/Field.tsx
 * @description Canonical labeled-control row. The single way to lay out a
 * "label + control" pair across the app.
 *
 * The row's height, label typography, label->control gap and vertical padding
 * are owned by `.h3-form-field-row` / `.h3-form-field-label` (see `styles/_form-kit.css`,
 * driven by the `--field-*` tokens). This component exposes NO size props on
 * purpose: callers pick a semantic role (a Field), never a size. Pair it with
 * a form-kit control (`TextField` / `SelectField` / ...).
 *
 * @module form/Field
 */

import React from 'react';

export interface FieldProps {
    /** Label shown above (stack) or beside (inline) the control. */
    label: string;
    /** Render label and control on one line (e.g. for a SwitchField). */
    inline?: boolean;
    /**
     * Inline rows only: put the control first and pack the pair to the start,
     * so the row reads `[switch] Label ......` instead of the default
     * `Label ...... [switch]`. Use it for a switch that reads as a
     * checkbox-style opt-in for the control below it (the dialogs' "Use
     * selection" toggle), where the default split would strand the switch on
     * the far side of the dialog.
     */
    controlFirst?: boolean;
    /**
     * Layout-only class for positioning the row within its parent (e.g. a
     * flex child). Must NOT be used to set sizes -- sizing lives in the kit.
     */
    className?: string;
    children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({
    label,
    inline,
    controlFirst,
    className,
    children,
}) => {
    const labelNode = <label className="h3-form-field-label">{label}</label>;
    const controlNode = <div className="h3-form-field-control">{children}</div>;
    const rowClass =
        'h3-form-field-row'
        + (inline ? ' h3-form-inline' : '')
        + (inline && controlFirst ? ' h3-form-control-first' : '')
        + (className ? ` ${className}` : '');
    return (
        <div className={rowClass}>
            {inline && controlFirst ? (
                <>
                    {controlNode}
                    {labelNode}
                </>
            ) : (
                <>
                    {labelNode}
                    {controlNode}
                </>
            )}
        </div>
    );
};
