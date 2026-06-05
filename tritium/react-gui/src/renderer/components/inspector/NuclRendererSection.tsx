/**
 * @file components/inspector/NuclRendererSection.tsx
 * @description Type-specific property sections for the nucleic-acid renderer
 * (C++ `molvis::NARenderer`, `type_name === "nucl"`). It draws a backbone tube
 * plus base sticks / cylinders along nucleic-acid chains.
 *
 * Migrated from the UXP `nucl-propdlg`, which stacks three tabs:
 *   - "Common"       -> the shared `RendererCommonSection`
 *   - "Nucleic acid" -> the nucl-specific controls (this file's `NuclBaseSection`)
 *   - "Tube"         -> the shared `tube-page` overlay, identical to the tube
 *     renderer's Tube / Section / Putty pages
 *
 * NARenderer extends TubeRenderer, so the backbone / cross-section / putty
 * properties are inherited unchanged; the tube renderer's already-migrated
 * sections are reused verbatim, wrapped here only to honour the UXP "Show tube"
 * gate (`nucl-propdlg.js` `updateEnabledState` -> `gTube.disableAll`): when
 * `show_tube` is off, the whole Tube tab is disabled.
 *
 * Parity notes:
 *   - `base_thick` is stored as an absolute real but the UXP slider shows it as
 *     a percentage of `base_size` (`thick * 100 / base_size`) and writes back
 *     `pct * base_size / 100` (`nucl-propdlg.js` L78 / L121-125). `BaseThickRow`
 *     reproduces this derived display, mirroring the tube `Width2Row` pattern.
 *   - `base_detail` uses a plain stepper (`NumInputRow`) like the adjacent
 *     `axialdetail` / `section.detail`; the real-valued sliders (`base_size`,
 *     `base_thick`) use the drag-numeric field.
 */

import React from "react";
import {
  NumRow,
  NumInputRow,
  BoolRow,
  EnumRow,
  resetProps,
} from "./RendererCommonSection";
import {
  TubeMainSection,
  TubeSectionSection,
  TubePuttySection,
} from "./TubeRendererSection";
import { PropertyField, DragNumericField } from "../../h3-kit/form";
import { useRealtimeDragProp } from "../../hooks/useRealtimeDragProp";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

// --- Local rows ---------------------------------------------------------------

interface BaseThickRowProps {
  /** `base_thick` entry (absolute thickness; the value actually written). */
  thickEntry: GenericPropEntry;
  /** `base_size` entry (the divisor for the percentage display). */
  sizeEntry: GenericPropEntry;
  onSet: RendererPropSectionProps["onSet"];
  onReset: RendererPropSectionProps["onReset"];
}

/**
 * "Base thick" row. `base_thick` is an absolute size in C++, but the UXP dialog
 * presents it as a percentage of `base_size` (`thick * 100 / size`); committing
 * writes `base_thick = pct * size / 100`. The modified bar / reset map to
 * `base_thick`.
 */
const BaseThickRow: React.FC<BaseThickRowProps> = ({
  thickEntry,
  sizeEntry,
  onSet,
  onReset,
}) => {
  const thick = Number(thickEntry.value);
  const size = Number(sizeEntry.value);
  const pct = size > 0 ? (thick * 100) / size : 0;
  const dragProps = useRealtimeDragProp({
    committed: pct,
    committedIsDefault: thickEntry.isdefault,
    realtime: false,
    onPreview: () => {},
    onCommit: (original, v) => {
      if (v === original || !(size > 0)) return;
      onSet(thickEntry.key, thickEntry.type, (v * size) / 100);
    },
  });
  return (
    <PropertyField label="Base thick" {...resetProps(thickEntry, onReset)}>
      <DragNumericField
        {...dragProps}
        min={0}
        max={100}
        step={10}
        decimals={1}
        unit="%"
        disabled={thickEntry.readonly}
      />
    </PropertyField>
  );
};

// --- Sections -----------------------------------------------------------------

/**
 * "Nucleic acid" section: the nucl-specific base-rendering controls. These are
 * never gated by "Show tube" (only the inherited Tube tab is).
 */
export const NuclBaseSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const showTube = get("show_tube");
  const showBp = get("show_basepair");
  const baseType = get("base_type");
  const baseDetail = get("base_detail");
  const baseSize = get("base_size");
  const baseThick = get("base_thick");

  return (
    <>
      {showTube && (
        <BoolRow entry={showTube} label="Show tube" onSet={onSet} onReset={onReset} />
      )}
      {showBp && (
        <BoolRow
          entry={showBp}
          label="Connect base pair"
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {baseType && (
        <EnumRow entry={baseType} label="Base type" onSet={onSet} onReset={onReset} />
      )}
      {baseDetail && (
        <NumInputRow
          key={`base_detail:${baseDetail.value}`}
          entry={baseDetail}
          label="Detail"
          onSet={onSet}
          onReset={onReset}
          min={2}
          max={20}
          step={1}
        />
      )}
      {baseSize && (
        <NumRow
          entry={baseSize}
          label="Base size"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={3}
          step={0.1}
          decimals={1}
          unit="Å"
        />
      )}
      {baseThick && baseSize && (
        <BaseThickRow
          thickEntry={baseThick}
          sizeEntry={baseSize}
          onSet={onSet}
          onReset={onReset}
        />
      )}
    </>
  );
};

/**
 * Compute the "Show tube" gate: true (disabled) when `show_tube` is present and
 * off. Absent (e.g. non-nucl host) leaves the section enabled.
 */
function tubeDisabled(entries: GenericPropEntry[]): boolean {
  const showTube = entries.find((e) => e.key === "show_tube");
  return showTube ? !showTube.value : false;
}

/** Backbone "Tube" section, disabled when "Show tube" is off. */
export const NuclTubeMainSection: React.FC<RendererPropSectionProps> = (props) => (
  <TubeMainSection {...props} disabled={tubeDisabled(props.entries)} />
);

/** Cross-section "Section" section, disabled when "Show tube" is off. */
export const NuclSectionSection: React.FC<RendererPropSectionProps> = (props) => (
  <TubeSectionSection {...props} disabled={tubeDisabled(props.entries)} />
);

/** "Putty" section, disabled when "Show tube" is off. */
export const NuclPuttySection: React.FC<RendererPropSectionProps> = (props) => (
  <TubePuttySection {...props} disabled={tubeDisabled(props.entries)} />
);
