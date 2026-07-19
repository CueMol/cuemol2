/**
 * @file components/panels/TrajectoryPanel.tsx
 * @description MD Trajectory bottom pane -- a frame timeline for a loaded
 * `mdtools::Trajectory`, in the spirit of the Animation panel.
 *
 * ## Layout
 *
 * ```
 * +-----------------------------------------------------------------+
 * | Trajectory [v Traj-1] [|<][>/||][##] Frame [42]/500 Loop Speed  |  <- 1 select + transport
 * +-----------------------------------------------------------------+
 * | 0      100      200      300      400      500                  |  <- 2 frame ruler
 * | [ md1.xtc ][   md2.xtc   ][ md3.dcd ][   md4.trr   ]            |  <- 3 block segments
 * |                 | playhead overlaps the blocks (up-triangle grip)|
 * +-----------------------------------------------------------------+
 * | [+ Add][x][<][>]                                     3 blocks    |  <- 4 block toolbar
 * +-----------------------------------------------------------------+
 * ```
 *
 * A Trajectory exposes only a frame cursor (frame / nframe) plus block getters;
 * it has no C++ playback engine, so `useTrajPlayback` drives playback with a JS
 * timer. Block remove / reorder need new C++ methods and are deferred (the
 * toolbar buttons are present but disabled); Add appends via the load flow.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppIcon } from '../AppIcon';
import { ButtonRow, FormButton } from '../../h3-kit/form/ButtonRow';
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect';
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol';
import { IPC } from '../../../shared/ipcChannels';
import { useTrajectory } from '../../hooks/useTrajectory';
import { useTrajPlayback } from '../../hooks/useTrajPlayback';
import { TrajTransport } from './mdtraj/TrajTransport';
import { TrajTrack } from './mdtraj/TrajTrack';
import {
    DEFAULT_PX_PER_FRAME,
    clampPxPerFrame,
    fitPxPerFrame,
} from './mdtraj/trackGeometry';

interface TrajectoryPanelProps {
    cm: AsyncCueMol | null;
    /** Active scene UID; undefined when no scene is active. */
    activeSceneId: number | undefined;
}

/** Step factor for the zoom in / out buttons. */
const ZOOM_FACTOR = 1.4;

/** Native file-picker filters for adding trajectory blocks. */
const TRAJ_FILTERS = [
    { name: 'MD trajectory (*.dcd, *.xtc, *.trr)', extensions: ['dcd', 'xtc', 'trr'] },
    { name: 'All Files', extensions: ['*'] },
];

/**
 * MD trajectory timeline panel. Selects a target Trajectory object, draws its
 * blocks as a frame-proportional track, drives frame playback / scrub, and adds
 * blocks (append). Remove / reorder are deferred (need new C++ methods).
 */
