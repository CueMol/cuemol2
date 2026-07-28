/**
 * @file components/renderwindow/RenderImageTab.tsx
 * @description "Image" tab of the Rendering window's settings pane -- every
 * setting describing the file a render produces.
 *
 * Sections, in order: Size (preset + width x height, plus the unit / DPI pair
 * in still mode), Output (the image-level toggles) and, while the render mode
 * is "movie", Movie (frame folder / naming / encoding). The backend-driven
 * quality settings live in the sibling "Render" tab.
 *
 * Movie settings are backend-independent and belong to the render *mode*, so
 * they are a plain typed record edited by MovieSettingsPanel rather than
 * PropDefs; grouping them here keeps every "what comes out" setting on one
 * tab.
 */

import React from "react";

import { ImageSettingsPanel } from "../panels/ImageSettingsPanel";
import { MovieSettingsPanel } from "../panels/MovieSettingsPanel";
import type { PropDef } from "../../data/rendererProperties";
import type {
  MovieSettings,
  RenderMode,
  RenderSizePreset,
} from "../../data/renderSettings";

/** Size-section keys per mode: movie sizes are exact pixels, so no unit / DPI. */
const STILL_SIZE_FIELDS = ["width", "height", "unit", "dpi"];
const MOVIE_SIZE_FIELDS = ["width", "height"];

/** Output-section keys, in display order. */
const OUTPUT_FIELDS = ["transparentBg", "postBlend", "pixelLabels"];

interface RenderImageTabProps {
  /** Output mode; movie adds the Movie section and drops unit / DPI. */
  mode: RenderMode;
  /** Backend-independent props; the section keys are picked out of these. */
  commonProps: PropDef[];
  /**
   * Common keys the active backend does not honor (e.g. Umbreon has no
   * post-render blending); hidden from the Output section exactly as the
   * Render tab hides them from its groups.
   */
  hiddenKeys?: string[];
  /** Apply a single setting change. */
  onChange: (key: string, value: string | number | boolean) => void;
  /** Selected size-preset label. */
  preset: string;
  /** Size presets offered for the current mode. */
  sizePresets: RenderSizePreset[];
  /** Apply a size preset. */
  onApplyPreset: (label: string) => void;
  /** Current movie settings (used in movie mode). */
  movie: MovieSettings;
  /** Apply a partial movie-settings change. */
  onMovieChange: (patch: Partial<MovieSettings>) => void;
  /** Open a folder picker for the movie output. */
  onPickFolder?: () => void;
  /** Disable the movie controls (a render is in flight). */
  movieDisabled?: boolean;
}

export const RenderImageTab: React.FC<RenderImageTabProps> = ({
  mode,
  commonProps,
  hiddenKeys,
  onChange,
  preset,
  sizePresets,
  onApplyPreset,
  movie,
  onMovieChange,
  onPickFolder,
  movieDisabled = false,
}) => {
  const isMovie = mode === "movie";
  const hidden = new Set(hiddenKeys ?? []);
  const outputFields = OUTPUT_FIELDS.filter((k) => !hidden.has(k));

  return (
    <div className="render-image-tab">
      <ImageSettingsPanel
        title="Size"
        commonProps={commonProps}
        onChange={onChange}
        fields={isMovie ? MOVIE_SIZE_FIELDS : STILL_SIZE_FIELDS}
        showPreset
        preset={preset}
        onApplyPreset={onApplyPreset}
        sizePresets={sizePresets}
      />

      {/* Every output toggle can be unsupported by the active backend, in
          which case the whole section is dropped rather than left empty. */}
      {outputFields.length > 0 && (
        <ImageSettingsPanel
          title="Output"
          commonProps={commonProps}
          onChange={onChange}
          fields={outputFields}
        />
      )}

      {isMovie && (
        <MovieSettingsPanel
          title="Movie"
          settings={movie}
          onChange={onMovieChange}
          onPickFolder={onPickFolder}
          disabled={movieDisabled}
        />
      )}
    </div>
  );
};
