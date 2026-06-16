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
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol';
import { SectionHeader } from './SectionHeader';
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect';
import { fireService } from '../../utils/fireService';
import { FieldSection, TextField } from '../../h3-kit/form';
import { getHistory, pushHistory } from '../../h3-kit/MolSelList/selHistory';
import { useSelHitCount } from '../../h3-kit/MolSelList/useSelHitCount';
import { CountTag } from '../../h3-kit/MolSelList/CountTag';
import { SelectionBuilder } from './selection/SelectionBuilder';
import { useSelectionValues } from './selection/useSelectionValues';

/* --- Props --- */

interface SelectionPaneProps {
    cm: AsyncCueMol | null;
    /** Active scene UID, or undefined when no scene is active. */
    activeSceneId: number | undefined;
    /** Active mol-view UID -- required for the Center action. */
    activeMolViewId?: number | undefined;
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
    activeMolViewId,
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

    // Hit count of the current selection expression, shown as a badge inside
    // the selection text field (the builder no longer renders its own header
    // row for this). selStr mirrors the builder's current selection.
    const currentCount = useSelHitCount(getHitCount, selStr);

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

    // Center the active view on the current selection (reuses the same worker
    // service as MolStructPane's Center action).
    const canCenter = canApply && activeMolViewId !== undefined;
    const onCenter = useCallback(() => {
        if (!cm || !canCenter) return;
        fireService(cm, 'centerMolSelection', {
            sceneId: activeSceneId!,
            viewId: activeMolViewId!,
            molId: selectedMolId!,
            selStr,
        });
    }, [cm, canCenter, activeSceneId, activeMolViewId, selectedMolId, selStr]);

    return (
        <div className="sp-pane selection-pane">
            <SectionHeader
                title="Selection"
                icon="ui.select"
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
            />
            {!collapsed && (
                <div className="sp-pane-fill">
                    <FieldSection title="Molecule" className="object-select-section">
                        <ObjectSelect
                            cm={cm}
                            sceneId={activeSceneId}
                            label="Molecule"
                            filter={objectFilters.molCoord}
                            selectedId={selectedMolId}
                            onChange={setSelectedMolId}
                            emptyText="(no molecules)"
                            fallbackName={(m) => `Mol ${m.uid}`}
                            hideLabel
                        />
                    </FieldSection>
                    <div className="selection-text-row">
                        <FieldSection title="Selection" className="selection-input-field">
                            <div className="selection-input-with-count">
                                <TextField
                                    value={selStr}
                                    onChange={(v) => {
                                        setSelStr(v);
                                        if (errorMsg) setErrorMsg(null);
                                    }}
                                    placeholder="Input selection command"
                                    invalid={!isValid}
                                />
                                <CountTag count={currentCount} />
                            </div>
                            {errorMsg !== null && (
                                <div className="selection-error">{errorMsg}</div>
                            )}
                        </FieldSection>
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
                            onSelect={onSelect}
                            onCenter={onCenter}
                            canSelect={canApply}
                            canCenter={canCenter}
                            disabled={cm === null || activeSceneId === undefined}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
