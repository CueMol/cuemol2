/**
 * @file CatalogPane3.tsx
 * @description Component catalog (3/3): the per-property reset UI -- the
 * `PropertyField` row (modified bar + hover reset + default annotation) and an
 * assembled "Inspector property pane" mock (mode bar + Reset all + accordion
 * sections of PropertyFields).
 *
 * A showcase, not a feature pane. "Modified" is flag-based, matching the cuemol
 * core property system: setting a property (even to a value equal to the
 * default) marks it non-default; only reset returns it to default. So editing a
 * row sets its `*Mod` flag (bar appears) and only reset clears it (bar
 * disappears) -- the value alone does not clear it. The isolated "Property rows"
 * group and the assembled mock keep SEPARATE state so their similarly named rows
 * do not move together. Sizing comes entirely from the catalog; this file sets
 * none.
 *
 * @module CatalogPane3
 */

import React, { useState } from "react";
import { SectionHeader } from "./SectionHeader";
import {
  FieldGroup,
  PropertyField,
  TextField,
  DragNumericField,
  SwitchField,
  SegmentField,
} from "../../h3-kit/form";
import { MolSelList } from "../../h3-kit/MolSelList";
import { AccordionSection } from "../inspector/AccordionSection";
import { InspectorResetAllButton } from "../inspector/InspectorResetAllButton";

/* --- Sample default values (restored on reset) --- */
const DEF_LABEL = "chain A";
const DEF_VISIBLE = true;
const DEF_OPACITY = 1.0;
const DEF_WIDTH = 1.0;
const DEF_SEL = "*";

/* --- Props --- */

interface CatalogPane3Props {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Active scene uid, forwarded to the MolSelList sample (picker defs). */
  activeSceneId?: number;
}

/* --- Component --- */

