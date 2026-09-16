/**
 * @file features/molview/ViewportToolPalette.tsx
 * @description Floating vertical tool palette anchored to the left edge of
 * the 3D viewport area. Each button activates a different interaction
 * mode (navigate, select, measure, ...).
 *
 * Layout:
 *   +----+
 *   | v  |  <- collapse cap (folds the palette down to this cap alone)
 *   +----+  <- separator
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
 * The cap folds the palette down to the cap alone and unfolds it again;
 * View > Tool palette and its shortcut toggle the same persisted flag.
 *
 * @module ViewportToolPalette
 */

import React from "react";
import { Popover, Tooltip } from "@blueprintjs/core";
import { AppIcon, DisclosureCaret } from "@renderer/h3-kit/primitives";
import { MeasureOptionsPopover } from "./MeasureOptionsPopover";
import { BondEditOptionsPopover } from "./BondEditOptionsPopover";
import { useTheme } from "@renderer/contexts/ThemeContext";
import {
  TOOLS,
  CATEGORY_ORDER,
  type ToolId,
} from "@renderer/data/viewportTools";

interface Props {
  activeTool: ToolId;
  onSelect: (id: ToolId) => void;
  /** Current measure target label-set name ('' = Auto). */
  measureTarget: string;
  /** Set the measure target label-set name. */
  onMeasureTargetChange: (name: string) => void;
  /** Folded: only the cap that shows the tools again is drawn. */
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const ViewportToolPalette: React.FC<Props> = ({
  activeTool,
  onSelect,
  measureTarget,
  onMeasureTargetChange,
  collapsed,
  onToggleCollapse,
}) => {
  const { theme } = useTheme();
  const toggleLabel = collapsed ? "Show tool palette" : "Hide tool palette";
  return (
    <div className="viewport-tool-palette" role="toolbar" aria-label="Viewport tools">
      {/* The label carries the state: Blueprint's Tooltip renders its own
          target props and drops an aria-expanded passed through it. */}
      <Tooltip placement="right" compact content={toggleLabel}>
        <button
          type="button"
          className="tool-palette-collapse"
          onClick={onToggleCollapse}
          aria-label={toggleLabel}
        >
          <DisclosureCaret expanded={!collapsed} />
        </button>
      </Tooltip>
      {!collapsed && <div className="tool-palette-separator" aria-hidden="true" />}
      {!collapsed && CATEGORY_ORDER.map((cat, idx) => {
        const tools = TOOLS.filter((t) => t.category === cat);
        if (tools.length === 0) return null;
        return (
          <React.Fragment key={cat}>
            {idx > 0 && <div className="tool-palette-separator" aria-hidden="true" />}
            {cat === "measure" && (
              <Popover
                placement="right-start"
                portalClassName={theme === "dark" ? "bp5-dark" : ""}
                content={
                  <MeasureOptionsPopover
                    target={measureTarget}
                    onTargetChange={onMeasureTargetChange}
                  />
                }
              >
                <button
                  type="button"
                  className="tool-options-cap"
                  aria-label="Measure options"
                  aria-haspopup="dialog"
                  title="Measure options"
                >
                  <AppIcon name="ui.menu" size="sm" aria-hidden />
                  <AppIcon name="ui.caretDown" size="sm" className="cap-caret" aria-hidden />
                </button>
              </Popover>
            )}
            {cat === "edit" && (
              <Popover
                placement="right-start"
                portalClassName={theme === "dark" ? "bp5-dark" : ""}
                content={<BondEditOptionsPopover />}
              >
                <button
                  type="button"
                  className="tool-options-cap"
                  aria-label="Bond editor options"
                  aria-haspopup="dialog"
                  title="Bond editor options"
                >
                  <AppIcon name="ui.menu" size="sm" aria-hidden />
                  <AppIcon name="ui.caretDown" size="sm" className="cap-caret" aria-hidden />
                </button>
              </Popover>
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
