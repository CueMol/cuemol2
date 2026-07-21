/**
 * @file components/inspector/RenderSettingsEditor.tsx
 * @description Render Settings editor, hosted in the Rendering window's
 * right pane (RenderWindowApp).
 *
 * Shows a backend selector followed by one merged, ordered set of accordion
 * groups. Backend-independent (common) and backend-specific props share the
 * same grouping so a group like "Quality" or "Edges" that both contribute to
 * renders as a single section (never a common "Quality" next to an "Umbreon
 * Quality"). Edits update the window-local useRenderSettings state; the frozen
 * snapshot is sent to the main window when a render starts.
 */

import React, { useCallback } from "react";
import { HTMLSelect } from "@blueprintjs/core";

import { PropGroupedEditor } from "./PropGroupedEditor";
import type { PropDef } from "../../data/rendererProperties";
import {
  RENDER_COMMON_GROUPS,
  type RenderBackendId,
  type RenderGroupDef,
} from "../../data/renderSettings";
import { RENDER_BACKENDS } from "../../data/renderBackends";

/**
 * Display order for every settings group (common + any backend's). The Image
 * group is intentionally absent: image-size settings live in the bottom pane
 * (ImageSettingsPanel), not here. Groups with no visible props are dropped by
 * PropGroupedEditor, so this superset is safe for every backend. Backend
 * groups not listed here are appended in their declared order.
 */
const GROUP_ORDER = [
  "Camera",
  "Quality",
  "Edges",
  "Shadows",
  "Ambient Occlusion",
  "Global Illumination",
  "POV-Ray",
];

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

  // Hide common settings the active backend does not honor (e.g. Umbreon has no
  // stereo / post-blend), and the Image group, which lives in the bottom pane.
  // PropGroupedEditor drops any group left with no props, so a fully-hidden
  // common group simply disappears (no empty accordion).
  const hiddenCommon = new Set(RENDER_BACKENDS[backend].unsupportedCommonKeys ?? []);
  const visibleCommonProps = commonProps.filter(
    (p) => p.group !== "Image" && !hiddenCommon.has(p.key),
  );

  // Merge common + backend props and their groups so shared group keys (e.g.
  // "Quality", "Edges") render as a single accordion. The backend's group def
  // wins on a key clash (its defaultExpanded), then GROUP_ORDER fixes display
  // order (any unlisted backend group is appended in declared order).
  const allProps: PropDef[] = [...visibleCommonProps, ...backendProps];
  const groupDefs = new Map<string, RenderGroupDef>();
  for (const g of RENDER_COMMON_GROUPS) groupDefs.set(g.key, g);
  for (const g of backendGroups) groupDefs.set(g.key, g);
  const orderedGroups: RenderGroupDef[] = [
    ...GROUP_ORDER.filter((k) => groupDefs.has(k)).map((k) => groupDefs.get(k)!),
    ...[...groupDefs.values()].filter((g) => !GROUP_ORDER.includes(g.key)),
  ];

  return (
    <div className="insp-properties-tab">
      {/* -- Backend selector -- */}
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

      {/* -- One merged set of ordered groups (common + backend). Image-size
             settings are not here; they live in the bottom pane. -- */}
      <PropGroupedEditor
        properties={allProps}
        groups={orderedGroups}
        onChange={onChange}
      />
    </div>
  );
};
