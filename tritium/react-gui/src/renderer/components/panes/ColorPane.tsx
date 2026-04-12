/**
 * @file ColorPane.tsx
 * @description Colour-scheme editor pane for molecular renderers.
 *
 * Displays a "Paint coloring" table where each row maps a structural
 * selection string (e.g. "sheet", "helix") to a named or raw colour value.
 * Users can add, remove, and reorder rows.
 *
 * This pane is one of the components within the ExplorerView.
 *
 * @module ColorPane
 */

import React, { useState, useCallback } from "react";
import {
  Button,
  ButtonGroup,
  HTMLSelect,
  Icon,
  Tooltip,
  type IconName,
} from "@blueprintjs/core";
import { SectionHeader } from "./SectionHeader";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/** A single row in the paint-coloring table. */
export interface ColorEntry {
  id: string;
  selection: string;
  color: string;
}

export interface MolOption {
  id: string;
  label: string;
}

// ────────────────────────────────────────────────────────────
// Named colour → CSS hex lookup (subset used by CueMol)
// ────────────────────────────────────────────────────────────

const NAMED_COLORS: Record<string, string> = {
  SteelBlue: "#4682B4",
  khaki: "#C3B091",
  yellow: "#FFE000",
  red: "#E06C75",
  green: "#87C38A",
  cyan: "#56B6C2",
  magenta: "#C678DD",
  orange: "#D19A66",
  white: "#FFFFFF",
  gray: "#808080",
};

/** Resolve a named colour or raw CSS value to something renderable. */
const resolveColor = (color: string): string => {
  if (NAMED_COLORS[color]) return NAMED_COLORS[color];
  if (color.startsWith("#") || color.startsWith("rgb") || color.startsWith("hsl"))
    return color;
  // fallback: try treating as-is (browser will ignore invalid values)
  return color;
};

// ────────────────────────────────────────────────────────────
// Default data
// ────────────────────────────────────────────────────────────

const DEFAULT_ENTRIES: ColorEntry[] = [
  { id: "c1", selection: "sheet", color: "SteelBlue" },
  { id: "c2", selection: "helix", color: "khaki" },
  { id: "c3", selection: "nucleic", color: "yellow" },
  { id: "c4", selection: "coil", color: "gray" },
];

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

interface ColorPaneProps {
  molecules?: MolOption[];
  selectedMol?: string;
  onMolChange?: (molId: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ColorPane: React.FC<ColorPaneProps> = ({
  molecules = [],
  selectedMol = "",
  onMolChange,
  collapsed,
  onToggleCollapse,
}) => {
  const [entries, setEntries] = useState<ColorEntry[]>(DEFAULT_ENTRIES);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);

  /* ── Row manipulation ─────────────────────────────────── */

  const handleAdd = useCallback(() => {
    const newEntry: ColorEntry = {
      id: `c-${Date.now()}`,
      selection: "*",
      color: "white",
    };
    setEntries((prev) => [...prev, newEntry]);
    setSelectedRow(newEntry.id);
  }, []);

  const handleRemove = useCallback(() => {
    if (!selectedRow) return;
    setEntries((prev) => prev.filter((e) => e.id !== selectedRow));
    setSelectedRow(null);
  }, [selectedRow]);

  const handleMoveUp = useCallback(() => {
    if (!selectedRow) return;
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === selectedRow);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, [selectedRow]);

  const handleMoveDown = useCallback(() => {
    if (!selectedRow) return;
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === selectedRow);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, [selectedRow]);

  /* ── Inline editing ────────────────────────────────────── */

  const updateEntry = useCallback(
    (id: string, field: "selection" | "color", value: string) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
      );
    },
    []
  );

  return (
    <div className="sp-pane">
      <SectionHeader
        title="Color"
        icon="tint"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <div className="sp-pane-fill color-panel-body">
          {/* Molecule selector */}
          {molecules.length > 0 && (
            <div className="color-mol-row">
              <HTMLSelect
                value={selectedMol}
                onChange={(e) => onMolChange?.(e.target.value)}
                fill
                className="selection-mol-select"
              >
                {molecules.map((mol) => (
                  <option key={mol.id} value={mol.id}>
                    {mol.label}
                  </option>
                ))}
              </HTMLSelect>
            </div>
          )}

          {/* Label */}
          <div className="color-section-label">Paint coloring:</div>

          {/* Colour table */}
          <div className="color-table-wrap">
            <table className="color-table">
              <thead>
                <tr>
                  <th className="color-th-selection">Selection</th>
                  <th className="color-th-color">Color</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`color-row ${selectedRow === entry.id ? "selected" : ""}`}
                    onClick={() => setSelectedRow(entry.id)}
                  >
                    <td className="color-cell-selection">
                      <input
                        className="color-inline-input"
                        value={entry.selection}
                        onChange={(e) =>
                          updateEntry(entry.id, "selection", e.target.value)
                        }
                        onClick={(e) => e.stopPropagation()}
                        spellCheck={false}
                      />
                    </td>
                    <td
                      className="color-cell-color"
                      style={{ backgroundColor: resolveColor(entry.color) }}
                    >
                      <input
                        className="color-inline-input color-value-input"
                        value={entry.color}
                        onChange={(e) =>
                          updateEntry(entry.id, "color", e.target.value)
                        }
                        onClick={(e) => e.stopPropagation()}
                        spellCheck={false}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action buttons (bottom toolbar) */}
          <div className="color-actions">
            <ButtonGroup minimal>
              <Tooltip content="Add row" placement="top" compact>
                <Button
                  small
                  icon={<Icon icon="plus" size={14} />}
                  className="color-action-btn"
                  onClick={handleAdd}
                />
              </Tooltip>
              <Tooltip content="Remove row" placement="top" compact>
                <Button
                  small
                  icon={<Icon icon="minus" size={14} />}
                  className="color-action-btn"
                  onClick={handleRemove}
                  disabled={!selectedRow}
                />
              </Tooltip>
              <Tooltip content="Duplicate" placement="top" compact>
                <Button
                  small
                  icon={<Icon icon="duplicate" size={14} />}
                  className="color-action-btn"
                  disabled={!selectedRow}
                  onClick={() => {
                    if (!selectedRow) return;
                    const src = entries.find((e) => e.id === selectedRow);
                    if (!src) return;
                    const dup: ColorEntry = {
                      ...src,
                      id: `c-${Date.now()}`,
                    };
                    setEntries((prev) => [...prev, dup]);
                  }}
                />
              </Tooltip>
              <Tooltip content="Move up" placement="top" compact>
                <Button
                  small
                  icon={<Icon icon="arrow-up" size={14} />}
                  className="color-action-btn"
                  onClick={handleMoveUp}
                  disabled={!selectedRow}
                />
              </Tooltip>
              <Tooltip content="Move down" placement="top" compact>
                <Button
                  small
                  icon={<Icon icon="arrow-down" size={14} />}
                  className="color-action-btn"
                  onClick={handleMoveDown}
                  disabled={!selectedRow}
                />
              </Tooltip>
            </ButtonGroup>
          </div>
        </div>
      )}
    </div>
  );
};