export const TrajectoryPanel: React.FC<TrajectoryPanelProps> = ({ cm, activeSceneId }) => {
    const [objId, setObjId] = useState<number | undefined>(undefined);
    const [pxPerFrame, setPxPerFrame] = useState(DEFAULT_PX_PER_FRAME);
    const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const panelRef = useRef<HTMLDivElement>(null);

    const { nframe, frame: baseFrame, blocks, refetch } = useTrajectory({
        cm,
        sceneId: activeSceneId,
        objId,
    });

    const playback = useTrajPlayback({
        cm,
        sceneId: activeSceneId,
        objId,
        nframe,
        baseFrame,
    });

    // Reset per-target UI state when the target changes.
    useEffect(() => {
        setSelectedBlock(null);
        setError(null);
    }, [objId]);

    // Drop a stale block selection when the block list shrinks.
    useEffect(() => {
        if (selectedBlock !== null && selectedBlock >= blocks.length) {
            setSelectedBlock(null);
        }
    }, [blocks.length, selectedBlock]);

    // Initial zoom = the Fit scale: when a target's frame count first becomes
    // known, fit the whole trajectory to the panel width (once per target, so a
    // later manual zoom or an Add is not overridden).
    const fittedForRef = useRef<number | undefined>(undefined);
    useEffect(() => {
        if (objId === undefined || nframe <= 0) return;
        if (fittedForRef.current === objId) return;
        fittedForRef.current = objId;
        const avail = panelRef.current?.clientWidth ?? 0;
        setPxPerFrame(fitPxPerFrame(nframe, avail));
    }, [objId, nframe]);

    const handleZoomIn = useCallback(
        () => setPxPerFrame((p) => clampPxPerFrame(p * ZOOM_FACTOR)),
        [],
    );
    const handleZoomOut = useCallback(
        () => setPxPerFrame((p) => clampPxPerFrame(p / ZOOM_FACTOR)),
        [],
    );
    const handleFit = useCallback(() => {
        const avail = panelRef.current?.clientWidth ?? 0;
        setPxPerFrame(fitPxPerFrame(nframe, avail));
    }, [nframe]);

    /** Append one or more trajectory files as new blocks (native multi-pick). */
    const handleAddBlocks = useCallback(async () => {
        if (!cm || activeSceneId === undefined || objId === undefined) return;
        setError(null);
        try {
            const res = await window.electronAPI?.invoke(IPC.DIALOG_PICK_PATH, {
                title: 'Add trajectory files',
                filters: TRAJ_FILTERS,
                multi: true,
            });
            if (!res || res.canceled) return;
            const paths = res.filePaths ?? (res.filePath ? [res.filePath] : []);
            for (const path of paths) {
                const r = await cm.invokeService('appendTrajectoryBlock', {
                    sceneId: activeSceneId,
                    objId,
                    path,
                });
                if (!r.ok) {
                    setError(r.error ?? `Failed to add ${path}`);
                    break;
                }
            }
            refetch();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [cm, activeSceneId, objId, refetch]);

    // --- Empty (no scene) state ---
    if (!cm || activeSceneId === undefined) {
        return (
            <div className="mdtraj-panel" ref={panelRef}>
                <div className="mdtraj-placeholder">
                    <AppIcon name="panel.trajectory" size={48} className="placeholder-icon" aria-hidden />
                    <div>No active scene</div>
                </div>
            </div>
        );
    }

    const hasTrajectory = objId !== undefined;

    return (
        <div className="mdtraj-panel" ref={panelRef}>
            {error && <div className="mdtraj-error type-caption">{error}</div>}

            <TrajTransport
                leftSlot={
                    <div className="mdtraj-target">
                        <span className="mdtraj-readout-label type-caption">Trajectory</span>
                        <ObjectSelect
                            cm={cm}
                            sceneId={activeSceneId}
                            label="Trajectory"
                            filter={objectFilters.trajectory}
                            selectedId={objId}
                            onChange={setObjId}
                            emptyText="No trajectory loaded"
                            hideLabel
                        />
                    </div>
                }
                frame={playback.frame}
                nframe={nframe}
                isPlaying={playback.isPlaying}
                canControl={playback.canControl}
                loop={playback.loop}
                fps={playback.fps}
                onPlayPause={playback.togglePlay}
                onStop={playback.stop}
                onSkipStart={playback.skipToStart}
                onSkipEnd={playback.skipToEnd}
                onToggleLoop={playback.setLoop}
                onSetFps={playback.setFps}
                onCommitFrame={playback.commit}
                onFit={handleFit}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
            />

            <TrajTrack
                blocks={blocks}
                nframe={nframe}
                frame={playback.frame}
                pxPerFrame={pxPerFrame}
                canControl={playback.canControl}
                selectedBlock={selectedBlock}
                onSelectBlock={setSelectedBlock}
                onScrubPreview={playback.previewFrame}
                onScrubCommit={playback.commit}
            />

            <ButtonRow className="mdtraj-block-toolbar">
                <FormButton
                    icon={<AppIcon name="ui.add" aria-hidden />}
                    text="Add..."
                    onClick={handleAddBlocks}
                    disabled={!hasTrajectory}
                    title="Add trajectory file(s)"
                />
                <FormButton
                    icon={<AppIcon name="ui.trash" aria-hidden />}
                    disabled
                    title="Remove block (not yet available)"
                />
                <FormButton
                    icon={<AppIcon name="ui.caretLeft" aria-hidden />}
                    disabled
                    title="Move block earlier (not yet available)"
                />
                <FormButton
                    icon={<AppIcon name="ui.caretRight" aria-hidden />}
                    disabled
                    title="Move block later (not yet available)"
                />
                <span className="mdtraj-block-count type-caption">
                    {blocks.length} block{blocks.length === 1 ? '' : 's'}
                </span>
            </ButtonRow>

            {!hasTrajectory && (
                <div className="mdtraj-hint type-caption">
                    No trajectory in this scene -- use File &gt; Open MD Trajectory... to load one.
                </div>
            )}
        </div>
    );
};
