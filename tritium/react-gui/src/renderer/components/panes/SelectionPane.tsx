/**
 * @file SelectionPane.tsx
 * @description Side-panel surface that mirrors the Command tab of UXP
 * `panel.selection` (`uxp_gui/cuemol2/base/content/selection-panel.{xul,js}`).
 *
 * Contents:
 *   - molecule selector (`HTMLSelect` over MolCoord-like scene objects)
 *   - free-form multi-line `TextArea` for the selection expression
 *   - toolbar: Select / Clear / History
 *
 * Select dispatches `applyMolSelString` (shared with MolStructPane); on
 * success the entry is appended via `pushHistory` from the MolSelList
 * widget's history module, so MolSelList instances (e.g. PaintSelCell)
 * see the same MRU entries. History is read back via `getHistory` when
 * the picker opens. Live validation runs through `validateSelection`
 * with the same 500 ms debounce MolSelList uses.
 *
 * UXP's Editor tab is intentionally not ported -- the free-text path
 * covers the dominant use case. See `docs/migration/mapping/panels.md`.
 *
 * @module SelectionPane
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    ButtonGroup,
    Icon,
    Menu,
    MenuItem,
    Popover,
    Tooltip,
} from '@blueprintjs/core';
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol';
import { ObjectSelect, objectFilters } from '../widgets/ObjectSelect';
import { Field, TextField } from '../widgets/form';
import {
    getHistory,
    pushHistory,
} from '../widgets/MolSelList/selHistory';
import { SelectionBuilder } from '../widgets/MolSelList';
import { useSelectionValues } from '../widgets/MolSelList/useSelectionValues';

/* --- Props --- */

