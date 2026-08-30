/**
 * @file features/animation/useAnimTransport.ts
 * @description Playback transport + live elapsed state for `AnimationPanel`.
 *
 * Wires the transport actions (play / pause / stop / seek / loop) to the worker
 * `animation.service` and owns the LIVE manager snapshot during playback.
 *
 * CueMol drives playback in C++: `AnimMgr.start(view)` registers a native timer
 * that advances the animation and updates the view camera every tick, and the
 * worker's existing per-frame redraw loop renders it. Nothing fires a
 * per-frame event, so the worker samples the manager on that same loop and
 * pushes what moved (`anim-progress`); this subscribes to it. The renderer
 * used to ask ~15 times a second instead, whether or not anything had.
 *
 * `mgr` returned here is the live snapshot (`liveMgr`) once an op or a push
 * has arrived, falling back to the fetched `baseMgr` otherwise.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AsyncCueMol } from "@renderer/worker/client/AsyncCueMol";
import type { AnimMgrState } from "@renderer/types";

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
  /** Set the start camera by name ('' = none); needs no active view. */
  setStartCam: (name: string) => void;
  /**
   * Adopt a manager snapshot produced elsewhere (an edit service that mutated
   * manager state, e.g. an add seeding the start camera). Needed because those
   * changes fire no event the panel could listen for.
   */
  adoptMgr: (mgr: AnimMgrState) => void;
}

const EMPTY_MGR: AnimMgrState = {
  lengthMs: 0,
  elapsedMs: 0,
  playState: "stop",
  loop: false,
  startcam: "",
};

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

  // Follow playback. The worker pushes only while a scene is playing and
  // sends one last snapshot when it ends, so this stays subscribed for the
  // panel's lifetime rather than only while `isPlaying` -- that flag comes
  // from these very pushes, and a subscription gated on it would have to be
  // in place before the first one arrives anyway.
  useEffect(() => {
    if (!cm) return;
    return cm.subscribeAnimProgress((update) => {
      if (update.sceneId !== sceneIdRef.current) return;
      setLiveMgr(update.mgr);
    });
  }, [cm]);

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

  // Start camera is a manager property, not a playback op: it is settable
  // without an active view (unlike play / seek), so it only guards on cm+scene.
  const setStartCam = useCallback((name: string) => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    if (!c || sid === undefined) return;
    c.invokeService("animSetStartCam", { sceneId: sid, startcam: name })
      .then((res) => {
        if (res?.mgr) setLiveMgr(res.mgr);
      })
      .catch((err: unknown) => console.warn("animSetStartCam failed:", err));
  }, []);

  const adoptMgr = useCallback((next: AnimMgrState) => setLiveMgr(next), []);

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) pause();
    else play();
  }, [play, pause]);

  // Memoized: AnimationPanel spreads this into its strip components, which
  // would otherwise re-render on every unrelated panel render.
  return useMemo(
    () => ({
      mgr, isPlaying, canControl, play, pause, togglePlay, stop, seek, setLoop,
      setStartCam, adoptMgr,
    }),
    [
      mgr, isPlaying, canControl, play, pause, togglePlay, stop, seek, setLoop,
      setStartCam, adoptMgr,
    ],
  );
}
