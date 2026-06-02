/**
 * @file components/inspector/PropEditors.tsx
 * @description Individual editor widgets for each property type.
 *
 * Each editor maps a single `PropDef` onto a form-kit catalog component
 * (`h3-kit/form/`), so control sizing/layout is owned by the
 * shared catalog -- the inspector never re-chooses sizes. The parent
 * `PropertiesTab` maps `PropDef.type` to the correct editor.
 */

import React from "react";
import type { PropDef } from "../../data/rendererProperties";
import {
  Field,
  TextField,
  SelectField,
  NumericField,
  SwitchField,
  ColorField,
} from "../../h3-kit/form";

// ────────────────────────────────────────────────────────────
// Shared row wrapper -- kept as a catalog alias for back-compat.
// New code should import `Field` from h3-kit/form.
// ────────────────────────────────────────────────────────────

export { Field as PropRow } from "../../h3-kit/form";

// ────────────────────────────────────────────────────────────
// String editor
// ────────────────────────────────────────────────────────────

interface StringEditorProps {
  prop: PropDef;
  onChange: (key: string, value: string) => void;
}

export const StringEditor: React.FC<StringEditorProps> = ({ prop, onChange }) => (
  <Field label={prop.label}>
    <TextField
      value={String(prop.value)}
      onChange={(v) => onChange(prop.key, v)}
      readOnly={prop.readonly}
    />
  </Field>
);

// ────────────────────────────────────────────────────────────
// Numeric editor (integer & real) — slider + numeric input
// ────────────────────────────────────────────────────────────

interface NumericEditorProps {
  prop: PropDef;
  onChange: (key: string, value: number) => void;
}

export const NumericEditor: React.FC<NumericEditorProps> = ({ prop, onChange }) => {
  const step = prop.step ?? (prop.type === "integer" ? 1 : 0.01);
  return (
    <Field label={prop.label}>
      <NumericField
        value={Number(prop.value)}
        onChange={(v) => onChange(prop.key, v)}
        min={prop.min ?? 0}
        max={prop.max ?? 100}
        step={step}
      />
    </Field>
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
  <Field label={prop.label} inline>
    <SwitchField
      checked={Boolean(prop.value)}
      onChange={(c) => onChange(prop.key, c)}
    />
  </Field>
);

// ────────────────────────────────────────────────────────────
// Enum editor — dropdown select
// ────────────────────────────────────────────────────────────

interface EnumEditorProps {
  prop: PropDef;
  onChange: (key: string, value: string) => void;
}

export const EnumEditor: React.FC<EnumEditorProps> = ({ prop, onChange }) => (
  <Field label={prop.label}>
    <SelectField value={String(prop.value)} onChange={(v) => onChange(prop.key, v)}>
      {prop.options?.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </SelectField>
  </Field>
);

// ────────────────────────────────────────────────────────────
// Color editor — swatch + text input
// ────────────────────────────────────────────────────────────

interface ColorEditorProps {
  prop: PropDef;
  onChange: (key: string, value: string) => void;
}

export const ColorEditor: React.FC<ColorEditorProps> = ({ prop, onChange }) => (
  <Field label={prop.label}>
    <ColorField
      value={String(prop.value)}
      onCommit={(v) => onChange(prop.key, v)}
      disabled={prop.readonly}
    />
  </Field>
);
