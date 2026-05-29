/**
 * @file DummyPane4.tsx
 * @description Placeholder pane for demonstrating N-pane system extensibility.
 *
 * This pane serves as a test fixture for the refactored SidePanel architecture.
 * In a real implementation, this would contain specific domain logic
 * (e.g., file explorer, property editor, asset library, etc.).
 *
 * This pane is specifically designed to be added to the Explorer view,
 * demonstrating how new panes can be inserted into existing views without
 * breaking the layout or state management.
 *
 * ## Props
 *
 * - `collapsed` – Current collapse state (header-only if true)
 * - `onToggleCollapse` – Callback to toggle collapse state
 *
 * ## Layout
 *
 * ```
 * ┌────────────────────────────────┐
 * │ Dummy Pane 4            [≡]   │  ← SectionHeader
 * ├────────────────────────────────┤
 * │ Pane 4 Content               │  ← Scrollable content area
 * │                              │
 * └────────────────────────────────┘
 * ```
 *
 * @module DummyPane4
 */

import React from "react";
import { SectionHeader } from "./SectionHeader";

/* ─── Props ─── */

interface DummyPane4Props {
  /** Whether this pane is currently collapsed (header-only). */
  collapsed?: boolean;
  /** Callback fired when the user clicks the collapse/expand toggle. */
  onToggleCollapse?: () => void;
}

/* ─── Component ─── */

/**
 * Dummy pane component for PoC validation of the N-pane system.
 *
 * This pane demonstrates:
 * - Integration with SectionHeader for consistent UI
 * - Receiving and responding to collapse state
 * - Providing a content area for future feature implementation
 * - Adding a pane to an existing view (Explorer)
 *
 * @param props – Component props
 * @returns Rendered pane with header and optional content area
 */
export const DummyPane4: React.FC<DummyPane4Props> = ({
  collapsed = false,
  onToggleCollapse,
}) => {
  return (
    <div className="pane-container">
      <SectionHeader
        title="Dummy Pane 4"
        icon="wrench"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <div className="pane-content">
          <div className="pane-placeholder">
            <p>Dummy Pane 4</p>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>
              実装予定: 具体的な機能がここに入ります
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
