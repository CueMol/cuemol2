/**
 * @file DummyPane3.tsx
 * @description Live gallery of the form-kit component catalog
 * (`components/widgets/form/`). Renders every catalog component with sample
 * state so the canonical sizes / designs are visible at a glance -- a visual
 * reference for "what a Field / TextField / SelectField / ... looks like".
 *
 * This is a showcase, not a feature pane: it owns no app state and talks to no
 * worker. Sizing comes entirely from the catalog (`styles/_form-kit.css`); this
 * file intentionally sets no control sizes itself.
 *
 * @module DummyPane3
 */

import React, { useState } from "react";
import { SectionHeader } from "./SectionHeader";
import {
  Field,
  FieldGroup,
  TextField,
  SelectField,
  NumericField,
  SwitchField,
  ColorField,
  ButtonRow,
  FormButton,
} from "../widgets/form";
import { MolSelList } from "../widgets/MolSelList";
import { SliderNumericField } from "../widgets/SliderNumericField";

/* ─── Props ─── */

interface DummyPane3Props {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Active scene uid, forwarded to the MolSelList sample (picker defs). */
  activeSceneId?: number;
}

/* ─── Component ─── */

/**
 * Catalog gallery. Each `FieldGroup` is one section; each `Field` shows one
 * control role at its canonical size.
 */
export const DummyPane3: React.FC<DummyPane3Props> = ({
  collapsed = false,
  onToggleCollapse,
  activeSceneId,
}) => {
  const [text, setText] = useState("aname CA");
  const [select, setSelect] = useState("ribbon");
  const [num, setNum] = useState(50);
  const [num2, setNum2] = useState(8);
  const [sw, setSw] = useState(true);
  const [color, setColor] = useState("#3b82f6");
  const [molSel, setMolSel] = useState("*");
  const [opacity, setOpacity] = useState(80);
  const [filter, setFilter] = useState("");

  return (
    <div className="sp-pane">
      <SectionHeader
        title="Component Catalog"
        icon="widget"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <div className="sp-pane-fill">
          <div className="sp-pane-scroll catalog-gallery">
            <FieldGroup title="Text & Select">
              <Field label="TextField">
                <TextField value={text} onChange={setText} placeholder="value" />
              </Field>
              <Field label="TextField (invalid)">
                <TextField value="bogus(" onChange={() => undefined} invalid />
              </Field>
              <Field label="TextField (disabled)">
                <TextField value="locked" onChange={() => undefined} disabled />
              </Field>
              <Field label="TextField (filter / leftIcon)">
                <TextField
                  value={filter}
                  onChange={setFilter}
                  placeholder="Filter..."
                  leftIcon="filter"
                />
              </Field>
              <Field label="SelectField">
                <SelectField value={select} onChange={setSelect}>
                  <option value="ribbon">Ribbon</option>
                  <option value="cpk">CPK</option>
                  <option value="stick">Stick</option>
                </SelectField>
              </Field>
            </FieldGroup>

            <FieldGroup title="Numeric, Switch & Color">
              <Field label="NumericField (slider + unit)">
                <NumericField value={num} onChange={setNum} min={0} max={100} unit="Å" />
              </Field>
              <Field label="NumericField (no slider)">
                <NumericField
                  value={num2}
                  onChange={setNum2}
                  min={0}
                  max={100}
                  slider={false}
                />
              </Field>
              <Field label="SwitchField" inline>
                <SwitchField checked={sw} onChange={setSw} />
              </Field>
              <Field label="ColorField">
                <ColorField value={color} onCommit={setColor} />
              </Field>
            </FieldGroup>

            <FieldGroup title="Shared widgets">
              <Field label="MolSelList (selection picker)">
                <MolSelList
                  sceneID={activeSceneId ?? 0}
                  selectedSel={molSel}
                  onSelectedSelChange={setMolSel}
                />
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

            <FieldGroup title="Buttons">
              <ButtonRow>
                <FormButton text="Default" />
                <FormButton text="Primary" intent="primary" />
                <FormButton text="Icon" icon="tick" />
                <FormButton text="Minimal" minimal />
                <FormButton text="Disabled" disabled />
              </ButtonRow>
            </FieldGroup>

            <div className="catalog-note type-caption">
              All controls render at the catalog&apos;s canonical sizes (text /
              select 22px, numeric 20px). Sizing lives in styles/_form-kit.css
              -- this pane sets none itself.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
