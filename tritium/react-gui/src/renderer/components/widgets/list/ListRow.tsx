/**
 * @file components/widgets/list/ListRow.tsx
 * @description Canonical selectable list row (flex). Row height, padding, gap,
 * hover and selected styling are owned by `.list-row` (see
 * `styles/_list-kit.css`); this component exposes NO size props -- every list
 * row across the app looks identical because they all use this.
 *
 * @module list/ListRow
 */

import React from 'react';

export interface ListRowProps {
    /** Highlight the row as selected. */
    selected?: boolean;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
    className?: string;
    children: React.ReactNode;
}

export const ListRow: React.FC<ListRowProps> = ({ selected, onClick, className, children }) => (
    <div
        className={`list-row${selected ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
        onClick={onClick}
        role="option"
        aria-selected={selected || undefined}
    >
        {children}
    </div>
);
