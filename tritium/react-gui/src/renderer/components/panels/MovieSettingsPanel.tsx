/**
 * @file components/panels/MovieSettingsPanel.tsx
 * @description Movie output settings, shown in the Rendering window's bottom
 * pane (Movie tab) while the render mode is "movie".
 *
 * These settings belong to the render *mode*, not to a backend: they apply
 * unchanged to POV-Ray and Umbreon alike. Keeping them out of the Render
 * Settings editor keeps that editor to the backend-driven groups, and lets
 * this panel do things the generic PropDef editor cannot -- a folder picker,
 * and disabling the format / bit rate while encoding is off.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Collapse } from "@blueprintjs/core";

import {
  Field,
  FieldSection,
  TextField,
  SelectField,
  SwitchField,
  ComboBoxField,
  FormButton,
} from "../../h3-kit/form";
import { AppIcon } from "../AppIcon";
import {
  MOVIE_FORMAT_IDS,
  MOVIE_FORMAT_LABEL,
  MOVIE_FPS_PRESETS,
  MOVIE_BITRATE_PRESETS,
  type MovieSettings,
  type MovieFormatId,
} from "../../data/renderSettings";

interface MovieSettingsPanelProps {
  /** Current movie settings. */
  settings: MovieSettings;
  /** Apply a partial change. */
  onChange: (patch: Partial<MovieSettings>) => void;
  /** Open a folder picker. Omit to hide the browse button. */
  onPickFolder?: () => void;
  /** Disable every control (a render is in flight). */
  disabled?: boolean;
}

/** Parse a positive number, or undefined when the text is not one. */
function positiveNumber(text: string): number | undefined {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export const MovieSettingsPanel: React.FC<MovieSettingsPanelProps> = ({
  settings,
  onChange,
  onPickFolder,
  disabled = false,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Numeric fields keep a draft string so an intermediate empty value while
  // editing (e.g. after deleting the last digit) is not snapped back by the
  // committed number. The draft re-syncs whenever the committed value changes.
  const [fpsDraft, setFpsDraft] = useState(String(settings.fps));
  const [bitrateDraft, setBitrateDraft] = useState(String(settings.bitrateKbps));
  useEffect(() => setFpsDraft(String(settings.fps)), [settings.fps]);
  useEffect(() => setBitrateDraft(String(settings.bitrateKbps)), [settings.bitrateKbps]);

  const handleFps = useCallback(
    (text: string) => {
      setFpsDraft(text);
      const fps = positiveNumber(text);
      if (fps !== undefined) onChange({ fps });
    },
    [onChange],
  );

  const handleBitrate = useCallback(
    (text: string) => {
      setBitrateDraft(text);
      const bitrateKbps = positiveNumber(text);
      if (bitrateKbps !== undefined) onChange({ bitrateKbps });
    },
    [onChange],
  );

  // Encoding options only matter when a movie is actually produced.
  const encodeDisabled = disabled || !settings.makeMovie;

  return (
    <div className="movie-settings-panel">
      <FieldSection title="Output">
        <Field label="Folder">
          <TextField
            value={settings.outputDir}
            onChange={(outputDir) => onChange({ outputDir })}
            placeholder="Choose a folder for the rendered frames"
            disabled={disabled}
            invalid={settings.outputDir.trim() === ""}
            rightElement={
              onPickFolder && (
                <FormButton
                  minimal
                  icon={<AppIcon name="toolbar.openFile" aria-hidden />}
                  aria-label="Choose output folder"
                  onClick={onPickFolder}
                  disabled={disabled}
                />
              )
            }
          />
        </Field>

        <Field label="Base name">
          <TextField
            value={settings.baseName}
            onChange={(baseName) => onChange({ baseName })}
            placeholder="movie"
            disabled={disabled}
          />
        </Field>

        <Field label="Frame rate">
          <ComboBoxField
            value={fpsDraft}
            onChange={handleFps}
            options={MOVIE_FPS_PRESETS.map(String)}
            disabled={disabled}
          />
        </Field>
      </FieldSection>

      <FieldSection title="Movie">
        <Field label="Encode movie" inline>
          <SwitchField
            checked={settings.makeMovie}
            onChange={(makeMovie) => onChange({ makeMovie })}
            disabled={disabled}
          />
        </Field>

        <Field label="Format">
          <SelectField
            value={settings.movieFormat}
            onChange={(v) => onChange({ movieFormat: v as MovieFormatId })}
            disabled={encodeDisabled}
          >
            {MOVIE_FORMAT_IDS.map((id) => (
              <option key={id} value={id}>
                {MOVIE_FORMAT_LABEL[id]}
              </option>
            ))}
          </SelectField>
        </Field>
      </FieldSection>

      <FormButton
        minimal
        icon={
          <AppIcon
            name={advancedOpen ? "ui.caretDown" : "ui.caretRight"}
            aria-hidden
          />
        }
        text="Advanced"
        onClick={() => setAdvancedOpen((v) => !v)}
      />
      <Collapse isOpen={advancedOpen}>
        <FieldSection>
          <Field label="Render last frame" inline>
            <SwitchField
              checked={settings.dupLastFrame}
              onChange={(dupLastFrame) => onChange({ dupLastFrame })}
              disabled={disabled}
            />
          </Field>
          <Field label="Bit rate (kbps)">
            <ComboBoxField
              value={bitrateDraft}
              onChange={handleBitrate}
              options={MOVIE_BITRATE_PRESETS.map(String)}
              disabled={encodeDisabled}
            />
          </Field>
        </FieldSection>
      </Collapse>
    </div>
  );
};
