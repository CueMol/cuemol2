/**
 * @file h3-kit/MolSelList/MolSelList.tsx
 * @description Atom-selection picker: a free-text Blueprint `InputGroup` with a
 * chevron trigger tucked inside its right edge (like a native `<select>`) that
 * opens a popover holding the shared `SelectionBuilder` (the same Term + Modify
 * composer the SelectionPane uses).
 *
 * The builder is tabbed (Named / History / Builder). The Builder tab composes
 * CueMol selection expressions (property keyword + value, set operations,
 * distance shells) into the widget's own `selectedSel` value. It is
 * NON-destructive: the target molecule's `mol.sel` is used only as read-only
 * context (hit counts, keyword autocomplete, the Named tab's "Selected"
 * entry) and is never mutated -- MolSelList is used across many dialogs that
 * pick a selection for an operation without applying it. Each builder op
 * calls `onSelectedSelChange` (updates the value); it does NOT `onCommit` --
 * commit stays on input blur / popover close. The exception is the builder's
 * quick-apply path (a Named / History tab click, or Enter on a term while the
 * field is empty): it commits the expression immediately and closes the
 * popover, restoring the old one-click-pick flow.
 *
 * Live validation: each `selectedSel` change is sent (debounced) to the
 * `validateSelection` worker service; on failure the input gets `Intent.DANGER`.
 *
 * History persistence is the parent's responsibility (see `pushHistory` from
 * `./selHistory`); this widget remains controlled & free of side effects on
 * unmount.
 */

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Button, Popover } from '@blueprintjs/core';
import { AppIcon } from '@renderer/h3-kit/primitives';
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import { useDarkPortalClass } from '@renderer/h3-kit/primitives';
import { TextField } from '@renderer/h3-kit/form';
import {
    SelectionBuilder,
    builderReducer,
    initBuilderState,
    useSelectionValues,
} from '@renderer/h3-kit/selection';
import { getHistory } from './selHistory';
import { useHitCountResolver } from './useSelHitCount';
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard';

const VALIDATE_DEBOUNCE_MS = 500;

/**
 * Slack between the popover and the window edge: Blueprint's own offset from
 * the field, plus enough that the list does not sit flush against the frame.
 */
const POPOVER_EDGE_GAP = 16;

/**
 * The shape this modifier reads out of Popper's state. Written structurally
 * rather than imported: `@popperjs/core` reaches us through Blueprint, and
 * pnpm does not put a transitive dependency where our own imports can find it.
 */
interface PopperStateSlice {
    placement: string;
    elements: {
        reference: { getBoundingClientRect: () => { top: number; bottom: number } };
        popper: HTMLElement;
    };
}

/**
 * Publish the room the popover actually has, as a CSS custom property the
 * stylesheet caps the list with.
 *
 * A fixed height cannot be right for a field that appears anywhere: in a
 * dialog whose rows sit near the bottom of the screen, a list tall enough to
 * be useful in the side panel has nowhere to go and lands on top of
 * everything above it. Popper already picks the roomier side; this measures
 * that side after it has chosen (`beforeWrite` runs after `flip`) and hands
 * the number to CSS, so the list grows into a tall window and shrinks near an
 * edge. Popper re-runs its modifiers on scroll and resize, so the value
 * follows the field.
 */
export const availHeightModifier = {
    name: 'h3AvailHeight',
    enabled: true,
    phase: 'beforeWrite' as const,
    requires: ['computeStyles'],
    fn: ({ state }: { state: PopperStateSlice }) => {
        const side = state.placement.split('-')[0];
        const rect = state.elements.reference.getBoundingClientRect();
        const room =
            side === 'top'
                ? rect.top
                : document.documentElement.clientHeight - rect.bottom;
        state.elements.popper.style.setProperty(
            '--h3-popover-avail',
            `${Math.max(0, room - POPOVER_EDGE_GAP)}px`,
        );
    },
};

