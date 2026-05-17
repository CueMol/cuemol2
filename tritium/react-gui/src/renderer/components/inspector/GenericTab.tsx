/**
 * @file components/inspector/GenericTab.tsx
 * @description Generic (power-user) tab that displays every property of the
 * inspected node in a flat key-value table with resizable columns.
 *
 * Migrated from the UXP `propeditor-generic-page` overlay. Each row shows the
 * property name, its C++ type tag and the current value. Selecting a row
 * populates the bottom detail area, whose editor widget is chosen from the
 * property type (string / integer / real / boolean / enum). Changes are
 * applied live - there is no OK/Cancel. The "default" checkbox restores the
 * C++ default for resettable properties.
 */

import React, { useState } from "react";
import { InputGroup, NumericInput, Switch, HTMLSelect, Checkbox } from "@blueprintjs/core";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import { useColumnResize } from "../../hooks/useColumnResize";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

/** Default column widths in px (Name & Type are resizable, Value fills remainder). */
const DEFAULT_WIDTHS = { name: 120, type: 80 };

/** localStorage key for the persisted Name / Type column widths. */
const GENERIC_COL_WIDTHS_KEY = "cuemol.inspector.genericTab.colWidths";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface GenericTabProps {
  entries: GenericPropEntry[];
  /** Write a property value (live-apply). */
  onSetValue: (key: string, valueType: string, value: string | number | boolean) => void;
  /** Restore a property to its C++ default. */
  onResetValue: (key: string) => void;
  /** True while the property list is being (re)fetched. */
  loading?: boolean;
}

// ────────────────────────────────────────────────────────────
// Display helpers
// ────────────────────────────────────────────────────────────

/** Render a value for the read-only table cell. */
function displayValue(entry: GenericPropEntry): string {
  if (entry.isContainer) return "<node>";
  if (typeof entry.value === "boolean") return entry.value ? "true" : "false";
  return String(entry.value);
}

// ────────────────────────────────────────────────────────────
// Detail editor — type-aware widget for the selected property
// ────────────────────────────────────────────────────────────

interface DetailEditorProps {
  entry: GenericPropEntry;
  /** True while the property is sitting at its (not yet cleared) C++ default. */
  atDefault: boolean;
  onSetValue: (key: string, valueType: string, value: string | number | boolean) => void;
}

/**
 * Editor for one property. Mounted via `DetailPanel`'s `key` so its draft
 * state resets whenever the selected row changes.
 */
const DetailEditor: React.FC<DetailEditorProps> = ({ entry, atDefault, onSetValue }) => {
  // Value widgets are disabled for read-only props and while a resettable
  // property is sitting at its default. Clearing the "default" checkbox
  // re-enables the widget without changing the value (UXP: `defaultToggleCheck`).
  const disabled = entry.readonly || atDefault;

  // Local draft for text / numeric widgets, committed on blur / Enter.
  const [draft, setDraft] = useState<string>(String(entry.value));

  const commitText = () => {
    if (draft !== String(entry.value)) {
      onSetValue(entry.key, entry.type, draft);
    }
  };

  const commitNumber = () => {
    const parsed = Number(draft);
    if (!Number.isNaN(parsed) && parsed !== Number(entry.value)) {
      onSetValue(entry.key, entry.type, parsed);
    }
  };

  if (entry.type === "boolean") {
    return (
      <Switch
        checked={Boolean(entry.value)}
        disabled={disabled}
        onChange={(e) =>
          onSetValue(entry.key, entry.type, (e.target as HTMLInputElement).checked)
        }
        className="insp-switch"
      />
    );
  }

  if (entry.type === "enum") {
    return (
      <HTMLSelect
        fill
        value={String(entry.value)}
        disabled={disabled}
        onChange={(e) => onSetValue(entry.key, entry.type, e.target.value)}
        className="insp-select"
      >
        {(entry.enumdef ?? [String(entry.value)]).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </HTMLSelect>
    );
  }

  if (entry.type === "integer" || entry.type === "real") {
    return (
      <NumericInput
        small
        fill
        value={draft}
        disabled={disabled}
        stepSize={entry.type === "integer" ? 1 : 0.1}
        minorStepSize={null}
        onValueChange={(_n, s) => setDraft(s)}
        onBlur={commitNumber}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitNumber();
        }}
        className="insp-numeric-input"
      />
    );
  }

  // string, and the unsupported object<...> fallback (raw display).
  const unsupported = entry.type.startsWith("object");
  return (
    <InputGroup
      small
      fill
      value={draft}
      disabled={disabled || unsupported}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitText}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitText();
      }}
      className="insp-input"
    />
  );
};

// ────────────────────────────────────────────────────────────
// Detail panel — "default" checkbox + type-aware editor
// ────────────────────────────────────────────────────────────

interface DetailPanelProps {
  entry: GenericPropEntry;
  onSetValue: (key: string, valueType: string, value: string | number | boolean) => void;
  onResetValue: (key: string) => void;
}

/**
 * Bottom detail area for the selected property. Mounted with a `key` that
 * encodes the entry's value / default flag, so that `defaultCleared` resets
 * whenever the row changes or the property list is refetched after a write.
 */
const DetailPanel: React.FC<DetailPanelProps> = ({ entry, onSetValue, onResetValue }) => {
  // Local override mirroring UXP's `defaultToggleCheck`: unchecking "default"
  // re-enables the editor without changing the value. There is no immutable
  // `entry.isdefault` to mutate, so the cleared state lives here instead.
  const [defaultCleared, setDefaultCleared] = useState(false);

  const atDefault = entry.hasdefault && entry.isdefault && !defaultCleared;

  return (
    <>
      <div className="insp-generic-detail-head">
        <span className="insp-generic-detail-key">{entry.key}</span>
        <span className="insp-generic-detail-type">{entry.type}</span>
      </div>
      <div className="insp-generic-detail-editor">
        <Checkbox
          label="default"
          checked={atDefault}
          disabled={entry.readonly || !entry.hasdefault}
          onChange={(e) => {
            // Checking restores the C++ default; unchecking only re-enables
            // the widget so the next edit can set a non-default value.
            if ((e.target as HTMLInputElement).checked) {
              onResetValue(entry.key);
            } else {
              setDefaultCleared(true);
            }
          }}
          className="insp-generic-default-check"
        />
        <DetailEditor entry={entry} atDefault={atDefault} onSetValue={onSetValue} />
      </div>
    </>
  );
};

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

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
        <InputGroup
          small
          fill
          leftIcon="search"
          placeholder="Filter properties…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="insp-input"
        />
      </div>

      {/* Scrollable table */}
      <div className="insp-generic-table-wrap">
        <table className="insp-generic-table">
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
                  "insp-gt-row" +
                  (selectedKey === entry.key ? " selected" : "") +
                  (entry.readonly ? " readonly" : "")
                }
                onClick={() => setSelectedKey(entry.key)}
              >
                <td className="insp-gt-cell-name">{entry.key}</td>
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
            key={`${selectedEntry.key}:${String(selectedEntry.value)}:${selectedEntry.isdefault}`}
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
