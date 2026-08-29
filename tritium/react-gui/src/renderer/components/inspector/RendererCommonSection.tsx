/**
 * @file components/inspector/RendererCommonSection.tsx
 * @description Renderer-common property page for the inspector Properties tab.
 *
 * Migrated from the UXP `renderer-common-page.xul` overlay shared by every
 * `dialog.property.*` renderer dialog. Renders two accordion groups:
 *   - "Basic settings": Name, Selection, Visible, Locked, Material, Opacity
 *   - "Edge lines": Edge type, Width, Color (Width/Color disabled when the
 *     edge type is "none", matching UXP `updateEnabledState`). Suppressed
 *     entirely for the line-only renderer types (see `NO_EDGE_LINE_TYPES`).
 *
 * It is backed by the same live `getGenericProps` / `setGenericProp` bridge as
 * the Generic tab: each field is looked up by property key in the live entry
 * list and only rendered when that property exists on the inspected renderer
 * (mirroring the UXP `findPropData` null checks). Edits commit through `onSet`;
 * text / numeric fields commit on blur / Enter / slider release to avoid one
 * undo step per keystroke or drag frame.
 */

import React, { useEffect, useState } from "react";
import { AccordionSection } from "./AccordionSection";
import {
  PropertyField,
  TextField,
  SelectField,
  DragNumericField,
  NumericField,
  SliderField,
  SwitchField,
  ColorField,
} from "../../h3-kit/form";
import { MolSelList } from "../../h3-kit/MolSelList/MolSelList";
import { useCueMol } from "@renderer/hooks/cuemol/useCueMol";
import { useRealtimeDragProp } from "@renderer/hooks/react/useRealtimeDragProp";
import { isModified, isResettable, formatDefaultLabel } from "./propModel";
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps';
import type { RendererPropSectionProps } from "./rendererPropSections";

type SetFn = RendererPropSectionProps["onSet"];
type ResetFn = RendererPropSectionProps["onReset"];

// ------------------------------------------------------------
// Field rows -- one per editable property type
// ------------------------------------------------------------

export interface RowProps {
  entry: GenericPropEntry;
  label: string;
  onSet: SetFn;
  onReset: ResetFn;
}

/**
 * Shared PropertyField decorations for a property entry: the modified bar
 * (flag-based, from the C++ default state), the per-property reset, and the
 * hover default-value annotation. Never-reset keys (name / sel) get no bar and
 * no reset, even when modified.
 */
export function resetProps(entry: GenericPropEntry, onReset: ResetFn) {
  const resettable = isResettable(entry);
  return {
    modified: resettable && isModified(entry),
    resettable,
    defaultValueLabel: resettable ? formatDefaultLabel(entry) : undefined,
    onReset: () => onReset(entry.key),
  };
}

interface TextRowProps extends RowProps {
  disabled?: boolean;
  /**
   * Placeholder shown when the field is empty. Use "(default)" for properties
   * whose empty value falls back to a per-polymer / per-type default resolved
   * by the C++ side (e.g. the pivot atom name).
   */
  placeholder?: string;
}

/**
 * Text input committed on blur / Enter (e.g. Name).
 *
 * Exported so renderer-type-specific sections (e.g. the atomintr label font
 * name) reuse the same text row contract instead of redefining it.
 */
export const TextRow: React.FC<TextRowProps> = ({
  entry,
  label,
  onSet,
  onReset,
  disabled,
  placeholder,
}) => {
  const [draft, setDraft] = useState(String(entry.value));
  const commit = () => {
    if (draft !== String(entry.value)) onSet(entry.key, entry.type, draft);
  };
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <TextField
        value={draft}
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        placeholder={placeholder}
        readOnly={entry.readonly}
        disabled={disabled}
      />
    </PropertyField>
  );
};

interface BoolRowProps extends RowProps {
  disabled?: boolean;
}

/**
 * Boolean toggle committed immediately (e.g. Visible / Locked).
 *
 * Exported so renderer-type-specific sections (e.g. `BallStickRendererSection`)
 * reuse the same toggle row contract instead of redefining it.
 */
