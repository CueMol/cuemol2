/**
 * Wiring contract for `useAnimTimeline`.
 *
 * Pins the renderer-side fetch + event subscription:
 *   - mount fetches via `cm.invokeService('animListTimeline', { sceneId })`
 *     and exposes the resolved timeline;
 *   - a SEM_ANIM listener scoped to the active scene is installed
 *     (refetch-on-change), so edits from any path stay in sync;
 *   - with no active scene there is no fetch and the timeline is null.
 */

import { describe, it, expect, vi } from "vitest";
import { makeRenderHook, flushPromises } from "./helpers/testHarness";
import { SEM_ANIM } from "../event";
import { useAnimTimeline } from "../hooks/useAnimTimeline";
import type { AnimTimeline } from "../types";

function fixture(sceneId = 7): AnimTimeline {
  return {
    sceneId,
    elements: [],
    mgr: { lengthMs: 0, elapsedMs: 0, playState: "stop", loop: false, startcam: "" },
    fps: 30,
  };
}

function makeCm() {
  return {
    invokeService: vi.fn().mockResolvedValue(fixture()),
    addEventListener: vi.fn().mockResolvedValue(1),
    removeEventListener: vi.fn().mockResolvedValue(undefined),
  };
}

describe("useAnimTimeline", () => {
  it("fetches the timeline on mount and exposes it", async () => {
    const cm = makeCm();
    const h = makeRenderHook(() =>
      useAnimTimeline({ cm: cm as never, sceneId: 7 }),
    );
    expect(cm.invokeService).toHaveBeenCalledWith("animListTimeline", { sceneId: 7 });
    await flushPromises();
    expect(h.result.timeline).toEqual(fixture());
    h.unmount();
  });

  it("subscribes to SEM_ANIM scoped to the active scene", async () => {
    const cm = makeCm();
    const h = makeRenderHook(() =>
      useAnimTimeline({ cm: cm as never, sceneId: 7 }),
    );
    await flushPromises();
    expect(cm.addEventListener).toHaveBeenCalled();
    // useCueMolEventListener: addEventListener(category, srcMask, evtMask, scopeId, fire)
    const args = cm.addEventListener.mock.calls[0];
    expect(args[1]).toBe(SEM_ANIM); // srcMask
    expect(args[3]).toBe(7); // scopeId
    h.unmount();
  });

  it("does not fetch and stays null when no scene is active", async () => {
    const cm = makeCm();
    const h = makeRenderHook(() =>
      useAnimTimeline({ cm: cm as never, sceneId: undefined }),
    );
    await flushPromises();
    expect(cm.invokeService).not.toHaveBeenCalled();
    expect(h.result.timeline).toBeNull();
    h.unmount();
  });
});