export const CatalogPane3: React.FC<CatalogPane3Props> = ({
  collapsed = false,
  onToggleCollapse,
  activeSceneId,
}) => {
  // Isolated "Property rows" showcase state. `*Mod` flags mirror the core
  // flag-based default state: edit sets the flag, only reset clears it.
  const [prLabel, setPrLabel] = useState("backbone");
  const [prLabelMod, setPrLabelMod] = useState(true);
  const [prVisible, setPrVisible] = useState(false);
  const [prVisibleMod, setPrVisibleMod] = useState(true);
  const [prOpacity, setPrOpacity] = useState(0.4);
  const [prOpacityMod, setPrOpacityMod] = useState(true);
  const [prLineWidth, setPrLineWidth] = useState(DEF_WIDTH); // starts at default
  const [prLineWidthMod, setPrLineWidthMod] = useState(false);
  const [prSel, setPrSel] = useState("resn ALA");
  const [prSelMod, setPrSelMod] = useState(true);

  // Assembled "Inspector property pane" mock state (separate from above).
  const [mkVisible, setMkVisible] = useState(false);
  const [mkVisibleMod, setMkVisibleMod] = useState(true);
  const [mkOpacity, setMkOpacity] = useState(0.4);
  const [mkOpacityMod, setMkOpacityMod] = useState(true);
  const [mkWidth, setMkWidth] = useState(2.5);
  const [mkWidthMod, setMkWidthMod] = useState(true);
  const [mkMode, setMkMode] = useState("properties");
  const mkAnyModified = mkVisibleMod || mkOpacityMod || mkWidthMod;

  return (
    <div className="sp-pane">
      <SectionHeader
        title="Catalog 3"
        icon="ui.widget"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <div className="sp-pane-fill">
          <div className="sp-pane-scroll catalog-gallery">
            <FieldGroup title="Property rows (PropertyField)">
              <PropertyField
                label="Label"
                modified={prLabelMod}
                resettable
                defaultValueLabel={DEF_LABEL}
                onReset={() => {
                  setPrLabel(DEF_LABEL);
                  setPrLabelMod(false);
                }}
              >
                <TextField
                  value={prLabel}
                  onChange={(v) => {
                    setPrLabel(v);
                    setPrLabelMod(true);
                  }}
                />
              </PropertyField>
              <PropertyField
                label="Visible"
                inline
                modified={prVisibleMod}
                resettable
                defaultValueLabel="on"
                onReset={() => {
                  setPrVisible(DEF_VISIBLE);
                  setPrVisibleMod(false);
                }}
              >
                <SwitchField
                  checked={prVisible}
                  onChange={(c) => {
                    setPrVisible(c);
                    setPrVisibleMod(true);
                  }}
                />
              </PropertyField>
              <PropertyField
                label="Opacity"
                modified={prOpacityMod}
                resettable
                defaultValueLabel="1.00"
                onReset={() => {
                  setPrOpacity(DEF_OPACITY);
                  setPrOpacityMod(false);
                }}
              >
                <DragNumericField
                  value={prOpacity}
                  onChange={(v) => {
                    setPrOpacity(v);
                    setPrOpacityMod(true);
                  }}
                  min={0}
                  max={1}
                  step={0.1}
                />
              </PropertyField>
              <PropertyField
                label="Line width"
                modified={prLineWidthMod}
                resettable
                defaultValueLabel="1.00"
                onReset={() => {
                  setPrLineWidth(DEF_WIDTH);
                  setPrLineWidthMod(false);
                }}
              >
                <DragNumericField
                  value={prLineWidth}
                  onChange={(v) => {
                    setPrLineWidth(v);
                    setPrLineWidthMod(true);
                  }}
                  min={0}
                  max={10}
                  step={0.2}
                  unit="px"
                />
              </PropertyField>
              <PropertyField
                label="Selection"
                modified={prSelMod}
                resettable
                defaultValueLabel={DEF_SEL}
                onReset={() => {
                  setPrSel(DEF_SEL);
                  setPrSelMod(false);
                }}
              >
                <MolSelList
                  sceneID={activeSceneId ?? 0}
                  selectedSel={prSel}
                  onSelectedSelChange={(v) => {
                    setPrSel(v);
                    setPrSelMod(true);
                  }}
                />
              </PropertyField>
            </FieldGroup>

            <FieldGroup title="Inspector property pane (mockup)">
              <div className="catalog-inspector-mock">
                <div className="inspector-mode-bar mode-bar">
                  <SegmentField
                    value={mkMode}
                    onValueChange={setMkMode}
                    options={[
                      { label: "Properties", value: "properties" },
                      { label: "Generic", value: "generic" },
                    ]}
                  />
                  {/* Reset all is available in both Properties and Generic
                      modes (the Generic editor also has a reset-to-default
                      concept), so it is not gated on the mode. */}
                  <InspectorResetAllButton
                    canResetAll={mkAnyModified}
                    onResetAll={() => {
                      setMkVisible(DEF_VISIBLE);
                      setMkVisibleMod(false);
                      setMkOpacity(DEF_OPACITY);
                      setMkOpacityMod(false);
                      setMkWidth(DEF_WIDTH);
                      setMkWidthMod(false);
                    }}
                  />
                </div>
                <AccordionSection title="Basic settings" defaultExpanded>
                  <PropertyField
                    label="Visible"
                    inline
                    modified={mkVisibleMod}
                    resettable
                    defaultValueLabel="on"
                    onReset={() => {
                      setMkVisible(DEF_VISIBLE);
                      setMkVisibleMod(false);
                    }}
                  >
                    <SwitchField
                      checked={mkVisible}
                      onChange={(c) => {
                        setMkVisible(c);
                        setMkVisibleMod(true);
                      }}
                    />
                  </PropertyField>
                  <PropertyField
                    label="Opacity"
                    modified={mkOpacityMod}
                    resettable
                    defaultValueLabel="1.00"
                    onReset={() => {
                      setMkOpacity(DEF_OPACITY);
                      setMkOpacityMod(false);
                    }}
                  >
                    <DragNumericField
                      value={mkOpacity}
                      onChange={(v) => {
                        setMkOpacity(v);
                        setMkOpacityMod(true);
                      }}
                      min={0}
                      max={1}
                      step={0.1}
                    />
                  </PropertyField>
                </AccordionSection>
                <AccordionSection title="Edge lines" defaultExpanded>
                  <PropertyField
                    label="Width"
                    modified={mkWidthMod}
                    resettable
                    defaultValueLabel="1.00"
                    onReset={() => {
                      setMkWidth(DEF_WIDTH);
                      setMkWidthMod(false);
                    }}
                  >
                    <DragNumericField
                      value={mkWidth}
                      onChange={(v) => {
                        setMkWidth(v);
                        setMkWidthMod(true);
                      }}
                      min={0}
                      max={10}
                      step={0.2}
                      unit="px"
                    />
                  </PropertyField>
                </AccordionSection>
              </div>
            </FieldGroup>
          </div>
        </div>
      )}
    </div>
  );
};
