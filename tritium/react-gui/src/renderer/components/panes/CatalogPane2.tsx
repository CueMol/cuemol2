/**
 * @file CatalogPane2.tsx
 * @description Component catalog (2/3): aligned FieldGrid, shared widgets
 * (MolSelList / SliderNumericField), Listbox rows, the segmented control and
 * form buttons.
 *
 * A showcase, not a feature pane. Sizing comes entirely from the catalog
 * (`styles/_form-kit.css`); this file sets no control sizes itself.
 *
 * @module CatalogPane2
 */

import React, { useState } from "react";
import { Icon } from "@blueprintjs/core";
import { SectionHeader } from "./SectionHeader";
import {
  Field,
  FieldGroup,
  FieldGrid,
  FieldGridRow,
  DragNumericField,
  ButtonRow,
  FormButton,
  SegmentField,
  ColorField,
} from "../../h3-kit/form";
import { Listbox, ListRow } from "../../h3-kit/list";
import { MolSelList } from "../../h3-kit/MolSelList";
import { SliderNumericField } from "../../h3-kit/SliderNumericField";

/** Sample rows for the Listbox showcase. */
const LISTBOX_ITEMS = ["1CRN", "3J3Q", "Water", "Ligand"];

/* ─── Props ─── */

interface CatalogPane2Props {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Active scene uid, forwarded to the MolSelList sample (picker defs). */
  activeSceneId?: number;
}

/* ─── Component ─── */

export const CatalogPane2: React.FC<CatalogPane2Props> = ({
  collapsed = false,
  onToggleCollapse,
  activeSceneId,
}) => {
  const [gx, setGx] = useState(-0.52);
  const [gy, setGy] = useState(-0.7);
  const [gz, setGz] = useState(0.54612);
  const [molSel, setMolSel] = useState("*");
  const [opacity, setOpacity] = useState(80);
  const [listSel, setListSel] = useState("3J3Q");
  const [seg, setSeg] = useState("all");
  const [color, setColor] = useState("#3b82f6");

  return (
    <div className="sp-pane">
      <SectionHeader
        title="Catalog 2"
        icon="widget"
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
              <SliderNumericField
                label="Opacity"
                value={opacity}
                onCommit={setOpacity}
                min={0}
                max={100}
                unit="%"
              />
            </FieldGroup>

            <FieldGroup title="Listbox (list / tree row)">
              <Listbox>
                {LISTBOX_ITEMS.map((item) => (
                  <ListRow
                    key={item}
                    selected={listSel === item}
                    onClick={() => setListSel(item)}
                  >
                    <Icon icon="cube" size={14} />
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

            <FieldGroup title="Buttons">
              <ButtonRow>
                <FormButton text="Default" />
                <FormButton text="Primary" intent="primary" />
                <FormButton text="Icon" icon="tick" />
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
