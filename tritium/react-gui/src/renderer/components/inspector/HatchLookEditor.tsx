/**
 * @file components/inspector/HatchLookEditor.tsx
 * @description The NPR hatch layer editor: the Rendering window's "Hatching"
 * settings tab. The style picked in the Render tab is a TEMPLATE: its layers
 * and shading are loaded from the C++ side and edited here; an edited look is
 * sent with the render as spec text, and "Reset to style" reloads the
 * template. Template loading itself lives in hooks/useHatchTemplate.ts.
 */

import React from "react";

import { HatchLayersSection } from "./HatchLayersSection";
import { HatchShadingSection } from "./HatchShadingSection";
import { AppIcon } from "@renderer/h3-kit/primitives";
import { ButtonRow, FormButton } from "../../h3-kit/form";
import type {
  HatchFieldEnv,
  HatchInk,
  HatchLayer,
  HatchLayerKind,
  HatchSpec,
  HatchTone,
} from "../../data/hatchSpec";
import type { HatchTemplateStatus } from "../../hooks/useHatchTemplate";

/** Multiplier text without float noise. */
const fmtMul = (v: number): string => String(Number(v.toFixed(3)));

export interface HatchLookEditorProps {
  /** The style whose template is being edited (the Render tab's pick). */
  styleName: string;
  /**
   * The Render tab's Mark density / Mark width. They multiply every layer at
   * render time (pitch / density, width or dot scale * widthScale) and are
   * shown here as the effective values, never folded into the layer values.
   */
  density: number;
  widthScale: number;
  /** Render supersampling (the ink grid's minimum-pitch hint). */
  supersample: number;
  /** Other render settings that switch tone / ink fields off. */
  env: HatchFieldEnv;
  /** The editable look; null until the style's template arrives. */
  spec: HatchSpec | null;
  /** True once the look differs from the style's template. */
  dirty: boolean;
  status: HatchTemplateStatus;
  error: string | null;
  onLayerChange: (id: string, patch: Partial<HatchLayer>) => void;
  onLayerAdd: (kind: HatchLayerKind) => void;
  onLayerRemove: (id: string) => void;
  onLayerDuplicate: (id: string) => void;
  onToneChange: (patch: Partial<HatchTone>) => void;
  onInkChange: (patch: Partial<HatchInk>) => void;
  onReset: () => void;
}

export const HatchLookEditor: React.FC<HatchLookEditorProps> = ({
  styleName,
  density,
  widthScale,
  supersample,
  env,
  spec,
  dirty,
  status,
  error,
  onLayerChange,
  onLayerAdd,
  onLayerRemove,
  onLayerDuplicate,
  onToneChange,
  onInkChange,
  onReset,
}) => (
  <div className="hatch-look">
    <span className="type-caption hatch-look-status">
      Style template: {styleName || "(none)"}
    </span>
    {(density !== 1 || widthScale !== 1) && (
      <span className="type-caption hatch-look-status">
        Render tab multipliers: Mark density x{fmtMul(density)}, Mark width x{fmtMul(widthScale)}
        {" "}(applied on top of the values below)
      </span>
    )}
    {status === "loading" && (
      <span className="type-caption hatch-look-status">Loading the style template...</span>
    )}
    {status === "error" && (
      <span className="type-caption hatch-look-status is-error">
        {error ?? "The style template could not be loaded."}
      </span>
    )}
    {spec && (
      <>
        <ButtonRow className="hatch-look-actions">
          <FormButton
            icon={<AppIcon name="ui.resetDefaults" aria-hidden />}
            text="Reset to style"
            disabled={!dirty}
            onClick={onReset}
          />
          {dirty && <span className="type-caption hatch-look-edited">Edited</span>}
        </ButtonRow>
        <HatchLayersSection
          layers={spec.layers}
          density={density}
          widthScale={widthScale}
          supersample={supersample}
          onLayerChange={onLayerChange}
          onLayerAdd={onLayerAdd}
          onLayerRemove={onLayerRemove}
          onLayerDuplicate={onLayerDuplicate}
        />
        <HatchShadingSection
          tone={spec.tone}
          ink={spec.ink}
          env={env}
          onToneChange={onToneChange}
          onInkChange={onInkChange}
        />
      </>
    )}
  </div>
);
