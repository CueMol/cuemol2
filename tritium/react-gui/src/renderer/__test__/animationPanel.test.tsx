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
import { act } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mountTree } from "./helpers/testHarness";
import type { AnimTimeline, AnimElement, AnimMgrState } from "../types";

void React;

let mockTimeline: AnimTimeline | null = null;
vi.mock("../hooks/useAnimTimeline", () => ({
  useAnimTimeline: () => ({ timeline: mockTimeline, loading: false, refetch: vi.fn() }),
}));

interface MockTransport {
  mgr: AnimMgrState;
  isPlaying: boolean;
  canControl: boolean;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  togglePlay: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  seek: ReturnType<typeof vi.fn>;
  setLoop: ReturnType<typeof vi.fn>;
  setStartCam: ReturnType<typeof vi.fn>;
  adoptMgr: ReturnType<typeof vi.fn>;
}
let mockTransport: MockTransport;
vi.mock("../hooks/useAnimTransport", () => ({
  useAnimTransport: () => mockTransport,
}));

interface MockEdit {
  addElement: ReturnType<typeof vi.fn>;
  removeElement: ReturnType<typeof vi.fn>;
  moveElement: ReturnType<typeof vi.fn>;
  setElementTime: ReturnType<typeof vi.fn>;
}
let mockEdit: MockEdit;
vi.mock("../hooks/useAnimEdit", () => ({
  useAnimEdit: () => mockEdit,
}));

function defaultEdit(): MockEdit {
  return {
    addElement: vi.fn(),
    removeElement: vi.fn(),
    moveElement: vi.fn(),
    setElementTime: vi.fn(),
  };
}

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

function timeline(
  elements: AnimElement[],
  lengthMs = 5000,
  cameras: string[] = [],
): AnimTimeline {
  return {
    sceneId: 1,
    elements,
    mgr: { lengthMs, elapsedMs: 0, playState: "stop", loop: false, startcam: "" },
    cameras,
    fps: 30,
  };
}

const cm = {} as never;

function defaultTransport(): MockTransport {
  return {
    mgr: { lengthMs: 5000, elapsedMs: 0, playState: "stop", loop: false, startcam: "" },
    isPlaying: false,
    canControl: true,
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    stop: vi.fn(),
    seek: vi.fn(),
    setLoop: vi.fn(),
    setStartCam: vi.fn(),
    adoptMgr: vi.fn(),
  };
}

describe("AnimationPanel (strip timeline)", () => {
  beforeEach(() => {
    mockTimeline = null;
    mockTransport = defaultTransport();
    mockEdit = defaultEdit();
  });

  it("shows a placeholder when no scene is active", () => {
    const { container, unmount } = mountTree(
      <AnimationPanel cm={null} activeSceneId={undefined} activeMolViewId={undefined} />,
    );
    expect(container.querySelector(".anim-placeholder")).not.toBeNull();
    expect(container.querySelector(".anim-strip")).toBeNull();
    unmount();
  });

  it("shows an empty hint (and the edit toolbar) when the scene has no animation", () => {
    mockTimeline = timeline([]);
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    expect(container.querySelector(".anim-empty-hint")).not.toBeNull();
    expect(container.querySelector(".anim-strip")).toBeNull();
    // Add toolbar is available even with no elements (to add the first one).
    expect(container.querySelector(".anim-label-toolbar")).not.toBeNull();
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

describe("AnimationPanel transport + scrub", () => {
  beforeEach(() => {
    mockTimeline = timeline([el({ uid: 1 })]);
    mockTransport = defaultTransport();
    mockEdit = defaultEdit();
  });

  it("commits exactly one seek on ruler mousedown+up, none during the drag", () => {
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    const ruler = container.querySelector(".anim-ruler") as HTMLElement;
    act(() =>
      ruler.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 100 })),
    );
    act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 160 })));
    expect(mockTransport.seek).not.toHaveBeenCalled();
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 160 })));
    expect(mockTransport.seek).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does not scrub when there is no active view (canControl=false)", () => {
    mockTransport.canControl = false;
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={undefined} />,
    );
    const ruler = container.querySelector(".anim-ruler") as HTMLElement;
    act(() =>
      ruler.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 100 })),
    );
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 100 })));
    expect(mockTransport.seek).not.toHaveBeenCalled();
    unmount();
  });

  it("disables the playback buttons when canControl is false", () => {
    mockTransport.canControl = false;
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={undefined} />,
    );
    const btns = container.querySelectorAll(".anim-transport-playback button");
    expect(btns.length).toBeGreaterThan(0);
    btns.forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
    unmount();
  });

  it("clicking play/pause calls togglePlay", () => {
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    const playBtn = container.querySelector(
      ".anim-transport-playback button:nth-child(2)",
    ) as HTMLButtonElement;
    act(() => playBtn.click());
    expect(mockTransport.togglePlay).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("shows the active (playing) state on the play/pause button", () => {
    mockTransport.isPlaying = true;
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    expect(container.querySelector(".anim-transport-playback .bp5-active")).not.toBeNull();
    unmount();
  });
});

