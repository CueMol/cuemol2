/**
 * @file components/inspector/GenericTab.tsx
 * @description Generic (power-user) tab that displays all renderer
 * properties in a flat key-value table with resizable columns.
 *
 * Each row shows the property name, the data type, and an editable value
 * field.  Read-only properties are visually greyed out and non-editable.
 * Selecting a row populates the bottom detail area for quick editing.
 * Column widths can be adjusted by dragging the header borders.
 */

import React, { useState, useCallback } from "react";
import { InputGroup, Checkbox } from "@blueprintjs/core";
import type { GenericPropEntry } from "../../data/rendererProperties";
import { useColumnResize } from "../../hooks/useColumnResize";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

/** Default column widths in px (Name & Type are resizable, Value fills remainder). */
const DEFAULT_WIDTHS = { name: 170, type: 140 };

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface GenericTabProps {
  entries: GenericPropEntry[];
  onChangeValue: (key: string, value: string) => void;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export const GenericTab: React.FC<GenericTabProps> = ({
  entries,
  onChangeValue,
}) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const { widths, startResize } = useColumnResize(DEFAULT_WIDTHS);

  const selectedEntry = entries.find((e) => e.key === selectedKey) ?? null;

  const filtered = filter
    ? entries.filter((e) =>
        e.key.toLowerCase().includes(filter.toLowerCase())
      )
    : entries;

  const handleValueChange = useCallback(
    (key: string, value: string) => {
      onChangeValue(key, value);
    },
    [onChangeValue]
  );

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
            <col /> {/* Value — takes remaining space */}
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
                <td className="insp-gt-cell-value">{entry.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom detail editor */}
      <div className="insp-generic-detail">
        <div className="insp-generic-detail-row">
          <span className="insp-generic-detail-label">Name:</span>
          <span className="insp-generic-detail-value">
            {selectedEntry?.key ?? ""}
          </span>
        </div>
        <div className="insp-generic-detail-row">
          <span className="insp-generic-detail-label">Type:</span>
          <span className="insp-generic-detail-value">
            {selectedEntry?.type ?? ""}
          </span>
        </div>
        <div className="insp-generic-detail-row">
          <span className="insp-generic-detail-label">Value:</span>
          <div className="insp-generic-detail-input-wrap">
            <Checkbox
              label="default"
              disabled={!selectedEntry || selectedEntry.readonly}
              className="insp-generic-default-check"
            />
            <InputGroup
              small
              fill
              value={selectedEntry?.value ?? ""}
              disabled={!selectedEntry || selectedEntry.readonly}
              onChange={(e) => {
                if (selectedEntry) {
                  handleValueChange(selectedEntry.key, e.target.value);
                }
              }}
              className="insp-input"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
