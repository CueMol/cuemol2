/**
 * @file components/dialogs/OpenMdTrajDialog.tsx
 * @description "Open MD Trajectory" dialog -- step 1 of the two-step trajectory
 * open flow. It COLLECTS a topology file (GROMACS .gro) plus an ordered list of
 * trajectory files (.dcd/.xtc/.trr); it does NOT load anything. The command
 * runs the actual (deferred) load only after the follow-up renderer dialog is
 * confirmed, so cancelling either dialog loads nothing (matching the normal
 * load-object flow).
 *
 * Files are collected in-dialog via native pickers (topology = single-select,
 * trajectory = multi-select) because the input is a set, not a single path.
 * Trajectory order is significant (frames concatenate in list order), hence the
 * Up/Down reordering controls (add/remove/move logic mirrors ApplyRendStyleDialog).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { DialogShell } from './DialogShell';
import { AppIcon } from '../AppIcon';
import { Field } from '../../h3-kit/form/Field';
import { FieldSection } from '../../h3-kit/form/FieldSection';
import { ComboBoxField } from '../../h3-kit/form/ComboBoxField';
import { SliderField } from '../../h3-kit/form/SliderField';
import { ButtonRow, FormButton } from '../../h3-kit/form/ButtonRow';
import { Listbox } from '../../h3-kit/list/Listbox';
import { ListRow } from '../../h3-kit/list/ListRow';
import { IPC } from '../../../shared/ipcChannels';
import {
    getLastTopologyPath,
    setLastTopologyPath,
    setLastTrajPath,
} from './trajPathHistory';

export interface OpenMdTrajResult {
    /** Topology file (GROMACS .gro). */
    topologyPath: string;
    /** Trajectory files (.dcd/.xtc/.trr) in frame-concatenation order. */
    trajPaths: string[];
    /** Load every Nth frame (1 = every frame). */
    nevery: number;
}

interface Props {
    visible: boolean;
    onConfirm: (result: OpenMdTrajResult) => void;
    onCancel: () => void;
}

const TOPOLOGY_FILTERS = [
    { name: 'GROMACS topology (*.gro)', extensions: ['gro'] },
    { name: 'All Files', extensions: ['*'] },
];

const TRAJ_FILTERS = [
    { name: 'MD trajectory (*.dcd, *.xtc, *.trr)', extensions: ['dcd', 'xtc', 'trr'] },
    { name: 'All Files', extensions: ['*'] },
];

/** Trajectory extension -> short format badge label. */
const TRAJ_BADGE: Record<string, string> = { dcd: 'DCD', xtc: 'XTC', trr: 'TRR' };

function basename(p: string): string {
    return p.split(/[\\/]/).pop() ?? p;
}

