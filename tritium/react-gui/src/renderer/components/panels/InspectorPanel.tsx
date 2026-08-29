/**
 * @file components/panels/InspectorPanel.tsx
 * @description Right-side inspector panel -- the property editor for whatever
 * context currently has focus.
 *
 * ## Layout
 *
 * ```
 * ----------------------------
 * | [Renderer] ribbon1   [×] |  <- header (category badge + name + close)
 * |--------------------------|
 * | [ Properties | Generic ] |  <- SegmentedControl (node targets only)
 * |--------------------------|
 * |  body: Generic table OR  |
 * |   Render Settings editor |
 * ----------------------------
 * ```
 *
 * The inspector targets one of several context kinds. `node` targets (a
 * scene-tree node or the View) use the migrated UXP `generic-propdlg`
 * editor; `animElement` targets use `AnimElementInspector`.
 *
 * @module InspectorPanel
 */

import React, { useState, useCallback, useEffect } from "react";
import { Button, Tag } from "@blueprintjs/core";
import { AppIcon } from "../AppIcon";
import { SegmentField } from "../../h3-kit/form";

import { PropertiesTab } from "../inspector/PropertiesTab";
import { GenericTab } from "../inspector/GenericTab";
import { AnimElementInspector } from "../inspector/AnimElementInspector";
import { InspectorResetAllButton } from "../inspector/InspectorResetAllButton";
import { modifiedKeys } from "../inspector/propModel";
import { ColorPickerProvider } from "../../h3-kit/colorpicker/ColorPickerContext";
import { useInspector, useInspectorActions } from "../../state/inspector";
import { useCueMol } from "../../hooks/cuemol/useCueMol";
import { useActiveScene } from "../../state/workspace";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

type InspectorMode = "properties" | "generic";

/** Kind of context the inspector is currently editing. */
export type InspectorTargetKind = "node" | "animElement";


// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

const InspectorPanelComponent: React.FC = () => {
  // The target and its property data come from the inspector provider; the
  // writers are identity-stable, so a property change re-renders only what
  // reads the entries.
  const {
    target,
    category: targetCategory,
    header,
    entries: genericEntries,
    molId: selContextMolId,
    loading: genericLoading,
  } = useInspector();
  const {
    setProp: onGenericSet,
    setMany: onGenericSetMany,
    resetProp: onGenericReset,
    resetMany: onResetMany,
    close: onClose,
    clearAnimElement: onAnimElementGone,
    setAnimHeader: onAnimHeaderChange,
  } = useInspectorActions();
  const { cm } = useCueMol();
  const { activeSceneId: sceneId } = useActiveScene();
  const hasTarget = target !== null;
  const targetKind: InspectorTargetKind | null = target?.kind ?? null;
  const nodeName = header.name;
  const nodeType = header.type;
  const nodeId = target?.kind === "node" ? target.nodeId : undefined;
  const animElement = target?.kind === "animElement" ? { sceneId: target.sceneId, uid: target.uid } : null;

  /**
   * Writer for the structured page. It presents a renderer group's `visible`
   * flag as "show / hide this group", so the members follow -- the same thing
   * the scene tree's eye toggle does. The Generic tab is a raw property
   * editor and writes only the property it names, so it uses the plain
   * writer.
   */
  const setStructuredProp = useCallback<typeof onGenericSet>(
    (key, valueType, value, opts) =>
      onGenericSet(key, valueType, value, { ...opts, cascadeGroupVisibility: true }),
    [onGenericSet],
  );
  // Renderer, Object and Scene targets have a migrated structured page, so
  // default to it; other node kinds fall back to the data-backed Generic tab.
  const isRenderer =
    targetCategory === "Renderer" || targetCategory === "Renderer group";
  const isObject = targetCategory === "Object";
  const isScene = targetCategory === "Scene";
  const defaultMode: InspectorMode =
    isRenderer || isObject || isScene ? "properties" : "generic";

  const [mode, setMode] = useState<InspectorMode>(defaultMode);

  const handleModeChange = useCallback((value: string) => {
    setMode(value as InspectorMode);
  }, []);

  // A freshly selected node should land on its default tab.
  useEffect(() => {
    if (hasTarget) setMode(defaultMode);
  }, [hasTarget, nodeName, defaultMode]);

  const isAnimElement = targetKind === "animElement";

  return (
    <ColorPickerProvider cm={cm} sceneId={sceneId}>
    <div className="inspector-panel">
      {/* -- Header -- */}
      <div className="inspector-header panel-header">
        <div className="inspector-header-left">
          <AppIcon name="ui.properties" size="md" className="panel-header-icon" aria-hidden />
          <div className="inspector-header-info">
            {hasTarget && targetCategory && (
              <Tag minimal className="inspector-header-badge">
                {targetCategory}
              </Tag>
            )}
            {nodeName ? (
              <span className="panel-header-name type-panel-title">{nodeName}</span>
            ) : !hasTarget ? (
              <span className="panel-header-name type-panel-title">Inspector</span>
            ) : null}
            {nodeType && (
              <span className="inspector-header-type">{nodeType}</span>
            )}
          </div>
        </div>
        <Button
          minimal
          small
          icon={<AppIcon name="ui.close" size="md" aria-hidden />}
          className="inspector-close-btn"
          onClick={onClose}
        />
      </div>

      {!hasTarget ? (
        <div className="inspector-empty">No node selected.</div>
      ) : isAnimElement ? (
        /* -- Animation element target (self-contained editor) -- */
        animElement && cm ? (
          <AnimElementInspector
            cm={cm}
            sceneId={animElement.sceneId}
            uid={animElement.uid}
            onGone={onAnimElementGone}
            onHeaderChange={onAnimHeaderChange}
          />
        ) : (
          <div className="inspector-empty">No animation element.</div>
        )
      ) : (
        /* -- Node target (scene-tree node / View) -- */
        <>
          {/* -- Mode switcher + reset all -- */}
          <div className="inspector-mode-bar mode-bar">
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

          {/* -- Tab content -- */}
          <div className="inspector-body">
            {mode === "properties" ? (
              <PropertiesTab
                entries={genericEntries}
                rendererType={nodeType}
                isObject={isObject}
                onSet={setStructuredProp}
                onSetMany={onGenericSetMany}
                onReset={onGenericReset}
                sceneId={sceneId}
                nodeId={nodeId}
                molId={selContextMolId}
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

/**
 * Props-free: re-renders for the inspector target and its property
 * entries alone.
 */
export const InspectorPanel = React.memo(InspectorPanelComponent)
InspectorPanel.displayName = 'InspectorPanel'
