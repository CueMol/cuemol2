/**
 * @file h3-kit/list/Listbox.tsx
 * @description Vertical container for a custom (flex-based) selectable list.
 * Pair with `ListRow`. Row metrics come from the list-kit single source
 * (`styles/_list-kit.css` + `--row-h` / `--list-*` tokens); this component
 * sets no sizes itself.
 *
 * For Blueprint `<Tree>` lists add the `h3-listbox-tree` class to the Tree; for
 * HTML tables use `.h3-list-table` / `.h3-list-table-row`.
 *
 * @module list/Listbox
 */

import React from 'react';

export interface ListboxProps {
    /** Bordered, sunken, scrollable box (for standalone lists e.g. in a dialog). */
    framed?: boolean;
    className?: string;
    children: React.ReactNode;
}

export const Listbox: React.FC<ListboxProps> = ({ framed, className, children }) => (
    <div className={`h3-listbox${framed ? ' is-framed' : ''}${className ? ` ${className}` : ''}`}>
        {children}
    </div>
);
