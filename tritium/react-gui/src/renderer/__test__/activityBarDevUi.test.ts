/**
 * @file activityBarDevUi.test.ts
 * @description Degrade-detection test for the developer-only gating of the
 * Component Catalog activity-bar view.
 *
 * The catalog is a design-review showcase and must not reach a shipped build:
 * release packaging (packaging/package.sh) sets CUEMOL_RELEASE=1, which turns
 * the `__DEV_UI__` compile-time flag off. This test pins the observable
 * contract of the gate -- which buttons the bar offers for each flag value --
 * so removing the gate fails here rather than silently shipping the catalog.
 */

import { describe, it, expect } from "vitest";
import { buildActivityItems } from "../components/ActivityBar";

describe("activity-bar dev-only views", () => {
  it("offers the Component Catalog in developer builds", () => {
    const ids = buildActivityItems(true).map((i) => i.id);
    expect(ids).toEqual(["explorer", "selection", "crystal", "catalog"]);
  });

  it("drops the Component Catalog from release builds", () => {
    const ids = buildActivityItems(false).map((i) => i.id);
    expect(ids).toEqual(["explorer", "selection", "crystal"]);
  });
});
