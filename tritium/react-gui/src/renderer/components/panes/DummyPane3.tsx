/**
 * @file DummyPane3.tsx
 * @description Placeholder pane for demonstrating N-pane system extensibility.
 *
 * This pane serves as a test fixture for the refactored SidePanel architecture.
 * In a real implementation, this would contain specific domain logic
 * (e.g., file explorer, property editor, asset library, etc.).
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
 * │ Dummy Pane 3            [≡]   │  ← SectionHeader
 * ├────────────────────────────────┤
 * │ Pane 3 Content               │  ← Scrollable content area
 * │                              │
 * └────────────────────────────────┘
 * ```
 *
 * @module DummyPane3
 */

import React from "react";
import { SectionHeader } from "./SectionHeader";

/* ─── Props ─── */

interface DummyPane3Props {
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
 *
 * @param props – Component props
 * @returns Rendered pane with header and optional content area
 */
export const DummyPane3: React.FC<DummyPane3Props> = ({
  collapsed = false,
  onToggleCollapse,
}) => {
  return (
    <div className="pane-container">
      <SectionHeader
        title="Dummy Pane 3"
        icon="properties"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <div className="pane-content">
          <div className="pane-placeholder">
            <p>Dummy Pane 3</p>
            <p style={{ fontSize: "0.9em", color: "#999" }}>
              実装予定: 具体的な機能がここに入ります
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
