/**
 * @file MolSelList.tsx
 * @description Atom-selection editor: a free-text Blueprint `InputGroup`
 * paired with a chevron-only `HTMLSelect` that hosts a true OS-rendered
 * dropdown listbox.
 *
 * Why this layout? `<input list="…">` + `<datalist>` (HTML5 autocomplete)
 * only surfaces a filtered list as the user types — it isn't a real
 * "click-the-button-to-open-the-full-list" combobox. To get that behaviour
 * with native (OS-rendered, dialog-flip-immune) styling we keep the editable
 * field as an `InputGroup` and put a chevron-only `HTMLSelect` next to it as
 * the dropdown trigger. The `<select>` always shows an empty hidden sentinel
 * option (so its display area is blank — no "Pick…" text), and selecting any
 * real option fires `onSelectedSelChange` then re-renders back to the sentinel.
 *
 * Items shown in the listbox (matches UXP `widget.molsellist.buildBox`):
 *   1. Preset optgroup     — `current (<sel>)` (only when `molID` resolves to a
 *                            molecule with a non-empty selection), `all (*)`,
 *                            `none`
 *   2. History optgroup    — localStorage-backed selection history
 *   3. Scene optgroup      — scene-level named sel defs (StyleManager)
 *   4. Global optgroup     — global named sel defs (StyleManager)
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
    ControlGroup,
    HTMLSelect,
    InputGroup,
    Intent,
} from '@blueprintjs/core';
import { useCueMol } from '../../../hooks/useCueMol';
import { getHistory } from './selHistory';

const PICK_SENTINEL = '__mol_sel_list_pick__';
const VALIDATE_DEBOUNCE_MS = 500;

export interface MolSelListProps {
    sceneID: number;
    /** Current selection-string value (controlled). */
    selectedSel: string;
    onSelectedSelChange: (value: string) => void;
    /** Optional: currently selected molecule UID (controlled). */
    molID?: number;
    onMolIdChange?: (molId: number | undefined) => void;
    disabled?: boolean;
    placeholder?: string;
    fill?: boolean;
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
    molID,
    onMolIdChange,
    disabled,
    placeholder = '* (all atoms)',
    fill = true,
    refreshKey = 0,
}) => {
    // `onMolIdChange` is part of the UXP-compatible API surface but is not
    // yet wired — referencing it silences the unused-locals diagnostic without
    // reshuffling the public contract.
    void onMolIdChange;
    const { cm } = useCueMol();
    const [sceneDefs, setSceneDefs] = useState<string[]>([]);
    const [globalDefs, setGlobalDefs] = useState<string[]>([]);
    const [currentSel, setCurrentSel] = useState<string | undefined>(undefined);
    const [historyItems, setHistoryItems] = useState<string[]>(() => getHistory());
    const [isValid, setIsValid] = useState(true);

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

    // ---- Refresh history just before the picker is opened ----
    const refreshHistory = useCallback((): void => {
        setHistoryItems(getHistory());
    }, []);

    // ---- Live validation (debounced) ----
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!cm) {
            setIsValid(true);
            return;
        }
        if (debounceRef.current !== null) clearTimeout(debounceRef.current);
        const trimmed = selectedSel.trim();
        // Treat empty / "*" as "no constraint" — same branch as setupRenderer.service.ts:29.
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

    const handlePick = (e: React.ChangeEvent<HTMLSelectElement>): void => {
        const v = e.target.value;
        if (v === PICK_SENTINEL) return;
        onSelectedSelChange(v);
    };

    return (
        <ControlGroup fill={fill} className="mol-sel-list">
            <InputGroup
                value={selectedSel}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSelectedSelChange(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                fill={fill}
                intent={isValid ? Intent.NONE : Intent.DANGER}
                aria-invalid={!isValid}
            />
            <HTMLSelect
                value={PICK_SENTINEL}
                onChange={handlePick}
                onMouseDown={refreshHistory}
                onFocus={refreshHistory}
                disabled={disabled}
                aria-label="Pick selection"
                className="mol-sel-list-picker"
            >
                {/* Hidden empty option keeps the display area blank; selecting
                    a real option re-renders back to this sentinel. */}
                <option value={PICK_SENTINEL} hidden></option>
                <optgroup label="Preset">
                    {currentSel !== undefined && (
                        <option value={currentSel}>current ({currentSel})</option>
                    )}
                    <option value="*">all (*)</option>
                    <option value="">none</option>
                </optgroup>
                {historyItems.length > 0 && (
                    <optgroup label="History">
                        {historyItems.map((v) => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </optgroup>
                )}
                {sceneDefs.length > 0 && (
                    <optgroup label="Scene">
                        {sceneDefs.map((v) => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </optgroup>
                )}
                {globalDefs.length > 0 && (
                    <optgroup label="Global">
                        {globalDefs.map((v) => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </optgroup>
                )}
            </HTMLSelect>
        </ControlGroup>
    );
};
