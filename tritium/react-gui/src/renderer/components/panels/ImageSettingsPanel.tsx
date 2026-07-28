/**
 * @file components/panels/ImageSettingsPanel.tsx
 * @description One section of image settings in the Rendering window's
 * Render Settings pane (Image tab).
 *
 * Renders an ordered list of Image-group keys under a section heading, with
 * width and height collapsed onto a single "Size" row. The Image tab composes
 * the sections (RenderImageTab: Size, then Output).
 */

import React from "react";

import {
  Field,
  FieldSection,
  SelectField,
  NumericField,
} from "../../h3-kit/form";
import { renderPropEditor } from "../inspector/PropGroupedEditor";
import type { PropDef } from "../../data/rendererProperties";
import type { RenderSizePreset } from "../../data/renderSettings";

interface ImageSettingsPanelProps {
  /** Section heading for this column. */
  title: string;
  /** Backend-independent props; the requested keys are picked out of these. */
  commonProps: PropDef[];
  /** Apply a single setting change. */
  onChange: (key: string, value: string | number | boolean) => void;
  /** Ordered Image-group keys to render in this column. */
  fields: string[];
  /** Show the size-preset dropdown at the top of this column. */
  showPreset?: boolean;
  /** Selected size-preset label (required when showPreset). */
  preset?: string;
  /** Apply a size preset (required when showPreset). */
  onApplyPreset?: (label: string) => void;
  /** Size presets to offer (required when showPreset). */
  sizePresets?: RenderSizePreset[];
}

/** Width and height on one row: "Size  [w] x [h]". */
const SizeRow: React.FC<{
  width: PropDef;
  height: PropDef;
  onChange: (key: string, value: number) => void;
}> = ({ width, height, onChange }) => (
  <Field label="Size">
    <div className="image-size-row">
      <NumericField
        value={Number(width.value)}
        onChange={(v) => onChange("width", v)}
        min={width.min ?? 1}
        max={width.max ?? 10000}
        step={width.step ?? 1}
        slider={false}
        unit={width.unit}
      />
      <span className="image-size-x" aria-hidden>
        &times;
      </span>
      <NumericField
        value={Number(height.value)}
        onChange={(v) => onChange("height", v)}
        min={height.min ?? 1}
        max={height.max ?? 10000}
        step={height.step ?? 1}
        slider={false}
        unit={height.unit}
      />
    </div>
  </Field>
);

export const ImageSettingsPanel: React.FC<ImageSettingsPanelProps> = ({
  title,
  commonProps,
  onChange,
  fields,
  showPreset = false,
  preset,
  onApplyPreset,
  sizePresets,
}) => {
  const byKey = (key: string) => commonProps.find((p) => p.key === key);
  const width = byKey("width");
  const height = byKey("height");
  const showSizeRow = fields.includes("width") && fields.includes("height") && width && height;

  return (
    <div className="image-settings-panel">
      <FieldSection title={title}>
        {showPreset && preset !== undefined && sizePresets && onApplyPreset && (
          <Field label="Preset">
            <SelectField value={preset} onChange={onApplyPreset}>
              {sizePresets.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </SelectField>
          </Field>
        )}

        {showSizeRow && (
          <SizeRow width={width} height={height} onChange={onChange} />
        )}

        {fields
          .filter((k) => !(showSizeRow && (k === "width" || k === "height")))
          .map((k) => byKey(k))
          .filter((p): p is PropDef => p !== undefined)
          .map((p) => renderPropEditor(p, onChange))}
      </FieldSection>
    </div>
  );
};
