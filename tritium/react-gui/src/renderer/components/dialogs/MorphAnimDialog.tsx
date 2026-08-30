/**
 * @file components/dialogs/MorphAnimDialog.tsx
 * @description "Morph animation tool" dialog (Tools > Mol morphing
 * animation...). Ports UXP `tools/morphanim-tool-dlg.xul` + the
 * `onMorphAnimSetup` entry flow:
 *   - Target selector (MolCoord / MorphMol). UXP asks with a prompt BEFORE
 *     opening the dialog and converts a picked MolCoord immediately; here the
 *     selector lives in-dialog and the (destructive, undoable) conversion is
 *     an explicit "Convert to MorphMol" button.
 *   - For a MorphMol target: the frame list (Name / Source; the base frame
 *     shows as "(this)") with Add PDB file... / Add mol... / Delete controls.
 *     Edits apply immediately inside their own undo txns (UXP parity) --
 *     the single footer button just closes the dialog.
 *
 * Playback is not set up here: bind the MorphMol to a "Mol morphing"
 * (MolAnim) element in the Animation panel, as in UXP.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@blueprintjs/core';
import { DialogShell } from './DialogShell';
import { AppIcon } from '@renderer/h3-kit/primitives';
import { Field, FieldSection, ButtonRow, FormButton } from '@renderer/h3-kit/form';
import { Listbox, ListRow } from '@renderer/h3-kit/list';
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect';
import type { SceneObjectEntry } from '../../worker/server/services/listSceneObjects.service';
import type { MorphFrameInfo } from '../../worker/server/services/morphMol.service';
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import { IPC } from '@shared/ipcChannels';

interface Props {
    visible: boolean;
    sceneId: number;
    onClose: () => void;
}

const PDB_FILTERS = [
    { name: 'PDB structure (*.pdb, *.ent, *.pdb.gz)', extensions: ['pdb', 'ent', 'gz'] },
    { name: 'All Files', extensions: ['*'] },
];

/** MolCoord / MorphMol -- the objects the tool can target (UXP filter). */
const targetFilter = (it: SceneObjectEntry): boolean => objectFilters.molCoord(it);

