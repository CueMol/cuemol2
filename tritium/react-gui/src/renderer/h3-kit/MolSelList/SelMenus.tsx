/**
 * @file h3-kit/MolSelList/SelMenus.tsx
 * @description Presentational Blueprint menus that list ready-made selection
 * expressions, used by the MolSelList picker popover.
 *
 * `NamedSelMenu` offers "all (*)" first, then groups the active molecule's
 * current selection ("Selected"), scene-level named defs, and global named
 * defs (built-in macros like `protein` / `water` surface under "Global"
 * automatically). `HistoryMenu` lists recently used expressions. Both are
 * dumb: they render a list and call `onPick(value)` -- the parent decides
 * whether that re-seeds builder state or commits a controlled value.
 *
 * @module SelMenus
 */

import React from 'react';
import { Menu, MenuDivider, MenuItem } from '@blueprintjs/core';

/* --- Named selections (All / Selected / Scene / Global) --- */

/** Every atom. The expression CueMol compiles, and how it is labelled. */
const ALL_SEL = '*';
const ALL_LABEL = 'all (*)';

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
 * Menu of named selection expressions, grouped by scope, with "all (*)" on top.
 *
 * Built-in macros (protein, water, ...) are global named selections loaded
 * from data/default_style.xml into scope 0, so they already surface under
 * "Global" -- no separate hardcoded list. `*` is not among them (it is syntax,
 * not a definition), which is why it is spelled out here.
 */
export const NamedSelMenu: React.FC<NamedSelMenuProps> = ({
    currentSel,
    sceneDefs = [],
    globalDefs = [],
    activeValue,
    onPick,
    dismissOnPick = false,
}) => {
    return (
        <Menu className="selbuilder-menu">
            {/* Not a named definition, but the expression this menu is reached
                for most often, and one nobody should have to remember the
                spelling of. It sits above the groups because it belongs to
                none of them. */}
            <MenuItem
                text={ALL_LABEL}
                htmlTitle={ALL_SEL}
                active={activeValue === ALL_SEL}
                shouldDismissPopover={dismissOnPick}
                onClick={() => onPick(ALL_SEL)}
            />
            {currentSel !== undefined && (
                <>
                    <MenuDivider title="Selected" />
                    <MenuItem
                        text={currentSel}
                        htmlTitle={currentSel}
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
                            htmlTitle={v}
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
                            htmlTitle={v}
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
                    htmlTitle={h}
                    active={activeValue === h}
                    shouldDismissPopover={dismissOnPick}
                    onClick={() => onPick(h)}
                />
            ))
        )}
    </Menu>
);

