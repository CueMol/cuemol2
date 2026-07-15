/**
 * @file h3-kit/MolSelList/SelMenus.tsx
 * @description Presentational Blueprint menus that list ready-made selection
 * expressions, shared by the SelectionBuilder (Term source) and the MolSelList
 * picker popover.
 *
 * `NamedSelMenu` groups the active molecule's current selection ("Selected"),
 * scene-level named defs, and global named defs (built-in macros like
 * `protein` / `water` surface under "Global" automatically). `HistoryMenu`
 * lists recently used expressions. Both are dumb: they render a list and call
 * `onPick(value)` -- the parent decides whether that re-seeds builder state or
 * commits a controlled value.
 *
 * @module SelMenus
 */

import React from 'react';
import { Menu, MenuDivider, MenuItem } from '@blueprintjs/core';
import { Listbox } from '../list/Listbox';
import { ListRow } from '../list/ListRow';

/* --- Named selections (Selected / Scene / Global) --- */

export interface NamedSelMenuProps {
    /** Target molecule's current selection (shown under "Selected"). */
    currentSel?: string;
    /** Scene-level named selection defs (StyleManager). */
    sceneDefs?: string[];
    /** Global named selection defs (StyleManager). */
    globalDefs?: string[];
    /** The value currently marked active (highlighted). */
    activeValue?: string;
    /** Pick a value. */
    onPick: (value: string) => void;
    /**
     * Whether clicking an item closes the enclosing Blueprint Popover.
     * The builder keeps the popover open while composing (`false`); the
     * MolSelList picker dismisses on pick (`true`).
     */
    dismissOnPick?: boolean;
}

/**
 * Menu of named selection expressions, grouped by scope.
 *
 * Built-in macros (protein, water, ...) are global named selections loaded
 * from data/default_style.xml into scope 0, so they already surface under
 * "Global" -- no separate hardcoded list.
 */
export const NamedSelMenu: React.FC<NamedSelMenuProps> = ({
    currentSel,
    sceneDefs = [],
    globalDefs = [],
    activeValue,
    onPick,
    dismissOnPick = false,
}) => {
    const hasNamed = currentSel !== undefined || sceneDefs.length > 0 || globalDefs.length > 0;
    return (
        <Menu className="selbuilder-menu">
            {!hasNamed && <MenuItem disabled text="No named selections" />}
            {currentSel !== undefined && (
                <>
                    <MenuDivider title="Selected" />
                    <MenuItem
                        text={currentSel}
                        active={activeValue === currentSel}
                        shouldDismissPopover={dismissOnPick}
                        onClick={() => onPick(currentSel)}
                    />
                </>
            )}
            {sceneDefs.length > 0 && (
                <>
                    <MenuDivider title="Scene" />
                    {sceneDefs.map((v) => (
                        <MenuItem
                            key={`s-${v}`}
                            text={v}
                            active={activeValue === v}
                            shouldDismissPopover={dismissOnPick}
                            onClick={() => onPick(v)}
                        />
                    ))}
                </>
            )}
            {globalDefs.length > 0 && (
                <>
                    <MenuDivider title="Global" />
                    {globalDefs.map((v) => (
                        <MenuItem
                            key={`g-${v}`}
                            text={v}
                            active={activeValue === v}
                            shouldDismissPopover={dismissOnPick}
                            onClick={() => onPick(v)}
                        />
                    ))}
                </>
            )}
        </Menu>
    );
};

/* --- History --- */

export interface HistoryMenuProps {
    /** Recently used expressions, newest first. */
    history?: string[];
    /** The value currently marked active (highlighted). */
    activeValue?: string;
    /** Pick a value. */
    onPick: (value: string) => void;
    /** Whether clicking an item closes the enclosing Blueprint Popover. */
    dismissOnPick?: boolean;
}

/** Menu of recently used selection expressions. */
export const HistoryMenu: React.FC<HistoryMenuProps> = ({
    history = [],
    activeValue,
    onPick,
    dismissOnPick = false,
}) => (
    <Menu className="selbuilder-menu">
        {history.length === 0 ? (
            <MenuItem disabled text="No history" />
        ) : (
            history.map((h, i) => (
                <MenuItem
                    key={i}
                    text={h}
                    active={activeValue === h}
                    shouldDismissPopover={dismissOnPick}
                    onClick={() => onPick(h)}
                />
            ))
        )}
    </Menu>
);

/* --- Inline list-kit variants (full-density Selection pane) --- */

/** One list-kit row showing a selection expression. */
const SelListRow: React.FC<{ value: string; active?: boolean; onPick: (v: string) => void }> = ({
    value,
    active,
    onPick,
}) => (
    <ListRow selected={active} onClick={() => onPick(value)}>
        <span className="type-row sellist-text">{value}</span>
    </ListRow>
);

/**
 * Inline listbox counterpart of `NamedSelMenu`, rendered directly under the
 * source segment (not in a popover) so the Named source expands in place --
 * symmetric with the Property source. Same grouping (Selected / Scene /
 * Global).
 */
export const NamedSelList: React.FC<NamedSelMenuProps> = ({
    currentSel,
    sceneDefs = [],
    globalDefs = [],
    activeValue,
    onPick,
}) => {
    const hasNamed = currentSel !== undefined || sceneDefs.length > 0 || globalDefs.length > 0;
    return (
        <Listbox className="sellist">
            {!hasNamed && <div className="sellist-empty type-body">No named selections</div>}
            {currentSel !== undefined && (
                <>
                    <div className="sellist-group type-caption">Selected</div>
                    <SelListRow value={currentSel} active={activeValue === currentSel} onPick={onPick} />
                </>
            )}
            {sceneDefs.length > 0 && (
                <>
                    <div className="sellist-group type-caption">Scene</div>
                    {sceneDefs.map((v) => (
                        <SelListRow key={`s-${v}`} value={v} active={activeValue === v} onPick={onPick} />
                    ))}
                </>
            )}
            {globalDefs.length > 0 && (
                <>
                    <div className="sellist-group type-caption">Global</div>
                    {globalDefs.map((v) => (
                        <SelListRow key={`g-${v}`} value={v} active={activeValue === v} onPick={onPick} />
                    ))}
                </>
            )}
        </Listbox>
    );
};

/** Inline listbox counterpart of `HistoryMenu`. */
export const HistoryList: React.FC<HistoryMenuProps> = ({ history = [], activeValue, onPick }) => (
    <Listbox className="sellist">
        {history.length === 0 ? (
            <div className="sellist-empty type-body">No history</div>
        ) : (
            history.map((h, i) => (
                <SelListRow key={i} value={h} active={activeValue === h} onPick={onPick} />
            ))
        )}
    </Listbox>
);
