/**
 * @file ViewportToolPalette.tsx
 * @description Floating vertical tool palette anchored to the left edge of
 * the 3D viewport area. Each button activates a different interaction
 * mode (navigate, select, measure, ...).
 *
 * Layout:
 *   +----+
 *   | N  |  <- navigate group
 *   +----+  <- separator
 *   | B  |  <- select group
 *   | L  |
 *   +----+  <- separator
 *   | D  |  <- measure group
 *   | A  |
 *   | T  |
 *   +----+
 *
 * @module ViewportToolPalette
 */

import React from "react";
import { Tooltip } from "@blueprintjs/core";
import { AppIcon } from "./AppIcon";
import {
  TOOLS,
  CATEGORY_ORDER,
  type ToolId,
} from "../data/viewportTools";

interface Props {
  activeTool: ToolId;
  onSelect: (id: ToolId) => void;
  /**
   * Open the measure group's options (target label-set) popover. Rendered as a
   * distinct "options cap" above the measure tools. Optional: when omitted the
   * cap is still shown but inert (used before the popover is wired).
   */
  onOpenMeasureOptions?: () => void;
}

export const ViewportToolPalette: React.FC<Props> = ({
  activeTool,
  onSelect,
  onOpenMeasureOptions,
}) => {
  return (
    <div className="viewport-tool-palette" role="toolbar" aria-label="Viewport tools">
      {CATEGORY_ORDER.map((cat, idx) => {
        const tools = TOOLS.filter((t) => t.category === cat);
        if (tools.length === 0) return null;
        return (
          <React.Fragment key={cat}>
            {idx > 0 && <div className="tool-palette-separator" aria-hidden="true" />}
            {cat === "measure" && (
              <button
                type="button"
                className="tool-options-cap"
                onClick={onOpenMeasureOptions}
                aria-label="Measure options"
                aria-haspopup="dialog"
                title="Measure options"
              >
                <AppIcon name="ui.properties" size="sm" aria-hidden />
                <AppIcon name="ui.caretDown" size="sm" className="cap-caret" aria-hidden />
              </button>
            )}
            {tools.map((t) => (
              <Tooltip
                key={t.id}
                placement="right"
                compact
                content={
                  <span>
                    {t.label} <kbd className="tool-shortcut">{t.shortcut}</kbd>
                  </span>
                }
              >
                <button
                  type="button"
                  className={`tool-btn${activeTool === t.id ? " active" : ""}`}
                  onClick={() => onSelect(t.id)}
                  aria-pressed={activeTool === t.id}
                  aria-label={`${t.label} (${t.shortcut})`}
                >
                  <AppIcon name={t.icon} size="lg" aria-hidden />
                </button>
              </Tooltip>
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
};
