/**
 * @file components/inspector/PropEditors.tsx
 * @description Individual editor widgets for each property type.
 *
 * Each editor is a small, focused component that handles a single
 * property type (string, integer, real, boolean, enum, color).
 * The parent `PropertiesTab` maps `PropDef.type` to the correct editor.
 */

import React, { useCallback } from "react";
import {
  InputGroup,
  NumericInput,
  Switch,
  HTMLSelect,
  Slider,
} from "@blueprintjs/core";
import type { PropDef } from "../../data/rendererProperties";
import { CueColorField } from "../widgets/colorpicker/CueColorField";

// ────────────────────────────────────────────────────────────
// Shared row wrapper
// ────────────────────────────────────────────────────────────

interface PropRowProps {
  label: string;
  /** If true, render children inline (for booleans). */
  inline?: boolean;
  children: React.ReactNode;
}

export const PropRow: React.FC<PropRowProps> = ({ label, inline, children }) => (
  <div className={`insp-prop-row ${inline ? "inline" : ""}`}>
    <label className="insp-prop-label">{label}</label>
    <div className="insp-prop-control">{children}</div>
  </div>
);

// ────────────────────────────────────────────────────────────
// String editor
// ────────────────────────────────────────────────────────────

interface StringEditorProps {
  prop: PropDef;
  onChange: (key: string, value: string) => void;
}

export const StringEditor: React.FC<StringEditorProps> = ({ prop, onChange }) => (
  <PropRow label={prop.label}>
    <InputGroup
      small
      fill
      value={String(prop.value)}
      onChange={(e) => onChange(prop.key, e.target.value)}
      className="insp-input"
      readOnly={prop.readonly}
    />
  </PropRow>
);

// ────────────────────────────────────────────────────────────
// Numeric editor (integer & real) — slider + numeric input
// ────────────────────────────────────────────────────────────

interface NumericEditorProps {
  prop: PropDef;
  onChange: (key: string, value: number) => void;
}

export const NumericEditor: React.FC<NumericEditorProps> = ({ prop, onChange }) => {
  const val = Number(prop.value);
  const step = prop.step ?? (prop.type === "integer" ? 1 : 0.01);
  const min = prop.min ?? 0;
  const max = prop.max ?? 100;

  const handleSlider = useCallback(
    (v: number) => onChange(prop.key, v),
    [prop.key, onChange]
  );

  const handleNumeric = useCallback(
    (_vn: number, vs: string) => {
      const parsed = parseFloat(vs);
      if (!isNaN(parsed)) onChange(prop.key, parsed);
    },
    [prop.key, onChange]
  );

  return (
    <PropRow label={prop.label}>
      <div className="insp-numeric-row">
        <Slider
          min={min}
          max={max}
          stepSize={step}
          value={val}
          onChange={handleSlider}
          labelRenderer={false}
          className="insp-slider"
        />
        <NumericInput
          small
          value={val}
          onValueChange={handleNumeric}
          min={min}
          max={max}
          stepSize={step}
          minorStepSize={null}
          className="insp-numeric-input"
          fill={false}
        />
      </div>
    </PropRow>
  );
};

// ────────────────────────────────────────────────────────────
// Boolean editor — switch toggle
// ────────────────────────────────────────────────────────────

interface BooleanEditorProps {
  prop: PropDef;
  onChange: (key: string, value: boolean) => void;
}

export const BooleanEditor: React.FC<BooleanEditorProps> = ({ prop, onChange }) => (
  <PropRow label={prop.label} inline>
    <Switch
      checked={Boolean(prop.value)}
      onChange={(e) =>
        onChange(prop.key, (e.target as HTMLInputElement).checked)
      }
      className="insp-switch"
    />
  </PropRow>
);

// ────────────────────────────────────────────────────────────
// Enum editor — dropdown select
// ────────────────────────────────────────────────────────────

interface EnumEditorProps {
  prop: PropDef;
  onChange: (key: string, value: string) => void;
}

export const EnumEditor: React.FC<EnumEditorProps> = ({ prop, onChange }) => (
  <PropRow label={prop.label}>
    <HTMLSelect
      fill
      value={String(prop.value)}
      onChange={(e) => onChange(prop.key, e.target.value)}
      className="insp-select"
    >
      {prop.options?.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </HTMLSelect>
  </PropRow>
);

// ────────────────────────────────────────────────────────────
// Color editor — swatch + text input
// ────────────────────────────────────────────────────────────

interface ColorEditorProps {
  prop: PropDef;
  onChange: (key: string, value: string) => void;
}

export const ColorEditor: React.FC<ColorEditorProps> = ({ prop, onChange }) => (
  <PropRow label={prop.label}>
    <CueColorField
      value={String(prop.value)}
      onCommit={(v) => onChange(prop.key, v)}
      disabled={prop.readonly}
    />
  </PropRow>
);
