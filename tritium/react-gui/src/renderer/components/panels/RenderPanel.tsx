/**
 * @file components/panels/RenderPanel.tsx
 * @description BottomPanel "Render" tab — render execution controls,
 * progress and log.
 *
 * Settings live in the Inspector (`renderSettings` target); this panel owns
 * the state-changing operations: Start / Stop, the progress bar, the phase
 * label and the render log. Phase 2 is mock-driven (see `useRenderJob`).
 */

import React from "react";
import { Button, Icon, ProgressBar, type Intent } from "@blueprintjs/core";
import { type RenderJob, isRenderJobActive } from "../../hooks/useRenderJob";

interface RenderPanelProps {
  /** Current render job, or null when none has run yet. */
  job: RenderJob | null;
  /** Start a new render. */
  onStart: () => void;
  /** Cancel the active render. */
  onCancel: () => void;
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
  onStart,
  onCancel,
}) => {
  const active = isRenderJobActive(job);

  return (
    <div className="render-panel">
      {/* ── Action bar ── */}
      <div className="render-panel-bar">
        {active ? (
          <Button
            small
            intent="danger"
            className="render-action-btn"
            icon={<Icon icon="stop" size={11} />}
            text="Stop"
            onClick={onCancel}
          />
        ) : (
          <Button
            small
            intent="primary"
            className="render-action-btn"
            icon={<Icon icon="play" size={11} />}
            text="Start Render"
            onClick={onStart}
          />
        )}
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
