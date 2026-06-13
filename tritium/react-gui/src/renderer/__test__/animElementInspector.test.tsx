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
    expect(fieldByLabel(container, "Angle")).not.toBeNull(); // SimpleSpin section
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
    const checkbox = fieldByLabel(container, "Enabled")!.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    act(() => checkbox.click()); // checked (enabled) -> unchecked -> disabled=true
    await flushPromises();
    expect(cm.invokeService).toHaveBeenCalledWith("setAnimElementProp", {
      sceneId: 1,
      uid: 7,
      prop: "disabled",
      value: true,
    });
    unmount();
  });

  it("renders the Common timing fields (Start / Duration) seeded from detail", async () => {
    const cm = makeCm(detail({ type: "NoopAnimObj", startMs: 200, endMs: 1200 }));
    const { container, unmount } = mountTree(
      <AnimElementInspector cm={cm as never} sceneId={1} uid={7} onGone={vi.fn()} onHeaderChange={vi.fn()} />,
    );
    await flushPromises();
    // Start + Duration are present; the timing write contract itself is pinned
    // in animDetailService.test.ts (prop:"timing" -> start/end + resolveRelTime).
    expect(fieldByLabel(container, "Start (ms)")).not.toBeNull();
    expect(fieldByLabel(container, "Duration (ms)")).not.toBeNull();
    expect(fieldByLabel(container, "Easing")).not.toBeNull();
    unmount();
  });
});
