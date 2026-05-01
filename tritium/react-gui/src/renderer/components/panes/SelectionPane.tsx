/**
 * @file SelectionPane.tsx
 * @description Atom-selection query pane with molecule selector and
 * free-text selection expression input.
 *
 * ## State ownership
 *
 * Both the selected-molecule dropdown and the selection-text input are
 * managed **internally** by this component. These values are purely
 * local UI state with no cross-pane dependencies.
 *
 * When the backend scripting engine is integrated, the selection text
 * will be dispatched as a command; at that point the state can be
 * lifted into a hook that also handles IPC.
 *
 * This pane is one of the components within the SelectionView.
 *
 * @module SelectionPane
 */

import React, { useState } from "react";
import { HTMLSelect, TextArea } from "@blueprintjs/core";
import { SectionHeader } from "./SectionHeader";

/* ─── Types ─── */

export interface MolOption {
  id: string;
  label: string;
}

/* ─── Defaults ─── */

const DEFAULT_SELECTED_MOL = "mol1";
const DEFAULT_SELECTION_TEXT = "";

/* ─── SelectionPane ─── */

interface SelectionPaneProps {
  /** Available molecules for the dropdown. */
  molecules: MolOption[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const SelectionPane: React.FC<SelectionPaneProps> = ({
  molecules,
  collapsed,
  onToggleCollapse,
}) => {
  // Interaction state — purely local to this pane.
  const [selectedMol, setSelectedMol] = useState(DEFAULT_SELECTED_MOL);
  const [selectionText, setSelectionText] = useState(DEFAULT_SELECTION_TEXT);

  return (
    <div className="sp-pane">
      <SectionHeader
        title="Selection"
        icon="select"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <div className="sp-pane-fill">
          <div className="selection-row">
            <label className="selection-label">Molecule</label>
            <HTMLSelect
              value={selectedMol}
              onChange={(e) => setSelectedMol(e.target.value)}
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
          <div className="selection-text-row">
            <label className="selection-label">Selection</label>
            <TextArea
              value={selectionText}
              onChange={(e) => setSelectionText(e.target.value)}
              placeholder="e.g. chain.A AND resid.1:10"
              fill
              growVertically={false}
              className="selection-textarea"
            />
          </div>
        </div>
      )}
    </div>
  );
};
