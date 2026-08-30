/**
 * @file features/inspector/HatchLayerRow.tsx
 * @description One mark layer of the NPR hatch layer editor: a header row
 * (name, duplicate, remove), the kind selector, the primary numeric fields
 * and a collapsed "Randomness / Advanced" area with the rest. Which fields
 * show follows the layer kind (line width vs. dot scale, stroke perturbations
 * vs. dot shape) through the field table in data/hatchSpec.ts.
 */

import React, { useCallback } from "react";

import { AccordionSection } from "./AccordionSection";
import { AppIcon } from "@renderer/h3-kit/primitives";
import { Field, FormButton, SelectField, SliderField, SwitchField } from "@renderer/h3-kit/form";
import {
  LAYER_FIELDS,
  fieldAppliesTo,
  layerFieldEnabled,
  type HatchFieldDef,
  type HatchLayer,
  type HatchLayerKind,
} from "@renderer/data/hatchSpec";

export interface HatchLayerRowProps {
  /** 0-based position in the layer list (shown 1-based). */
  index: number;
  layer: HatchLayer;
  /**
   * Render tab multipliers: pitch / density and width (or dot scale) *
   * widthScale are what actually render, shown as a hint under the field
   * whenever a multiplier is not 1.
   */
  density: number;
  widthScale: number;
  /** Render supersampling: the ink grid the 2 px minimum pitch applies on. */
  supersample: number;
  onChange: (id: string, patch: Partial<HatchLayer>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
}

/** umbreon's minimum lattice pitch on the ink grid (hatch_ink.hpp). */
const MIN_PITCH_PX = 2;

const KIND_LABEL: Record<HatchLayerKind, string> = {
  line: "Line",
  dot: "Dot screen",
  stipple: "Stipple",
};

/** Fields the editor may show for a layer: those of its kind, by place. */
const fieldsFor = (kind: HatchLayerKind, place: HatchFieldDef["place"]): HatchFieldDef[] =>
  LAYER_FIELDS.filter((f) => f.place === place && fieldAppliesTo(f, kind));

/** Effective-value text without float noise. */
const fmtEff = (v: number): string => String(Number(v.toFixed(3)));

const HatchLayerRowImpl: React.FC<HatchLayerRowProps> = ({
  index,
  layer,
  density,
  widthScale,
  supersample,
  onChange,
  onRemove,
  onDuplicate,
}) => {
  const patch = useCallback(
    (p: Partial<HatchLayer>) => onChange(layer.id, p),
    [onChange, layer.id],
  );

  /** The Render tab multiplier hint for a size field, or null. */
  const effectiveHint = (f: HatchFieldDef, value: number): React.ReactNode => {
    let text: string | null = null;
    if (f.key === "spacing") {
      const eff = value / density;
      const parts: string[] = [];
      if (density !== 1) parts.push(`effective ${fmtEff(eff)} px at Mark density x${fmtEff(density)}`);
      // The ink is laid on the supersampled grid, where the pitch cannot go
      // below 2 px: a finer pitch (or a higher density) changes nothing.
      if (eff * Math.max(1, supersample) < MIN_PITCH_PX) {
        parts.push(
          `below the ${MIN_PITCH_PX} px minimum pitch on the supersample grid: clamped (raise Supersampling)`,
        );
      }
      text = parts.length ? parts.join("; ") : null;
    } else if ((f.key === "width" || f.key === "dotscale") && widthScale !== 1) {
      const unit = f.key === "width" ? " px" : "";
      text = `effective ${fmtEff(value * widthScale)}${unit} at Mark width x${fmtEff(widthScale)}`;
    }
    return text ? (
      <span key={`${f.key}-eff`} className="type-caption hatch-effective">
        {text}
      </span>
    ) : null;
  };

  const renderField = (f: HatchFieldDef) => {
    const value = (layer as unknown as Record<string, unknown>)[f.key];
    const enabled = layerFieldEnabled(f.key, layer);
    if (f.type === "bool") {
      return (
        <Field key={f.key} label={f.label} inline>
          <SwitchField
            checked={Boolean(value)}
            disabled={!enabled}
            onChange={(v) => patch({ [f.key]: v })}
          />
        </Field>
      );
    }
    return (
      <React.Fragment key={f.key}>
        <SliderField
          label={f.label}
          value={Number(value)}
          min={f.min ?? 0}
          max={f.max ?? 1}
          step={f.step}
          unit={f.unit}
          slider={f.type !== "int"}
          disabled={!enabled}
          onCommit={(v) => patch({ [f.key]: v })}
        />
        {effectiveHint(f, Number(value))}
      </React.Fragment>
    );
  };

  return (
    <div className="hatch-layer">
      <div className="h3-list-row hatch-layer-head">
        <span className="type-row">
          Layer {index + 1} -- {KIND_LABEL[layer.kind]}
        </span>
        <FormButton
          minimal
          icon={<AppIcon name="ui.duplicate" aria-hidden />}
          aria-label="Duplicate layer"
          title="Duplicate layer"
          onClick={() => onDuplicate(layer.id)}
        />
        <FormButton
          minimal
          icon={<AppIcon name="ui.trash" aria-hidden />}
          aria-label="Remove layer"
          title="Remove layer"
          onClick={() => onRemove(layer.id)}
        />
      </div>
      <Field label="Kind" inline>
        <SelectField
          value={layer.kind}
          onChange={(v) => patch({ kind: v as HatchLayerKind })}
          aria-label="Layer kind"
        >
          <option value="line">Line</option>
          <option value="dot">Dot screen</option>
          <option value="stipple">Stipple</option>
        </SelectField>
      </Field>
      {fieldsFor(layer.kind, "primary").map(renderField)}
      <AccordionSection title="Randomness / Advanced">
        {fieldsFor(layer.kind, "advanced").map(renderField)}
      </AccordionSection>
    </div>
  );
};

export const HatchLayerRow = React.memo(HatchLayerRowImpl);
