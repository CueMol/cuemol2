/**
 * @file components/panels/RenderPanel.tsx
 * @description Render execution controls, progress and log (hosted in the
 * Rendering window's bottom pane).
 *
 * The tab strip selects the output mode: Still renders one image, Movie
 * renders the scene's animation as a frame sequence. Below it sits the run bar
 * -- Start / Stop, the movie-only actions, and the two "what is rendered by
 * what" dropdowns (Backend, Target) -- then the job progress. Everything below
 * that is the log, which fills the rest of the pane.
 *
 * The settings themselves live in the adjacent Render Settings pane (Render /
 * Image tabs). The optional `onOpenSettings` shortcut is for hosts where that
 * pane is not permanently visible.
 */

import React, { useCallback, useRef } from "react";
import { ProgressBar, type Intent } from "@blueprintjs/core";
import { SelectField, FormButton } from "../../h3-kit/form";
import { AppIcon } from "../AppIcon";
import { PanelTabButton } from "./PanelTabButton";
import { useCollapsibleLabels } from "../../hooks/useCollapsibleLabels";
import { type RenderJob, isRenderJobActive } from "../../hooks/useRenderJob";
import type { RenderBackendId, RenderMode } from "../../data/renderSettings";
import { RENDER_BACKENDS } from "../../data/renderBackends";
import type { RenderTargetViewWire } from "../../../shared/ipcTypes";

interface RenderPanelProps {
  /** Current render job, or null when none has run yet. */
  job: RenderJob | null;
  /** Output mode; also the selected tab. */
  mode: RenderMode;
  /** Switch the output mode (i.e. the tab). */
  onModeChange: (mode: RenderMode) => void;
  /**
   * Whether the active content tab has a scene to render. Gates the panel's
   * render controls (Start button, Render Settings shortcut): a non-renderable
   * state (Settings tab, or no open tab) disables them instead of leaving controls that
   * silently do nothing. Stop is never gated -- an in-flight job stays
   * cancellable regardless of the active tab.
   */
  renderable: boolean;
  /** Start a new render. */
  onStart: () => void;
  /** Cancel the active render. */
  onCancel: () => void;
  /**
   * Re-encode the frames already on disk (movie mode). Shown only when
   * provided; enabled by `canEncode`.
   */
  onEncode?: () => void;
  /** Whether a complete frame sequence is on disk to re-encode. */
  canEncode?: boolean;
  /**
   * Delete the intermediate frames and the output movie (movie mode). Shown
   * only when provided; enabled by `canCleanup`.
   */
  onCleanup?: () => void;
  /** Whether there are frames / a movie on disk to delete. */
  canCleanup?: boolean;
  /**
   * Open the Render Settings editor. Omit when the settings editor is
   * permanently visible next to this panel -- the button is then hidden.
   */
  onOpenSettings?: () => void;
  /**
   * Selected rendering backend. Shown next to the target because the pair
   * answers "render what, with what"; the backend's own settings stay in the
   * Render Settings pane. Omit (with `backendIds`) to hide the dropdown.
   */
  backend?: RenderBackendId;
  /** Backend ids available in the selector. */
  backendIds?: RenderBackendId[];
  /** Called when the user picks a different backend. */
  onBackendChange?: (id: RenderBackendId) => void;
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
  renderable,
  onStart,
  onCancel,
  onEncode,
  canEncode = false,
  onCleanup,
  canCleanup = false,
  onOpenSettings,
  backend,
  backendIds,
  onBackendChange,
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

  const handleBackendChange = useCallback(
    (value: string) => {
      onBackendChange?.(value as RenderBackendId);
    },
    [onBackendChange],
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

      {/* -- Action bar + progress. Kept above the settings and the log so a
             running job stays visible and cancellable. -- */}
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

        {/* Movie mode: re-encode the frames already on disk into a movie,
            without re-rendering. Enabled only when a complete frame sequence
            is present. */}
        {!active && onEncode && (
          <FormButton
            icon={<AppIcon name="file.render" aria-hidden />}
            text="Re-encode"
            onClick={onEncode}
            disabled={!canEncode}
            title={
              canEncode
                ? "Re-encode the rendered frames into a movie (no re-rendering)"
                : "No complete frame sequence found in the output folder"
            }
          />
        )}

        {/* Movie mode: delete the intermediate frames and the output movie. */}
        {!active && onCleanup && (
          <FormButton
            icon={<AppIcon name="ui.trash" aria-hidden />}
            text="Clean up"
            onClick={onCleanup}
            disabled={!canCleanup}
            title={
              canCleanup
                ? "Delete the rendered frames and the output movie"
                : "Nothing to clean up in the output folder"
            }
          />
        )}

        {backend && backendIds && backendIds.length > 0 && (
          <span className="render-panel-preset">
            <span className="render-panel-preset-label type-label">Backend</span>
            <span className="render-panel-backend-select">
              <SelectField value={backend} onChange={handleBackendChange} fill>
                {backendIds.map((id) => (
                  <option key={id} value={id}>
                    {RENDER_BACKENDS[id].label}
                  </option>
                ))}
              </SelectField>
            </span>
          </span>
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
          {/* Whole-job progress. For a movie this spans the entire sequence,
              so it never resets between frames. */}
          <ProgressBar
            value={job.progress / 100}
            intent={intentForJob(job)}
            stripes={active}
            animate={active}
          />
        </div>
      )}

      {/* -- Log: the whole area below the run bar, so a long job's output is
             readable without a disclosure step (the pane itself is
             resizable / snappable when the log is not wanted). -- */}
      <div className="render-panel-logsection">
        <div className="render-panel-log-header type-label">Log</div>
        <div className="render-panel-log">
          {job && job.log.length > 0 ? (
            job.log.map((line, i) => (
              <div className="render-log-line" key={i}>
                {line}
              </div>
            ))
          ) : (
            <div className="render-panel-empty">No render log yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};
