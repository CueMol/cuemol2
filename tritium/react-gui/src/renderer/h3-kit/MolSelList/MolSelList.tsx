/**
 * @file MolSelList.tsx
 * @description Lightweight atom-selection picker: a free-text Blueprint
 * `InputGroup` with a chevron trigger tucked inside its right edge (like a
 * native `<select>`) that opens a popover listing ready-made selection
 * expressions.
 *
 * The popover has a `Named | History` `SegmentedControl` at the top; choosing
 * a tab shows the corresponding list (see `SelMenus.tsx`). "Named" surfaces the
 * target molecule's current selection ("Selected"), scene-level named defs, and
 * global named defs (built-in macros like `protein` / `water` arrive under
 * "Global" automatically). "History" lists recently used expressions. Picking
 * an item writes it into the controlled value and closes the popover.
 *
 * This is the reusable picker used across panes/panels. Authoring complex
 * selections (set operations, distance shells, ...) lives in the SelectionPane
 * builder; named selections defined there reappear here under "Named".
 *
 * Live validation: each `selectedSel` change is sent (debounced) to the
 * `validateSelection` worker service; on failure the input gets `Intent.DANGER`.
 *
 * History persistence is the parent's responsibility (see `pushHistory` from
 * `./selHistory`); this widget remains controlled & free of side effects on
 * unmount.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Button,
    Icon,
    Popover,
} from '@blueprintjs/core';
import { useCueMol } from '../../hooks/useCueMol';
import { useTheme } from '../../contexts/ThemeContext';
import { TextField, SegmentField } from '../form';
import { getHistory } from './selHistory';
import { HistoryMenu, NamedSelMenu } from './SelMenus';

const VALIDATE_DEBOUNCE_MS = 500;

type PickSource = 'named' | 'history';

export interface MolSelListProps {
    sceneID: number;
    /** Current selection-string value (controlled). */
    selectedSel: string;
    onSelectedSelChange: (value: string) => void;
    /**
     * Fired when the value should be committed: a popover pick or input blur.
     * Lets a parent live-apply once (e.g. compile + assign a selection) rather
     * than on every keystroke.
     */
    onCommit?: (value: string) => void;
    /** Optional: currently selected molecule UID (controlled). */
    molID?: number;
    onMolIdChange?: (molId: number | undefined) => void;
    disabled?: boolean;
    placeholder?: string;
    fill?: boolean;
    /**
     * Show the leading atom-selection glyph that marks the field as a selection
     * picker (default true). Dense hosts (e.g. the color paint table cell) can
     * disable it to keep the row visually plain.
     */
    showSelectionIcon?: boolean;
    /**
     * Re-fetch trigger for the named-selection-defs list. Bumping this number
     * forces a refresh (e.g. when the parent knows the scene's defs changed).
     */
    refreshKey?: number;
}