export const BoolRow: React.FC<BoolRowProps> = ({
  entry,
  label,
  onSet,
  onReset,
  disabled,
}) => (
  <PropertyField label={label} inline {...resetProps(entry, onReset)}>
    <SwitchField
      checked={Boolean(entry.value)}
      disabled={disabled || entry.readonly}
      onChange={(c) => onSet(entry.key, entry.type, c)}
    />
  </PropertyField>
);

interface NumRowProps extends RowProps {
  min: number;
  max: number;
  step: number;
  /** Fine drag snap (Shift). Defaults to `step / 10`; see DragNumericField. */
  fineSnap?: number;
  /** Coarse drag snap (Ctrl / Cmd). Defaults to `step * 10`. */
  coarseSnap?: number;
  unit?: string;
  /**
   * Decimals to display. Omit to derive from the fine snap (`step / 10`); set
   * explicitly (e.g. `0`) for integer-valued properties so they do not show a
   * spurious fractional digit.
   */
  decimals?: number;
  disabled?: boolean;
  /** Live-apply the value to the renderer during the drag (one undo step). */
  realtime?: boolean;
}

/**
 * Drag-to-snap numeric field committed on drag end / Enter (e.g. Opacity,
 * Width). With `realtime`, the renderer updates live during the drag (the
 * worker previews without undo and commits a single step on release).
 *
 * Exported so renderer-type-specific sections (e.g. `SimpleRendererSection`)
 * reuse the same drag-numeric row contract instead of redefining it.
 */
export const NumRow: React.FC<NumRowProps> = ({
  entry,
  label,
  onSet,
  onReset,
  min,
  max,
  step,
  fineSnap,
  coarseSnap,
  unit,
  decimals,
  disabled,
  realtime,
}) => {
  const committed = Number(entry.value);
  const dragProps = useRealtimeDragProp({
    committed,
    committedIsDefault: entry.isdefault,
    realtime,
    onPreview: (v) => onSet(entry.key, entry.type, v, { mode: "preview" }),
    onCommit: (original, v, wasDefault) => {
      if (v === original) return;
      // Realtime: the renderer was previewed, so restore `original` (and its
      // default flag) before the single undo step. Non-realtime: plain commit
      // (current behavior).
      if (realtime)
        onSet(entry.key, entry.type, v, {
          mode: "commit",
          originalValue: original,
          originalWasDefault: wasDefault,
        });
      else onSet(entry.key, entry.type, v);
    },
    onAbort: (original, wasDefault) =>
      onSet(entry.key, entry.type, original, {
        mode: "abort",
        originalWasDefault: wasDefault,
      }),
  });
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <DragNumericField
        {...dragProps}
        min={min}
        max={max}
        step={step}
        fineSnap={fineSnap}
        coarseSnap={coarseSnap}
        unit={unit}
        decimals={decimals}
        disabled={disabled || entry.readonly}
      />
    </PropertyField>
  );
};

interface NumInputRowProps extends RowProps {
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
}

/**
 * Numeric row backed by the plain `NumericField` with the slider hidden
 * (`slider={false}`), i.e. a stepper input only. Used for discrete count-like
 * "detail" properties where a slider is unwanted. The stepper does not stretch
 * horizontally, so the row is laid out inline (label beside the control), like
 * the switch rows. Commits a single undo step on blur / Enter; the local draft
 * tracks the value live and resyncs when the committed value changes (caller
 * passes a value-keyed `key` to remount).
 *
 * Exported so renderer-type-specific sections (cartoon `axialdetail`, disorder
 * `detail`) reuse the same stepper-row contract instead of redefining it.
 */
export const NumInputRow: React.FC<NumInputRowProps> = ({
  entry,
  label,
  onSet,
  onReset,
  min,
  max,
  step,
  unit,
  disabled,
}) => {
  const [draft, setDraft] = useState(Number(entry.value));
  const commit = (v: number) => {
    if (v !== Number(entry.value)) onSet(entry.key, entry.type, v);
  };
  return (
    <PropertyField label={label} inline {...resetProps(entry, onReset)}>
      <NumericField
        value={draft}
        onChange={setDraft}
        onRelease={commit}
        slider={false}
        min={min}
        max={max}
        step={step}
        unit={unit}
        disabled={disabled || entry.readonly}
      />
    </PropertyField>
  );
};

