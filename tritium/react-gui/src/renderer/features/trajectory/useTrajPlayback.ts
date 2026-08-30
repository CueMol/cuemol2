/**
 * @file hooks/useTrajPlayback.ts
 * @description Playback transport + live frame cursor for the MD Trajectory
 * pane.
 *
 * Unlike the Animation panel (whose playback is driven by the C++ `AnimMgr`
 * timer), a `Trajectory` exposes no playback engine -- only a `frame` cursor.
 * So playback is driven HERE by a JS timer: each tick advances the frame and
 * commits it via `setTrajectoryFrame`, which writes the block coordinates and
 * re-renders. This hook is the source of truth for the current frame during
 * playback and scrubbing.
 *
 * The displayed frame is `scrubFrame ?? committedFrame`: a drag sets a local
 * preview (`previewFrame`) without seeking, and the release commits once
 * (`commit`) -- the same "local preview, single commit" pattern the Animation
 * ruler uses, so a large trajectory is not re-seeked on every mouse move.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol';
import { SEM_OBJECT, SEM_CHANGED } from '@renderer/event';
import { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener';

interface UseTrajPlaybackOptions {
    cm: AsyncCueMol | null;
    sceneId: number | undefined;
    /** Selected trajectory object uid. */
    objId: number | undefined;
    /** Total frame count (from useTrajectory). */
    nframe: number;
    /** Fetched baseline frame (seeds the cursor while idle). */
    baseFrame: number;
}

export interface UseTrajPlaybackResult {
    /** Displayed frame (scrub preview if dragging, else the committed frame). */
    frame: number;
    isPlaying: boolean;
    loop: boolean;
    /** Playback rate in frames per second. */
    fps: number;
    /** True when cm + scene + object + at least one frame are all available. */
    canControl: boolean;
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    /** Stop playback and rewind to frame 0. */
    stop: () => void;
    skipToStart: () => void;
    skipToEnd: () => void;
    setLoop: (loop: boolean) => void;
    setFps: (fps: number) => void;
    /** Commit a frame (spinbox entry, scrub release, ruler click). */
    commit: (frame: number) => void;
    /** Set a local scrub preview without seeking (null = clear preview). */
    previewFrame: (frame: number | null) => void;
}

const DEFAULT_FPS = 15;
const MIN_FPS = 1;
const MAX_FPS = 60;

// Ignore atomsMoved events we caused ourselves for this long after a commit,
// so a self-seek does not trigger a redundant read-back.
const SELF_WRITE_GUARD_MS = 200;

/**
 * JS-timer playback controller for a trajectory's frame cursor.
 *
 * @param opts - cm, scene/object ids, total frame count, and baseline frame.
 * @returns The current frame plus transport actions and scrub controls.
 */