export const MolSelList: React.FC<MolSelListProps> = ({
    sceneID,
    selectedSel,
    onSelectedSelChange,
    onCommit,
    molID,
    onMolIdChange,
    disabled,
    placeholder = '* (all atoms)',
    fill = true,
    showSelectionIcon = true,
    refreshKey = 0,
}) => {
    // `onMolIdChange` is part of the UXP-compatible API surface but is not
    // yet wired -- referencing it silences the unused-locals diagnostic without
    // reshuffling the public contract.
    void onMolIdChange;
    const { cm } = useCueMol();
    const { theme } = useTheme();
    const portalClassName = theme === 'dark' ? 'bp5-dark' : '';

    const [sceneDefs, setSceneDefs] = useState<string[]>([]);
    const [globalDefs, setGlobalDefs] = useState<string[]>([]);
    const [currentSel, setCurrentSel] = useState<string | undefined>(undefined);
    const [historyItems, setHistoryItems] = useState<string[]>(() => getHistory());
    const [isValid, setIsValid] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [source, setSource] = useState<PickSource>('named');

    // ---- Fetch named selection defs (scene + global) and current mol sel ----
    useEffect(() => {
        if (!cm) {
            setSceneDefs([]);
            setGlobalDefs([]);
            setCurrentSel(undefined);
            return;
        }
        let cancelled = false;
        const args = molID !== undefined ? { sceneId: sceneID, molId: molID } : { sceneId: sceneID };
        cm.invokeService('getSelDefs', args)
            .then((res) => {
                if (cancelled) return;
                setSceneDefs(res.scene);
                setGlobalDefs(res.global);
                setCurrentSel(res.currentSel);
            })
            .catch(() => {
                if (cancelled) return;
                setSceneDefs([]);
                setGlobalDefs([]);
                setCurrentSel(undefined);
            });
        return () => {
            cancelled = true;
        };
    }, [cm, sceneID, molID, refreshKey]);

    // ---- Live validation (debounced) ----
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!cm) {
            setIsValid(true);
            return;
        }
        if (debounceRef.current !== null) clearTimeout(debounceRef.current);
        const trimmed = selectedSel.trim();
        // Treat empty / "*" as "no constraint" -- same branch as setupRenderer.service.ts:29.
        if (trimmed === '' || trimmed === '*') {
            setIsValid(true);
            return;
        }
        let cancelled = false;
        debounceRef.current = setTimeout(() => {
            cm.invokeService('validateSelection', { selStr: trimmed, sceneId: sceneID })
                .then((res) => {
                    if (!cancelled) setIsValid(res.ok);
                })
                .catch(() => {
                    if (!cancelled) setIsValid(true); // don't flag on transport error
                });
        }, VALIDATE_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            if (debounceRef.current !== null) clearTimeout(debounceRef.current);
        };
    }, [cm, selectedSel, sceneID]);

    // Refresh history each time the popover opens, in case another pane
    // appended an entry while we were idle.
    const handleInteraction = useCallback((next: boolean) => {
        if (next) setHistoryItems(getHistory());
        setIsOpen(next);
    }, []);

    const handlePick = useCallback(
        (value: string): void => {
            onSelectedSelChange(value);
            onCommit?.(value);
            setIsOpen(false);
        },
        [onSelectedSelChange, onCommit],
    );

    const pickerContent = (
        <div className="h3-mol-sel-list-popover">
            <SegmentField
                value={source}
                onValueChange={setSource}
                options={[
                    { label: 'Named', value: 'named' },
                    { label: 'History', value: 'history' },
                ]}
            />
            {source === 'named' ? (
                <NamedSelMenu
                    currentSel={currentSel}
                    sceneDefs={sceneDefs}
                    globalDefs={globalDefs}
                    activeValue={selectedSel}
                    onPick={handlePick}
                    dismissOnPick
                />
            ) : (
                <HistoryMenu
                    history={historyItems}
                    activeValue={selectedSel}
                    onPick={handlePick}
                    dismissOnPick
                />
            )}
        </div>
    );

    // The chevron trigger sits inside the input's right edge (InputGroup
    // rightElement), mirroring a native <select> caret rather than a separate
    // button beside the field.
    const caretTrigger = (
        <Popover
            isOpen={isOpen}
            onInteraction={handleInteraction}
            placement="bottom-end"
            portalClassName={portalClassName}
            className="h3-mol-sel-list-trigger"
            disabled={disabled}
            content={pickerContent}
            // A mouse-driven dropdown needs no focus trap. Leaving Blueprint's
            // default focus management on makes the overlay's focus-trap
            // sentinel (a fixed, full-width div) take focus, which -- with no
            // app-wide FocusStyleManager -- renders Blueprint's :focus outline
            // as a stray cyan line across the window top.
            enforceFocus={false}
            autoFocus={false}
        >
            <Button
                className="h3-mol-sel-list-caret"
                icon={<span className="h3-form-caret" aria-hidden />}
                minimal
                disabled={disabled}
                title="Pick selection"
                aria-label="Pick selection"
            />
        </Popover>
    );

    return (
        <TextField
            value={selectedSel}
            onChange={onSelectedSelChange}
            onBlur={() => onCommit?.(selectedSel)}
            placeholder={placeholder}
            disabled={disabled}
            invalid={!isValid}
            fill={fill}
            leftIcon={showSelectionIcon ? <Icon icon="select" size={14} /> : undefined}
            rightElement={caretTrigger}
        />
    );
};
