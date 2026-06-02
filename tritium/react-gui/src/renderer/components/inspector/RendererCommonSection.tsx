/**
 * @file components/inspector/RendererCommonSection.tsx
 * @description Renderer-common property page for the inspector Properties tab.
 *
 * Migrated from the UXP `renderer-common-page.xul` overlay shared by every
 * `dialog.property.*` renderer dialog. Renders two accordion groups:
 *   - "Basic settings": Name, Selection, Visible, Locked, Material, Opacity
 *   - "Edge lines": Edge type, Width, Color (Width/Color disabled when the
 *     edge type is "none", matching UXP `updateEnabledState`)
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
  Field,
  TextField,
  SelectField,
  DragNumericField,
  SwitchField,
  ColorField,
} from "../../h3-kit/form";
import { MolSelList } from "../../h3-kit/MolSelList/MolSelList";
import { useCueMol } from "../../hooks/useCueMol";
import { useRealtimeDragProp } from "../../hooks/useRealtimeDragProp";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

type SetFn = RendererPropSectionProps["onSet"];

// ────────────────────────────────────────────────────────────
// Field rows -- one per editable property type
// ────────────────────────────────────────────────────────────

interface RowProps {
  entry: GenericPropEntry;
  label: string;
  onSet: SetFn;
}

/** Text input committed on blur / Enter (e.g. Name). */
const TextRow: React.FC<RowProps> = ({ entry, label, onSet }) => {
  const [draft, setDraft] = useState(String(entry.value));
  const commit = () => {
    if (draft !== String(entry.value)) onSet(entry.key, entry.type, draft);
  };
  return (
    <Field label={label}>
      <TextField
        value={draft}
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        readOnly={entry.readonly}
      />
    </Field>
  );
};

/** Boolean toggle committed immediately (e.g. Visible / Locked). */
const BoolRow: React.FC<RowProps> = ({ entry, label, onSet }) => (
  <Field label={label} inline>
    <SwitchField
      checked={Boolean(entry.value)}
      disabled={entry.readonly}
      onChange={(c) => onSet(entry.key, entry.type, c)}
    />
  </Field>
);

interface NumRowProps extends RowProps {
  min: number;
  max: number;
  step: number;
  unit?: string;
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
  min,
  max,
  step,
  unit,
  disabled,
  realtime,
}) => {
  const committed = Number(entry.value);
  const dragProps = useRealtimeDragProp({
    committed,
    realtime,
    onPreview: (v) => onSet(entry.key, entry.type, v, { mode: "preview" }),
    onCommit: (original, v) => {
      if (v === original) return;
      // Realtime: the renderer was previewed, so restore `original` before the
      // single undo step. Non-realtime: plain commit (current behavior).
      if (realtime)
        onSet(entry.key, entry.type, v, { mode: "commit", originalValue: original });
      else onSet(entry.key, entry.type, v);
    },
    onAbort: (original) => onSet(entry.key, entry.type, original, { mode: "preview" }),
  });
  return (
    <Field label={label}>
      <DragNumericField
        {...dragProps}
        min={min}
        max={max}
        step={step}
        unit={unit}
        disabled={disabled || entry.readonly}
      />
    </Field>
  );
};

interface EnumRowProps extends RowProps {
  disabled?: boolean;
}

/** Dropdown committed immediately (e.g. Edge type). */
const EnumRow: React.FC<EnumRowProps> = ({ entry, label, onSet, disabled }) => (
  <Field label={label}>
    <SelectField
      value={String(entry.value)}
      disabled={disabled || entry.readonly}
      onChange={(v) => onSet(entry.key, entry.type, v)}
    >
      {(entry.enumdef ?? [String(entry.value)]).map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </SelectField>
  </Field>
);

interface ColorRowProps extends RowProps {
  disabled?: boolean;
}

/** Colour editor committed on a completed change (e.g. Edge color). */
const ColorRow: React.FC<ColorRowProps> = ({ entry, label, onSet, disabled }) => (
  <Field label={label}>
    <ColorField
      value={String(entry.value)}
      onCommit={(v) => onSet(entry.key, entry.type, v)}
      disabled={disabled || entry.readonly}
    />
  </Field>
);

interface SelRowProps extends RowProps {
  sceneId: number | undefined;
}

/** Selection picker committed on pick / blur (compiled to a SelCommand). */
const SelRow: React.FC<SelRowProps> = ({ entry, label, onSet, sceneId }) => {
  const [draft, setDraft] = useState(String(entry.value));
  return (
    <Field label={label}>
      <MolSelList
        sceneID={sceneId ?? 0}
        selectedSel={draft}
        onSelectedSelChange={setDraft}
        onCommit={(v) => {
          if (v !== String(entry.value)) onSet(entry.key, entry.type, v);
        }}
        disabled={entry.readonly}
      />
    </Field>
  );
};

/** Material selector; options fetched from the StyleManager via the worker. */
const MaterialRow: React.FC<SelRowProps> = ({ entry, label, onSet, sceneId }) => {
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
    <Field label={label}>
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
    </Field>
  );
};

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export const RendererCommonSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  sceneId,
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
  const hasEdge = egtype || eglinew || egcolor;

  return (
    <>
      {hasBasic && (
        <AccordionSection title="Basic settings" defaultExpanded>
          {name && <TextRow key={`name:${name.value}`} entry={name} label="Name" onSet={onSet} />}
          {sel && (
            <SelRow
              key={`sel:${sel.value}`}
              entry={sel}
              label="Selection"
              onSet={onSet}
              sceneId={sceneId}
            />
          )}
          {visible && <BoolRow entry={visible} label="Visible" onSet={onSet} />}
          {locked && <BoolRow entry={locked} label="Locked" onSet={onSet} />}
          {material && (
            <MaterialRow
              key={`material:${material.value}`}
              entry={material}
              label="Material"
              onSet={onSet}
              sceneId={sceneId}
            />
          )}
          {alpha && (
            <NumRow
              key="alpha"
              entry={alpha}
              label="Opacity"
              onSet={onSet}
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
          {egtype && <EnumRow entry={egtype} label="Edge type" onSet={onSet} />}
          {eglinew && (
            <NumRow
              key="eglinew"
              entry={eglinew}
              label="Width"
              onSet={onSet}
              min={0}
              max={0.5}
              step={0.01}
              unit="Å"
              disabled={edgeOff}
            />
          )}
          {egcolor && (
            <ColorRow entry={egcolor} label="Color" onSet={onSet} disabled={edgeOff} />
          )}
        </AccordionSection>
      )}
    </>
  );
};