describe("AnimationPanel start camera", () => {
  beforeEach(() => {
    mockTimeline = timeline([el({ uid: 1 })], 5000, ["front", "back"]);
    mockTransport = defaultTransport();
    mockEdit = defaultEdit();
  });

  function startCamSelect(container: HTMLElement) {
    return container.querySelector(".anim-startcam select") as HTMLSelectElement;
  }

  it("offers (none) plus every scene camera, selecting the manager's startcam", () => {
    mockTransport.mgr = { ...mockTransport.mgr, startcam: "back" };
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    const sel = startCamSelect(container);
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(["", "front", "back"]);
    expect(sel.value).toBe("back");
    unmount();
  });

  it("commits the picked camera name via setStartCam", () => {
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    const sel = startCamSelect(container);
    act(() => {
      sel.value = "front";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mockTransport.setStartCam).toHaveBeenCalledWith("front");
    unmount();
  });

  it("falls back to (none) when the stored startcam no longer exists (UXP parity)", () => {
    mockTransport.mgr = { ...mockTransport.mgr, startcam: "deleted-cam" };
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    expect(startCamSelect(container).value).toBe("");
    unmount();
  });

  it("stays usable without an active view (startcam needs no view)", () => {
    mockTransport.canControl = false;
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={undefined} />,
    );
    expect(startCamSelect(container).disabled).toBe(false);
    unmount();
  });
});

