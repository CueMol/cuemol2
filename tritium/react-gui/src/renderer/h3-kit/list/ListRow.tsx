/**
 * @file h3-kit/list/ListRow.tsx
 * @description Canonical selectable list row (flex). Row height, padding, gap,
 * hover and selected styling are owned by `.h3-list-row` (see
 * `styles/_list-kit.css`); this component exposes NO size props -- every list
 * row across the app looks identical because they all use this.
 *
 * @module list/ListRow
 */

import React from 'react';

/**
 * Everything a plain div accepts is passed through (drag handlers, dataset
 * attributes, double-click, context menu), so a list can be made draggable or
 * renameable without a row variant per surface. What is deliberately NOT here
 * is any size prop -- those belong to `.h3-list-row`.
 */
export interface ListRowProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'> {
    /** Highlight the row as selected. */
    selected?: boolean;
    className?: string;
    children: React.ReactNode;
}

export const ListRow: React.FC<ListRowProps> = ({ selected, className, children, ...rest }) => (
    <div
        {...rest}
        className={`h3-list-row${selected ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
        role="option"
        aria-selected={selected || undefined}
    >
        {children}
    </div>
);
