/**
 * @file components/panels/ImageSettingsPanel.tsx
 * @description Image-size settings, shown in the Rendering window's bottom
 * pane for both still and movie renders.
 *
 * These are the most frequently touched settings (preset, width / height,
 * resolution, output options), so they live in the bottom pane next to Start
 * rather than in the Render Settings pane. The remaining, less-touched groups
 * (Camera / Quality / Edges / backend) stay in that pane.
 *
 * Movie output is pixel-based, so its variant hides the DPI and the non-px
 * unit selector.
 */

import React from "react";

import { Field, SelectField } from "../../h3-kit/form";
import { renderPropEditor } from "../inspector/PropGroupedEditor";
import type { PropDef } from "../../data/rendererProperties";
import type { RenderSizePreset } from "../../data/renderSettings";

/** Group key of the image settings within the common props. */
const IMAGE_GROUP = "Image";

/** Keys hidden in movie mode (pixel-based output needs no DPI / unit). */
const MOVIE_HIDDEN_KEYS = new Set(["unit", "dpi"]);

interface ImageSettingsPanelProps {
  /** Backend-independent props; the Image group is picked out of these. */
  commonProps: PropDef[];
  /** Apply a single setting change. */
  onChange: (key: string, value: string | number | boolean) => void;
  /** Selected size-preset label. */
  preset: string;
  /** Apply a size preset. */
  onApplyPreset: (label: string) => void;
  /** Size presets to offer (video resolutions in movie mode). */
  sizePresets: RenderSizePreset[];
  /** Movie mode: hide DPI and the non-px unit selector. */
  movie?: boolean;
}

export const ImageSettingsPanel: React.FC<ImageSettingsPanelProps> = ({
  commonProps,
  onChange,
  preset,
  onApplyPreset,
  sizePresets,
  movie = false,
}) => {
  const imageProps = commonProps.filter(
    (p) =>
      p.group === IMAGE_GROUP && !(movie && MOVIE_HIDDEN_KEYS.has(p.key)),
  );

  return (
    <div className="image-settings-panel">
      <Field label="Preset">
        <SelectField value={preset} onChange={onApplyPreset}>
          {sizePresets.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </SelectField>
      </Field>
      {imageProps.map((p) => renderPropEditor(p, onChange))}
    </div>
  );
};
