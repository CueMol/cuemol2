/**
 * Degrade-detection tests for `AppIcon`.
 *
 * Pins the icon abstraction contract:
 *   - a Phosphor-backed key renders an <svg> at the px mapped from the size
 *     token (sm=12, md=14, lg=18)
 *   - the icon inherits text color via `currentColor` (theme-aware), i.e. no
 *     hard-coded color is applied
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { AppIcon } from "../components/AppIcon";

void React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

function render(node: React.ReactElement): SVGSVGElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(node);
  });
  return container.querySelector("svg") as SVGSVGElement;
}

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
});

beforeEach(() => {
  /* no-op; each test renders its own tree */
});

describe("AppIcon", () => {
  it("renders a Phosphor svg for a registered key", () => {
    const svg = render(<AppIcon name="tool.lasso" />);
    expect(svg).toBeTruthy();
    expect(svg.tagName.toLowerCase()).toBe("svg");
  });

  it("maps size tokens to px (lg=18, sm=12, default md=14)", () => {
    expect(render(<AppIcon name="tool.lasso" size="lg" />).getAttribute("width")).toBe("18");
    expect(render(<AppIcon name="tool.angle" size="sm" />).getAttribute("width")).toBe("12");
    expect(render(<AppIcon name="tool.torsion" />).getAttribute("width")).toBe("14");
  });

  it("accepts an explicit px size", () => {
    expect(render(<AppIcon name="tool.navigate" size={22} />).getAttribute("width")).toBe("22");
  });

  it("inherits color via currentColor (no hard-coded color)", () => {
    const svg = render(<AppIcon name="tool.distance" />);
    // Phosphor renders fill=currentColor so the icon follows the theme text color.
    expect(svg.getAttribute("fill")).toBe("currentColor");
  });
});
