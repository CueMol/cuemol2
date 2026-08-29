/**
 * @file CatalogPane1.tsx
 * @description Component catalog (1/3): label hierarchy and the basic
 * label+control roles -- Field/FieldSection, Text & Select, Numeric/Switch/Color.
 *
 * A showcase, not a feature pane: it owns no app state and talks to no worker.
 * Sizing comes entirely from the catalog (`styles/_form-kit.css`); this file
 * intentionally sets no control sizes itself.
 *
 * @module CatalogPane1
 */

import React, { useState } from "react";
import { SectionHeader } from "./SectionHeader";
import { AppIcon } from "../AppIcon";
import {
  Field,
  FieldGroup,
  FieldSection,
  TextField,
  SelectField,
  NumericField,
  DragNumericField,
  GatedControl,
  TimeField,
  VectorField,
  SwitchField,
  CheckboxField,
} from "../../h3-kit/form";

/* --- Props --- */

interface CatalogPane1Props {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/* --- Component --- */

export const CatalogPane1: React.FC<CatalogPane1Props> = ({
  collapsed = false,
  onToggleCollapse,
}) => {
  const [text, setText] = useState("aname CA");
  const [select, setSelect] = useState("ribbon");
  const [num, setNum] = useState(50);
  const [num2, setNum2] = useState(8);
  const [drag, setDrag] = useState(1.0);
  const [timeMs, setTimeMs] = useState(1500);
  const [vec, setVec] = useState('(1,2,3)');
  const [sw, setSw] = useState(true);
  const [gated, setGated] = useState(true);
  const [filter, setFilter] = useState("");

  return (
    <div className="sp-pane">
      <SectionHeader
        title="Catalog 1"
        icon="ui.widget"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <div className="sp-pane-fill">
          <div className="sp-pane-scroll catalog-gallery">
            <FieldGroup title="Label hierarchy (FieldSection vs Field)">
              <FieldSection title="Molecule">
                <SelectField value={select} onChange={setSelect}>
                  <option value="ribbon">1CRN</option>
                  <option value="cpk">3J3Q</option>
                </SelectField>
              </FieldSection>
              <FieldSection title="Term">
                <Field label="Dist">
                  <TextField value={text} onChange={setText} />
                </Field>
              </FieldSection>
            </FieldGroup>

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
                  leftIcon={<AppIcon name="ui.filter" aria-hidden />}
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

            <FieldGroup title="Numeric & Switch">
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
              <Field label="DragNumericField (drag-snap / click-edit)">
                <DragNumericField
                  value={drag}
                  onChange={setDrag}
                  min={0}
                  max={10}
                  step={0.1}
                  unit="Å"
                />
              </Field>
              <Field label="TimeField (drag / spin / typed timecode)">
                <TimeField value={timeMs} onCommit={setTimeMs} />
              </Field>
              <Field label="VectorField (x/y/z cells; qlib::Vector4D text)">
                <VectorField value={vec} onCommit={setVec} />
              </Field>
              <Field label="SwitchField" inline>
                <SwitchField checked={sw} onChange={setSw} />
              </Field>
              {/* Opt-in gate: the box leads and the slack trails after the
                  label, so the row reads "[x] enables what follows". */}
              <Field label="CheckboxField (inline controlFirst)" inline controlFirst>
                <CheckboxField checked={sw} onChange={setSw} />
              </Field>
              {/* One property whose "off" is a value, not a separate flag:
                  the box and the field stay on one row so they share the
                  property's modified bar and reset. */}
              <Field label="GatedControl (checkbox + control, one property)">
                <GatedControl
                  checked={gated}
                  onCheckedChange={setGated}
                  ariaLabel="Use this value"
                >
                  <DragNumericField
                    value={drag}
                    onChange={setDrag}
                    min={0}
                    max={10}
                    step={0.1}
                    unit="Å"
                    disabled={!gated}
                  />
                </GatedControl>
              </Field>
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
