/**
 * Wiring contract for `useAnimEdit`.
 *
 * Pins that each editing action routes to the matching worker service with the
 * right payload, and is inert without an active scene. The hook holds no local
 * state -- the UI refreshes via the SEM_ANIM event listener (useAnimTimeline),
 * except for the post-add manager snapshot (start-camera seeding fires no
 * event), which is handed to `onMgrState`.
 */

import { describe, it, expect, vi } from "vitest";
import { makeRenderHook, flushPromises } from "@renderer/__test__/helpers/testHarness";
import { useAnimEdit } from "@renderer/features/animation/useAnimEdit";

function makeCm() {
  return { invokeService: vi.fn().mockResolvedValue({ ok: true }) };
}

describe("useAnimEdit", () => {
  it("addElement routes to animAddElement with type + insertIndex + the active view", async () => {
    const cm = makeCm();
    const h = makeRenderHook(() =>
      useAnimEdit({ cm: cm as never, sceneId: 5, viewId: 9 }),
    );
    h.result.addElement("SimpleSpin", 2);
    await flushPromises();
    expect(cm.invokeService).toHaveBeenCalledWith("animAddElement", {
      sceneId: 5,
      type: "SimpleSpin",
      insertIndex: 2,
      viewId: 9,
    });
    h.unmount();
  });

  it("hands the post-add manager snapshot to onMgrState (start-camera seeding)", async () => {
    const mgr = { lengthMs: 0, elapsedMs: 0, playState: "stop", loop: false, startcam: "__current" };
    const cm = { invokeService: vi.fn().mockResolvedValue({ ok: true, mgr }) };
    const onMgrState = vi.fn();
    const h = makeRenderHook(() =>
      useAnimEdit({ cm: cm as never, sceneId: 5, viewId: 9, onMgrState }),
    );
    h.result.addElement("SimpleSpin");
    await flushPromises();
    expect(onMgrState).toHaveBeenCalledWith(mgr);
    h.unmount();
  });

  it("remove / move / setElementTime route to their services", async () => {
    const cm = makeCm();
    const h = makeRenderHook(() =>
      useAnimEdit({ cm: cm as never, sceneId: 5, viewId: 9 }),
    );
    h.result.removeElement(30);
    h.result.moveElement(30, 2);
    h.result.setElementTime(10, 100, 900);
    await flushPromises();
    expect(cm.invokeService).toHaveBeenCalledWith("animRemoveElement", { sceneId: 5, uid: 30 });
    expect(cm.invokeService).toHaveBeenCalledWith("animMoveElement", { sceneId: 5, uid: 30, to: 2 });
    expect(cm.invokeService).toHaveBeenCalledWith("animSetElementTime", {
      sceneId: 5,
      uid: 10,
      startMs: 100,
      endMs: 900,
    });
    h.unmount();
  });

  it("is inert without an active scene", async () => {
    const cm = makeCm();
    const h = makeRenderHook(() =>
      useAnimEdit({ cm: cm as never, sceneId: undefined, viewId: undefined }),
    );
    h.result.addElement("NoopAnimObj");
    h.result.removeElement(0);
    await flushPromises();
    expect(cm.invokeService).not.toHaveBeenCalled();
    h.unmount();
  });

  it("reports a refused edit through onError and resolves false", async () => {
    const cm = {
      invokeService: vi.fn().mockResolvedValue({ ok: false, error: "no such element", code: "not-found" }),
    };
    const onError = vi.fn();
    const h = makeRenderHook(() =>
      useAnimEdit({ cm: cm as never, sceneId: 5, viewId: 9, onError }),
    );
    const accepted = h.result.setElementTime(10, 0, 100);
    h.result.removeElement(10);
    await flushPromises();
    expect(await accepted).toBe(false);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith("no such element");
    h.unmount();
  });

  it("still adopts the manager snapshot a refused add carries (start-camera seeding ran)", async () => {
    const mgr = { lengthMs: 0, elapsedMs: 0, playState: "stop", loop: false, startcam: "__current" };
    const cm = {
      invokeService: vi.fn().mockResolvedValue({ ok: false, error: "createObj failed", code: "native", mgr }),
    };
    const onMgrState = vi.fn();
    const onError = vi.fn();
    const h = makeRenderHook(() =>
      useAnimEdit({ cm: cm as never, sceneId: 5, viewId: 9, onMgrState, onError }),
    );
    h.result.addElement("SimpleSpin");
    await flushPromises();
    expect(onMgrState).toHaveBeenCalledWith(mgr);
    expect(onError).toHaveBeenCalledWith("createObj failed");
    h.unmount();
  });
});
