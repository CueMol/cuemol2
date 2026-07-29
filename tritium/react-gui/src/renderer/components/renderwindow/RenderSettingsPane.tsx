/**
 * @file components/renderwindow/RenderSettingsPane.tsx
 * @description Right pane of the Rendering window: the render settings, split
 * into two tabs behind one header.
 *
 * "Image" holds everything describing the produced file (size, output toggles,
 * and the movie output settings in movie mode) and opens first, since size is
 * what a render is set up around; "Render" holds the backend-driven groups
 * (Camera / Quality / Edges / the backend's own). The split keeps a single
 * scrolling column short enough to scan in a narrow pane.
 *
 * The tab strip follows the Inspector's mode bar (SegmentField under the pane
 * header) so both panes switch views the same way. The backend selector is not
 * in this pane -- it sits in the run bar next to the render target
 * (RenderPanel), with the run controls.
 */

import React, { useState } from "react";

import { SegmentField } from "../../h3-kit/form";
import { RenderSettingsEditor } from "../inspector/RenderSettingsEditor";
import { RenderImageTab } from "./RenderImageTab";
import { RENDER_BACKENDS } from "../../data/renderBackends";
import type { PropDef } from "../../data/rendererProperties";
import type {
  MovieSettings,
  RenderBackendId,
  RenderLightingMode,
  RenderMode,
  RenderQualitySteps,
  RenderSizePreset,
} from "../../data/renderSettings";

/** Which settings tab is visible. */
type RenderSettingsTab = "render" | "image";

interface RenderSettingsPaneProps {
  /** Currently selected backend (drives the Render tab's groups). */
  backend: RenderBackendId;
  /** Backend-independent property definitions. */
  commonProps: PropDef[];
  /** Active backend's property definitions. */
  backendProps: PropDef[];
  /** Apply a single setting change (common or backend-specific). */
  onChange: (key: string, value: string | number | boolean) => void;
  /** Active lighting method of the Render tab's quality section. */
  lighting: RenderLightingMode;
  /** Selected step per quality axis ("custom" after a manual override). */
  qualitySteps: RenderQualitySteps;
  /** Switch the lighting method. */
  onLightingChange: (mode: RenderLightingMode) => void;
  /** Move one quality axis to a step. */
  onQualityStepChange: (axisKey: string, stepId: string) => void;
  /** Output mode; movie adds the Movie section to the Image tab. */
  mode: RenderMode;
  /** Selected size-preset label. */
  preset: string;
  /** Size presets offered for the current mode. */
  sizePresets: RenderSizePreset[];
  /** Apply a size preset. */
  onApplyPreset: (label: string) => void;
  /** Current movie settings. */
  movie: MovieSettings;
  /** Apply a partial movie-settings change. */
  onMovieChange: (patch: Partial<MovieSettings>) => void;
  /** Open a folder picker for the movie output. */
  onPickFolder?: () => void;
  /** Disable the movie controls (a render is in flight). */
  movieDisabled?: boolean;
}

export const RenderSettingsPane: React.FC<RenderSettingsPaneProps> = ({
  backend,
  commonProps,
  backendProps,
  onChange,
  lighting,
  qualitySteps,
  onLightingChange,
  onQualityStepChange,
  mode,
  preset,
  sizePresets,
  onApplyPreset,
  movie,
  onMovieChange,
  onPickFolder,
  movieDisabled = false,
}) => {
  const [tab, setTab] = useState<RenderSettingsTab>("image");

  return (
    <div className="render-window-settings">
      <div className="render-window-settings-header type-group-label">
        Render Settings
      </div>

      <div className="render-window-settings-tabbar">
        <SegmentField<RenderSettingsTab>
          value={tab}
          onValueChange={setTab}
          options={[
            { label: "Image", value: "image" },
            { label: "Render", value: "render" },
          ]}
        />
      </div>

      <div className="render-window-settings-body">
        {tab === "render" ? (
          <RenderSettingsEditor
            backend={backend}
            commonProps={commonProps}
            backendProps={backendProps}
            onChange={onChange}
            lighting={lighting}
            qualitySteps={qualitySteps}
            onLightingChange={onLightingChange}
            onQualityStepChange={onQualityStepChange}
          />
        ) : (
          <RenderImageTab
            mode={mode}
            commonProps={commonProps}
            hiddenKeys={RENDER_BACKENDS[backend].unsupportedCommonKeys}
            onChange={onChange}
            preset={preset}
            sizePresets={sizePresets}
            onApplyPreset={onApplyPreset}
            movie={movie}
            onMovieChange={onMovieChange}
            onPickFolder={onPickFolder}
            movieDisabled={movieDisabled}
          />
        )}
      </div>
    </div>
  );
};
