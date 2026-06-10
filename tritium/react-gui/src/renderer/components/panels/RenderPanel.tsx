/**
 * @file components/panels/RenderPanel.tsx
 * @description BottomPanel "Render" tab — render execution controls,
 * progress and log.
 *
 * Detailed settings live in the Inspector (`renderSettings` target); this
 * panel owns the state-changing operations (Start / Stop), a quick
 * image-size preset, a shortcut to the Inspector settings, the progress
 * bar and the render log. Phase 2/3 is mock-driven (see `useRenderJob`).
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
  /** Selected image-size preset label. */
  preset: string;
  /** Start a new render. */
  onStart: () => void;
  /** Cancel the active render. */
  onCancel: () => void;
  /** Apply an image-size preset. */
  onApplyPreset: (label: string) => void;
  /** Open the Render Settings editor in the Inspector. */
  onOpenSettings: () => void;
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
  preset,
  onStart,
  onCancel,
  onApplyPreset,
  onOpenSettings,
}) => {
  const active = isRenderJobActive(job);

  return (
    <div className="render-panel">
      {/* ── Action bar ── */}
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
          />
        )}

        <span className="render-panel-preset">
          <span className="render-panel-preset-label type-label">Image size</span>
          <span className="render-panel-preset-select">
            <SelectField value={preset} onChange={onApplyPreset} fill>
              {RENDER_SIZE_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </SelectField>
          </span>
        </span>

        <FormButton
          minimal
          icon={<AppIcon name="ui.settings" aria-hidden />}
          text="Render Settings"
          onClick={onOpenSettings}
        />

        {job && (
          <span className="render-panel-status">
            {job.phase} · {job.progress}% · {elapsedSec(job)}s
          </span>
        )}
      </div>

      {/* ── Progress ── */}
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

      {/* ── Log ── */}
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
