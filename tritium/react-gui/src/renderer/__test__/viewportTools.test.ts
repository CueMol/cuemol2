import { describe, it, expect } from "vitest";
import {
  TOOLS,
  CATEGORY_ORDER,
  TOOL_BY_ID,
  type ToolCategory,
} from "../data/viewportTools";

describe("viewportTools data integrity", () => {
  it("all TOOLS entries have unique ids", () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all TOOLS entries have unique shortcuts (case-insensitive)", () => {
    const shortcuts = TOOLS.map((t) => t.shortcut.toLowerCase());
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it("all TOOLS entries have a valid category", () => {
    const validCategories: ToolCategory[] = ["navigate", "select", "measure", "edit"];
    for (const tool of TOOLS) {
      expect(validCategories).toContain(tool.category);
    }
  });

  it("TOOL_BY_ID contains every tool in TOOLS", () => {
    for (const tool of TOOLS) {
      expect(TOOL_BY_ID[tool.id]).toBe(tool);
    }
  });

  it("CATEGORY_ORDER includes all used categories", () => {
    const usedCategories = new Set(TOOLS.map((t) => t.category));
    for (const cat of usedCategories) {
      expect(CATEGORY_ORDER).toContain(cat);
    }
  });
});