interface SliderRowProps extends RowProps {
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}

/**
 * Numeric row backed by `SliderField`: label + slider + number box + stepper.
 * Use it for a bounded property whose whole range is meaningful to sweep (a
 * tessellation density, an intensity), where dragging the track is the fastest
 * way to find a value; use `NumInputRow` when only the stepper makes sense.
 *
 * `SliderField` owns the commit timing (slider release / blur / Enter /
 * stepper click) and resyncs its draft from `value`, so no value-keyed remount
 * is needed here. The visible label and the reset affordance come from
 * `PropertyField`, so the field's own label is hidden and serves only as the
 * accessible name.
 */
export const SliderRow: React.FC<SliderRowProps> = ({
  entry,
  label,
  onSet,
  onReset,
  min,
  max,
  step,
  unit,
  disabled,
}) => {
  const committed = Number(entry.value);
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SliderField
        label={label}
        hideLabel
        value={committed}
        min={min}
        max={max}
        step={step}
        unit={unit}
        disabled={disabled || entry.readonly}
        onCommit={(v) => {
          if (v !== committed) onSet(entry.key, entry.type, v);
        }}
      />
    </PropertyField>
  );
};

export interface EnumRowProps extends RowProps {
  /**
   * Offer these options, in this order. Entries not present in the property's
   * `enumdef` are dropped. Use it to fix the display order -- the `enumdef`
   * from C++ getPropsJSON is alphabetical, which is rarely the natural order
   * (e.g. the edge type reads none -> edges -> silhouette, not the alphabetical
   * edges -> none -> silhouette). Defaults to the full `enumdef`.
   */
  options?: string[];
  disabled?: boolean;
}

/**
 * Dropdown committed immediately (e.g. Edge type). Options come from the
 * property's `enumdef` (raw C++ string IDs), optionally restricted / reordered
 * by `options`.
 *
 * Exported so renderer-type-specific sections reuse the same enum row contract.
 */
export const EnumRow: React.FC<EnumRowProps> = ({
  entry,
  label,
  options,
  onSet,
  onReset,
  disabled,
}) => {
  const allOptions = entry.enumdef ?? [String(entry.value)];
  const shownOptions = options
    ? options.filter((o) => allOptions.includes(o))
    : allOptions;
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SelectField
        value={String(entry.value)}
        disabled={disabled || entry.readonly}
        onChange={(v) => onSet(entry.key, entry.type, v)}
      >
        {shownOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  );
};

export interface MappedEnumRowProps extends RowProps {
  /** Display text per raw enum ID (value stays the raw C++ string ID). */
  labels: Record<string, string>;
  /**
   * Offer these options, in this order. Entries not present in the property's
   * `enumdef` are dropped, so this both restricts the choices (e.g. the
   * cartoon cylinder-helix / sheet / coil section type omits "fancy1") and
   * fixes the display order (the `enumdef` from C++ getPropsJSON is
   * alphabetical, which is rarely the natural order). Defaults to the full
   * `enumdef`.
   */
  options?: string[];
  disabled?: boolean;
}

/**
 * Enum dropdown that shows a friendly label per option while committing the raw
 * C++ enum string ID. Falls back to the raw ID for any option missing from
 * `labels`. Unlike `EnumRow`, the visible option text is decoupled from the
 * committed value.
 *
 * Exported so renderer-type-specific sections (cartoon / tube cap-type, section
 * type, putty mode) reuse the same mapped-enum row contract.
 */
