/**
 * @file features/inspector/GenericTab.tsx
 * @description Generic (power-user) tab that displays every property of the
 * inspected node in a flat key-value table with resizable columns.
 *
 * Migrated from the UXP `propeditor-generic-page` overlay. Each row shows the
 * property name, its C++ type tag and the current value. Selecting a row
 * populates the bottom detail area, whose editor widget is chosen from the
 * property type (string / integer / real / boolean / enum). Changes are
 * applied live - there is no OK/Cancel. The "default" checkbox restores the
 * C++ default for resettable properties.
 *
 * Every control comes from the form-kit catalog (`h3-kit/form`), so control
 * height and spacing have their single source in `_form-kit.css` and the
 * `--field-*` tokens. The detail editor deliberately uses the bare controls
 * rather than `PropertyField`: the selected property is already named by the
 * header above the editor, so a second label would repeat it, and the
 * reset affordance here is the "default" checkbox rather than the inspector
 * row's hover button.
 */

import React, { useEffect, useState } from "react";
import {
  CheckboxField,
  ColorField,
  Field,
  NumericField,
  SelectField,
  SwitchField,
  TextField,
  TimeField,
  VectorField,
} from "@renderer/h3-kit/form";
import { AppIcon } from "@renderer/h3-kit/primitives";
import type { GenericPropEntry, PropWriteOpts } from '@renderer/worker/shared/genericProps';
import { useRealtimeDragProp } from "@renderer/hooks/react/useRealtimeDragProp";
import { isResettable } from "./propModel";
import { useColumnResize } from "@renderer/hooks/useColumnResize";

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

/** Default column widths in px (Name & Type are resizable, Value fills remainder). */
const DEFAULT_WIDTHS = { name: 120, type: 80 };

/** localStorage key for the persisted Name / Type column widths. */
const GENERIC_COL_WIDTHS_KEY = "cuemol.inspector.genericTab.colWidths";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface GenericTabProps {
  entries: GenericPropEntry[];
  /** Write a property value (live-apply). */
  onSetValue: (
    key: string,
    valueType: string,
    value: string | number | boolean,
    opts?: PropWriteOpts,
  ) => void;
  /** Restore a property to its C++ default. */
  onResetValue: (key: string) => void;
  /** True while the property list is being (re)fetched. */
  loading?: boolean;
}

// ------------------------------------------------------------
// Display helpers
// ------------------------------------------------------------

/**
 * Convert the C++ `qlib::LScrTime` string form to milliseconds.
 *
 * The format is `[[H:]M:]S[.mmm]`, but the fractional part is NOT a decimal
 * fraction of a second: `LScrTime::toString` writes it with `fromInt` and
 * `setStrValue` reads it back with `toInt`, so `"1.50"` is 1 s + 50 ms, not
 * 1.5 s. The form-kit `parseTime` reads that same text as a decimal fraction
 * (correct for its own `formatMs` output, which zero-pads to 3 digits), so it
 * cannot be used here -- it would turn 1050 ms into 1500 ms.
 *
 * Returns null for anything malformed, so the caller can fall back to the raw
 * text editor instead of silently showing 0.
 */
export function cppTimeToMs(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const parts = trimmed.split(":");
  if (parts.length > 3) return null;

  const last = parts[parts.length - 1];
  const dot = last.indexOf(".");
  const secStr = dot >= 0 ? last.slice(0, dot) : last;
  const msStr = dot >= 0 ? last.slice(dot + 1) : "0";
  if (dot >= 0 && last.indexOf(".", dot + 1) >= 0) return null;

  const nums = [...parts.slice(0, -1), secStr === "" ? "0" : secStr, msStr];
  if (nums.some((n) => !/^\d+$/.test(n))) return null;

  const ms = Number(nums[nums.length - 1]);
  const sec = Number(nums[nums.length - 2]);
  const min = parts.length >= 2 ? Number(nums[nums.length - 3]) : 0;
  const hour = parts.length >= 3 ? Number(nums[0]) : 0;
  return ((hour * 60 + min) * 60 + sec) * 1000 + ms;
}

