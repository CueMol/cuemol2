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
import { mountTree } from "@renderer/__test__/helpers/testHarness";
import type { AnimTimeline, AnimElement, AnimMgrState } from "@renderer/types";

void React;

let mockTimeline: AnimTimeline | null = null;
// The panel drives the inspector through its actions context.
const inspector = vi.hoisted(() => ({ showAnimElement: vi.fn(), clearAnimElement: vi.fn() }));
vi.mock("@renderer/state/inspector", () => ({ useInspectorActions: () => inspector }));

// Refused edits / transport ops go through the app's error alert; the harness
// mounts without its provider.
const showErrorAlert = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@renderer/dialogs/ErrorAlertDialogProvider", () => ({
  useShowErrorAlert: () => showErrorAlert,
}));

vi.mock("@renderer/features/animation/useAnimTimeline", () => ({
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
// The options the panel hands the hooks, to drive their onError from a test.
let transportOpts: { onError?: (message: string) => void } = {};
let editOpts: { onError?: (message: string) => void } = {};
vi.mock("@renderer/features/animation/useAnimTransport", () => ({
  useAnimTransport: (opts: { onError?: (message: string) => void }) => {
    transportOpts = opts;
    return mockTransport;
  },
}));

interface MockEdit {
  addElement: ReturnType<typeof vi.fn>;
  removeElement: ReturnType<typeof vi.fn>;
  moveElement: ReturnType<typeof vi.fn>;
  setElementTime: ReturnType<typeof vi.fn>;
}
let mockEdit: MockEdit;
vi.mock("@renderer/features/animation/useAnimEdit", () => ({
  useAnimEdit: (opts: { onError?: (message: string) => void }) => {
    editOpts = opts;
    return mockEdit;
  },
}));

function defaultEdit(): MockEdit {
  return {
    addElement: vi.fn(),
    removeElement: vi.fn(),
    moveElement: vi.fn(),
    // Resolves like the real hook: the panel awaits it to know whether a
    // refetch (and so a preview handover) is coming.
    setElementTime: vi.fn(() => Promise.resolve(true)),
  };
}

import { AnimationPanel } from "@renderer/features/animation/AnimationPanel";

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
    timeRefState: "ok",
    ...over,
  };
}

function timeline(
  elements: AnimElement[],
  lengthMs = 5000,
  cameras: string[] = [],
  resolveError?: string,
): AnimTimeline {
  return {
    sceneId: 1,
    elements,
    ...(resolveError !== undefined ? { resolveError } : {}),
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
    expect(mockEdit.setElementTime.mock.calls[0][0]).toBe(1); // element uid
    unmount();
  });

  it("holds the dropped span until fresh data arrives (no snap back to the old place)", () => {
    const { container, root, unmount } = mount();
    const strip = () => container.querySelector('.anim-strip[data-uid="1"]') as HTMLElement;
    act(() => strip().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 100 })));
    act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 200 })));
    // DEFAULT_PX_PER_MS = 0.1 -> +100 px = +1000 ms -> left 1000*0.1 = 100 px.
    expect(strip().style.left).toBe("100px");
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 200 })));
    // Still at the drop position: the fetched timeline has not caught up yet.
    expect(strip().style.left).toBe("100px");

    // The refetch lands with the edit applied -> the preview hands over.
    mockTimeline = timeline([
      el({ uid: 1, name: "A", index: 0, startMs: 1000, endMs: 2000, absStartMs: 1000, absEndMs: 2000 }),
      el({ uid: 2, name: "B", index: 1, startMs: 0, endMs: 1000, absStartMs: 1000, absEndMs: 2000 }),
    ]);
    act(() => {
      root.render(<AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />);
    });
    expect(strip().style.left).toBe("100px");
    unmount();
  });

  it("releases the held span when the write is rejected", async () => {
    mockEdit.setElementTime = vi.fn(() => Promise.resolve(false));
    const { container, unmount } = mount();
    const strip = () => container.querySelector('.anim-strip[data-uid="1"]') as HTMLElement;
    act(() => strip().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 100 })));
    act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 200 })));
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 200 })));
    await act(async () => {
      await Promise.resolve();
    });
    expect(strip().style.left).toBe("0px"); // back to the fetched span
    unmount();
  });

  it("does not drag a chained element before its reference's end (relative start >= 0)", () => {
    // B is chained after A with relative start 0 (abs 1000). Dragging far left
    // must stop at relative 0, not run negative -- a relative time is measured
    // from the reference's END, so a negative one is not a supported state.
    mockTimeline = timeline([
      el({ uid: 1, name: "A", index: 0, startMs: 0, endMs: 1000, absStartMs: 0, absEndMs: 1000 }),
      el({
        uid: 2, name: "B", index: 1, timeRefName: "A",
        startMs: 0, endMs: 1000, absStartMs: 1000, absEndMs: 2000,
      }),
    ]);
    const { container, unmount } = mount();
    const strip = container.querySelector('.anim-strip[data-uid="2"]') as HTMLElement;
    act(() => strip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 300 })));
    act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 0 })));
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 0 })));
    expect(mockEdit.setElementTime).toHaveBeenCalledTimes(1);
    const [uid, startMs, endMs] = mockEdit.setElementTime.mock.calls[0];
    expect(uid).toBe(2); // the chained element (index 1)
    expect(startMs).toBe(0); // floored at the reference's end
    expect(endMs).toBe(1000); // duration preserved
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
    const [uid, startMs] = mockEdit.setElementTime.mock.calls[0];
    expect(uid).toBe(1);
    expect(startMs).toBe(0);
    unmount();
  });

  it("Delete removes the selected element", () => {
    const { container, unmount } = mount();
    selectFirst(container);
    const delBtn = container.querySelectorAll(".anim-label-toolbar button")[1] as HTMLButtonElement;
    expect(delBtn.disabled).toBe(false);
    act(() => delBtn.click());
    expect(mockEdit.removeElement).toHaveBeenCalledWith(1); // uid, not index
    unmount();
  });

  it("selects the following element after a delete so the button stays live", () => {
    inspector.showAnimElement.mockClear();
    inspector.clearAnimElement.mockClear();
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    selectFirst(container); // uid 1 (index 0)
    const delBtn = container.querySelectorAll(".anim-label-toolbar button")[1] as HTMLButtonElement;
    act(() => delBtn.click());
    // Selection moves to uid 2 -- delete is still enabled for the next click.
    expect(inspector.showAnimElement).toHaveBeenLastCalledWith(1, 2);
    expect(
      (container.querySelectorAll(".anim-label-toolbar button")[1] as HTMLButtonElement).disabled,
    ).toBe(false);
    unmount();
  });

  it("falls back to the preceding element when the last one is deleted", () => {
    inspector.showAnimElement.mockClear();
    inspector.clearAnimElement.mockClear();
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    act(() => (container.querySelectorAll(".anim-label-row")[1] as HTMLElement).click()); // uid 2
    const delBtn = container.querySelectorAll(".anim-label-toolbar button")[1] as HTMLButtonElement;
    act(() => delBtn.click());
    expect(mockEdit.removeElement).toHaveBeenCalledWith(2); // uid of the last element
    expect(inspector.showAnimElement).toHaveBeenLastCalledWith(1, 1);
    unmount();
  });

  it("clears the selection when the only element is deleted", () => {
    mockTimeline = timeline([el({ uid: 1, index: 0 })]);
    inspector.showAnimElement.mockClear();
    inspector.clearAnimElement.mockClear();
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    selectFirst(container);
    const delBtn = container.querySelectorAll(".anim-label-toolbar button")[1] as HTMLButtonElement;
    act(() => delBtn.click());
    expect(inspector.clearAnimElement).toHaveBeenLastCalledWith(1);
    unmount();
  });

  it("Move down reorders the selected element", () => {
    const { container, unmount } = mount();
    selectFirst(container);
    const downBtn = container.querySelectorAll(".anim-label-toolbar button")[3] as HTMLButtonElement;
    expect(downBtn.disabled).toBe(false);
    act(() => downBtn.click());
    expect(mockEdit.moveElement).toHaveBeenCalledWith(1, 1); // (uid, raw target index)
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
    inspector.showAnimElement.mockClear();
    inspector.clearAnimElement.mockClear();
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    expect(inspector.clearAnimElement).toHaveBeenCalledWith(1); // mount: nothing selected
    inspector.showAnimElement.mockClear();
    inspector.clearAnimElement.mockClear();
    const row = container.querySelector(".anim-label-row") as HTMLElement;
    act(() => row.click()); // select uid 1
    expect(inspector.showAnimElement).toHaveBeenCalledWith(1, 1);
    inspector.showAnimElement.mockClear();
    inspector.clearAnimElement.mockClear();
    act(() => row.click()); // toggle deselect
    expect(inspector.clearAnimElement).toHaveBeenCalledWith(1);
    unmount();
  });

  it("clears the selection + inspector when the selected element vanishes", () => {
    inspector.showAnimElement.mockClear();
    inspector.clearAnimElement.mockClear();
    const { container, root, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    act(() => (container.querySelector(".anim-label-row") as HTMLElement).click());
    inspector.showAnimElement.mockClear();
    inspector.clearAnimElement.mockClear();
    mockTimeline = timeline([]); // element removed (e.g. deleted via SEM_ANIM)
    act(() =>
      root.render(
        <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
      ),
    );
    expect(inspector.clearAnimElement).toHaveBeenCalledWith(1);
    unmount();
  });

  it("resets the selection on scene switch", () => {
    inspector.showAnimElement.mockClear();
    inspector.clearAnimElement.mockClear();
    const { container, root, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    act(() => (container.querySelector(".anim-label-row") as HTMLElement).click());
    inspector.showAnimElement.mockClear();
    inspector.clearAnimElement.mockClear();
    act(() =>
      root.render(
        <AnimationPanel cm={cm} activeSceneId={9} activeMolViewId={2} />,
      ),
    );
    expect(inspector.clearAnimElement).toHaveBeenCalledWith(9);
    unmount();
  });
});