describe("AnimationPanel editing", () => {
  beforeEach(() => {
    mockTimeline = timeline([
      el({ uid: 1, name: "A", index: 0, startMs: 0, endMs: 1000, absStartMs: 0, absEndMs: 1000 }),
      el({ uid: 2, name: "B", index: 1, startMs: 0, endMs: 1000, absStartMs: 1000, absEndMs: 2000 }),
    ]);
    mockTransport = defaultTransport();
    mockEdit = defaultEdit();
  });

  function mount() {
    return mountTree(<AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />);
  }

  function selectFirst(container: HTMLElement) {
    act(() => (container.querySelectorAll(".anim-label-row")[0] as HTMLElement).click());
  }

  it("commits one setElementTime on a strip body drag, none during the drag", () => {
    const { container, unmount } = mount();
    const strip = container.querySelector('.anim-strip[data-uid="1"]') as HTMLElement;
    act(() => strip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 100 })));
    act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 200 })));
    expect(mockEdit.setElementTime).not.toHaveBeenCalled();
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 200 })));
    expect(mockEdit.setElementTime).toHaveBeenCalledTimes(1);
    expect(mockEdit.setElementTime.mock.calls[0][0]).toBe(0); // element index
    unmount();
  });

  it("resize-right grip changes only the end (relative start unchanged)", () => {
    const { container, unmount } = mount();
    const grip = container.querySelector(
      '.anim-strip[data-uid="1"] .anim-strip-grip-right',
    ) as HTMLElement;
    act(() => grip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 100 })));
    act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 160 })));
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 160 })));
    expect(mockEdit.setElementTime).toHaveBeenCalledTimes(1);
    const [index, startMs] = mockEdit.setElementTime.mock.calls[0];
    expect(index).toBe(0);
    expect(startMs).toBe(0);
    unmount();
  });

  it("Delete removes the selected element", () => {
    const { container, unmount } = mount();
    selectFirst(container);
    const delBtn = container.querySelectorAll(".anim-label-toolbar button")[1] as HTMLButtonElement;
    expect(delBtn.disabled).toBe(false);
    act(() => delBtn.click());
    expect(mockEdit.removeElement).toHaveBeenCalledWith(0);
    unmount();
  });

  it("Move down reorders the selected element", () => {
    const { container, unmount } = mount();
    selectFirst(container);
    const downBtn = container.querySelectorAll(".anim-label-toolbar button")[3] as HTMLButtonElement;
    expect(downBtn.disabled).toBe(false);
    act(() => downBtn.click());
    expect(mockEdit.moveElement).toHaveBeenCalledWith(0, 1);
    unmount();
  });

  it("Add menu adds the chosen type after the selection", () => {
    const { container, unmount } = mount();
    selectFirst(container);
    const addBtn = container.querySelectorAll(".anim-label-toolbar button")[0] as HTMLButtonElement;
    act(() => addBtn.click()); // open the popover
    const item = Array.from(document.querySelectorAll(".bp5-menu-item")).find((i) =>
      i.textContent?.includes("No operation"),
    ) as HTMLElement | undefined;
    expect(item).toBeTruthy();
    act(() => item!.click());
    expect(mockEdit.addElement).toHaveBeenCalledWith("NoopAnimObj", 1);
    unmount();
  });
});

describe("AnimationPanel inspector wiring", () => {
  beforeEach(() => {
    mockTimeline = timeline([el({ uid: 1, index: 0 })]);
    mockTransport = defaultTransport();
    mockEdit = defaultEdit();
  });

  it("emits the selected element uid to the inspector, null on deselect", () => {
    const onInspect = vi.fn();
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} onInspectAnimElement={onInspect} />,
    );
    expect(onInspect).toHaveBeenCalledWith(1, null); // mount: nothing selected
    onInspect.mockClear();
    const row = container.querySelector(".anim-label-row") as HTMLElement;
    act(() => row.click()); // select uid 1
    expect(onInspect).toHaveBeenCalledWith(1, 1);
    onInspect.mockClear();
    act(() => row.click()); // toggle deselect
    expect(onInspect).toHaveBeenCalledWith(1, null);
    unmount();
  });

  it("clears the selection + inspector when the selected element vanishes", () => {
    const onInspect = vi.fn();
    const { container, root, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} onInspectAnimElement={onInspect} />,
    );
    act(() => (container.querySelector(".anim-label-row") as HTMLElement).click());
    onInspect.mockClear();
    mockTimeline = timeline([]); // element removed (e.g. deleted via SEM_ANIM)
    act(() =>
      root.render(
        <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} onInspectAnimElement={onInspect} />,
      ),
    );
    expect(onInspect).toHaveBeenCalledWith(1, null);
    unmount();
  });

  it("resets the selection on scene switch", () => {
    const onInspect = vi.fn();
    const { container, root, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} onInspectAnimElement={onInspect} />,
    );
    act(() => (container.querySelector(".anim-label-row") as HTMLElement).click());
    onInspect.mockClear();
    act(() =>
      root.render(
        <AnimationPanel cm={cm} activeSceneId={9} activeMolViewId={2} onInspectAnimElement={onInspect} />,
      ),
    );
    expect(onInspect).toHaveBeenCalledWith(9, null);
    unmount();
  });
});
