import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ViewportToolPalette } from "@renderer/features/molview/ViewportToolPalette";
import { TOOLS } from "@renderer/data/viewportTools";
import type { ToolId } from "@renderer/data/viewportTools";

// The palette reads the theme (for the options popover portal) and embeds the
// measure / bond-edit options popovers (which pull in worker hooks). Stub them
// all: this suite only exercises the tool buttons, not the popover content.
vi.mock("@renderer/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark" }),
}));
vi.mock("@renderer/features/molview/MeasureOptionsPopover", () => ({
  MeasureOptionsPopover: () => null,
}));
vi.mock("@renderer/features/molview/BondEditOptionsPopover", () => ({
  BondEditOptionsPopover: () => null,
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

function renderPalette(activeTool: ToolId, onSelect = vi.fn()) {
  act(() => {
    root.render(
      React.createElement(ViewportToolPalette, {
        activeTool,
        onSelect,
        measureTarget: "",
        onMeasureTargetChange: vi.fn(),
      }),
    );
  });
  return { container, onSelect };
}

describe("ViewportToolPalette", () => {
  it("renders a button for every tool in TOOLS", () => {
    const { container } = renderPalette("navigate");
    const buttons = container.querySelectorAll("button.tool-btn");
    expect(buttons.length).toBe(TOOLS.length);
  });

  it("active tool button has 'active' class", () => {
    const { container } = renderPalette("navigate");
    const activeBtn = container.querySelector('button[aria-pressed="true"]');
    expect(activeBtn).not.toBeNull();
    expect(activeBtn!.classList.contains("active")).toBe(true);
    expect(activeBtn!.getAttribute("aria-label")).toContain("Navigate");
  });

  it("non-active buttons do not have 'active' class", () => {
    const { container } = renderPalette("navigate");
    const inactiveButtons = container.querySelectorAll('button[aria-pressed="false"]');
    for (const btn of inactiveButtons) {
      expect(btn.classList.contains("active")).toBe(false);
    }
  });

  it("clicking a button calls onSelect with the tool id", () => {
    const onSelect = vi.fn();
    const { container } = renderPalette("navigate", onSelect);
    const rectSelectBtn = container.querySelector('button[aria-label^="Rect Select"]') as HTMLButtonElement;
    expect(rectSelectBtn).not.toBeNull();
    act(() => { rectSelectBtn.click(); });
    expect(onSelect).toHaveBeenCalledWith("rectSelect");
  });

  it("renders category separators between groups", () => {
    const { container } = renderPalette("navigate");
    const separators = container.querySelectorAll(".tool-palette-separator");
    // navigate | select | measure => 2 separators between 3 groups
    expect(separators.length).toBeGreaterThanOrEqual(2);
  });

  it("each button aria-label includes label and shortcut", () => {
    const { container } = renderPalette("navigate");
    for (const tool of TOOLS) {
      const btn = container.querySelector(`button[aria-label="${tool.label} (${tool.shortcut})"]`);
      expect(btn, `button for ${tool.id} not found`).not.toBeNull();
    }
  });

  it("updates active button when activeTool prop changes", () => {
    renderPalette("navigate");
    // Re-render with different activeTool
    act(() => {
      root.render(
        React.createElement(ViewportToolPalette, {
          activeTool: "rectSelect",
          onSelect: vi.fn(),
          measureTarget: "",
          onMeasureTargetChange: vi.fn(),
        }),
      );
    });
    const activeBtn = container.querySelector('button[aria-pressed="true"]');
    expect(activeBtn!.getAttribute("aria-label")).toContain("Rect Select");
  });
});
