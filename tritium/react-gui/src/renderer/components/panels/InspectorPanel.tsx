/**
 * @file components/InspectorPanel.tsx
 * @description Right-side inspector panel — the property editor for whatever
 * context currently has focus.
 *
 * ## Layout
 *
 * ```
 * ┌──────────────────────────┐
 * │ [Renderer] ribbon1   [×] │  ← header (category badge + name + close)
 * ├──────────────────────────┤
 * │ [ Properties │ Generic ] │  ← SegmentedControl (node targets only)
 * ├──────────────────────────┤
 * │  body: Generic table OR  │
 * │   Render Settings editor │
 * └──────────────────────────┘
 * ```
 *
 * The inspector targets one of several context kinds. `node` targets (a
 * scene-tree node or the View) use the migrated UXP `generic-propdlg`
 * editor; the `renderSettings` target uses `RenderSettingsEditor`.
 *
 * @module InspectorPanel
 */

import React, { useState, useCallback, useEffect } from "react";
import { Icon, Button, Tag } from "@blueprintjs/core";
import { SegmentField } from "../../h3-kit/form";

import { PropertiesTab } from "../inspector/PropertiesTab";
import { GenericTab } from "../inspector/GenericTab";
import { RenderSettingsEditor } from "../inspector/RenderSettingsEditor";
import { InspectorResetAllButton } from "../inspector/InspectorResetAllButton";
import { modifiedKeys } from "../inspector/propModel";
import type { PropDef } from "../../data/rendererProperties";
import type { RenderBackendId } from "../../data/renderSettings";
import type {
  GenericPropEntry,
  PropWriteOpts,
} from "../../worker/server/services/genericProps.service";
import type { AsyncCueMol } from "../../worker/client/AsyncCueMol";
import { ColorPickerProvider } from "../../h3-kit/colorpicker/ColorPickerContext";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type InspectorMode = "properties" | "generic";

/** Kind of context the inspector is currently editing. */
export type InspectorTargetKind = "node" | "renderSettings";

/** Props passed through to the Render Settings editor. */
export interface RenderSettingsView {
  backend: RenderBackendId;
  backendIds: RenderBackendId[];
  commonProps: PropDef[];
  backendProps: PropDef[];
  onBackendChange: (id: RenderBackendId) => void;
  onChange: (key: string, value: string | number | boolean) => void;
}

interface InspectorPanelProps {
  /** Whether something is currently being inspected. */
  hasTarget: boolean;
  /** Kind of the current target (null when nothing is inspected). */
  targetKind: InspectorTargetKind | null;
  /** Conceptual category label shown as a header badge. */
  targetCategory: string;
  /** Display name shown in the header. */
  nodeName: string;
  /** Type label shown in the header (renderer type / class name). */
  nodeType: string;
  /** Flat property entries shared by the Properties and Generic tabs. */
  genericEntries: GenericPropEntry[];
  /** True while the Generic property list is being (re)fetched. */
  genericLoading: boolean;
  /** Render Settings state, present only for the `renderSettings` target. */
  renderSettings: RenderSettingsView | null;
  /** Called to write a Generic property value (live-apply). `opts` carries realtime-drag info. */
  onGenericSet: (
    key: string,
    valueType: string,
    value: string | number | boolean,
    opts?: PropWriteOpts,
  ) => void;
  /** Called to restore a Generic property to its C++ default. */
  onGenericReset: (key: string) => void;
  /** Called to restore several properties to their defaults in one undo step. */
  onResetMany: (keys: string[]) => void;
  /** Called when the user clicks the close button. */
  onClose: () => void;
  /** CueMol handle for colour resolution in property colour editors. */
  cm: AsyncCueMol | null;
  /** Active scene id for colour resolution (named colours / gamut). */
  sceneId: number | undefined;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  hasTarget,
  targetKind,
  targetCategory,
  nodeName,
  nodeType,
  genericEntries,
  genericLoading,
  renderSettings,
  onGenericSet,
  onGenericReset,
  onResetMany,
  onClose,
  cm,
  sceneId,
}) => {
  // Renderer targets have a migrated structured page, so default to it;
  // other node kinds fall back to the data-backed Generic tab.
  const isRenderer =
    targetCategory === "Renderer" || targetCategory === "Renderer group";
  const defaultMode: InspectorMode = isRenderer ? "properties" : "generic";

  const [mode, setMode] = useState<InspectorMode>(defaultMode);

  const handleModeChange = useCallback((value: string) => {
    setMode(value as InspectorMode);
  }, []);

  // A freshly selected node should land on its default tab.
  useEffect(() => {
    if (hasTarget) setMode(defaultMode);
  }, [hasTarget, nodeName, defaultMode]);

  const isRenderSettings = targetKind === "renderSettings";

  return (
    <ColorPickerProvider cm={cm} sceneId={sceneId}>
    <div className="inspector-panel">
      {/* ── Header ── */}
      <div className="inspector-header">
        <div className="inspector-header-left">
          <Icon icon="properties" size={14} className="inspector-header-icon" />
          <div className="inspector-header-info">
            {hasTarget && targetCategory && (
              <Tag minimal className="inspector-header-badge">
                {targetCategory}
              </Tag>
            )}
            {nodeName ? (
              <span className="inspector-header-name">{nodeName}</span>
            ) : !hasTarget ? (
              <span className="inspector-header-name">Inspector</span>
            ) : null}
            {nodeType && (
              <span className="inspector-header-type">{nodeType}</span>
            )}
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
      ) : isRenderSettings && renderSettings ? (
        /* ── Render Settings target ── */
        <div className="inspector-body">
          <RenderSettingsEditor
            backend={renderSettings.backend}
            backendIds={renderSettings.backendIds}
            commonProps={renderSettings.commonProps}
            backendProps={renderSettings.backendProps}
            onBackendChange={renderSettings.onBackendChange}
            onChange={renderSettings.onChange}
          />
        </div>
      ) : (
        /* ── Node target (scene-tree node / View) ── */
        <>
          {/* ── Mode switcher + reset all ── */}
          <div className="inspector-mode-bar">
            <SegmentField
              value={mode}
              onValueChange={handleModeChange}
              options={[
                { label: "Properties", value: "properties" },
                { label: "Generic", value: "generic" },
              ]}
            />
            {/* Reset all is available in both tabs (both edit the same
                properties); it restores every modified property in one step. */}
            <InspectorResetAllButton
              canResetAll={modifiedKeys(genericEntries).length > 0}
              onResetAll={() => onResetMany(modifiedKeys(genericEntries))}
            />
          </div>

          {/* ── Tab content ── */}
          <div className="inspector-body">
            {mode === "properties" ? (
              <PropertiesTab
                entries={genericEntries}
                rendererType={nodeType}
                onSet={onGenericSet}
                onReset={onGenericReset}
                sceneId={sceneId}
              />
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
    </ColorPickerProvider>
  );
};
