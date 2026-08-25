/**
 * @file components/inspector/PropEditors.tsx
 * @description Individual editor widgets for each property type.
 *
 * Each editor maps a single `PropDef` onto a form-kit catalog component
 * (`h3-kit/form/`), so control sizing/layout is owned by the
 * shared catalog -- the inspector never re-chooses sizes. The parent
 * `PropertiesTab` maps `PropDef.type` to the correct editor.
 */

import React, { useCallback, useRef, useState } from "react";
import type { PropDef } from "../../data/rendererProperties";
import {
  Field,
  TextField,
  SelectField,
  DragNumericField,
  NumericField,
  ComboBoxField,
  SwitchField,
  ColorField,
  SliderField,
} from "../../h3-kit/form";

// ------------------------------------------------------------
// Shared row wrapper -- kept as a catalog alias for back-compat.
// New code should import `Field` from h3-kit/form.
// ------------------------------------------------------------

export { Field as PropRow } from "../../h3-kit/form";

// ------------------------------------------------------------
// String editor
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// Numeric editor (integer & real) -- Blender-style drag field
// ------------------------------------------------------------

interface NumericEditorProps {
  prop: PropDef;
  onChange: (key: string, value: number) => void;
}

/**
 * Drag-to-edit numeric field, matching the renderer property sections
 * (`NumRow`). The value lives in React state and updates synchronously, so a
 * plain controlled `value` / `onChange` is enough -- no draft/commit hook is
 * needed. The unit suffix (`prop.unit`, e.g. "px" / "in") is shown inside the
 * field; integer props render with no decimal digits.
 *
 * When `prop.inline` is set the field renders as a compact plain number box
 * (no drag) with the label beside it on a single row -- used by the
 * render-settings width / height fields, where a drag control and a two-row
 * layout are both unwanted. When `prop.slider` is set it renders the
 * slider + number + stepper row instead (settings adjusted by feel within a
 * known range, e.g. the NPR hatch multipliers).
 */
export const NumericEditor: React.FC<NumericEditorProps> = ({ prop, onChange }) => {
  const step = prop.step ?? (prop.type === "integer" ? 1 : 0.01);
  const decimals = prop.decimals ?? (prop.type === "integer" ? 0 : undefined);
  if (prop.slider) {
    // SliderField carries its own label; no Field wrapper (double label).
    return (
      <SliderField
        label={prop.label}
        value={Number(prop.value)}
        min={prop.min ?? 0}
        max={prop.max ?? 100}
        step={step}
        unit={prop.unit}
        onCommit={(v) => onChange(prop.key, v)}
      />
    );
  }
  if (prop.inline) {
    return (
      <Field label={prop.label} inline>
        <NumericField
          value={Number(prop.value)}
          onChange={(v) => onChange(prop.key, v)}
          min={prop.min ?? 0}
          max={prop.max ?? 100}
          step={step}
          slider={false}
          unit={prop.unit}
        />
      </Field>
    );
  }
  return (
    <Field label={prop.label}>
      <DragNumericField
        value={Number(prop.value)}
        onChange={(v) => onChange(prop.key, v)}
        min={prop.min ?? 0}
        max={prop.max ?? 100}
        step={step}
        decimals={decimals}
        unit={prop.unit}
      />
    </Field>
  );
};

// ------------------------------------------------------------
// Combo editor (numeric value with preset suggestions)
// ------------------------------------------------------------

interface ComboEditorProps {
  prop: PropDef;
  onChange: (key: string, value: number) => void;
}

/**
 * Editable numeric combobox (e.g. DPI), matching UXP's editable DPI menulist:
 * a text input plus a dropdown of preset values (`prop.options`). Free numeric
 * entry is allowed and only a valid number is committed. A local draft holds
 * the in-progress text so the field can be cleared and retyped; it is re-seeded
 * when the committed value changes from outside (e.g. a size preset sets DPI).
 */
export const ComboEditor: React.FC<ComboEditorProps> = ({ prop, onChange }) => {
  const committed = Number(prop.value);
  const [draft, setDraft] = useState(() => String(prop.value));
  // Adopt an external value change (preset / restore) without fighting typing:
  // only re-seed when the committed value moved to something the draft does not
  // already represent.
  const lastCommittedRef = useRef(committed);
  if (committed !== lastCommittedRef.current) {
    lastCommittedRef.current = committed;
    if (Number(draft) !== committed) setDraft(String(committed));
  }
  const commit = useCallback(
    (s: string) => {
      const n = Number(s);
      if (s.trim() !== "" && Number.isFinite(n)) onChange(prop.key, n);
    },
    [onChange, prop.key],
  );
  return (
    <Field label={prop.label}>
      <ComboBoxField
        value={draft}
        options={prop.options ?? []}
        onChange={(v) => {
          setDraft(v);
          commit(v);
        }}
        triggerLabel={`Show ${prop.label} presets`}
        triggerTitle={`${prop.label} presets`}
      />
    </Field>
  );
};

// ------------------------------------------------------------
// Boolean editor -- switch toggle
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// Enum editor -- dropdown select
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// Color editor -- swatch + text input
// ------------------------------------------------------------

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