/** Inverse of `cppTimeToMs`, matching `LScrTime::toString` exactly. */
export function msToCppTime(msTotal: number): string {
  const v = Math.max(0, Math.round(msTotal || 0));
  const ms = v % 1000;
  const totalSec = Math.floor(v / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hour = Math.floor(totalMin / 60);
  const tail = ms !== 0 ? `${sec}.${ms}` : String(sec);
  if (hour !== 0) return `${hour}:${min}:${tail}`;
  if (min !== 0) return `${min}:${tail}`;
  return tail;
}

/** Render a value for the read-only table cell. */
function displayValue(entry: GenericPropEntry): string {
  if (entry.isContainer) return "<node>";
  if (typeof entry.value === "boolean") return entry.value ? "true" : "false";
  return String(entry.value);
}

// ------------------------------------------------------------
// Detail editor -- type-aware widget for the selected property
// ------------------------------------------------------------

interface DetailEditorProps {
  entry: GenericPropEntry;
  /** True while the property is sitting at its (not yet cleared) C++ default. */
  atDefault: boolean;
  onSetValue: (
    key: string,
    valueType: string,
    value: string | number | boolean,
    opts?: PropWriteOpts,
  ) => void;
}

/**
 * `object<TimeValue>` editor: a `TimeField` over the C++ timecode string,
 * realtime like `NumRow`: a gesture previews the property without undo, its
 * release commits one undo step from where the gesture began, and a cancel
 * restores that. The ms <-> string conversion happens at this boundary.
 */
const TimeValueEditor: React.FC<{
  ms: number;
  atDefault: boolean;
  disabled: boolean;
  onSet: (value: string, opts?: PropWriteOpts) => void;
}> = ({ ms, atDefault, disabled, onSet }) => {
  const dragProps = useRealtimeDragProp({
    committed: ms,
    committedIsDefault: atDefault,
    realtime: true,
    onPreview: (v) => onSet(msToCppTime(v), { mode: "preview" }),
    onCommit: (original, v, wasDefault) => {
      if (v === original) return;
      onSet(msToCppTime(v), {
        mode: "commit",
        originalValue: msToCppTime(original),
        originalWasDefault: wasDefault,
      });
    },
    onAbort: (original, wasDefault) =>
      onSet(msToCppTime(original), { mode: "abort", originalWasDefault: wasDefault }),
  });
  return <TimeField {...dragProps} disabled={disabled} />;
};

/**
 * Editor for one property. Remounted (via `DetailPanel`'s `key`) when the
 * selected row changes; a value change on the same row re-seeds the drafts in
 * place, so a live preview refetch cannot unmount a field mid-gesture.
 */
const DetailEditor: React.FC<DetailEditorProps> = ({ entry, atDefault, onSetValue }) => {
  // Value widgets are disabled for read-only props and while a resettable
  // property is sitting at its default. Clearing the "default" checkbox
  // re-enables the widget without changing the value (UXP: `defaultToggleCheck`).
  const disabled = entry.readonly || atDefault;

  // Local drafts committed on blur / Enter. Text keeps the raw string;
  // NumericField owns its own in-progress text and hands back numbers, so
  // the numeric draft is a number.
  const [draft, setDraft] = useState<string>(String(entry.value));
  const [numDraft, setNumDraft] = useState<number>(Number(entry.value));
  useEffect(() => {
    setDraft(String(entry.value));
    setNumDraft(Number(entry.value));
  }, [entry.value]);

  const commitText = () => {
    if (draft !== String(entry.value)) {
      onSetValue(entry.key, entry.type, draft);
    }
  };

  const commitNumber = (value: number) => {
    if (!Number.isNaN(value) && value !== Number(entry.value)) {
      onSetValue(entry.key, entry.type, value);
    }
  };

  if (entry.type === "boolean") {
    return (
      <SwitchField
        checked={Boolean(entry.value)}
        disabled={disabled}
        onChange={(c) => onSetValue(entry.key, entry.type, c)}
      />
    );
  }

  if (entry.type === "enum") {
    return (
      <SelectField
        fill
        value={String(entry.value)}
        disabled={disabled}
        onChange={(v) => onSetValue(entry.key, entry.type, v)}
      >
        {(entry.enumdef ?? [String(entry.value)]).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </SelectField>
    );
  }

  if (entry.type === "integer" || entry.type === "real") {
    // No slider: a generic property carries no range to scale one against.
    // `onRelease` (blur / Enter) is the commit -- `onChange` fires per
    // keystroke and would write one undo step per digit.
    return (
      <NumericField
        slider={false}
        value={numDraft}
        disabled={disabled}
        step={entry.type === "integer" ? 1 : 0.1}
        onChange={setNumDraft}
        onRelease={commitNumber}
      />
    );
  }

  // Object-valued properties arrive as their C++ string form, because
  // `LScrObjBase::getPropsJSONImpl` emits `toString()` for any object whose
  // `isStrConv()` is true (color, selection, vector, time). Each editor
  // below reads and writes that same string, so the write path is the
  // ordinary `setProp` -- no new worker contract.
  if (entry.type.startsWith("object<AbstractColor")) {
    return (
      <ColorField
        value={String(entry.value)}
        onCommit={(v) => onSetValue(entry.key, entry.type, v)}
        disabled={disabled}
      />
    );
  }

  if (entry.type.startsWith("object<Vector")) {
    return (
      <VectorField
        value={String(entry.value)}
        onCommit={(v) => onSetValue(entry.key, entry.type, v)}
        disabled={disabled}
      />
    );
  }

  if (entry.type.startsWith("object<TimeValue")) {
    // TimeField works in ms; the property string is the C++ timecode, whose
    // fractional part is an integer ms count rather than a decimal fraction
    // (see cppTimeToMs). An unparseable value falls through to the text
    // editor so it stays fixable rather than silently reading as 0.
    const ms = cppTimeToMs(String(entry.value));
    if (ms !== null) {
      return (
        <TimeValueEditor
          ms={ms}
          atDefault={atDefault}
          disabled={disabled}
          onSet={(v, opts) => onSetValue(entry.key, entry.type, v, opts)}
        />
      );
    }
  }

  // string, and the remaining object<...> types (raw read-only display).
  const unsupported = entry.type.startsWith("object");
  return (
    <TextField
      fill
      value={draft}
      disabled={disabled || unsupported}
      onChange={setDraft}
      onBlur={commitText}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitText();
      }}
    />
  );
};

