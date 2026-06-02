/**
 * @file components/inspector/RenderSettingsEditor.tsx
 * @description Inspector body for the `renderSettings` target.
 *
 * Shows a backend selector followed by the backend-independent setting
 * groups (Image / Camera / Quality / Output) and the active backend's own
 * groups. Phase 1 is mock-only: edits update local state but no rendering
 * is performed yet.
 */

import React, { useCallback } from "react";
import { HTMLSelect } from "@blueprintjs/core";

import { PropGroupedEditor } from "./PropGroupedEditor";
import type { PropDef } from "../../data/rendererProperties";
import { RENDER_COMMON_GROUPS, type RenderBackendId } from "../../data/renderSettings";
import { RENDER_BACKENDS } from "../../data/renderBackends";

interface RenderSettingsEditorProps {
  /** Currently selected backend. */
  backend: RenderBackendId;
  /** Backend ids available in the selector. */
  backendIds: RenderBackendId[];
  /** Backend-independent property definitions. */
  commonProps: PropDef[];
  /** Active backend's property definitions. */
  backendProps: PropDef[];
  /** Called when the user picks a different backend. */
  onBackendChange: (id: RenderBackendId) => void;
  /** Called when any setting value changes. */
  onChange: (key: string, value: string | number | boolean) => void;
}

export const RenderSettingsEditor: React.FC<RenderSettingsEditorProps> = ({
  backend,
  backendIds,
  commonProps,
  backendProps,
  onBackendChange,
  onChange,
}) => {
  const handleBackendChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onBackendChange(e.currentTarget.value as RenderBackendId);
    },
    [onBackendChange],
  );

  const backendGroups = RENDER_BACKENDS[backend].groups;

  return (
    <div className="insp-properties-tab">
      {/* ── Backend selector ── */}
      <div className="insp-render-backend-bar">
        <span className="insp-prop-label">Backend</span>
        <HTMLSelect
          className="insp-select h3-form-select"
          fill
          value={backend}
          onChange={handleBackendChange}
        >
          {backendIds.map((id) => (
            <option key={id} value={id}>
              {RENDER_BACKENDS[id].label}
            </option>
          ))}
        </HTMLSelect>
      </div>

      {/* ── Backend-independent groups ── */}
      <PropGroupedEditor
        properties={commonProps}
        groups={RENDER_COMMON_GROUPS}
        onChange={onChange}
      />

      {/* ── Backend-specific groups ── */}
      <PropGroupedEditor
        properties={backendProps}
        groups={backendGroups}
        onChange={onChange}
      />
    </div>
  );
};
