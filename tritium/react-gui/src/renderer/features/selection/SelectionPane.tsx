/**
 * @file features/selection/SelectionPane.tsx
 * @description Side-panel surface for composing and applying CueMol atom
 * selections. Mirrors the Command tab of UXP `panel.selection`
 * (`uxp_gui/cuemol2/base/content/selection-panel.{xul,js}`).
 *
 * ## Model
 *
 * The molecule's `mol.sel` is the single source of truth. The "Selection"
 * field reflects `mol.sel.toString()` (kept in sync via the CueMol event
 * manager, so scene undo/redo is mirrored automatically) and is editable for
 * micro-corrections. The `SelectionBuilder` below is the primary,
 * grammar-free way to construct a selection: every builder operation writes
 * `mol.sel` live through `applySelection`. There is no separate commit step --
 * the arrow (Select) button only applies a hand-typed edit, and is enabled
 * only when the field diverges from `mol.sel`.
 *
 * UI state (target molecule, operand draft, pending text) persists across
 * activity-group switches via `selectionPaneStore`; a scene change or a
 * target-molecule change resets it.
 *
 * @module SelectionPane
 */

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Button, Popover } from '@blueprintjs/core';
import { PaneSectionHeader } from '@renderer/shell/PaneSectionHeader';
import { useSelectionValidation } from '@renderer/features/selection/selection/useSelectionValidation';
import { AppIcon, Tooltip } from '@renderer/h3-kit/primitives';
import { ObjectSelect, objectFilters } from '@renderer/h3-kit/ObjectSelect';
import { fireService } from '@renderer/utils/fireService';
import { FieldSection, FormButton, TextField } from '@renderer/h3-kit/form';
import { useTheme } from '@renderer/contexts/ThemeContext';
import { getHistory, pushHistory, useSelHitCount, useHitCountResolver, CountTag } from '@renderer/h3-kit/MolSelList';
import {
    SelectionBuilder,
    useSelectionValues,
    builderReducer,
    initBuilderState,
} from '@renderer/h3-kit/selection';
import { loadSnapshot, saveSnapshot } from '@renderer/features/selection/selection/selectionPaneStore';
import { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener';
import { SEM_ANY, SEM_OBJECT, SEM_RENDERER, SEM_SCENE } from '@renderer/event';
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import { useActiveScene } from '@renderer/state/workspace';

/* --- Props --- */

interface SelectionPaneProps {
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

/* --- Component --- */

export const SelectionPane: React.FC<SelectionPaneProps> = ({ collapsed, onToggleCollapse }) => {
    const { cm } = useCueMol();
    const { activeSceneId, activeMolViewId } = useActiveScene();

    // Seed persisted UI state, but only when the snapshot belongs to the
    // active scene (a scene change is allowed to reset).
    const seededForScene = (): boolean => {
        const s = loadSnapshot();
        return s !== null && s.sceneId === activeSceneId;
    };
    const [selectedMolId, setSelectedMolId] = useState<number | undefined>(() =>
        seededForScene() ? loadSnapshot()!.selectedMolId : undefined,
    );
    const [draft, dispatch] = useReducer(builderReducer, undefined, () =>
        seededForScene() ? loadSnapshot()!.draft : initBuilderState(),
    );
    const [textDraft, setTextDraft] = useState<string>(() =>
        seededForScene() ? loadSnapshot()!.textDraft : '',
    );
    // Last mol.sel value synced into textDraft; a ref so a plain remount does
    // not clobber a persisted pending edit (only a genuine mol.sel change does).
    const syncedSelRef = useRef<string>(seededForScene() ? loadSnapshot()!.syncedSel : '');

    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [historyItems, setHistoryItems] = useState<string[]>(() => getHistory());

    // Named selection defs + the target mol's applied selection.
    const [sceneDefs, setSceneDefs] = useState<string[]>([]);
    const [globalDefs, setGlobalDefs] = useState<string[]>([]);
    const [currentSel, setCurrentSel] = useState<string>('');
    // Bumped after a successful "Define name..." to re-fetch the named defs.
    const [saveBump, setSaveBump] = useState(0);

    // Define-name popover.
    const [defining, setDefining] = useState(false);
    const [defName, setDefName] = useState('');
    const { theme } = useTheme();
    const portalClassName = theme === 'dark' ? 'bp5-dark' : '';

    const canApply =
        cm !== null && activeSceneId !== undefined && selectedMolId !== undefined;

    // ---- Persist UI state so it survives activity-group switches ----
    useEffect(() => {
        saveSnapshot({
            sceneId: activeSceneId,
            selectedMolId,
            draft,
            textDraft,
            syncedSel: syncedSelRef.current,
        });
    }, [activeSceneId, selectedMolId, draft, textDraft]);

    // Full reset on scene change; operand-draft reset on target-mol change.
    const firstSceneRef = useRef(true);
    useEffect(() => {
        if (firstSceneRef.current) {
            firstSceneRef.current = false;
            return;
        }
        setSelectedMolId(undefined);
        dispatch({ type: 'INIT' });
        setTextDraft('');
        syncedSelRef.current = '';
    }, [activeSceneId]);

    const firstMolRef = useRef(true);
    useEffect(() => {
        if (firstMolRef.current) {
            firstMolRef.current = false;
            return;
        }
        dispatch({ type: 'RESET_DRAFT' });
    }, [selectedMolId]);

    // ---- Fetch named defs + the applied selection (mol.sel reflection) ----
    const refreshDefs = useCallback(() => {
        if (!cm || activeSceneId === undefined) {
            setSceneDefs([]);
            setGlobalDefs([]);
            setCurrentSel('');
            return;
        }
        const args =
            selectedMolId !== undefined
                ? { sceneId: activeSceneId, molId: selectedMolId }
                : { sceneId: activeSceneId };
        cm.invokeService('getSelDefs', args)
            .then((res) => {
                setSceneDefs(res.scene);
                setGlobalDefs(res.global);
                setCurrentSel(res.currentSel ?? '');
            })
            .catch(() => {
                setSceneDefs([]);
                setGlobalDefs([]);
                setCurrentSel('');
            });
        // The pane stays mounted, so re-read the shared history store here --
        // expressions pushed by other widgets (MolSelList hosts) would
        // otherwise never reach this pane's quick list.
        setHistoryItems(getHistory());
    }, [cm, activeSceneId, selectedMolId]);

    useEffect(() => {
        refreshDefs();
    }, [refreshDefs, saveBump]);

    // Keep in sync with mol.sel changes made anywhere (apply, undo/redo, script).
    useCueMolEventListener({
        cm,
        enabled: cm !== null && activeSceneId !== undefined,
        category: '',
        srcMask: SEM_SCENE | SEM_OBJECT | SEM_RENDERER,
        evtMask: SEM_ANY,
        scopeId: activeSceneId ?? SEM_ANY,
        debounceMs: 30,
        handler: () => refreshDefs(),
    });

    // Mirror mol.sel into the text field, but only on a genuine value change so
    // a remount / unrelated event never clobbers a pending hand-edit.
    useEffect(() => {
        if (currentSel !== syncedSelRef.current) {
            setTextDraft(currentSel);
            syncedSelRef.current = currentSel;
        }
    }, [currentSel]);

    const resolveValues = useSelectionValues({ cm, sceneID: activeSceneId, molID: selectedMolId });

    const getHitCount = useHitCountResolver(cm, activeSceneId, selectedMolId);

    // Hit count of the expression currently in the text field.
    const currentCount = useSelHitCount(getHitCount, textDraft);

    // ---- Apply a selection expression to mol.sel (live) ----
    const applySelection = useCallback(
        (expr: string, record = false) => {
            if (!cm || activeSceneId === undefined || selectedMolId === undefined) return;
            cm.invokeService('applyMolSelString', {
                sceneId: activeSceneId,
                molId: selectedMolId,
                selStr: expr,
            })
                .then((res) => {
                    if (res?.ok) {
                        setErrorMsg(null);
                        if (record && expr.trim() !== '') {
                            pushHistory(expr);
                            setHistoryItems(getHistory());
                        }
                        refreshDefs();
                    } else {
                        setErrorMsg('Invalid selection expression.');
                    }
                })
                .catch((err: unknown) => {
                    console.warn('applyMolSelString failed:', err);
                    setErrorMsg('Failed to apply selection.');
                });
        },
        [cm, activeSceneId, selectedMolId, refreshDefs],
    );

    // Builder operations apply live without recording history (they can fire
    // often); a hand-typed selection records history on explicit apply.
    const onBuilderApply = useCallback((expr: string) => applySelection(expr), [applySelection]);
    const onTextApply = useCallback(
        () => applySelection(textDraft, true),
        [applySelection, textDraft],
    );
    const isValid = useSelectionValidation({ cm, sceneId: activeSceneId, text: textDraft });

    // Center the active view on the applied selection.
    const canCenter = canApply && activeMolViewId !== undefined;
    const onCenter = useCallback(() => {
        if (!cm || !canCenter || currentSel === '') return;
        fireService(cm, 'centerMolSelection', {
            sceneId: activeSceneId!,
            viewId: activeMolViewId!,
            molId: selectedMolId!,
            selStr: currentSel,
        });
    }, [cm, canCenter, activeSceneId, activeMolViewId, selectedMolId, currentSel]);

    // Define the text-field expression as a named selection.
    const onConfirmDefine = useCallback(() => {
        const name = defName.trim();
        if (name === '' || textDraft.trim() === '' || !cm || activeSceneId === undefined) return;
        void cm
            .invokeService('saveSelDef', { sceneId: activeSceneId, name, expr: textDraft })
            .then((res) => {
                if (!res.ok) return;
                // Naming an expression is a deliberate use of it.
                pushHistory(textDraft);
                setHistoryItems(getHistory());
                setSaveBump((n) => n + 1);
            });
        setDefining(false);
        setDefName('');
    }, [defName, textDraft, cm, activeSceneId]);

    // Clear empties both the text field and mol.sel; it must reset textDraft
    // directly since applying '' when mol.sel is already empty produces no
    // currentSel change to mirror back.
    const onClear = useCallback(() => {
        setTextDraft('');
        applySelection('');
    }, [applySelection]);

    const selectEnabled = canApply && textDraft !== currentSel;
    const clearEnabled = canApply && (textDraft !== '' || currentSel !== '');
    const defineEnabled = canApply && textDraft.trim() !== '';

    return (
        <div className="sp-pane selection-pane">
            <PaneSectionHeader
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
                                value={textDraft}
                                mono
                                onChange={(v) => {
                                    setTextDraft(v);
                                    if (errorMsg) setErrorMsg(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && selectEnabled) onTextApply();
                                }}
                                placeholder="Input selection command"
                                invalid={!isValid}
                            />
                            <CountTag count={currentCount} />
                        </div>
                        {errorMsg !== null && <div className="selection-error">{errorMsg}</div>}
                        <div className="selection-actions">
                            <Tooltip content="Apply typed selection">
                                <FormButton
                                    icon={<AppIcon name="ui.select" aria-hidden />}
                                    aria-label="Apply selection"
                                    disabled={!selectEnabled}
                                    onClick={onTextApply}
                                />
                            </Tooltip>
                            <Tooltip content="Center view on selection">
                                <FormButton
                                    icon={<AppIcon name="ui.locate" aria-hidden />}
                                    aria-label="Center view on selection"
                                    disabled={!(canCenter && currentSel !== '')}
                                    onClick={onCenter}
                                />
                            </Tooltip>
                            <Tooltip content="Clear selection">
                                <FormButton
                                    icon={<AppIcon name="ui.eraser" aria-hidden />}
                                    aria-label="Clear selection"
                                    disabled={!clearEnabled}
                                    onClick={onClear}
                                />
                            </Tooltip>
                            <Popover
                                isOpen={defining}
                                onInteraction={(next) => {
                                    setDefining(next);
                                    if (!next) setDefName('');
                                }}
                                placement="bottom-end"
                                portalClassName={portalClassName}
                                disabled={!defineEnabled}
                                content={
                                    <div className="selection-define-popover">
                                        <TextField
                                            value={defName}
                                            onChange={setDefName}
                                            placeholder="name"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') onConfirmDefine();
                                                if (e.key === 'Escape') setDefining(false);
                                            }}
                                        />
                                        <FormButton
                                            intent="primary"
                                            text="Define"
                                            disabled={defName.trim() === '' || textDraft.trim() === ''}
                                            onClick={onConfirmDefine}
                                        />
                                    </div>
                                }
                            >
                                {/* Raw Button (ref-forwarding) as the Popover
                                    target, with the FormButton class so it is
                                    visually identical to the other actions. The
                                    tooltip nests inside the Popover target. */}
                                <Tooltip content="Define as a named selection (reusable in this scene)">
                                    <Button
                                        small
                                        className="h3-form-btn"
                                        icon={<AppIcon name="ui.tag" aria-hidden />}
                                        aria-label="Define name"
                                        disabled={!defineEnabled}
                                    />
                                </Tooltip>
                            </Popover>
                        </div>
                    </FieldSection>

                    {/* No onQuickApply here: the default onApply channel
                        already applies straight to mol.sel (live, no history
                        record), which is exactly what a Named / History tab
                        click should do. namedCurrentSel is omitted as well --
                        `current` already mirrors mol.sel, so a "Selected"
                        entry would duplicate it. */}
                    <SelectionBuilder
                        current={currentSel}
                        draft={draft}
                        dispatch={dispatch}
                        onApply={onBuilderApply}
                        history={historyItems}
                        sceneDefs={sceneDefs}
                        globalDefs={globalDefs}
                        resolveValues={resolveValues}
                        getHitCount={getHitCount}
                        disabled={!canApply}
                    />
                    </div>
                </div>
            )}
        </div>
    );
};
