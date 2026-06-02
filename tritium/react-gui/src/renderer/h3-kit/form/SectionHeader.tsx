/**
 * @file h3-kit/form/SectionHeader.tsx
 * @description Canonical sub-section header bar, using the shared
 * `.section-header` structural role (height owned by the role, not here).
 *
 * @module form/SectionHeader
 */

import React from 'react';

export interface SectionHeaderProps {
    title: string;
    /** Optional trailing actions (buttons) aligned to the right. */
    actions?: React.ReactNode;
    className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, actions, className }) => (
    <div className={`section-header h3-form-section-header${className ? ` ${className}` : ''}`}>
        <span className="type-eyebrow">{title}</span>
        {actions}
    </div>
);
