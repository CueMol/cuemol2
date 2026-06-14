/**
 * @file hooks/useAnimTransport.ts
 * @description Playback transport + live elapsed state for `AnimationPanel`.
 *
 * Wires the transport actions (play / pause / stop / seek / loop) to the worker
 * `animation.service` and owns the LIVE manager snapshot during playback.
 *
 * CueMol drives playback in C++: `AnimMgr.start(view)` registers a native timer
 * that advances the animation and updates the view camera every tick, and the
 * worker's existing per-frame redraw loop renders it. The renderer only needs
 * to (1) call the transport ops and (2) POLL `elapsed` while playing, because
 * the C++ side fires no per-frame change event (see `AnimMgrState` in types.ts).
 *
 * `mgr` returned here is the live snapshot (`liveMgr`) once any op/poll has run,
 * falling back to the fetched `baseMgr` otherwise.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AsyncCueMol } from "../worker/client/AsyncCueMol";
import type { AnimMgrState } from "../types";

interface UseAnimTransportOptions {
  cm: AsyncCueMol | null;
  sceneId: number | undefined;
  /** Target view for playback/scrub; transport is disabled when undefined. */
  viewId: number | undefined;
  /** Fetched manager snapshot (source until a transport op/poll supersedes it). */
  baseMgr: AnimMgrState | null;
}

export interface UseAnimTransportResult {
  mgr: AnimMgrState;
  isPlaying: boolean;
  /** True when cm + scene + view are all available (transport can act). */
  canControl: boolean;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stop: () => void;
  seek: (ms: number) => void;
  setLoop: (loop: boolean) => void;
}

const EMPTY_MGR: AnimMgrState = {
  lengthMs: 0,
  elapsedMs: 0,
  playState: "stop",
  loop: false,
  startcam: "",
};

// Poll cadence for elapsed during playback (~15 Hz is smooth enough for a
// progress indicator and cheap on the worker).
const POLL_INTERVAL_MS = 66;

/**
 * Transport controller for the active scene's animation.
 *
 * @param opts - cm, active sceneId/viewId, and the fetched base manager state.
 * @returns The live manager snapshot plus transport action callbacks.
 */
export function useAnimTransport({
  cm,
  sceneId,
  viewId,
  baseMgr,
}: UseAnimTransportOptions): UseAnimTransportResult {
  const [liveMgr, setLiveMgr] = useState<AnimMgrState | null>(null);

  const cmRef = useRef(cm);
  cmRef.current = cm;
  const sceneIdRef = useRef(sceneId);
  sceneIdRef.current = sceneId;
  const viewIdRef = useRef(viewId);
  viewIdRef.current = viewId;

  // Drop live state on scene / view switch so the new scene starts clean.
  useEffect(() => {
    setLiveMgr(null);
  }, [sceneId, viewId]);

  const mgr = liveMgr ?? baseMgr ?? EMPTY_MGR;
  const isPlaying = mgr.playState === "play";
  const canControl = !!cm && sceneId !== undefined && viewId !== undefined;

  // Poll elapsed while playing; the effect tears down when isPlaying flips
  // false (a poll reading 'stop'/'pause' updates liveMgr -> isPlaying false).
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = 0;
    let cancelled = false;
    const tick = (now: number) => {
      if (cancelled) return;
      const c = cmRef.current;
      const sid = sceneIdRef.current;
      if (c && sid !== undefined && now - last >= POLL_INTERVAL_MS) {
        last = now;
        c.invokeService("animGetMgrState", { sceneId: sid })
          .then((res) => {
            if (!cancelled && res) setLiveMgr(res);
          })
          .catch(() => {
            /* keep last snapshot */
          });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [isPlaying]);

  const play = useCallback(() => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    const vid = viewIdRef.current;
    if (!c || sid === undefined || vid === undefined) return;
    c.invokeService("animPlay", { sceneId: sid, viewId: vid })
      .then((res) => {
        if (res?.mgr) setLiveMgr(res.mgr);
      })
      .catch((err: unknown) => console.warn("animPlay failed:", err));
  }, []);

  const pause = useCallback(() => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    if (!c || sid === undefined) return;
    c.invokeService("animPause", { sceneId: sid })
      .then((res) => {
        if (res?.mgr) setLiveMgr(res.mgr);
      })
      .catch((err: unknown) => console.warn("animPause failed:", err));
  }, []);

  const stop = useCallback(() => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    if (!c || sid === undefined) return;
    c.invokeService("animStop", { sceneId: sid })
      .then((res) => {
        if (res?.mgr) setLiveMgr(res.mgr);
      })
      .catch((err: unknown) => console.warn("animStop failed:", err));
  }, []);

  const seek = useCallback((ms: number) => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    const vid = viewIdRef.current;
    if (!c || sid === undefined || vid === undefined) return;
    c.invokeService("animGoTime", { sceneId: sid, viewId: vid, ms })
      .then((res) => {
        if (res?.mgr) setLiveMgr(res.mgr);
      })
      .catch((err: unknown) => console.warn("animGoTime failed:", err));
  }, []);

  const setLoop = useCallback((loop: boolean) => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    if (!c || sid === undefined) return;
    c.invokeService("animSetLoop", { sceneId: sid, loop })
      .then((res) => {
        if (res?.mgr) setLiveMgr(res.mgr);
      })
      .catch((err: unknown) => console.warn("animSetLoop failed:", err));
  }, []);

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) pause();
    else play();
  }, [play, pause]);

  return { mgr, isPlaying, canControl, play, pause, togglePlay, stop, seek, setLoop };
}
