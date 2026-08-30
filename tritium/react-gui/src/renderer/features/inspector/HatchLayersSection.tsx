/**
 * @file components/inspector/HatchLayersSection.tsx
 * @description The "Layers" section of the NPR hatch layer editor: the mark
 * layers of the selected style, each editable, with add buttons in the
 * section title.
 */

import React from "react";

import { HatchLayerRow } from "./HatchLayerRow";
import { AppIcon } from "@renderer/h3-kit/primitives";
import { FieldSection, FormButton } from "@renderer/h3-kit/form";
import type { HatchLayer, HatchLayerKind } from "@renderer/data/hatchSpec";

export interface HatchLayersSectionProps {
  layers: HatchLayer[];
  /** Render tab multipliers, for the effective-value hints. */
  density: number;
  widthScale: number;
  supersample: number;
  onLayerChange: (id: string, patch: Partial<HatchLayer>) => void;
  onLayerAdd: (kind: HatchLayerKind) => void;
  onLayerRemove: (id: string) => void;
  onLayerDuplicate: (id: string) => void;
}

export const HatchLayersSection: React.FC<HatchLayersSectionProps> = ({
  layers,
  density,
  widthScale,
  supersample,
  onLayerChange,
  onLayerAdd,
  onLayerRemove,
  onLayerDuplicate,
}) => (
  <FieldSection
    title="Layers"
    titleActions={
      <>
        <FormButton
          minimal
          icon={<AppIcon name="ui.add" aria-hidden />}
          text="Line"
          title="Add a line layer"
          onClick={() => onLayerAdd("line")}
        />
        <FormButton
          minimal
          icon={<AppIcon name="ui.add" aria-hidden />}
          text="Dot"
          title="Add a dot layer"
          onClick={() => onLayerAdd("dot")}
        />
      </>
    }
  >
    {layers.map((layer, i) => (
      <HatchLayerRow
        key={layer.id}
        index={i}
        layer={layer}
        density={density}
        widthScale={widthScale}
        supersample={supersample}
        onChange={onLayerChange}
        onRemove={onLayerRemove}
        onDuplicate={onLayerDuplicate}
      />
    ))}
    {layers.length === 0 && (
      <span className="type-caption hatch-look-status">No layers: add one above.</span>
    )}
  </FieldSection>
);