function fileExt(p: string): string {
    const base = basename(p);
    const dot = base.lastIndexOf('.');
    return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

function trajBadge(p: string): string {
    return TRAJ_BADGE[fileExt(p)] ?? fileExt(p).toUpperCase();
}

export function OpenMdTrajDialog({ visible, onConfirm, onCancel }: Props): React.JSX.Element {
    const [topologyPath, setTopologyPath] = useState('');
    const [trajPaths, setTrajPaths] = useState<string[]>([]);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const [nevery, setNevery] = useState(1);

    // Seed state each time the dialog opens: topology from history, an empty
    // trajectory list, stride reset to 1.
    useEffect(() => {
        if (!visible) return;
        setTopologyPath(getLastTopologyPath() ?? '');
        setTrajPaths([]);
        setSelectedIdx(-1);
        setNevery(1);
    }, [visible]);

    const topoOptions = useMemo(() => {
        const last = getLastTopologyPath();
        return last ? [last] : [];
    }, [visible]);

    const browseTopology = async (): Promise<void> => {
        try {
            const res = await window.electronAPI?.invoke(IPC.DIALOG_PICK_PATH, {
                title: 'Select topology file',
                filters: TOPOLOGY_FILTERS,
            });
            if (res && !res.canceled && res.filePath) {
                setTopologyPath(res.filePath);
                setLastTopologyPath(res.filePath);
            }
        } catch {
            /* dialog unavailable (e.g. Vite dev server) -- ignore */
        }
    };

    const addTrajectories = async (): Promise<void> => {
        try {
            const res = await window.electronAPI?.invoke(IPC.DIALOG_PICK_PATH, {
                title: 'Add trajectory files',
                filters: TRAJ_FILTERS,
                multi: true,
            });
            if (res && !res.canceled) {
                const added = res.filePaths ?? (res.filePath ? [res.filePath] : []);
                if (added.length > 0) {
                    setTrajPaths((prev) => [...prev, ...added]);
                    setLastTrajPath(added[added.length - 1]);
                }
            }
        } catch {
            /* dialog unavailable -- ignore */
        }
    };

    const removeTrajectory = (): void => {
        if (selectedIdx < 0) return;
        const next = trajPaths.slice();
        next.splice(selectedIdx, 1);
        setTrajPaths(next);
        setSelectedIdx(next.length === 0 ? -1 : Math.min(selectedIdx, next.length - 1));
    };

    const moveTrajectory = (delta: -1 | 1): void => {
        if (selectedIdx < 0) return;
        const target = selectedIdx + delta;
        if (target < 0 || target >= trajPaths.length) return;
        const next = trajPaths.slice();
        const [moved] = next.splice(selectedIdx, 1);
        next.splice(target, 0, moved);
        setTrajPaths(next);
        setSelectedIdx(target);
    };

    const canDelete = selectedIdx >= 0;
    const canMoveUp = selectedIdx > 0;
    const canMoveDown = selectedIdx >= 0 && selectedIdx < trajPaths.length - 1;
    const canOpen = topologyPath.trim().length > 0 && trajPaths.length > 0;

    const handleOk = (): void => {
        if (!canOpen) return;
        onConfirm({ topologyPath: topologyPath.trim(), trajPaths, nevery });
    };

    return (
        <DialogShell
            visible={visible}
            title="Open MD Trajectory"
            width="2xl"
            okLabel="Open"
            okDisabled={!canOpen}
            onOk={handleOk}
            onCancel={onCancel}
        >
            {/* Wider inter-section gap than the default form-section-gap so the
                three meaning-units (topology / files / sampling) read apart. */}
            <div className="omt-traj-sections">
            <FieldSection title="Topology">
                <Field label="Topology file (.gro)">
                    <ComboBoxField
                        value={topologyPath}
                        onChange={setTopologyPath}
                        options={topoOptions}
                        placeholder="/path/to/system.gro"
                        emptyText="No recent files"
                    />
                </Field>
                <ButtonRow>
                    <FormButton text="Browse..." onClick={browseTopology} />
                </ButtonRow>
            </FieldSection>

            <FieldSection
                title="Trajectory files"
                titleActions={
                    <span className="type-caption">
                        {trajPaths.length} file{trajPaths.length === 1 ? '' : 's'}
                    </span>
                }
            >
                <Listbox framed>
                    {trajPaths.length === 0 ? (
                        <div className="h3-list-empty">(no trajectory files added)</div>
                    ) : (
                        trajPaths.map((p, idx) => (
                            <ListRow
                                key={`${p}-${idx}`}
                                selected={idx === selectedIdx}
                                onClick={() => setSelectedIdx(idx)}
                            >
                                <span className="type-row" title={p}>{basename(p)}</span>
                                <span className="type-caption">{trajBadge(p)}</span>
                            </ListRow>
                        ))
                    )}
                </Listbox>
                <ButtonRow>
                    <FormButton icon={<AppIcon name="ui.add" aria-hidden />} text="Add..." onClick={addTrajectories} />
                    <FormButton icon={<AppIcon name="ui.trash" aria-hidden />} text="Remove" disabled={!canDelete} onClick={removeTrajectory} />
                    <FormButton icon={<AppIcon name="ui.caretUp" aria-hidden />} text="Up" disabled={!canMoveUp} onClick={() => moveTrajectory(-1)} />
                    <FormButton icon={<AppIcon name="ui.caretDown" aria-hidden />} text="Down" disabled={!canMoveDown} onClick={() => moveTrajectory(1)} />
                </ButtonRow>
            </FieldSection>

            <FieldSection title="Frame sampling">
                <SliderField
                    label="Load every N-th frame"
                    value={nevery}
                    min={1}
                    max={9999}
                    step={1}
                    onCommit={setNevery}
                    slider={false}
                />
            </FieldSection>
            </div>
        </DialogShell>
    );
}