export const MappedEnumRow: React.FC<MappedEnumRowProps> = ({
  entry,
  label,
  labels,
  options,
  onSet,
  onReset,
  disabled,
}) => {
  const allOptions = entry.enumdef ?? [String(entry.value)];
  // options controls the display order (enumdef is alphabetical); keep only
  // the entries the live enumdef actually offers.
  const shownOptions = options
    ? options.filter((o) => allOptions.includes(o))
    : allOptions;
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SelectField
        value={String(entry.value)}
        disabled={disabled || entry.readonly}
        onChange={(v) => onSet(entry.key, entry.type, v)}
      >
        {shownOptions.map((opt) => (
          <option key={opt} value={opt}>
            {labels[opt] ?? opt}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  );
};

export interface NumEnumRowProps extends RowProps {
  /** Allowed integer values, in display order. */
  options: number[];
  /** Optional friendly label per value (e.g. 0 -> "Off"); falls back to the number itself. */
  labels?: Record<number, string>;
  disabled?: boolean;
}

/**
 * Dropdown for an integer property restricted to a small fixed set of values
 * (e.g. Scene antialiasing Jitter SS, 0-5) -- a `SelectField` is a clearer
 * affordance than a numeric stepper when the domain is this small, and it
 * makes an out-of-range value unreachable through the UI instead of merely
 * clamped. Commits the parsed number immediately, like `EnumRow` /
 * `MappedEnumRow`.
 *
 * Exported so other small-integer-domain properties reuse the same contract.
 */
export const NumEnumRow: React.FC<NumEnumRowProps> = ({
  entry,
  label,
  options,
  labels,
  onSet,
  onReset,
  disabled,
}) => (
  <PropertyField label={label} {...resetProps(entry, onReset)}>
    <SelectField
      value={String(entry.value)}
      disabled={disabled || entry.readonly}
      onChange={(v) => onSet(entry.key, entry.type, Number(v))}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {labels?.[opt] ?? String(opt)}
        </option>
      ))}
    </SelectField>
  </PropertyField>
);

/** Cap-type enum labels shared by the spline-family renderers (cartoon / tube). */
export const CAP_LABELS: Record<string, string> = {
  sphere: "Round",
  flat: "Flat",
  none: "None",
};

export interface ColorRowProps extends RowProps {
  disabled?: boolean;
}

/**
 * Colour editor committed on a completed change (e.g. Edge color).
 *
 * Exported so renderer-type-specific sections (e.g. `BallStickRendererSection`)
 * reuse the same colour row contract instead of redefining it.
 */
export const ColorRow: React.FC<ColorRowProps> = ({ entry, label, onSet, onReset, disabled }) => (
  <PropertyField label={label} {...resetProps(entry, onReset)}>
    <ColorField
      value={String(entry.value)}
      onCommit={(v) => onSet(entry.key, entry.type, v)}
      disabled={disabled || entry.readonly}
    />
  </PropertyField>
);

export interface SelRowProps extends RowProps {
  sceneId: number | undefined;
  disabled?: boolean;
}

/**
 * Selection picker committed on pick / blur (compiled to a SelCommand).
 *
 * Exported so renderer-type-specific sections (e.g. the cartoon spline anchor
 * `anchor_sel`) reuse the same selection-row contract; the worker compiles any
 * `object<MolSelection>` property via `makeSel`, not just the common `sel`.
 */
export const SelRow: React.FC<SelRowProps> = ({
  entry,
  label,
  onSet,
  onReset,
  sceneId,
  disabled,
}) => {
  const [draft, setDraft] = useState(String(entry.value));
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <MolSelList
        sceneID={sceneId ?? 0}
        selectedSel={draft}
        onSelectedSelChange={setDraft}
        onCommit={(v) => {
          if (v !== String(entry.value)) onSet(entry.key, entry.type, v);
        }}
        disabled={disabled || entry.readonly}
      />
    </PropertyField>
  );
};

/** Material selector; options fetched from the StyleManager via the worker. */
const MaterialRow: React.FC<SelRowProps> = ({ entry, label, onSet, onReset, sceneId }) => {
  const { cm } = useCueMol();
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!cm || sceneId === undefined) {
      setNames([]);
      return;
    }
    let cancelled = false;
    cm.invokeService("getMaterialNames", { sceneId })
      .then((r) => {
        if (!cancelled) setNames(r.names);
      })
      .catch(() => {
        if (!cancelled) setNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cm, sceneId]);

  const current = String(entry.value ?? "");
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SelectField
        value={current}
        disabled={entry.readonly}
        onChange={(v) => onSet(entry.key, entry.type, v)}
      >
        <option value="">(none)</option>
        {/* Keep the current value selectable even if it is not in the list. */}
        {current !== "" && !names.includes(current) && (
          <option value={current}>{current}</option>
        )}
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  );
};

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

