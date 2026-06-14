/**
 * Wiring contract for `useAnimEdit`.
 *
 * Pins that each editing action routes to the matching worker service with the
 * right payload, and is inert without an active scene. The hook holds no local
 * state -- the UI refreshes via the SEM_ANIM event listener (useAnimTimeline).
 */

import { describe, it, expect, vi } from "vitest";
import { makeRenderHook, flushPromises } from "./helpers/testHarness";
import { useAnimEdit } from "../hooks/useAnimEdit";

function makeCm() {
  return { invokeService: vi.fn().mockResolvedValue({ ok: true }) };
}

describe("useAnimEdit", () => {
  it("addElement routes to animAddElement with type + insertIndex", async () => {
    const cm = makeCm();
    const h = makeRenderHook(() => useAnimEdit({ cm: cm as never, sceneId: 5 }));
    h.result.addElement("SimpleSpin", 2);
    await flushPromises();
    expect(cm.invokeService).toHaveBeenCalledWith("animAddElement", {
      sceneId: 5,
      type: "SimpleSpin",
      insertIndex: 2,
    });
    h.unmount();
  });

  it("remove / move / setElementTime route to their services", async () => {
    const cm = makeCm();
    const h = makeRenderHook(() => useAnimEdit({ cm: cm as never, sceneId: 5 }));
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
    const h = makeRenderHook(() => useAnimEdit({ cm: cm as never, sceneId: undefined }));
    h.result.addElement("NoopAnimObj");
    h.result.removeElement(0);
    await flushPromises();
    expect(cm.invokeService).not.toHaveBeenCalled();
    h.unmount();
  });
});