export function MorphAnimDialog({ visible, sceneId, onClose }: Props): React.JSX.Element {
    const { cm } = useCueMol();

    const [targetId, setTargetId] = useState<number | undefined>(undefined);
    const [isMorphMol, setIsMorphMol] = useState(false);
    const [frames, setFrames] = useState<MorphFrameInfo[]>([]);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const [addMolOpen, setAddMolOpen] = useState(false);
    const [addMolId, setAddMolId] = useState<number | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Reset per-open state (the provider reuses one component instance).
    useEffect(() => {
        if (!visible) return;
        setTargetId(undefined);
        setIsMorphMol(false);
        setFrames([]);
        setSelectedIdx(-1);
        setAddMolOpen(false);
        setErrorMsg(null);
    }, [visible]);

    const refetchFrames = useCallback(async (objId: number | undefined): Promise<void> => {
        if (!cm || objId === undefined) {
            setIsMorphMol(false);
            setFrames([]);
            return;
        }
        const res = await cm.invokeService('getMorphFrames', { sceneId, objId });
        setIsMorphMol(res.isMorphMol);
        setFrames(res.ok ? res.frames : []);
    }, [cm, sceneId]);

    useEffect(() => {
        if (!visible) return;
        setSelectedIdx(-1);
        setAddMolOpen(false);
        void refetchFrames(targetId);
    }, [visible, targetId, refetchFrames]);

    /** Insert position: after the selected row, or append when none (UXP). */
    const insertIndex = selectedIdx >= 0 ? selectedIdx + 1 : -1;

    const handleConvert = async (): Promise<void> => {
        if (!cm || targetId === undefined) return;
        setBusy(true);
        setErrorMsg(null);
        try {
            const res = await cm.invokeService('convertToMorphMol', {
                sceneId, objId: targetId,
            });
            if (!res.ok) {
                setErrorMsg(`Convert to MorphMol failed: ${res.error ?? 'unknown error'}`);
                return;
            }
            // Select the replacement object; ObjectSelect refreshes its list
            // from the SEM_OBJECT events fired by the swap.
            setTargetId(res.morphObjId);
        } finally {
            setBusy(false);
        }
    };

    const handleAddPdb = async (): Promise<void> => {
        if (!cm || targetId === undefined) return;
        let paths: string[] = [];
        try {
            const res = await window.electronAPI?.invoke(IPC.DIALOG_PICK_PATH, {
                title: 'Add PDB file(s)',
                filters: PDB_FILTERS,
                multi: true,
            });
            if (!res || res.canceled) return;
            paths = res.filePaths ?? (res.filePath ? [res.filePath] : []);
        } catch {
            return; /* dialog unavailable (e.g. Vite dev server) */
        }
        if (paths.length === 0) return;

        setBusy(true);
        setErrorMsg(null);
        try {
            let ins = insertIndex;
            for (const path of paths) {
                const res = await cm.invokeService('addMorphFrameFromFile', {
                    sceneId, objId: targetId, path, insertIndex: ins,
                });
                if (!res.ok) {
                    setErrorMsg(`Failed to add "${path}": ${res.error ?? 'unknown error'}`);
                    break;
                }
                if (ins >= 0) {
                    setSelectedIdx(ins);
                    ins++;
                }
            }
            await refetchFrames(targetId);
        } finally {
            setBusy(false);
        }
    };

    const handleAddMol = async (): Promise<void> => {
        if (!cm || targetId === undefined || addMolId === undefined) return;
        setBusy(true);
        setErrorMsg(null);
        try {
            const res = await cm.invokeService('addMorphFrameFromMol', {
                sceneId, objId: targetId, srcObjId: addMolId, insertIndex,
            });
            if (!res.ok) {
                setErrorMsg(`Failed to add molecule: ${res.error ?? 'unknown error'}`);
                return;
            }
            if (insertIndex >= 0) setSelectedIdx(insertIndex);
            setAddMolOpen(false);
            await refetchFrames(targetId);
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (): Promise<void> => {
        if (!cm || targetId === undefined || selectedIdx < 0) return;
        setBusy(true);
        setErrorMsg(null);
        try {
            const res = await cm.invokeService('removeMorphFrame', {
                sceneId, objId: targetId, frameIndex: selectedIdx,
            });
            if (!res.ok) {
                setErrorMsg(`Failed to delete frame: ${res.error ?? 'unknown error'}`);
                return;
            }
            setSelectedIdx(-1);
            await refetchFrames(targetId);
        } finally {
            setBusy(false);
        }
    };

    const canDelete = selectedIdx >= 0 && !frames[selectedIdx]?.isThis && !busy;

    /** MolCoord sources for "Add mol..." -- plain MolCoords only (UXP). */
    const addMolFilter = useCallback(
        (it: SceneObjectEntry): boolean =>
            objectFilters.molCoord(it) && it.className !== 'MorphMol',
        [],
    );

    return (
        <DialogShell
            visible={visible}
            title="Morph animation tool"
            width="2xl"
            onCancel={onClose}
            errorMsg={errorMsg}
            footerActions={<Button onClick={onClose}>Close</Button>}
        >
            <ObjectSelect
                cm={cm}
                sceneId={sceneId}
                label="Target"
                filter={targetFilter}
                selectedId={targetId}
                onChange={setTargetId}
                emptyText="(no molecules)"
            />

            {targetId !== undefined && !isMorphMol && (
                <FieldSection title="Setup">
                    <div className="type-caption">
                        The selected molecule is not a MorphMol yet. Convert it to
                        set up morphing frames (the object is replaced in the
                        scene; renderers are kept, and the step can be undone).
                    </div>
                    <ButtonRow>
                        <FormButton
                            text="Convert to MorphMol"
                            onClick={() => { void handleConvert(); }}
                            disabled={busy}
                        />
                    </ButtonRow>
                </FieldSection>
            )}

            {isMorphMol && (
                <FieldSection
                    title="Frames"
                    titleActions={
                        <span className="type-caption">
                            {frames.length} frame{frames.length === 1 ? '' : 's'}
                        </span>
                    }
                >
                    <Listbox framed>
                        {frames.length === 0 ? (
                            <div className="h3-list-empty">(no frames)</div>
                        ) : (
                            frames.map((f, idx) => (
                                <ListRow
                                    key={`${f.name}-${idx}`}
                                    selected={idx === selectedIdx}
                                    onClick={() => setSelectedIdx(idx)}
                                >
                                    <span className="type-row" title={f.src || f.name}>
                                        {f.name}
                                    </span>
                                    <span className="type-caption">{f.src}</span>
                                </ListRow>
                            ))
                        )}
                    </Listbox>
                    <ButtonRow>
                        <FormButton
                            icon={<AppIcon name="ui.add" aria-hidden />}
                            text="Add PDB file..."
                            onClick={() => { void handleAddPdb(); }}
                            disabled={busy}
                        />
                        <FormButton
                            icon={<AppIcon name="ui.add" aria-hidden />}
                            text="Add mol..."
                            onClick={() => setAddMolOpen((v) => !v)}
                            disabled={busy}
                        />
                        <FormButton
                            icon={<AppIcon name="ui.trash" aria-hidden />}
                            text="Delete"
                            onClick={() => { void handleDelete(); }}
                            disabled={!canDelete}
                        />
                    </ButtonRow>
                    {addMolOpen && (
                        <>
                            <Field label="Molecule to add">
                                <ObjectSelect
                                    cm={cm}
                                    sceneId={sceneId}
                                    label="Molecule to add"
                                    hideLabel
                                    filter={addMolFilter}
                                    selectedId={addMolId}
                                    onChange={setAddMolId}
                                    emptyText="(no molecules)"
                                />
                            </Field>
                            <ButtonRow>
                                <FormButton
                                    text="Add as frame"
                                    onClick={() => { void handleAddMol(); }}
                                    disabled={busy || addMolId === undefined}
                                />
                                <FormButton
                                    text="Cancel"
                                    onClick={() => setAddMolOpen(false)}
                                    disabled={busy}
                                />
                            </ButtonRow>
                        </>
                    )}
                </FieldSection>
            )}
        </DialogShell>
    );
}
