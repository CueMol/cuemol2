/**
 * @file components/panels/RenderPanel.tsx
 * @description Render execution controls, progress and log (hosted in the
 * Rendering window's bottom pane).
 *
 * Detailed settings live in the adjacent Render Settings pane; this panel
 * owns the state-changing operations (Start / Stop), a quick image-size
 * preset, the progress bar and the render log. The optional
 * `onOpenSettings` shortcut is for hosts where the settings editor is not
 * permanently visible.
 */

import React from "react";
import { ProgressBar, type Intent } from "@blueprintjs/core";
import { SelectField, FormButton } from "../../h3-kit/form";
import { AppIcon } from "../AppIcon";
import { type RenderJob, isRenderJobActive } from "../../hooks/useRenderJob";
import { RENDER_SIZE_PRESETS } from "../../data/renderSettings";

interface RenderPanelProps {
  /** Current render job, or null when none has run yet. */
  job: RenderJob | null;
  /**
   * Whether the active content tab has a scene to render. Gates the panel's
   * render controls (Start button, image-size preset, Render Settings
   * shortcut): a non-renderable tab (Settings / welcome) disables them instead
   * of leaving controls that silently do nothing. Stop is never gated -- an
   * in-flight job stays cancellable regardless of the active tab.
   */
  renderable: boolean;
  /** Selected image-size preset label. */
  preset: string;
  /** Start a new render. */
  onStart: () => void;
  /** Cancel the active render. */
  onCancel: () => void;
  /** Apply an image-size preset. */
  onApplyPreset: (label: string) => void;
  /**
   * Open the Render Settings editor. Omit when the settings editor is
   * permanently visible next to this panel -- the button is then hidden.
   */
  onOpenSettings?: () => void;
}

/** Progress-bar intent for the job's status. */
const intentForJob = (job: RenderJob): Intent => {
  switch (job.status) {
    case "done":
      return "success";
    case "error":
      return "danger";
    case "cancelled":
      return "warning";
    default:
      return "primary";
  }
};

/** Elapsed seconds, frozen once the job finishes. */
const elapsedSec = (job: RenderJob): string =>
  (((job.finishedAt ?? Date.now()) - job.startedAt) / 1000).toFixed(1);

export const RenderPanel: React.FC<RenderPanelProps> = ({
  job,
  renderable,
  preset,
  onStart,
  onCancel,
  onApplyPreset,
  onOpenSettings,
}) => {
  const active = isRenderJobActive(job);

  return (
    <div className="render-panel">
      {/* -- Action bar -- */}
      <div className="render-panel-bar">
        {active ? (
          <FormButton
            intent="danger"
            icon={<AppIcon name="media.stop" aria-hidden />}
            text="Stop"
            onClick={onCancel}
          />
        ) : (
          <FormButton
            intent="primary"
            icon={<AppIcon name="media.play" aria-hidden />}
            text="Start Render"
            onClick={onStart}
            disabled={!renderable}
          />
        )}

        <span className="render-panel-preset">
          <span className="render-panel-preset-label type-label">Image size</span>
          <span className="render-panel-preset-select">
            <SelectField value={preset} onChange={onApplyPreset} fill disabled={!renderable}>
              {RENDER_SIZE_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </SelectField>
          </span>
        </span>

        {onOpenSettings && (
          <FormButton
            minimal
            icon={<AppIcon name="ui.settings" aria-hidden />}
            text="Render Settings"
            onClick={onOpenSettings}
            disabled={!renderable}
          />
        )}

        {job && (
          <span className="render-panel-status">
            {job.phase} · {job.progress}% · {elapsedSec(job)}s
          </span>
        )}
      </div>

      {/* -- Progress -- */}
      {job && (
        <div className="render-panel-progress">
          <ProgressBar
            value={job.progress / 100}
            intent={intentForJob(job)}
            stripes={active}
            animate={active}
          />
        </div>
      )}

      {/* -- Log -- */}
      <div className="render-panel-log">
        {job && job.log.length > 0 ? (
          job.log.map((line, i) => (
            <div className="render-log-line" key={i}>
              {line}
            </div>
          ))
        ) : (
          <div className="render-panel-empty">
            No render yet. Press Start Render to begin.
          </div>
        )}
      </div>
    </div>
  );
};
