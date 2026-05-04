/**
 * @file components/InspectorPanel.tsx
 * @description Right-side inspector panel for editing renderer properties.
 *
 * ## Layout
 *
 * ```
 * ┌──────────────────────────┐
 * │  ribbon1          [×]   │  ← header (renderer name + close)
 * ├──────────────────────────┤
 * │ [ Properties │ Generic ] │  ← SegmentedControl
 * ├──────────────────────────┤
 * │  ▾ Basic Settings        │
 * │    Name: [ribbon1      ] │  ← accordion sections
 * │    ...                   │
 * │  ▸ Common                │
 * │  ▸ Helix Section         │
 * │  ...                     │
 * └──────────────────────────┘
 * ```
 *
 * The panel uses Blueprint's `SegmentedControl` to switch between the
 * structured Properties view (accordion) and the flat Generic key-value
 * table.
 *
 * @module InspectorPanel
 */

import React, { useState, useCallback } from "react";
import {
  Icon,
  Button,
  SegmentedControl,
} from "@blueprintjs/core";

import { PropertiesTab } from "../inspector/PropertiesTab";
import { GenericTab } from "../inspector/GenericTab";
import type { PropDef, GenericPropEntry } from "../../data/rendererProperties";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type InspectorMode = "properties" | "generic";

interface InspectorPanelProps {
  /** Display name shown in the header (e.g. "ribbon1"). */
  rendererName: string;
  /** Renderer type label (e.g. "Ribbon"). */
  rendererType: string;
  /** Structured property definitions for the Properties tab. */
  properties: PropDef[];
  /** Flat key-value entries for the Generic tab. */
  genericEntries: GenericPropEntry[];
  /** Called when any property value changes. */
  onPropertyChange: (key: string, value: string | number | boolean) => void;
  /** Called when a generic entry value changes. */
  onGenericChange: (key: string, value: string) => void;
  /** Called when the user clicks the close button. */
  onClose: () => void;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  rendererName,
  rendererType,
  properties,
  genericEntries,
  onPropertyChange,
  onGenericChange,
  onClose,
}) => {
  const [mode, setMode] = useState<InspectorMode>("properties");

  const handleModeChange = useCallback((value: string) => {
    setMode(value as InspectorMode);
  }, []);

  return (
    <div className="inspector-panel">
      {/* ── Header ── */}
      <div className="inspector-header">
        <div className="inspector-header-left">
          <Icon icon="style" size={14} className="inspector-header-icon" />
          <div className="inspector-header-info">
            <span className="inspector-header-name">{rendererName}</span>
            <span className="inspector-header-type">{rendererType}</span>
          </div>
        </div>
        <Button
          minimal
          small
          icon={<Icon icon="cross" size={14} />}
          className="inspector-close-btn"
          onClick={onClose}
        />
      </div>

      {/* ── Mode switcher ── */}
      <div className="inspector-mode-bar">
        <SegmentedControl
          small
          fill
          value={mode}
          onValueChange={handleModeChange}
          options={[
            { label: "Properties", value: "properties" },
            { label: "Generic", value: "generic" },
          ]}
        />
      </div>

      {/* ── Tab content ── */}
      <div className="inspector-body">
        {mode === "properties" ? (
          <PropertiesTab
            properties={properties}
            onChange={onPropertyChange}
          />
        ) : (
          <GenericTab
            entries={genericEntries}
            onChangeValue={onGenericChange}
          />
        )}
      </div>
    </div>
  );
};
