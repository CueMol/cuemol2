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
    h.result.removeElement(3);
    h.result.moveElement(3, 2);
    h.result.setElementTime(1, 100, 900);
    await flushPromises();
    expect(cm.invokeService).toHaveBeenCalledWith("animRemoveElement", { sceneId: 5, index: 3 });
    expect(cm.invokeService).toHaveBeenCalledWith("animMoveElement", { sceneId: 5, from: 3, to: 2 });
    expect(cm.invokeService).toHaveBeenCalledWith("animSetElementTime", {
      sceneId: 5,
      index: 1,
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
});
