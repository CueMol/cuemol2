/**
 * @file features/trajectory/useTrajectory.ts
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
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol';
import type {
    TrajectoryState,
    TrajBlockInfo,
} from '@renderer/worker/server/services/traj/trajectory';
import { SEM_OBJECT, SEM_ANY, SEM_CHANGED } from '@renderer/event';
import { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener';
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard';

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
    const guard = useStaleGuard();

    const refetch = useCallback(() => {
        const sid = sceneIdRef.current;
        const oid = objIdRef.current;
        if (!cm || sid === undefined || oid === undefined) {
            setState(EMPTY);
            return;
        }
        const token = guard.next();
        setLoading(true);
        cm.invokeService('getTrajectoryState', { sceneId: sid, objId: oid })
            .then((res) => {
                if (guard.isCurrent(token)) setState(res ?? EMPTY);
            })
            .catch((err: unknown) => {
                if (guard.isCurrent(token)) {
                    console.warn('getTrajectoryState failed:', err);
                    setState(EMPTY);
                }
            })
            .finally(() => {
                if (guard.isCurrent(token)) setLoading(false);
            });
    }, [cm, guard]);

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

    // Structure changes -> refetch. This includes object add/remove/prop
    // (SEM_ADDED/REMOVING/PROPCHG) and the trajectory's own block append/remove,
    // which fire OBE_CHANGED with descr "topologyChanged". The per-frame
    // coordinate event (descr "atomsMoved", also SEM_CHANGED) is ignored so
    // playback/scrub does not cause a refetch storm.
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined && objId !== undefined,
        category: '',
        srcMask: SEM_OBJECT,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: (args: unknown) => {
            // The event category is delivered as `method` (see EventSlots).
            // Block append/remove fires SEM_CHANGED with method
            // "trajBlockChanged" (a trajectory-specific structural change,
            // distinct from molecular "topologyChanged"); the per-frame
            // coordinate event is "atomsMoved" and is ignored to avoid a
            // playback refetch storm.
            const a = args as { evtType?: number; method?: string } | null;
            if (a?.evtType === SEM_CHANGED && a?.method !== 'trajBlockChanged') return;
            refetch();
        },
        // No debounce: removeBlock fires atomsMoved (from the coord update)
        // *before* trajBlockChanged, and a leading-edge debounce would deliver
        // only the first event (atomsMoved -> ignored), dropping trajBlockChanged.
        // Delivering each event individually lets the handler ignore atomsMoved
        // and refetch on trajBlockChanged (matching useMolSequenceData).
    });

    return {
        nframe: state.nframe,
        frame: state.frame,
        blocks: state.blocks as TrajBlockInfo[],
        loading,
        refetch,
    };
}
