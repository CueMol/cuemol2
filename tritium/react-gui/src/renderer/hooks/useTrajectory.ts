/**
 * @file hooks/useTrajectory.ts
 * @description Live trajectory state (frame count + current frame + block
 * segmentation) for the MD Trajectory bottom pane.
 *
 * Fetches `getTrajectoryState` for the selected trajectory object and refetches
 * on STRUCTURE changes (block append/remove, object add/remove/prop). It
 * deliberately ignores per-frame `atomsMoved` (SEM_OBJECT / SEM_CHANGED) events:
 * those fire once per frame during playback and would cause a refetch storm.
 * The live frame cursor is owned by `useTrajPlayback`, not here; the `frame`
 * returned here is only the fetched baseline (used to seed the playback hook).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncCueMol } from '../worker/client/AsyncCueMol';
import type {
    TrajectoryState,
    TrajBlockInfo,
} from '../worker/server/services/trajectory.service';
import { SEM_OBJECT, SEM_ANY, SEM_CHANGED } from '../event';
import { useCueMolEventListener } from './useCueMolEventListener';

interface UseTrajectoryOptions {
    cm: AsyncCueMol | null;
    sceneId: number | undefined;
    /** Selected trajectory object uid (undefined when none selected). */
    objId: number | undefined;
}

export interface UseTrajectoryResult {
    /** Total frame count across all blocks. */
    nframe: number;
    /** Fetched current frame (baseline; the live cursor lives in playback). */
    frame: number;
    /** Ordered block segments. */
    blocks: TrajBlockInfo[];
    /** True while a fetch is in flight. */
    loading: boolean;
    /** Force a refetch (call after an Add succeeds). */
    refetch: () => void;
}

const EMPTY: TrajectoryState = { ok: false, nframe: 0, frame: 0, blocks: [] };

// Coalesce structure-event bursts (an append/undo fires several events).
const REFETCH_DEBOUNCE_MS = 50;

/**
 * Subscribe to the selected trajectory's frame/block state.
 *
 * @param opts - `cm`, active `sceneId`, and the selected `objId`.
 * @returns nframe / frame / blocks, a loading flag, and a `refetch` callback.
 */
export function useTrajectory({
    cm,
    sceneId,
    objId,
}: UseTrajectoryOptions): UseTrajectoryResult {
    const [state, setState] = useState<TrajectoryState>(EMPTY);
    const [loading, setLoading] = useState(false);

    const sceneIdRef = useRef(sceneId);
    sceneIdRef.current = sceneId;
    const objIdRef = useRef(objId);
    objIdRef.current = objId;
    const tokenRef = useRef(0);

    const refetch = useCallback(() => {
        const sid = sceneIdRef.current;
        const oid = objIdRef.current;
        if (!cm || sid === undefined || oid === undefined) {
            setState(EMPTY);
            return;
        }
        const token = ++tokenRef.current;
        setLoading(true);
        cm.invokeService('getTrajectoryState', { sceneId: sid, objId: oid })
            .then((res) => {
                if (token === tokenRef.current) setState(res ?? EMPTY);
            })
            .catch((err: unknown) => {
                if (token === tokenRef.current) {
                    console.warn('getTrajectoryState failed:', err);
                    setState(EMPTY);
                }
            })
            .finally(() => {
                if (token === tokenRef.current) setLoading(false);
            });
    }, [cm]);

    // Clear immediately on target switch so consumers see nframe=0 until the
    // new target's state arrives (so an auto-fit / seek does not run against the
    // previous target's frame count during the async refetch gap).
    useEffect(() => {
        setState(EMPTY);
    }, [sceneId, objId]);

    // Initial + target-change fetch.
    useEffect(() => {
        refetch();
    }, [cm, sceneId, objId, refetch]);

    // Structure changes only (append/remove/undo). Ignore SEM_CHANGED, which is
    // the per-frame atomsMoved event fired during playback/scrub.
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined && objId !== undefined,
        category: '',
        srcMask: SEM_OBJECT,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: (args: unknown) => {
            const evtType = (args as { evtType?: number } | null)?.evtType;
            if (evtType === SEM_CHANGED) return;
            refetch();
        },
        debounceMs: REFETCH_DEBOUNCE_MS,
    });

    return {
        nframe: state.nframe,
        frame: state.frame,
        blocks: state.blocks as TrajBlockInfo[],
        loading,
        refetch,
    };
}