describe("AnimationPanel current-time field", () => {
  beforeEach(() => {
    mockTimeline = timeline([el({ uid: 1 })]);
    mockTransport = defaultTransport();
    mockEdit = defaultEdit();
  });

  const timeField = (container: HTMLElement) =>
    container.querySelector(".anim-readout .h3-form-time") as HTMLElement;
  const fieldText = (container: HTMLElement) =>
    timeField(container).querySelector(".h3-form-time-segs")?.textContent;
  const moveBy = (dx: number) => {
    const ev = new MouseEvent("mousemove");
    Object.defineProperty(ev, "movementX", { value: dx, configurable: true });
    act(() => document.dispatchEvent(ev));
  };

  it("seeks once to a typed time on Enter", () => {
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    const field = timeField(container);
    act(() => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    const input = field.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "0:02.000");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(mockTransport.seek).toHaveBeenCalledTimes(1);
    expect(mockTransport.seek).toHaveBeenCalledWith(2000);
    unmount();
  });

  it("previews the playhead locally while dragging and seeks once on release", () => {
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    const seg = timeField(container).querySelector('[data-unit="s"]') as HTMLElement;
    act(() => seg.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    moveBy(20); // 4 px per second -> +5 s
    expect(fieldText(container)).toBe("0:05.000");
    expect(mockTransport.seek).not.toHaveBeenCalled();
    act(() => document.dispatchEvent(new MouseEvent("mouseup")));
    expect(mockTransport.seek).toHaveBeenCalledTimes(1);
    expect(mockTransport.seek).toHaveBeenCalledWith(5000);
    unmount();
  });

  it("drops the preview and does not seek when the drag is abandoned", () => {
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />,
    );
    const seg = timeField(container).querySelector('[data-unit="s"]') as HTMLElement;
    act(() => seg.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    moveBy(20);
    act(() => document.dispatchEvent(new Event("pointerlockchange"))); // Esc
    expect(fieldText(container)).toBe("0:00.000");
    act(() => document.dispatchEvent(new MouseEvent("mouseup")));
    expect(mockTransport.seek).not.toHaveBeenCalled();
    unmount();
  });

  it("is disabled without an active view", () => {
    mockTransport.canControl = false;
    const { container, unmount } = mountTree(
      <AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={undefined} />,
    );
    expect(timeField(container).classList.contains("is-disabled")).toBe(true);
    expect(timeField(container).tabIndex).toBe(-1);
    unmount();
  });
});

describe("AnimationPanel chain state and failures", () => {
  beforeEach(() => {
    mockTimeline = timeline([
      el({ uid: 1, name: "A", index: 0, startMs: 0, endMs: 1000, absStartMs: 0, absEndMs: 1000 }),
      el({ uid: 2, name: "B", index: 1, startMs: 0, endMs: 1000, absStartMs: 1000, absEndMs: 2000 }),
    ]);
    mockTransport = defaultTransport();
    mockEdit = defaultEdit();
    showErrorAlert.mockClear();
  });

  const mount = () => mountTree(<AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />);
  const rerender = (root: { render: (n: React.ReactNode) => void }) =>
    act(() => {
      root.render(<AnimationPanel cm={cm} activeSceneId={1} activeMolViewId={2} />);
    });
  const dragStrip = (container: HTMLElement, uid: number, fromX: number, toX: number) => {
    const strip = container.querySelector(`.anim-strip[data-uid="${uid}"]`) as HTMLElement;
    act(() => strip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: fromX })));
    act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: toX })));
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: toX })));
  };

  it("holds the dropped span across an unrelated refetch and hands over when the edit shows", () => {
    const { container, root, unmount } = mount();
    const strip = () => container.querySelector('.anim-strip[data-uid="1"]') as HTMLElement;
    dragStrip(container, 1, 100, 200); // +1000 ms -> committed {1000, 2000}
    expect(strip().style.left).toBe("100px");

    // Some other event refetched first: identity-new, same old spans. Held.
    mockTimeline = timeline([...mockTimeline!.elements]);
    rerender(root);
    expect(strip().style.left).toBe("100px");

    // The refetch that carries the edit ends the hold...
    mockTimeline = timeline([
      el({ uid: 1, name: "A", index: 0, startMs: 1000, endMs: 2000, absStartMs: 1000, absEndMs: 2000 }),
      el({ uid: 2, name: "B", index: 1, startMs: 0, endMs: 1000, absStartMs: 2000, absEndMs: 3000 }),
    ]);
    rerender(root);
    expect(strip().style.left).toBe("100px");
    // ...so a later fetched position is drawn, not the stale preview.
    mockTimeline = timeline([
      el({ uid: 1, name: "A", index: 0, startMs: 500, endMs: 1500, absStartMs: 500, absEndMs: 1500 }),
    ]);
    rerender(root);
    expect(strip().style.left).toBe("50px");
    unmount();
  });

  it("drops the held span when the dragged element vanishes", () => {
    const { container, root, unmount } = mount();
    dragStrip(container, 1, 100, 200);
    mockTimeline = timeline([
      el({ uid: 2, name: "B", index: 0, startMs: 0, endMs: 1000, absStartMs: 1000, absEndMs: 2000 }),
    ]);
    rerender(root);
    expect(container.querySelector('.anim-strip[data-uid="1"]')).toBeNull();
    expect((container.querySelector('.anim-strip[data-uid="2"]') as HTMLElement).style.left).toBe("100px");
    unmount();
  });

  it("commits whole milliseconds", () => {
    const { container, unmount } = mount();
    // Zoom in once: 0.1 * 1.4 px/ms, so 100 px is 714.28... ms.
    const zoomIn = Array.from(container.querySelectorAll(".anim-zoom button")).find((b) =>
      b.getAttribute("title")?.startsWith("Zoom in"),
    ) as HTMLButtonElement;
    act(() => zoomIn.click());
    dragStrip(container, 1, 100, 200);
    expect(mockEdit.setElementTime).toHaveBeenCalledWith(1, 714, 1714);
    unmount();
  });

  it("resize-left stops at the axis and never crosses the end", () => {
    const { container, unmount } = mount();
    const grip = () =>
      container.querySelector('.anim-strip[data-uid="1"] .anim-strip-grip-left') as HTMLElement;
    act(() => grip().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 100 })));
    act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 0 })));
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 0 })));
    expect(mockEdit.setElementTime).toHaveBeenLastCalledWith(1, 0, 1000);
    act(() => grip().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 100 })));
    act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 300 })));
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 300 })));
    expect(mockEdit.setElementTime).toHaveBeenLastCalledWith(1, 1000, 1000);
    unmount();
  });

  it("marks an unresolved strip and draws a negative span clamped to the axis", () => {
    mockTimeline = timeline([
      el({
        uid: 3, name: "C", index: 0, timeRefName: "ghost", timeRefState: "missing",
        resolveError: '"C" is relative to "ghost", which does not exist',
        startMs: -500, endMs: 500, absStartMs: -500, absEndMs: 500,
      }),
    ]);
    const { container, unmount } = mount();
    const strip = container.querySelector('.anim-strip[data-uid="3"]') as HTMLElement;
    expect(strip.classList.contains("is-unresolved")).toBe(true);
    expect(strip.classList.contains("is-clamped")).toBe(true);
    expect(strip.dataset.refState).toBe("missing");
    expect(strip.style.left).toBe("0px");
    expect(strip.getAttribute("title")).toContain('"C" is relative to "ghost", which does not exist');
    unmount();
  });

  it("says why the chain does not resolve and refuses playback until it does", () => {
    const reason = "Cyclic reference: A -> B -> A";
    mockTimeline = timeline(mockTimeline!.elements, 5000, [], reason);
    const { container, unmount } = mount();
    const warning = container.querySelector(".anim-warning");
    expect(warning?.getAttribute("role")).toBe("status");
    expect(warning?.textContent).toContain(reason);
    const [skipBack, play, stop] = Array.from(
      container.querySelectorAll(".anim-transport-playback button"),
    ) as HTMLButtonElement[];
    expect(play.disabled).toBe(true);
    expect(play.getAttribute("title")).toBe(`Cannot play: ${reason}`);
    expect(skipBack.disabled).toBe(true);
    expect(stop.disabled).toBe(false);
    expect(
      (container.querySelector(".anim-readout .h3-form-time") as HTMLElement).classList.contains("is-disabled"),
    ).toBe(true);
    const ruler = container.querySelector(".anim-ruler") as HTMLElement;
    act(() => ruler.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 100 })));
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: 100 })));
    expect(mockTransport.seek).not.toHaveBeenCalled();
    unmount();
  });

  it("shows no warning and keeps playback live when every element resolves", () => {
    const { container, unmount } = mount();
    expect(container.querySelector(".anim-warning")).toBeNull();
    const play = container.querySelectorAll(".anim-transport-playback button")[1] as HTMLButtonElement;
    expect(play.disabled).toBe(false);
    unmount();
  });

  it("routes a refused edit or transport op to the error alert, one at a time", async () => {
    let settle: () => void = () => undefined;
    showErrorAlert.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const { unmount } = mount();
    act(() => editOpts.onError?.("no such element"));
    act(() => editOpts.onError?.("again"));
    expect(showErrorAlert).toHaveBeenCalledTimes(1);
    expect(showErrorAlert).toHaveBeenCalledWith({ title: "Animation timeline", message: "no such element" });
    settle();
    await act(async () => {
      await Promise.resolve();
    });
    act(() => transportOpts.onError?.("Cannot play: Cyclic reference: A -> A"));
    expect(showErrorAlert).toHaveBeenCalledTimes(2);
    expect(showErrorAlert).toHaveBeenLastCalledWith({
      title: "Animation playback",
      message: "Cannot play: Cyclic reference: A -> A",
    });
    unmount();
  });
});