// ------------------------------------------------------------
// Detail panel -- "default" checkbox + type-aware editor
// ------------------------------------------------------------

interface DetailPanelProps {
  entry: GenericPropEntry;
  onSetValue: (
    key: string,
    valueType: string,
    value: string | number | boolean,
    opts?: PropWriteOpts,
  ) => void;
  onResetValue: (key: string) => void;
}

/**
 * Bottom detail area for the selected property. Keyed by the entry's key
 * only: a refetch that changes the value or the default flag re-seeds the
 * state below instead of remounting the panel, because a realtime drag
 * refetches while the field is still held and a remount would cancel it.
 */
const DetailPanel: React.FC<DetailPanelProps> = ({ entry, onSetValue, onResetValue }) => {
  // Local override mirroring UXP's `defaultToggleCheck`: unchecking "default"
  // re-enables the editor without changing the value. There is no immutable
  // `entry.isdefault` to mutate, so the cleared state lives here instead.
  const [defaultCleared, setDefaultCleared] = useState(false);
  useEffect(() => {
    setDefaultCleared(false);
  }, [entry.value, entry.isdefault]);

  // `name` / `sel` never reset (NON_RESETTABLE_KEYS), whatever the dump says:
  // the C++ table declares "" as the name's default, and a name set through a
  // bare setter is reported as sitting at it, which used to lock the editor
  // and offer a reset that left a renderer group nameless.
  const resettable = isResettable(entry);
  const atDefault = resettable && entry.isdefault && !defaultCleared;

  return (
    <>
      <div className="insp-generic-detail-head">
        <span className="insp-generic-detail-key">{entry.key}</span>
        <span className="insp-generic-detail-type">{entry.type}</span>
      </div>
      <div className="insp-generic-detail-editor">
        <Field label="default" inline controlFirst className="insp-generic-default-check">
          <CheckboxField
            checked={atDefault}
            disabled={entry.readonly || !resettable}
            onChange={(checked) => {
              // Checking restores the C++ default; unchecking only re-enables
              // the widget so the next edit can set a non-default value.
              if (checked) onResetValue(entry.key);
              else setDefaultCleared(true);
            }}
          />
        </Field>
        <DetailEditor entry={entry} atDefault={atDefault} onSetValue={onSetValue} />
      </div>
    </>
  );
};

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

