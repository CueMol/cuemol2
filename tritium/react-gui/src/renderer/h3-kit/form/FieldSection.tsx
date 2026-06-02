/**
 * @file h3-kit/form/FieldSection.tsx
 * @description A top-level labelled group inside a pane's content -- the
 * canonical way to express the *highest* label hierarchy level (e.g.
 * "Molecule", "Selection", "Term", "Modify"). The title renders at the
 * `.type-group-label` role; the title->content gap and the spacing between
 * sibling sections are owned by `.h3-form-field-section` (see `styles/_form-kit.css`).
 *
 * Use `FieldSection` for top-level groups and `Field` for the (lower-level)
 * label+control rows *inside* a section. Callers never restyle the title or
 * choose section spacing -- that is what keeps hierarchy consistent without
 * per-pane tuning. The control(s) can be a single widget or several rows.
 *
 * Unlike `FieldGroup` (whose `SectionHeader` title is a tinted header *bar*
 * with a bottom rule), `FieldSection`'s title is a lightweight inline heading
 * that blends with the surface.
 *
 * @module form/FieldSection
 */

import React from 'react';

export interface FieldSectionProps {
    /** Group heading (rendered at the group-label role). Omit for an unlabelled group. */
    title?: string;
    /** Trailing actions aligned to the right of the title (e.g. a hit-count badge). */
    titleActions?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}

export const FieldSection: React.FC<FieldSectionProps> = ({
    title,
    titleActions,
    className,
    children,
}) => (
    <div className={`h3-form-field-section${className ? ` ${className}` : ''}`}>
        {(title != null || titleActions != null) && (
            <div className="h3-form-field-section-head">
                {title != null && <span className="h3-form-field-section-title type-group-label">{title}</span>}
                {titleActions}
            </div>
        )}
        {children}
    </div>
);