/** Edge-type options in reading order (the C++ enumdef is alphabetical). */
const EGTYPE_OPTIONS = ["none", "edges", "silhouette"];

/**
 * Renderer types whose "Edge lines" block is suppressed. Edge / silhouette
 * lines are derived from surface geometry (see the C++ `getEdgeLineType()`
 * checks in MapSurfRenderer / MolSurfRenderer / DirectSurfRenderer), so a
 * renderer that draws only lines -- `simple` / `trace` (bond lines) and
 * `contour` (a wireframe map mesh) -- has no faces to outline and the three
 * properties are dead knobs there. They inherit `egtype` / `eglinew` /
 * `egcolor` from the C++ `Renderer` base regardless, so the gate has to be
 * by type rather than by property presence.
 */
const NO_EDGE_LINE_TYPES = new Set(["simple", "trace", "contour"]);

interface RendererCommonSectionProps extends RendererPropSectionProps {
  /** Renderer `type_name`; gates blocks that do not apply to the type. */
  rendererType?: string;
}

export const RendererCommonSection: React.FC<RendererCommonSectionProps> = ({
  entries,
  onSet,
  onReset,
  sceneId,
  rendererType,
}) => {
  const byKey = new Map<string, GenericPropEntry>();
  for (const e of entries) byKey.set(e.key, e);
  const get = (k: string) => byKey.get(k);

  const name = get("name");
  const sel = get("sel");
  const visible = get("visible");
  const locked = get("locked");
  const material = get("material");
  const alpha = get("alpha");
  const egtype = get("egtype");
  const eglinew = get("eglinew");
  const egcolor = get("egcolor");

  // Edge width / color are disabled while the edge type is "none".
  const edgeOff = egtype ? String(egtype.value) === "none" : false;

  const hasBasic = name || sel || visible || locked || material || alpha;
  const hasEdge =
    (egtype || eglinew || egcolor) &&
    !NO_EDGE_LINE_TYPES.has(rendererType ?? "");

  return (
    <>
      {hasBasic && (
        <AccordionSection title="Basic settings" defaultExpanded>
          {name && (
            <TextRow
              key={`name:${name.value}`}
              entry={name}
              label="Name"
              onSet={onSet}
              onReset={onReset}
            />
          )}
          {sel && (
            <SelRow
              key={`sel:${sel.value}`}
              entry={sel}
              label="Selection"
              onSet={onSet}
              onReset={onReset}
              sceneId={sceneId}
            />
          )}
          {visible && (
            <BoolRow entry={visible} label="Visible" onSet={onSet} onReset={onReset} />
          )}
          {locked && (
            <BoolRow entry={locked} label="Locked" onSet={onSet} onReset={onReset} />
          )}
          {material && (
            <MaterialRow
              key={`material:${material.value}`}
              entry={material}
              label="Material"
              onSet={onSet}
              onReset={onReset}
              sceneId={sceneId}
            />
          )}
          {alpha && (
            <NumRow
              key="alpha"
              entry={alpha}
              label="Opacity"
              onSet={onSet}
              onReset={onReset}
              min={0}
              max={1}
              step={0.1}
              realtime
            />
          )}
        </AccordionSection>
      )}

      {hasEdge && (
        <AccordionSection title="Edge lines" defaultExpanded>
          {egtype && (
            <EnumRow
              entry={egtype}
              label="Edge type"
              options={EGTYPE_OPTIONS}
              onSet={onSet}
              onReset={onReset}
            />
          )}
          {eglinew && (
            <NumRow
              key="eglinew"
              entry={eglinew}
              label="Width"
              onSet={onSet}
              onReset={onReset}
              min={0}
              max={0.5}
              step={0.01}
              unit="Å"
              disabled={edgeOff}
            />
          )}
          {egcolor && (
            <ColorRow
              entry={egcolor}
              label="Color"
              onSet={onSet}
              onReset={onReset}
              disabled={edgeOff}
            />
          )}
        </AccordionSection>
      )}
    </>
  );
};
