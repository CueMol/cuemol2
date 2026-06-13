/**
 * Render + wire contract for `AnimElementInspector` (right-panel anim target).
 *
 * Pins:
 *   - self-fetch -> renders Common + the per-type section and reports the header;
 *   - gone:true -> calls onGone (no crash);
 *   - a discrete toggle (Enabled) commits setAnimElementProp;
 *   - committing Start/Duration sends a single { prop:"timing", value:{startMs,endMs} }.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { mountTree, flushPromises } from "./helpers/testHarness";
import type { AnimElementDetail } from "../worker/server/services/animDetail.service";
import type { AnimElementType } from "../types";
import { SEM_OBJECT, SEM_RENDERER, SEM_CAMERA, SEM_ANY } from "../event";

void React;

import { AnimElementInspector } from "../components/inspector/AnimElementInspector";

function detail(over: {
  type?: AnimElementType;
  name?: string;
  disabled?: boolean;
  startMs?: number;
  endMs?: number;
  quadric?: number;
  typeProps?: Record<string, unknown>;
  siblings?: { name: string }[];
}): AnimElementDetail {
  return {
    common: {
      uid: 7,
      name: over.name ?? "El0",
      type: over.type ?? "SimpleSpin",
      disabled: over.disabled ?? false,
      timeRefName: "",
      startMs: over.startMs ?? 0,
      endMs: over.endMs ?? 1000,
      quadric: over.quadric ?? 0,
    },
    typeProps: over.typeProps ?? {},
    siblings: over.siblings ?? [],
  };
}

function makeCm(detailOrGone: AnimElementDetail | { gone: true }) {
  const invokeService = vi.fn((name: string) => {
    if (name === "getAnimElementDetail") {
      if ("gone" in detailOrGone) return Promise.resolve({ ok: false, gone: true });
      return Promise.resolve({ ok: true, detail: detailOrGone });
    }
    if (name === "getAnimTargetOptions") {
      return Promise.resolve({ ok: true, renderers: [], cameras: [], mols: [] });
    }
    if (name === "setAnimElementProp") {
      const d = "gone" in detailOrGone ? null : detailOrGone;
      return Promise.resolve({ ok: true, detail: d });
    }
    return Promise.resolve({});
  });
  return {
    invokeService,
    addEventListener: vi.fn().mockResolvedValue(1),
    removeEventListener: vi.fn().mockResolvedValue(undefined),
  };
}

function fieldByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll(".h3-form-field-label")).find(
    (l) => l.textContent === label,
  );
  return lab ? (lab.parentElement as HTMLElement) : null;
}

describe("AnimElementInspector", () => {
  it("fetches, renders Common + the Spin section, and reports the header", async () => {
    const cm = makeCm(detail({ type: "SimpleSpin", name: "Spin0", typeProps: { angle: 90, axisX: 0, axisY: 1, axisZ: 0 } }));
    const onHeaderChange = vi.fn();
    const { container, unmount } = mountTree(
      <AnimElementInspector cm={cm as never} sceneId={1} uid={7} onGone={vi.fn()} onHeaderChange={onHeaderChange} />,
    );
    await flushPromises();
    expect(fieldByLabel(container, "Name")).not.toBeNull();
    expect(fieldByLabel(container, "Relative to")).not.toBeNull();
    expect(fieldByLabel(container, "Rotation angle")).not.toBeNull(); // SimpleSpin section
    expect(fieldByLabel(container, "Spin axis")).not.toBeNull();
    expect(onHeaderChange).toHaveBeenCalledWith("Spin0", "Simple spin");
    unmount();
  });

  it("calls onGone when the element is already deleted", async () => {
    const cm = makeCm({ gone: true });
    const onGone = vi.fn();
    const { unmount } = mountTree(
      <AnimElementInspector cm={cm as never} sceneId={1} uid={7} onGone={onGone} onHeaderChange={vi.fn()} />,
    );
    await flushPromises();
    expect(onGone).toHaveBeenCalledWith(1);
    unmount();
  });

  it("commits a discrete toggle (Enabled) via setAnimElementProp", async () => {
    const cm = makeCm(detail({ type: "NoopAnimObj", disabled: false }));
    const { container, unmount } = mountTree(
      <AnimElementInspector cm={cm as never} sceneId={1} uid={7} onGone={vi.fn()} onHeaderChange={vi.fn()} />,
    );
    await flushPromises();
    const checkbox = fieldByLabel(container, "Disabled")!.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    act(() => checkbox.click()); // unchecked (enabled) -> checked -> disabled=true
    await flushPromises();
    expect(cm.invokeService).toHaveBeenCalledWith("setAnimElementProp", {
      sceneId: 1,
      uid: 7,
      prop: "disabled",
      value: true,
    });
    unmount();
  });

  it("renders the Common timing fields as time strings (TimeField) seeded from detail", async () => {
    const cm = makeCm(detail({ type: "NoopAnimObj", startMs: 200, endMs: 1200 }));
    const { container, unmount } = mountTree(
      <AnimElementInspector cm={cm as never} sceneId={1} uid={7} onGone={vi.fn()} onHeaderChange={vi.fn()} />,
    );
    await flushPromises();
    // Start / Duration use the TimeField (ms -> M:SS.mmm); the timing write
    // contract is pinned in animDetailService.test.ts.
    const startInput = fieldByLabel(container, "Start time")!.querySelector(
      "input.h3-form-time",
    ) as HTMLInputElement;
    const durInput = fieldByLabel(container, "Duration")!.querySelector(
      "input.h3-form-time",
    ) as HTMLInputElement;
    expect(startInput.value).toBe("0:00.200"); // 200 ms
    expect(durInput.value).toBe("0:01.000"); // 1200 - 200 = 1000 ms
    expect(fieldByLabel(container, "Quadric")).not.toBeNull();
    unmount();
  });

  it("re-seeds the form on element switch even with a prior uncommitted edit (no stuck Loading)", async () => {
    // Regression: an interaction can end WITHOUT committing (e.g. an Easing
    // release out of the 0..50 range, or an axis release near zero), leaving the
    // internal "mid-edit" flag latched. Switching to another element must still
    // re-seed its form -- otherwise the panel stays on "Loading..." forever.
    // The latch is driven here through the Name field's onChange (typing without
    // blurring), a stable path that does not depend on drag/release timing.
    const detailFor = (uid: number) => detail({ type: "NoopAnimObj", name: `El${uid}` });
    const invokeService = vi.fn((name: string, args: { uid?: number }) => {
      if (name === "getAnimElementDetail")
        return Promise.resolve({ ok: true, detail: detailFor(args.uid ?? 0) });
      if (name === "getAnimTargetOptions")
        return Promise.resolve({ ok: true, renderers: [], cameras: [], mols: [] });
      return Promise.resolve({});
    });
    const cm = {
      invokeService,
      addEventListener: vi.fn().mockResolvedValue(1),
      removeEventListener: vi.fn().mockResolvedValue(undefined),
    };

    let setUid!: (u: number) => void;
    const Probe: React.FC = () => {
      const [uid, set] = React.useState(7);
      setUid = set;
      return (
        <AnimElementInspector
          cm={cm as never}
          sceneId={1}
          uid={uid}
          onGone={vi.fn()}
          onHeaderChange={vi.fn()}
        />
      );
    };

    const { container, unmount } = mountTree(<Probe />);
    await flushPromises();
    const name7 = fieldByLabel(container, "Name")!.querySelector("input") as HTMLInputElement;
    expect(name7.value).toBe("El7");

    // Latch a mid-edit (uncommitted) draft via the Name input -- no blur/commit.
    // Use the native value setter so React's controlled-input tracker registers
    // the change and fires onChange (a plain `.value =` is swallowed by React).
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      nativeSetter.call(name7, "draft");
      name7.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Switch to a different element: the form must re-seed (not stay Loading).
    await act(async () => {
      setUid(8);
      await flushPromises();
    });
    const name8 = fieldByLabel(container, "Name")?.querySelector("input") as
      | HTMLInputElement
      | undefined;
    expect(name8).toBeTruthy();
    expect(name8!.value).toBe("El8");
    unmount();
  });

  it("switches to the Generic tab and lists the element's full property set", async () => {
    const entries = [
      { key: "name", type: "string", value: "Spin0", readonly: false, hasdefault: false, isdefault: false, isContainer: false, depth: 0 },
      { key: "angle", type: "real", value: 90, readonly: false, hasdefault: true, isdefault: false, isContainer: false, depth: 0 },
    ];
    const invokeService = vi.fn((name: string) => {
      if (name === "getAnimElementDetail")
        return Promise.resolve({ ok: true, detail: detail({ type: "SimpleSpin", name: "Spin0" }) });
      if (name === "getAnimTargetOptions")
        return Promise.resolve({ ok: true, renderers: [], cameras: [], mols: [] });
      if (name === "getAnimElementGenericProps") return Promise.resolve({ ok: true, entries });
      return Promise.resolve({});
    });
    const cm = {
      invokeService,
      addEventListener: vi.fn().mockResolvedValue(1),
      removeEventListener: vi.fn().mockResolvedValue(undefined),
    };
    const { container, unmount } = mountTree(
      <AnimElementInspector cm={cm as never} sceneId={1} uid={7} onGone={vi.fn()} onHeaderChange={vi.fn()} />,
    );
    await flushPromises();

    // Click the "Generic" segment in the mode bar.
    const seg = Array.from(
      container.querySelectorAll(".inspector-mode-bar button, .inspector-mode-bar label"),
    ).find((el) => el.textContent === "Generic") as HTMLElement | undefined;
    expect(seg).toBeTruthy();
    await act(async () => {
      seg!.click();
      await flushPromises();
    });

    expect(invokeService).toHaveBeenCalledWith("getAnimElementGenericProps", { sceneId: 1, uid: 7 });
    expect(container.querySelectorAll(".insp-gt-row").length).toBe(2);
    unmount();
  });

  it("multi-selects target renderers via a checklist that commits a joined rend string", async () => {
    const renderers = [
      { name: "rendA", objName: "Mol1", type: "cartoon" },
      { name: "rendB", objName: "Mol1", type: "tube" },
    ];
    const invokeService = vi.fn((name: string, args?: { value?: unknown }) => {
      if (name === "getAnimElementDetail")
        return Promise.resolve({
          ok: true,
          detail: detail({ type: "ShowHideAnim", typeProps: { rend: "rendA", hide: false, fade: false, tgtAlpha: 1 } }),
        });
      if (name === "getAnimTargetOptions")
        return Promise.resolve({ ok: true, renderers, cameras: [], mols: [] });
      if (name === "setAnimElementProp")
        return Promise.resolve({
          ok: true,
          detail: detail({ type: "ShowHideAnim", typeProps: { rend: String(args?.value ?? ""), hide: false, fade: false, tgtAlpha: 1 } }),
        });
      return Promise.resolve({});
    });
    const cm = {
      invokeService,
      addEventListener: vi.fn().mockResolvedValue(1),
      removeEventListener: vi.fn().mockResolvedValue(undefined),
    };
    const { container, unmount } = mountTree(
      <AnimElementInspector cm={cm as never} sceneId={1} uid={7} onGone={vi.fn()} onHeaderChange={vi.fn()} />,
    );
    await flushPromises();

    const checks = container.querySelectorAll(
      ".anim-rend-list input[type='checkbox']",
    ) as NodeListOf<HTMLInputElement>;
    expect(checks.length).toBe(2);
    expect(checks[0].checked).toBe(true); // rendA preselected
    expect(checks[1].checked).toBe(false); // rendB not

    // Toggle rendB on -> commit the joined list.
    await act(async () => {
      checks[1].click();
      await flushPromises();
    });
    expect(invokeService).toHaveBeenCalledWith("setAnimElementProp", {
      sceneId: 1,
      uid: 7,
      prop: "rend",
      value: "rendA,rendB",
    });
    unmount();
  });

  it("subscribes to scene-tree renderer/object/camera changes so target lists refetch", async () => {
    const cm = makeCm(
      detail({ type: "ShowHideAnim", typeProps: { rend: "", hide: false, fade: false, tgtAlpha: 1 } }),
    );
    const { unmount } = mountTree(
      <AnimElementInspector cm={cm as never} sceneId={1} uid={7} onGone={vi.fn()} onHeaderChange={vi.fn()} />,
    );
    await flushPromises();
    // Explorer add/delete fires SEM_OBJECT/RENDERER/CAMERA on the scene; the
    // inspector listens so getAnimTargetOptions refetches and the lists update.
    const mask = SEM_OBJECT | SEM_RENDERER | SEM_CAMERA;
    expect(cm.addEventListener).toHaveBeenCalledWith("", mask, SEM_ANY, 1, expect.any(Function));
    unmount();
  });

  it("locks the spin-axis x/y/z boxes unless Cartesian is selected", async () => {
    // A unit-axis vector derives the combobox to that axis -> boxes disabled.
    const cm = makeCm(
      detail({ type: "SimpleSpin", typeProps: { angle: 90, axisX: 0, axisY: 1, axisZ: 0 } }),
    );
    const { container, unmount } = mountTree(
      <AnimElementInspector cm={cm as never} sceneId={1} uid={7} onGone={vi.fn()} onHeaderChange={vi.fn()} />,
    );
    await flushPromises();
    const cellX = () => container.querySelector('input[aria-label="Axis X"]') as HTMLInputElement;
    expect(cellX().disabled).toBe(true);

    // Picking Cartesian enables manual editing.
    const select = container.querySelector(".anim-axis-row select") as HTMLSelectElement;
    act(() => {
      select.value = "cart";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(cellX().disabled).toBe(false);
    unmount();
  });
});