export const GenericTab: React.FC<GenericTabProps> = ({
  entries,
  onSetValue,
  onResetValue,
  loading,
}) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const { widths, startResize } = useColumnResize(
    DEFAULT_WIDTHS,
    undefined,
    GENERIC_COL_WIDTHS_KEY,
  );

  const selectedEntry = entries.find((e) => e.key === selectedKey) ?? null;

  const filtered = filter
    ? entries.filter((e) => e.key.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  return (
    <div className="insp-generic-tab">
      {/* Search / filter bar */}
      <div className="insp-generic-filter">
        <TextField
          fill
          leftIcon={<AppIcon name="ui.search" aria-hidden />}
          placeholder="Filter properties…"
          value={filter}
          onChange={setFilter}
        />
      </div>

      {/* Scrollable table */}
      <div className="insp-generic-table-wrap">
        <table className="insp-generic-table h3-list-table">
          <colgroup>
            <col style={{ width: widths.name }} />
            <col style={{ width: widths.type }} />
            {/* Value column takes the remaining space */}
            <col />
          </colgroup>

          <thead>
            <tr>
              <th className="insp-gt-th insp-gt-name">
                <span className="insp-gt-th-label">Name</span>
                <div
                  className="insp-gt-resize-handle"
                  onMouseDown={(e) => startResize("name", e)}
                />
              </th>
              <th className="insp-gt-th insp-gt-type">
                <span className="insp-gt-th-label">Type</span>
                <div
                  className="insp-gt-resize-handle"
                  onMouseDown={(e) => startResize("type", e)}
                />
              </th>
              <th className="insp-gt-th insp-gt-value">
                <span className="insp-gt-th-label">Value</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((entry) => (
              <tr
                key={entry.key}
                className={
                  "insp-gt-row h3-list-table-row" +
                  (selectedKey === entry.key ? " is-selected" : "") +
                  (entry.readonly ? " readonly" : "")
                }
                onClick={() => setSelectedKey(entry.key)}
              >
                <td className="insp-gt-cell-name">
                  {/* Indent nested-object children by their dot-nesting depth
                      so the `section` -> `section.width` hierarchy reads. */}
                  <span
                    style={
                      entry.depth
                        ? { marginLeft: `${entry.depth * 16}px` }
                        : undefined
                    }
                  >
                    {entry.key}
                  </span>
                </td>
                <td className="insp-gt-cell-type">{entry.type}</td>
                <td className="insp-gt-cell-value">{displayValue(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && entries.length === 0 && (
          <div className="insp-generic-empty">No properties available.</div>
        )}
      </div>

      {/* Bottom detail editor */}
      <div className="insp-generic-detail">
        {selectedEntry ? (
          <DetailPanel
            key={selectedEntry.key}
            entry={selectedEntry}
            onSetValue={onSetValue}
            onResetValue={onResetValue}
          />
        ) : (
          <div className="insp-generic-detail-hint">
            Select a property to edit its value.
          </div>
        )}
      </div>
    </div>
  );
};
