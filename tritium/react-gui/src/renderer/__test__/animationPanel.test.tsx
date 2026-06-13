/**
 * Render contract for the strip-model `AnimationPanel`.
 *
 * Pins the observable rendering driven by an `AnimTimeline` snapshot:
 *   - no active scene -> placeholder, no strips;
 *   - a scene with no elements -> empty placeholder;
 *   - one strip per element, positioned by `absStart`/`absEnd * pxPerMs`
 *     and tagged with the per-type class;
 *   - disabled elements carry the `is-disabled` modifier.
 *
 * `useAnimTimeline` is mocked so the panel renders from a fixed snapshot
 * without the worker plumbing.
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mountTree } from "./helpers/testHarness";
import type { AnimTimeline, AnimElement } from "../types";

void React;

let mockTimeline: AnimTimeline | null = null;
vi.mock("../hooks/useAnimTimeline", () => ({
  useAnimTimeline: () => ({ timeline: mockTimeline, loading: false, refetch: vi.fn() }),
}));

import { AnimationPanel } from "../components/panels/AnimationPanel";

function el(over: Partial<AnimElement>): AnimElement {
  return {
    index: 0,
    uid: 1,
    name: "A",
    type: "CamMotion",
    disabled: false,
    timeRefName: "",
    startMs: 0,
    endMs: 1000,
    absStartMs: 0,
    absEndMs: 1000,
    quadric: 0,
    ...over,
  };
}

function timeline(elements: AnimElement[], lengthMs = 5000): AnimTimeline {
  return {
    sceneId: 1,
    elements,
    mgr: { lengthMs, elapsedMs: 0, playState: "stop", loop: false, startcam: "" },
    fps: 30,
  };
}

const cm = {} as never;

describe("AnimationPanel (strip timeline)", () => {
  beforeEach(() => {
    mockTimeline = null;
  });

  it("shows a placeholder when no scene is active", () => {
    const { container, unmount } = mountTree(
      <AnimationPanel cm={null} activeSceneId={undefined} activeMolViewId={undefined} />,
    );
    expect(container.querySelector(".anim-placeholder")).not.toBeNull();
    expect(container.querySelector(".anim-strip")).toBeNull();
    unmount();
  });

  it("shows the empty placeholder when the scene has no animation", () => {
    mockTimeline = timeline([]);
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    expect(container.querySelector(".anim-placeholder")).not.toBeNull();
    expect(container.querySelector(".anim-strip")).toBeNull();
    unmount();
  });

  it("renders one strip per element positioned by absStart/absEnd * pxPerMs", () => {
    mockTimeline = timeline([
      el({ uid: 1, name: "Cam", type: "CamMotion", absStartMs: 0, absEndMs: 1000 }),
      el({ uid: 2, name: "Spin", type: "SimpleSpin", absStartMs: 2000, absEndMs: 4000 }),
    ]);
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    const strips = container.querySelectorAll(".anim-strip");
    expect(strips.length).toBe(2);
    // DEFAULT_PX_PER_MS = 0.1 -> left = 2000*0.1 = 200, width = (4000-2000)*0.1 = 200
    const spin = container.querySelector('.anim-strip[data-uid="2"]') as HTMLElement;
    expect(spin.style.left).toBe("200px");
    expect(spin.style.width).toBe("200px");
    expect(spin.className).toContain("anim-strip--SimpleSpin");
    unmount();
  });

  it("marks a disabled element strip", () => {
    mockTimeline = timeline([el({ uid: 5, disabled: true })]);
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    const strip = container.querySelector('.anim-strip[data-uid="5"]') as HTMLElement;
    expect(strip.className).toContain("is-disabled");
    unmount();
  });
});