export interface MolSelListProps {
    sceneID: number;
    /** Current selection-string value (controlled). */
    selectedSel: string;
    onSelectedSelChange: (value: string) => void;
    /**
     * Fired when the value should be committed: input blur. Lets a parent
     * live-apply once (e.g. compile + assign a selection) rather than on every
     * keystroke. Builder operations update the value but do NOT commit.
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
    /** Focus the text input on mount (e.g. a cell entering edit mode). */
    autoFocus?: boolean;
    /**
     * Open the builder popover on mount, for a host that mounts the field in
     * response to the gesture that means "open the picker" -- a table cell's
     * chevron, say, where the field itself was not on screen a moment ago.
     */
    autoOpen?: boolean;
    /**
     * Keys the host wants first (e.g. Enter to confirm a cell edit, Escape to
     * abandon it). Runs before the field's own handling.
     */
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
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
    autoFocus,
    autoOpen,
    onKeyDown,
}) => {
    // `onMolIdChange` is part of the UXP-compatible API surface but is not
    // yet wired -- referencing it silences the unused-locals diagnostic without
    // reshuffling the public contract.
    void onMolIdChange;
    const { cm } = useCueMol();
    const portalClassName = useDarkPortalClass();

    const [sceneDefs, setSceneDefs] = useState<string[]>([]);
    const [globalDefs, setGlobalDefs] = useState<string[]>([]);
    // The target molecule's applied selection (mol.sel), shown as the Named
    // tab's "Selected" entry. Read-only context; never written back.
    const [molCurrentSel, setMolCurrentSel] = useState<string | undefined>(undefined);
    const [historyItems, setHistoryItems] = useState<string[]>(() => getHistory());
    const [isValid, setIsValid] = useState(true);
    const [isOpen, setIsOpen] = useState(autoOpen === true);
    // Two independent fetches: the definition list and the live validation of
    // what the user typed. One guard for both would let either make the
    // other's answer look stale.
    const defsGuard = useStaleGuard();
    const validateGuard = useStaleGuard();

    // Operand draft for the builder (kept for the widget's lifetime so the last
    // keyword / value survives reopening the popover).
    const [draft, dispatch] = useReducer(builderReducer, undefined, initBuilderState);
    const resolveValues = useSelectionValues({ cm, sceneID, molID });
    const getHitCount = useHitCountResolver(cm, sceneID, molID);

    // ---- Fetch named selection defs (scene + global) ----
    useEffect(() => {
        if (!cm) {
            setSceneDefs([]);
            setGlobalDefs([]);
            setMolCurrentSel(undefined);
            return;
        }
        const token = defsGuard.next();
        const args = molID !== undefined ? { sceneId: sceneID, molId: molID } : { sceneId: sceneID };
        cm.invokeService('getSelDefs', args)
            .then((res) => {
                if (!defsGuard.isCurrent(token)) return;
                setSceneDefs(res.scene);
                setGlobalDefs(res.global);
                setMolCurrentSel(res.currentSel);
            })
            .catch(() => {
                if (!defsGuard.isCurrent(token)) return;
                setSceneDefs([]);
                setGlobalDefs([]);
                setMolCurrentSel(undefined);
            });
        return () => defsGuard.invalidate();
    }, [cm, sceneID, molID, refreshKey, defsGuard]);

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
        const token = validateGuard.next();
        debounceRef.current = setTimeout(() => {
            cm.invokeService('validateSelection', { selStr: trimmed, sceneId: sceneID })
                .then((res) => {
                    if (validateGuard.isCurrent(token)) setIsValid(res.ok);
                })
                .catch(() => {
                    if (validateGuard.isCurrent(token)) setIsValid(true); // don't flag on transport error
                });
        }, VALIDATE_DEBOUNCE_MS);
        return () => {
            validateGuard.invalidate();
            if (debounceRef.current !== null) clearTimeout(debounceRef.current);
        };
    }, [cm, selectedSel, sceneID, validateGuard]);

    // On open, refresh history (another pane may have appended while we were
    // idle). On close, commit the composed value once -- builder ops only
    // update the value, so closing the popover is the finalize step (the
    // analogue of the old "pick an item" commit); input blur also commits.
    const handleInteraction = useCallback(
        (next: boolean, e?: React.SyntheticEvent<HTMLElement>) => {
            if (next) {
                setHistoryItems(getHistory());
                setIsOpen(true);
                return;
            }
            // Already closed: nothing to commit. The quick-apply path closes
            // the popover itself (committing the NEW value); the click that
            // triggered it then reaches Blueprint's outside-click detection
            // with a detached target, which would otherwise re-commit the
            // stale selectedSel here.
            if (!isOpen) return;
            // A pick inside a nested combobox dropdown (the keyword autocomplete)
            // is portaled OUTSIDE this popover's DOM, so it reads as an outside
            // click. Keep the popover open so autocomplete selection behaves like
            // the native <select> dropdowns (which never close it).
            const target = e?.target as HTMLElement | null;
            if (target?.closest('.h3-form-combobox-menu')) return;
            onCommit?.(selectedSel);
            setIsOpen(false);
        },
        [onCommit, selectedSel, isOpen],
    );

    // Quick-apply (a Named / History tab pick): the one-click replacement.
    // Commit the NEW expression explicitly -- the `selectedSel` prop is still
    // the stale pre-click value in this tick, so routing through the popover's
    // close-commit would commit the wrong value.
    const handleQuickApply = useCallback(
        (expr: string) => {
            onSelectedSelChange(expr);
            onCommit?.(expr);
            setIsOpen(false);
        },
        [onSelectedSelChange, onCommit],
    );

    const pickerContent = (
        <div className="h3-mol-sel-list-popover">
            <SelectionBuilder
                current={selectedSel}
                draft={draft}
                dispatch={dispatch}
                onApply={onSelectedSelChange}
                onQuickApply={handleQuickApply}
                namedCurrentSel={molCurrentSel}
                history={historyItems}
                sceneDefs={sceneDefs}
                globalDefs={globalDefs}
                resolveValues={resolveValues}
                getHitCount={getHitCount}
                disabled={disabled}
            />
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
            modifiersCustom={[availHeightModifier]}
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
                title="Build selection"
                aria-label="Build selection"
            />
        </Popover>
    );

    return (
        <TextField
            value={selectedSel}
            onChange={onSelectedSelChange}
            onBlur={() => onCommit?.(selectedSel)}
            autoFocus={autoFocus}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            invalid={!isValid}
            fill={fill}
            leftIcon={showSelectionIcon ? <AppIcon name="ui.select" aria-hidden /> : undefined}
            rightElement={caretTrigger}
        />
    );
};
