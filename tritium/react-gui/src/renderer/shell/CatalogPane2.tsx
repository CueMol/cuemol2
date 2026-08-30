/**
 * @file shell/CatalogPane2.tsx
 * @description Component catalog (2/3): aligned FieldGrid, shared widgets
 * (MolSelList / SliderField), Listbox rows, the segmented control and
 * form buttons.
 *
 * A showcase, not a feature pane. Sizing comes entirely from the catalog
 * (`styles/_form-kit.css`); this file sets no control sizes itself.
 *
 * @module CatalogPane2
 */

import React, { useState } from "react";
import { AppIcon } from "@renderer/h3-kit/primitives";
import { PaneSectionHeader } from "./PaneSectionHeader";
import {
  Field,
  FieldGroup,
  FieldGrid,
  FieldGridRow,
  DragNumericField,
  ButtonRow,
  FormButton,
  SegmentField,
  RadioField,
  ColorField,
  SliderField,
} from "@renderer/h3-kit/form";
import { Listbox, ListRow } from "@renderer/h3-kit/list";
import { MolSelList } from "@renderer/h3-kit/MolSelList";
import { useActiveScene } from '@renderer/state/workspace';

/** Sample rows for the Listbox showcase. */
const LISTBOX_ITEMS = ["1CRN", "3J3Q", "Water", "Ligand"];

/* --- Props --- */

interface CatalogPane2Props {
  collapsed?: boolean;
  onToggleCollapse?: () => void;

}

/* --- Component --- */

export const CatalogPane2: React.FC<CatalogPane2Props> = ({
  collapsed = false,
  onToggleCollapse,
}) => {
  const { activeSceneId } = useActiveScene();
  const [gx, setGx] = useState(-0.52);
  const [gy, setGy] = useState(-0.7);
  const [gz, setGz] = useState(0.54612);
  const [molSel, setMolSel] = useState("*");
  const [opacity, setOpacity] = useState(80);
  const [angle, setAngle] = useState(90);
  const [listSel, setListSel] = useState("3J3Q");
  const [seg, setSeg] = useState("all");
  const [radio, setRadio] = useState("temp");
  const [color, setColor] = useState("#3b82f6");

  return (
    <div className="sp-pane">
      <PaneSectionHeader
        title="Catalog 2"
        icon="ui.widget"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <div className="sp-pane-fill">
          <div className="sp-pane-scroll catalog-gallery">
            <FieldGroup title="FieldGrid (aligned label column)">
              <FieldGrid>
                <FieldGridRow label="Location X">
                  <DragNumericField value={gx} onChange={setGx} step={0.1} unit="m" />
                </FieldGridRow>
                <FieldGridRow label="Y">
                  <DragNumericField value={gy} onChange={setGy} step={0.1} unit="m" />
                </FieldGridRow>
                <FieldGridRow label="Z">
                  <DragNumericField value={gz} onChange={setGz} step={0.1} unit="m" />
                </FieldGridRow>
              </FieldGrid>
            </FieldGroup>

            <FieldGroup title="Shared widgets">
              <Field label="MolSelList (selection picker)">
                <MolSelList
                  sceneID={activeSceneId ?? 0}
                  selectedSel={molSel}
                  onSelectedSelChange={setMolSel}
                />
              </Field>
              <Field label="ColorField">
                <ColorField value={color} onCommit={setColor} />
              </Field>
              <SliderField
                label="Opacity"
                value={opacity}
                onCommit={setOpacity}
                min={0}
                max={100}
                unit="%"
              />
              <SliderField
                label="Stride (slider=false)"
                value={opacity}
                onCommit={setOpacity}
                min={1}
                max={9999}
                slider={false}
              />
              {/* Label-less variant: the Field owns the label, so the stepper
                  can share a row with another control (e.g. a preset select). */}
              <Field label="Angle (hideLabel, in a Field)">
                <SliderField
                  label="Angle"
                  hideLabel
                  slider={false}
                  value={angle}
                  onCommit={setAngle}
                  min={0}
                  max={360}
                  unit="°"
                />
              </Field>
            </FieldGroup>

            <FieldGroup title="Listbox (list / tree row)">
              <Listbox>
                {LISTBOX_ITEMS.map((item) => (
                  <ListRow
                    key={item}
                    selected={listSel === item}
                    onClick={() => setListSel(item)}
                  >
                    <AppIcon name="ui.cube" size="md" aria-hidden />
                    <span>{item}</span>
                  </ListRow>
                ))}
              </Listbox>
            </FieldGroup>

            <FieldGroup title="Segmented control">
              <SegmentField
                value={seg}
                onValueChange={setSeg}
                options={[
                  { label: "All", value: "all" },
                  { label: "Backbone", value: "backbone" },
                  { label: "Sidechain", value: "sidechain" },
                ]}
              />
            </FieldGroup>

            {/* One of N as a *setting* (a segmented control above reads as a
                tab strip, so it belongs at the top of a pane, not in a form). */}
            <FieldGroup title="Radio group">
              <Field label="Location">
                <RadioField
                  value={radio}
                  onValueChange={setRadio}
                  options={[
                    { label: "Temporary", value: "temp" },
                    { label: "Custom", value: "custom" },
                  ]}
                />
              </Field>
            </FieldGroup>

            <FieldGroup title="Buttons">
              <ButtonRow>
                <FormButton text="Default" />
                <FormButton text="Primary" intent="primary" />
                <FormButton text="Icon" icon={<AppIcon name="ui.check" aria-hidden />} />
                <FormButton text="Minimal" minimal />
                <FormButton text="Disabled" disabled />
              </ButtonRow>
            </FieldGroup>
          </div>
        </div>
      )}
    </div>
  );
};
