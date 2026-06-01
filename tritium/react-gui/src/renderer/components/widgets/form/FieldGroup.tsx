/**
 * @file components/widgets/form/FieldGroup.tsx
 * @description Vertical stack of Fields (a form section). The inter-row gap and
 * section spacing are owned by `.fk-field-group` (see `styles/_form-kit.css`),
 * so callers never choose spacing between rows.
 *
 * @module form/FieldGroup
 */

import React from 'react';
import { SectionHeader } from './SectionHeader';

export interface FieldGroupProps {
    /** Optional section header rendered above the rows. */
    title?: string;
    className?: string;
    children: React.ReactNode;
}

export const FieldGroup: React.FC<FieldGroupProps> = ({ title, className, children }) => (
    <div className={`fk-field-group${className ? ` ${className}` : ''}`}>
        {title != null && <SectionHeader title={title} />}
        {children}
    </div>
);
