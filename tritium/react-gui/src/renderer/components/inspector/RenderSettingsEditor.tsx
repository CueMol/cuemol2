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
import { Field, SelectField } from "../../h3-kit/form";
import type { PropDef } from "../../data/rendererProperties";
import {
  RENDER_COMMON_GROUPS,
  RENDER_SIZE_PRESETS,
  type RenderBackendId,
  type RenderGroupDef,
} from "../../data/renderSettings";
import { RENDER_BACKENDS } from "../../data/renderBackends";

/**
 * Display order for every settings group (common + any backend's). Groups with
 * no visible props are dropped by PropGroupedEditor, so this superset is safe
 * for every backend. Backend groups not listed here are appended in their
 * declared order.
 */
const GROUP_ORDER = [
  "Image",
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
  /** Currently selected image-size preset label (consolidated here from the panel). */
  preset: string;
  /** Called when the user picks an image-size preset. */
  onApplyPreset: (label: string) => void;
}

export const RenderSettingsEditor: React.FC<RenderSettingsEditorProps> = ({
  backend,
  backendIds,
  commonProps,
  backendProps,
  onBackendChange,
  onChange,
  preset,
  onApplyPreset,
}) => {
  const handleBackendChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onBackendChange(e.currentTarget.value as RenderBackendId);
    },
    [onBackendChange],
  );

  const backendGroups = RENDER_BACKENDS[backend].groups;

  // Hide common settings the active backend does not honor (e.g. Umbreon has no
  // stereo / post-blend). PropGroupedEditor drops any group left with no props,
  // so a fully-hidden common group simply disappears (no empty accordion).
  const hiddenCommon = new Set(RENDER_BACKENDS[backend].unsupportedCommonKeys ?? []);
  const visibleCommonProps =
    hiddenCommon.size === 0
      ? commonProps
      : commonProps.filter((p) => !hiddenCommon.has(p.key));

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

  // The image-size preset sits at the top of the Image group -- it is a
  // shortcut for the width / height fields right below it, so it belongs in
  // the same section rather than in a separate bar.
  const groupLeadContent = {
    Image: (
      <Field label="Preset">
        <SelectField value={preset} onChange={onApplyPreset}>
          {RENDER_SIZE_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </SelectField>
      </Field>
    ),
  };

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

      {/* -- One merged set of ordered groups (common + backend). The
             image-size preset rides at the top of the Image group. -- */}
      <PropGroupedEditor
        properties={allProps}
        groups={orderedGroups}
        onChange={onChange}
        groupLeadContent={groupLeadContent}
      />
    </div>
  );
};
