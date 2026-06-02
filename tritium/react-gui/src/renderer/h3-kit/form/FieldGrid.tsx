/**
 * @file h3-kit/form/FieldGrid.tsx
 * @description Aligned label+control layout: a grid whose rows share one
 * label-column width, so every control's left edge lines up (Blender-style
 * property rows). Use this instead of a stack of inline `Field`s when several
 * rows should align into a tidy two-column block.
 *
 * `FieldGrid` is the grid container; each `FieldGridRow` contributes a label
 * cell and a control cell. Rows use `display: contents` so their label/control
 * become direct grid items of the container -- that is what lets the auto
 * label column size to the widest label and stay shared across rows.
 *
 * Like the rest of the catalog these own layout only: sizing/spacing/typography
 * come from `.h3-form-grid*` in `styles/_form-kit.css`. No size props are exposed,
 * and controls (e.g. `DragNumericField`) need not know about the label column.
 *
 * @module form/FieldGrid
 */

import React from 'react';

export interface FieldGridProps {
    /** Layout-only class for positioning the grid within its parent. */
    className?: string;
    children: React.ReactNode;
}

export const FieldGrid: React.FC<FieldGridProps> = ({ className, children }) => (
    <div className={`h3-form-grid${className ? ` ${className}` : ''}`}>{children}</div>
);

export interface FieldGridRowProps {
    /** Label shown in the (right-aligned) label column. */
    label: string;
    children: React.ReactNode;
}

export const FieldGridRow: React.FC<FieldGridRowProps> = ({ label, children }) => (
    <div className="h3-form-grid-row">
        <label className="h3-form-grid-label">{label}</label>
        <div className="h3-form-grid-control">{children}</div>
    </div>
);
