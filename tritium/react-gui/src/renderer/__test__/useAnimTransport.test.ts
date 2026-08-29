/**
 * Wiring contract for `useAnimTransport`.
 *
 * Pins the transport action wires (service name + payload shape) and the
 * base/live manager fallback:
 *   - play / stop / seek / setLoop route to animPlay / animStop / animGoTime /
 *     animSetLoop with the active scene/view ids;
 *   - with no active view, `canControl` is false and the actions are no-ops;
 *   - `mgr` exposes `baseMgr` until a transport op supersedes it;
 *   - playback progress arrives as worker pushes for this scene, and the
 *     renderer never asks for it -- the poll this replaced was the one
 *     remaining place the UI questioned the worker on a timer.
 */

import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { makeRenderHook, flushPromises } from "./helpers/testHarness";
import { useAnimTransport } from "../hooks/useAnimTransport";
import type { AnimMgrState } from "../types";

function mgrState(over: Partial<AnimMgrState> = {}): AnimMgrState {
  return { lengthMs: 5000, elapsedMs: 0, playState: "stop", loop: false, startcam: "", ...over };
}

/** Fake bridge; `push` fires an `anim-progress` message at the subscriber. */
function makeCm(resultMgr: AnimMgrState) {
  let listener: ((u: { sceneId: number; mgr: AnimMgrState }) => void) | null = null;
  return {
    invokeService: vi.fn().mockResolvedValue({ ok: true, mgr: resultMgr }),
    subscribeAnimProgress: vi.fn((cb: (u: { sceneId: number; mgr: AnimMgrState }) => void) => {
      listener = cb;
      return () => { listener = null; };
    }),
    push(sceneId: number, mgr: AnimMgrState) {
      listener?.({ sceneId, mgr });
    },
    get subscribed() { return listener !== null; },
  };
}

describe("useAnimTransport", () => {
  it("play() routes to animPlay with the active scene + view", async () => {
    const cm = makeCm(mgrState({ playState: "stop" }));
    const h = makeRenderHook(() =>
      useAnimTransport({ cm: cm as never, sceneId: 3, viewId: 7, baseMgr: mgrState() }),
    );
    h.result.play();
    await flushPromises();
    expect(cm.invokeService).toHaveBeenCalledWith("animPlay", { sceneId: 3, viewId: 7 });
    h.unmount();
  });

  it("seek() routes to animGoTime with the ms target and reflects the snapshot", async () => {
    const cm = makeCm(mgrState({ playState: "pause", elapsedMs: 1200 }));
    const h = makeRenderHook(() =>
      useAnimTransport({ cm: cm as never, sceneId: 3, viewId: 7, baseMgr: mgrState() }),
    );
    h.result.seek(1200);
    await flushPromises();
    expect(cm.invokeService).toHaveBeenCalledWith("animGoTime", { sceneId: 3, viewId: 7, ms: 1200 });
    expect(h.result.mgr.elapsedMs).toBe(1200);
    h.unmount();
  });

  it("stop() and setLoop() route to their services", async () => {
    const cm = makeCm(mgrState());
    const h = makeRenderHook(() =>
      useAnimTransport({ cm: cm as never, sceneId: 3, viewId: 7, baseMgr: mgrState() }),
    );
    h.result.stop();
    h.result.setLoop(true);
    await flushPromises();
    expect(cm.invokeService).toHaveBeenCalledWith("animStop", { sceneId: 3 });
    expect(cm.invokeService).toHaveBeenCalledWith("animSetLoop", { sceneId: 3, loop: true });
    h.unmount();
  });

  it("is inert (canControl=false) without an active view", async () => {
    const cm = makeCm(mgrState());
    const h = makeRenderHook(() =>
      useAnimTransport({ cm: cm as never, sceneId: 3, viewId: undefined, baseMgr: mgrState() }),
    );
    expect(h.result.canControl).toBe(false);
    h.result.play();
    h.result.seek(500);
    await flushPromises();
    expect(cm.invokeService).not.toHaveBeenCalled();
    h.unmount();
  });

  it("exposes baseMgr until an op supersedes it", async () => {
    const cm = makeCm(mgrState({ loop: true }));
    const h = makeRenderHook(() =>
      useAnimTransport({ cm: cm as never, sceneId: 3, viewId: 7, baseMgr: mgrState({ loop: false, lengthMs: 8000 }) }),
    );
    expect(h.result.mgr.loop).toBe(false);
    expect(h.result.mgr.lengthMs).toBe(8000);
    h.result.setLoop(true);
    await flushPromises();
    expect(h.result.mgr.loop).toBe(true);
    h.unmount();
  });
});

describe("useAnimTransport progress", () => {
  it("takes the elapsed time from the worker's pushes, asking for nothing", async () => {
    const cm = makeCm(mgrState());
    const h = makeRenderHook(() =>
      useAnimTransport({ cm: cm as never, sceneId: 3, viewId: 7, baseMgr: mgrState() }),
    );
    await flushPromises();
    expect(cm.subscribed).toBe(true);
    cm.invokeService.mockClear();

    act(() => cm.push(3, mgrState({ playState: "play", elapsedMs: 800 })));
    expect(h.result.mgr.elapsedMs).toBe(800);
    expect(h.result.isPlaying).toBe(true);

    act(() => cm.push(3, mgrState({ playState: "play", elapsedMs: 1600 })));
    expect(h.result.mgr.elapsedMs).toBe(1600);

    // The end of playback is a push like any other.
    act(() => cm.push(3, mgrState({ playState: "stop", elapsedMs: 0 })));
    expect(h.result.isPlaying).toBe(false);

    // Nothing was polled for any of it.
    expect(cm.invokeService).not.toHaveBeenCalled();
    h.unmount();
  });

  it("ignores progress for another scene", async () => {
    const cm = makeCm(mgrState());
    const h = makeRenderHook(() =>
      useAnimTransport({ cm: cm as never, sceneId: 3, viewId: 7, baseMgr: mgrState() }),
    );
    await flushPromises();
    act(() => cm.push(9, mgrState({ playState: "play", elapsedMs: 800 })));
    expect(h.result.mgr.elapsedMs).toBe(0);
    expect(h.result.isPlaying).toBe(false);
    h.unmount();
  });
});
