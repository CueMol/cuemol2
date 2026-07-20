/**
 * @file components/panels/RenderPanel.tsx
 * @description Render execution controls, progress and log (hosted in the
 * Rendering window's bottom pane).
 *
 * The tab strip selects the output mode: Still renders one image, Movie
 * renders the scene's animation as a frame sequence. Both share the same
 * execution column (Start/Stop, target, progress, log); Movie adds a settings
 * column beside it, so its extra options use the horizontal space rather than
 * pushing the log out of view.
 *
 * Detailed image settings live in the adjacent Render Settings pane. The
 * optional `onOpenSettings` shortcut is for hosts where that pane is not
 * permanently visible.
 */

import React, { useCallback, useRef } from "react";
import { ProgressBar, type Intent } from "@blueprintjs/core";
import { SelectField, FormButton } from "../../h3-kit/form";
import { AppIcon } from "../AppIcon";
import { PanelTabButton } from "./PanelTabButton";
import { useCollapsibleLabels } from "../../hooks/useCollapsibleLabels";
import { type RenderJob, isRenderJobActive } from "../../hooks/useRenderJob";
import type { RenderMode } from "../../data/renderSettings";
import type { RenderTargetViewWire } from "../../../shared/ipcTypes";

interface RenderPanelProps {
  /** Current render job, or null when none has run yet. */
  job: RenderJob | null;
  /** Output mode; also the selected tab. */
  mode: RenderMode;
  /** Switch the output mode (i.e. the tab). */
  onModeChange: (mode: RenderMode) => void;
  /**
   * Movie settings column, shown beside the execution column in Movie mode.
   * Passed in rather than built here so this panel stays unaware of the
   * movie settings themselves.
   */
  moviePanel?: React.ReactNode;
  /**
   * Whether the active content tab has a scene to render. Gates the panel's
   * render controls (Start button, Render Settings shortcut): a non-renderable
   * tab (Settings / welcome) disables them instead of leaving controls that
   * silently do nothing. Stop is never gated -- an in-flight job stays
   * cancellable regardless of the active tab.
   */
  renderable: boolean;
  /** Start a new render. */
  onStart: () => void;
  /** Cancel the active render. */
  onCancel: () => void;
  /**
   * Open the Render Settings editor. Omit when the settings editor is
   * permanently visible next to this panel -- the button is then hidden.
   */
  onOpenSettings?: () => void;
  /**
   * Render targets for the Target dropdown (open molviews pushed by the
   * main window). Omit to hide the dropdown.
   */
  targetViews?: RenderTargetViewWire[];
  /** Selected render target (viewId), or null when no molview is open. */
  targetViewId?: number | null;
  /** Explicitly select a render target. */
  onTargetChange?: (viewId: number) => void;
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
  mode,
  onModeChange,
  moviePanel,
  renderable,
  onStart,
  onCancel,
  onOpenSettings,
  targetViews,
  targetViewId,
  onTargetChange,
}) => {
  const active = isRenderJobActive(job);

  const barRef = useRef<HTMLDivElement>(null);
  // Collapse toolbar labels (Start/Stop, Render Settings) to icon-only when the
  // bar is too narrow to show even their ellipsis (truncation itself is CSS).
  useCollapsibleLabels(barRef);

  const handleTargetChange = useCallback(
    (value: string) => {
      const id = Number(value);
      if (Number.isFinite(id)) onTargetChange?.(id);
    },
    [onTargetChange],
  );

  return (
    <div className="render-panel">
      {/* -- Output mode. Uses the shared panel tab strip so it matches the
             main window's bottom panel exactly. -- */}
      <div className="bottom-panel-tabs">
        <PanelTabButton<RenderMode>
          tab="still"
          activeTab={mode}
          icon="panel.render"
          label="Still"
          onClick={onModeChange}
        />
        <PanelTabButton<RenderMode>
          tab="movie"
          activeTab={mode}
          icon="panel.animation"
          label="Movie"
          onClick={onModeChange}
        />
      </div>

      <div className="render-panel-body">
        {/* -- Execution column (both modes) -- */}
        <div className="render-panel-main">
          <div ref={barRef} className="render-panel-bar">
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

            {targetViews && (
              <span className="render-panel-preset">
                <span className="render-panel-preset-label type-label">Target</span>
                <span className="render-panel-target-select">
                  <SelectField
                    value={targetViewId != null ? String(targetViewId) : ""}
                    onChange={handleTargetChange}
                    fill
                    disabled={targetViews.length === 0}
                  >
                    {targetViews.length === 0 && <option value="">(no scene)</option>}
                    {targetViews.map((v) => (
                      <option key={v.viewId} value={String(v.viewId)}>
                        {v.title}
                      </option>
                    ))}
                  </SelectField>
                </span>
              </span>
            )}

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

          {job && (
            <div className="render-panel-progress">
              {/* Whole-job progress. For a movie this spans the entire
                  sequence, so it never resets between frames. */}
              <ProgressBar
                value={job.progress / 100}
                intent={intentForJob(job)}
                stripes={active}
                animate={active}
              />
              {job.frameCount !== undefined && job.frameCount > 0 && (
                <div className="render-panel-frame-progress">
                  <span className="render-panel-frame-label type-label">
                    Frame {Math.min((job.frameIndex ?? 0) + 1, job.frameCount)} /{" "}
                    {job.frameCount}
                  </span>
                  <ProgressBar
                    value={(job.frameProgress ?? 0) / 100}
                    intent={intentForJob(job)}
                    stripes={active}
                    animate={active}
                  />
                </div>
              )}
            </div>
          )}

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

        {/* -- Movie settings column (Movie mode only) -- */}
        {mode === "movie" && moviePanel && (
          <div className="render-panel-movie">{moviePanel}</div>
        )}
      </div>
    </div>
  );
};