export function useTrajPlayback({
    cm,
    sceneId,
    objId,
    nframe,
    baseFrame,
}: UseTrajPlaybackOptions): UseTrajPlaybackResult {
    const [committed, setCommitted] = useState(0);
    const [scrubFrame, setScrubFrame] = useState<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [loop, setLoop] = useState(false);
    const [fps, setFpsState] = useState(DEFAULT_FPS);

    const cmRef = useRef(cm);
    cmRef.current = cm;
    const sceneIdRef = useRef(sceneId);
    sceneIdRef.current = sceneId;
    const objIdRef = useRef(objId);
    objIdRef.current = objId;
    const nframeRef = useRef(nframe);
    nframeRef.current = nframe;
    const committedRef = useRef(committed);
    committedRef.current = committed;
    const loopRef = useRef(loop);
    loopRef.current = loop;
    const isPlayingRef = useRef(isPlaying);
    isPlayingRef.current = isPlaying;
    const scrubRef = useRef(scrubFrame);
    scrubRef.current = scrubFrame;
    const selfWriteUntilRef = useRef(0);

    const canControl =
        !!cm && sceneId !== undefined && objId !== undefined && nframe > 0;

    /** Commit a frame: update local state and seek the C++ trajectory. */
    const commit = useCallback((f: number) => {
        const nf = nframeRef.current;
        if (nf <= 0) return;
        const clamped = Math.max(0, Math.min(Math.trunc(f), nf - 1));
        committedRef.current = clamped;
        setScrubFrame(null);
        setCommitted(clamped);
        const c = cmRef.current;
        const sid = sceneIdRef.current;
        const oid = objIdRef.current;
        if (c && sid !== undefined && oid !== undefined) {
            selfWriteUntilRef.current = performance.now() + SELF_WRITE_GUARD_MS;
            c.invokeService('setTrajectoryFrame', {
                sceneId: sid,
                objId: oid,
                frame: clamped,
            }).catch((err: unknown) => console.warn('setTrajectoryFrame failed:', err));
        }
    }, []);

    const previewFrame = useCallback((f: number | null) => {
        if (f === null) {
            setScrubFrame(null);
            return;
        }
        const nf = nframeRef.current;
        if (nf <= 0) return;
        setScrubFrame(Math.max(0, Math.min(Math.trunc(f), nf - 1)));
    }, []);

    // Reset transport when the target object changes.
    useEffect(() => {
        setIsPlaying(false);
        setScrubFrame(null);
    }, [objId]);

    // Seed / refresh the committed cursor from the fetched baseline while idle
    // (not playing, not scrubbing), so an external frame change is reflected.
    useEffect(() => {
        if (isPlayingRef.current || scrubRef.current !== null) return;
        const nf = nframeRef.current;
        const seed = nf > 0 ? Math.max(0, Math.min(baseFrame, nf - 1)) : 0;
        committedRef.current = seed;
        setCommitted(seed);
    }, [baseFrame, objId, nframe]);

    // Playback timer: advance one frame per tick at the current fps.
    useEffect(() => {
        if (!isPlaying) return;
        if (nframe <= 0) return;
        const intervalMs = Math.max(1, Math.round(1000 / fps));
        const id = setInterval(() => {
            const nf = nframeRef.current;
            if (nf <= 0) return;
            const cur = committedRef.current;
            const next = cur + 1;
            if (next >= nf) {
                if (loopRef.current) {
                    commit(0);
                } else {
                    commit(nf - 1);
                    setIsPlaying(false);
                }
            } else {
                commit(next);
            }
        }, intervalMs);
        return () => clearInterval(id);
    }, [isPlaying, fps, nframe, commit]);

    // External frame changes (script / other view): read back while idle. Skip
    // events we caused (self-write guard) and events for other objects.
    useCueMolEventListener({
        cm,
        enabled: canControl,
        category: '',
        srcMask: SEM_OBJECT,
        evtMask: SEM_CHANGED,
        scopeId: sceneId ?? -1,
        handler: (args: unknown) => {
            if (isPlayingRef.current || scrubRef.current !== null) return;
            if (performance.now() < selfWriteUntilRef.current) return;
            const a = args as { srcUID?: number; obj?: { target_uid?: number } } | null;
            const oid = objIdRef.current;
            const src = a?.srcUID ?? a?.obj?.target_uid;
            if (oid !== undefined && src !== undefined && src !== oid) return;
            const c = cmRef.current;
            const sid = sceneIdRef.current;
            if (!c || sid === undefined || oid === undefined) return;
            c.invokeService('getTrajectoryState', { sceneId: sid, objId: oid })
                .then((res) => {
                    if (!res?.ok) return;
                    if (isPlayingRef.current || scrubRef.current !== null) return;
                    const nf = nframeRef.current;
                    const f = nf > 0 ? Math.max(0, Math.min(res.frame, nf - 1)) : 0;
                    committedRef.current = f;
                    setCommitted(f);
                })
                .catch(() => {
                    /* keep last frame */
                });
        },
    });

    const play = useCallback(() => {
        if (nframeRef.current <= 0) return;
        // Restart from 0 when already at the end.
        if (committedRef.current >= nframeRef.current - 1) commit(0);
        setIsPlaying(true);
    }, [commit]);

    const pause = useCallback(() => setIsPlaying(false), []);

    const togglePlay = useCallback(() => {
        if (isPlayingRef.current) setIsPlaying(false);
        else play();
    }, [play]);

    const stop = useCallback(() => {
        setIsPlaying(false);
        commit(0);
    }, [commit]);

    const skipToStart = useCallback(() => commit(0), [commit]);
    const skipToEnd = useCallback(() => commit(nframeRef.current - 1), [commit]);

    const setFps = useCallback((v: number) => {
        setFpsState(Math.max(MIN_FPS, Math.min(Math.trunc(v), MAX_FPS)));
    }, []);

    return {
        frame: scrubFrame ?? committed,
        isPlaying,
        loop,
        fps,
        canControl,
        play,
        pause,
        togglePlay,
        stop,
        skipToStart,
        skipToEnd,
        setLoop,
        setFps,
        commit,
        previewFrame,
    };
}