interface SelectionPaneProps {
    cm: AsyncCueMol | null;
    /** Active scene UID, or undefined when no scene is active. */
    activeSceneId: number | undefined;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

/* --- Constants --- */

const VALIDATE_DEBOUNCE_MS = 500;
// Mirror MolSelList/selHistory.SKIP: values that pushHistory ignores.
// Skipping the validate round-trip for these as well matches MolSelList.
const VALIDATE_SKIP = new Set(['', '*', 'none']);

/* --- Component --- */

export const SelectionPane: React.FC<SelectionPaneProps> = ({
    cm,
    activeSceneId,
    collapsed,
    onToggleCollapse,
}) => {
    const [selectedMolId, setSelectedMolId] = useState<number | undefined>(undefined);

    const [selStr, setSelStr] = useState('');
    const [isValid, setIsValid] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [historyItems, setHistoryItems] = useState<string[]>(() => getHistory());

    // Named selection defs + target mol's current selection, for the builder.
    const [sceneDefs, setSceneDefs] = useState<string[]>([]);
    const [globalDefs, setGlobalDefs] = useState<string[]>([]);
    const [currentSel, setCurrentSel] = useState<string | undefined>(undefined);
    // Bumped after a successful "Save as..." to re-fetch the named defs.
    const [saveBump, setSaveBump] = useState(0);

    useEffect(() => {
        if (!cm || activeSceneId === undefined) {
            setSceneDefs([]);
            setGlobalDefs([]);
            setCurrentSel(undefined);
            return;
        }
        let cancelled = false;
        const args =
            selectedMolId !== undefined
                ? { sceneId: activeSceneId, molId: selectedMolId }
                : { sceneId: activeSceneId };
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
    }, [cm, activeSceneId, selectedMolId, saveBump]);

    const resolveValues = useSelectionValues({ cm, sceneID: activeSceneId, molID: selectedMolId });

    const getHitCount = useMemo(
        () =>
            cm && activeSceneId !== undefined && selectedMolId !== undefined
                ? (str: string): Promise<number | null> =>
                      cm
                          .invokeService('getSelHitCount', {
                              sceneId: activeSceneId,
                              molId: selectedMolId,
                              selStr: str,
                          })
                          .then((r) => r.count)
                : undefined,
        [cm, activeSceneId, selectedMolId],
    );

    const onSaveAs = useCallback(
        async (name: string, expr: string): Promise<boolean> => {
            if (!cm || activeSceneId === undefined) return false;
            const res = await cm.invokeService('saveSelDef', { sceneId: activeSceneId, name, expr });
            if (res.ok) setSaveBump((n) => n + 1);
            return res.ok;
        },
        [cm, activeSceneId],
    );

    const onBuilderEmit = useCallback((expr: string) => {
        setSelStr(expr);
        setErrorMsg(null);
    }, []);

    // ---- Live validation (debounced, mirrors MolSelList) ----
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!cm || activeSceneId === undefined) {
            setIsValid(true);
            return;
        }
        if (debounceRef.current !== null) clearTimeout(debounceRef.current);
        const trimmed = selStr.trim();
        if (VALIDATE_SKIP.has(trimmed)) {
            setIsValid(true);
            return;
        }
        let cancelled = false;
        debounceRef.current = setTimeout(() => {
            cm.invokeService('validateSelection', { selStr: trimmed, sceneId: activeSceneId })
                .then((res) => {
                    if (!cancelled) setIsValid(res.ok);
                })
                .catch(() => {
                    // Transport error -- don't flag the input as invalid.
                    if (!cancelled) setIsValid(true);
                });
        }, VALIDATE_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            if (debounceRef.current !== null) clearTimeout(debounceRef.current);
        };
    }, [cm, selStr, activeSceneId]);

    const canApply =
        cm !== null && activeSceneId !== undefined && selectedMolId !== undefined;

    const onSelect = useCallback(() => {
        if (!canApply) return;
        const sid = activeSceneId!;
        const mid = selectedMolId!;
        cm!
            .invokeService('applyMolSelString', { sceneId: sid, molId: mid, selStr })
            .then((res) => {
                if (res?.ok) {
                    setErrorMsg(null);
                    pushHistory(selStr);
                    setHistoryItems(getHistory());
                } else {
                    setErrorMsg('Invalid selection expression.');
                }
            })
            .catch((err: unknown) => {
                console.warn('applyMolSelString failed:', err);
                setErrorMsg('Failed to apply selection.');
            });
    }, [cm, canApply, activeSceneId, selectedMolId, selStr]);

    const onClear = useCallback(() => {
        setSelStr('');
        setErrorMsg(null);
    }, []);

    // Refresh history just before the picker opens, in case another
    // pane (MolSelList instance) appended something while we were idle.
    const onHistoryOpening = useCallback(() => {
        setHistoryItems(getHistory());
    }, []);

    const onPickHistory = useCallback((value: string) => {
        setSelStr(value);
        setErrorMsg(null);
    }, []);

    const historyMenu = (
        <Menu>
            {historyItems.length === 0 ? (
                <MenuItem text="(no history)" disabled />
            ) : (
                historyItems.map((entry) => (
                    <MenuItem
                        key={entry}
                        text={entry}
                        onClick={() => onPickHistory(entry)}
                    />
                ))
            )}
        </Menu>
    );

    return (
        <div className="sp-pane">
            <div
                className={`sp-section-header ${onToggleCollapse ? 'collapsible' : ''}`}
                onClick={onToggleCollapse}
            >
                <div className="sp-section-header-left">
                    {onToggleCollapse != null && (
                        <Icon
                            icon={collapsed ? 'chevron-right' : 'chevron-down'}
                            size={12}
                            className="section-chevron"
                        />
                    )}
                    <Icon icon="select" size={14} className="section-icon" />
                    <span className="section-title">Selection</span>
                </div>
                <div
                    className="sp-section-header-actions"
                    onClick={(e) => e.stopPropagation()}
                >
                    <ButtonGroup minimal>
                        <Tooltip content="Select" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="select" size={14} />}
                                className="section-action-btn"
                                disabled={!canApply}
                                onClick={onSelect}
                            />
                        </Tooltip>
                        <Tooltip content="Clear input" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="eraser" size={14} />}
                                className="section-action-btn"
                                disabled={selStr.length === 0}
                                onClick={onClear}
                            />
                        </Tooltip>
                        <Popover
                            content={historyMenu}
                            onOpening={onHistoryOpening}
                            placement="bottom-end"
                        >
                            <Tooltip content="History" placement="bottom" compact>
                                <Button
                                    minimal
                                    small
                                    icon={<Icon icon="history" size={14} />}
                                    className="section-action-btn"
                                />
                            </Tooltip>
                        </Popover>
                    </ButtonGroup>
                </div>
            </div>
            {!collapsed && (
                <div className="sp-pane-fill">
                    <ObjectSelect
                        cm={cm}
                        sceneId={activeSceneId}
                        label="Molecule"
                        filter={objectFilters.molCoord}
                        selectedId={selectedMolId}
                        onChange={setSelectedMolId}
                        emptyText="(no molecules)"
                        fallbackName={(m) => `Mol ${m.uid}`}
                    />
                    <div className="selection-text-row">
                        <Field label="Selection" className="selection-input-field">
                            <TextField
                                value={selStr}
                                onChange={(v) => {
                                    setSelStr(v);
                                    if (errorMsg) setErrorMsg(null);
                                }}
                                placeholder="Input selection command"
                                invalid={!isValid}
                            />
                        </Field>
                        {errorMsg !== null && (
                            <div className="selection-error">{errorMsg}</div>
                        )}
                        <SelectionBuilder
                            value={selStr}
                            onEmit={onBuilderEmit}
                            history={historyItems}
                            currentSel={currentSel}
                            sceneDefs={sceneDefs}
                            globalDefs={globalDefs}
                            resolveValues={resolveValues}
                            getHitCount={getHitCount}
                            onSaveAs={onSaveAs}
                            disabled={cm === null || activeSceneId === undefined}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
