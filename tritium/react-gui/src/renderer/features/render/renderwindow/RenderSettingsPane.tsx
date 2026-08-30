/**
 * @file components/renderwindow/RenderSettingsPane.tsx
 * @description Right pane of the Rendering window: the render settings, split
 * into tabs behind one header.
 *
 * "Image" holds everything describing the produced file (size, output toggles,
 * and the movie output settings in movie mode) and opens first, since size is
 * what a render is set up around; "Render" holds the backend-driven groups
 * (Camera / Quality / Edges / the backend's own). The split keeps a single
 * scrolling column short enough to scan in a narrow pane. The Umbreon (NPR)
 * backend adds a "Detail" tab with the hatch layer editor (the Render tab's
 * Hatching group keeps the style pick and its simple multipliers).
 *
 * The header and the tab strip are the shared .panel-header / .mode-bar roles
 * the main window's Inspector uses, so the two panes are titled and switched
 * with the same chrome rather than two look-alike copies of it. The backend
 * selector is not in this pane -- it sits in the run bar next to the render
 * target (RenderPanel), with the run controls.
 */

import React, { useState } from "react";

import { SegmentField } from "@renderer/h3-kit/form";
import { AppIcon } from "@renderer/h3-kit/primitives";
import { RenderSettingsEditor } from "@renderer/features/inspector/RenderSettingsEditor";
import { HatchLookEditor, type HatchLookEditorProps } from "@renderer/features/inspector/HatchLookEditor";
import { RenderImageTab } from "./RenderImageTab";
import { RENDER_BACKENDS } from "@renderer/data/renderBackends";
import type { PropDef } from "@renderer/data/rendererProperties";
import type {
  MovieSettings,
  RenderBackendId,
  RenderLightingMode,
  RenderMode,
  RenderQualitySteps,
  RenderSizePreset,
} from "@renderer/data/renderSettings";

/** Which settings tab is visible. */
type RenderSettingsTab = "render" | "image" | "hatch";

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
  /** Switch the movie output back to the app-managed folder. */
  onUseTempDir?: () => void;
  /** Leave the app-managed folder for one the user names. */
  onUseCustomDir?: () => void;
  /** Open a folder picker for the movie output. */
  onPickFolder?: () => void;
  /** Disable the movie controls (a render is in flight). */
  movieDisabled?: boolean;
  /** NPR hatch layer editor: adds the "Detail" tab (umbreon_npr only). */
  hatch?: HatchLookEditorProps;
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
  onUseTempDir,
  onUseCustomDir,
  onPickFolder,
  movieDisabled = false,
  hatch,
}) => {
  const [tab, setTab] = useState<RenderSettingsTab>("image");
  // The Detail tab exists only while the NPR backend is active; leaving the
  // backend while on it falls back to the Render tab.
  const activeTab: RenderSettingsTab = tab === "hatch" && !hatch ? "render" : tab;

  return (
    <div className="render-window-settings">
      <div className="render-window-settings-header panel-header">
        <AppIcon name="ui.properties" size="md" className="panel-header-icon" aria-hidden />
        <span className="panel-header-name type-panel-title">Render Settings</span>
      </div>

      <div className="render-window-settings-tabbar mode-bar">
        <SegmentField<RenderSettingsTab>
          value={activeTab}
          onValueChange={setTab}
          options={[
            { label: "Image", value: "image" },
            { label: "Render", value: "render" },
            ...(hatch ? [{ label: "Detail", value: "hatch" as const }] : []),
          ]}
        />
      </div>

      <div className="render-window-settings-body">
        {activeTab === "hatch" && hatch ? (
          <div className="insp-properties-tab">
            <HatchLookEditor {...hatch} />
          </div>
        ) : activeTab === "render" ? (
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
            onUseTempDir={onUseTempDir}
            onUseCustomDir={onUseCustomDir}
            onPickFolder={onPickFolder}
            movieDisabled={movieDisabled}
          />
        )}
      </div>
    </div>
  );
};
