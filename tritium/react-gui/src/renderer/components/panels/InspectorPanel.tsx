/**
 * @file components/InspectorPanel.tsx
 * @description Right-side inspector panel for editing node properties.
 *
 * ## Layout
 *
 * ```
 * ┌──────────────────────────┐
 * │  ribbon1          [×]   │  ← header (node name + type + close)
 * ├──────────────────────────┤
 * │ [ Properties │ Generic ] │  ← SegmentedControl
 * ├──────────────────────────┤
 * │  (Generic) flat table +  │
 * │   type-aware detail edit │
 * └──────────────────────────┘
 * ```
 *
 * The "Generic" tab is the migrated UXP `generic-propdlg` - a flat,
 * type-aware editor for every property of the selected scene-tree node.
 * The "Properties" tab is a structured per-type view still on sample data.
 *
 * @module InspectorPanel
 */

import React, { useState, useCallback, useEffect } from "react";
import { Icon, Button, SegmentedControl } from "@blueprintjs/core";

import { PropertiesTab } from "../inspector/PropertiesTab";
import { GenericTab } from "../inspector/GenericTab";
import type { PropDef } from "../../data/rendererProperties";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type InspectorMode = "properties" | "generic";

interface InspectorPanelProps {
  /** Whether a scene-tree node is currently being inspected. */
  hasTarget: boolean;
  /** Display name shown in the header (node name). */
  nodeName: string;
  /** Type label shown in the header (renderer type / class name). */
  nodeType: string;
  /** Structured property definitions for the Properties tab (sample data). */
  properties: PropDef[];
  /** Flat property entries for the Generic tab. */
  genericEntries: GenericPropEntry[];
  /** True while the Generic property list is being (re)fetched. */
  genericLoading: boolean;
  /** Called when a structured (sample) property value changes. */
  onPropertyChange: (key: string, value: string | number | boolean) => void;
  /** Called to write a Generic property value (live-apply). */
  onGenericSet: (key: string, valueType: string, value: string | number | boolean) => void;
  /** Called to restore a Generic property to its C++ default. */
  onGenericReset: (key: string) => void;
  /** Called when the user clicks the close button. */
  onClose: () => void;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  hasTarget,
  nodeName,
  nodeType,
  properties,
  genericEntries,
  genericLoading,
  onPropertyChange,
  onGenericSet,
  onGenericReset,
  onClose,
}) => {
  // Generic tab is the real, data-backed view - default to it.
  const [mode, setMode] = useState<InspectorMode>("generic");

  const handleModeChange = useCallback((value: string) => {
    setMode(value as InspectorMode);
  }, []);

  // A freshly selected node should land on the Generic tab.
  useEffect(() => {
    if (hasTarget) setMode("generic");
  }, [hasTarget, nodeName]);

  return (
    <div className="inspector-panel">
      {/* ── Header ── */}
      <div className="inspector-header">
        <div className="inspector-header-left">
          <Icon icon="properties" size={14} className="inspector-header-icon" />
          <div className="inspector-header-info">
            <span className="inspector-header-name">{nodeName || "Inspector"}</span>
            <span className="inspector-header-type">{nodeType}</span>
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

      {!hasTarget ? (
        <div className="inspector-empty">No node selected.</div>
      ) : (
        <>
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
              <PropertiesTab properties={properties} onChange={onPropertyChange} />
            ) : (
              <GenericTab
                entries={genericEntries}
                loading={genericLoading}
                onSetValue={onGenericSet}
                onResetValue={onGenericReset}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};
