/**
 * @file components/widgets/form/Field.tsx
 * @description Canonical labeled-control row. The single way to lay out a
 * "label + control" pair across the app.
 *
 * The row's height, label typography, label->control gap and vertical padding
 * are owned by `.fk-field-row` / `.fk-field-label` (see `styles/_form-kit.css`,
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
     * Layout-only class for positioning the row within its parent (e.g. a
     * flex child). Must NOT be used to set sizes -- sizing lives in the kit.
     */
    className?: string;
    children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, inline, className, children }) => (
    <div className={`fk-field-row${inline ? ' fk-inline' : ''}${className ? ` ${className}` : ''}`}>
        <label className="fk-field-label">{label}</label>
        <div className="fk-field-control">{children}</div>
    </div>
);
