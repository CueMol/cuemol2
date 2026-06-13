/**
 * Wiring contract for `useAnimTransport`.
 *
 * Pins the transport action wires (service name + payload shape) and the
 * base/live manager fallback:
 *   - play / stop / seek / setLoop route to animPlay / animStop / animGoTime /
 *     animSetLoop with the active scene/view ids;
 *   - with no active view, `canControl` is false and the actions are no-ops;
 *   - `mgr` exposes `baseMgr` until a transport op supersedes it.
 *
 * The rAF elapsed-poll timing is intentionally NOT pinned (it is an internal
 * detail; the wire is what matters).
 */

import { describe, it, expect, vi } from "vitest";
import { makeRenderHook, flushPromises } from "./helpers/testHarness";
import { useAnimTransport } from "../hooks/useAnimTransport";
import type { AnimMgrState } from "../types";

function mgrState(over: Partial<AnimMgrState> = {}): AnimMgrState {
  return { lengthMs: 5000, elapsedMs: 0, playState: "stop", loop: false, startcam: "", ...over };
}

function makeCm(resultMgr: AnimMgrState) {
  return { invokeService: vi.fn().mockResolvedValue({ ok: true, mgr: resultMgr }) };
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
