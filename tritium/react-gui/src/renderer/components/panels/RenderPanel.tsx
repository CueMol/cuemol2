/**
 * @file components/panels/RenderPanel.tsx
 * @description Render execution controls, progress and log (hosted in the
 * Rendering window's bottom pane).
 *
 * The tab strip selects the output mode: Still renders one image, Movie
 * renders the scene's animation as a frame sequence. Below the action bar and
 * progress, the settings area is two resizable columns (leftPanel | rightPanel,
 * 1:1 by default) composed by the host; the collapsible log sits below them.
 *
 * The remaining, less-touched settings live in the adjacent Render Settings
 * pane. The optional `onOpenSettings` shortcut is for hosts where that pane is
 * not permanently visible.
 */

import React, { useCallback, useRef, useState } from "react";
import { ProgressBar, Collapse, type Intent } from "@blueprintjs/core";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
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
  /** Left settings column. Passed in so this panel stays unaware of its content. */
  leftPanel?: React.ReactNode;
  /** Right settings column (empty in still mode). */
  rightPanel?: React.ReactNode;
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
   * Re-encode the frames already on disk (movie mode). Shown only when
   * provided; enabled by `canEncode`.
   */
  onEncode?: () => void;
  /** Whether a complete frame sequence is on disk to re-encode. */
  canEncode?: boolean;
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
  leftPanel,
  rightPanel,
  renderable,
  onStart,
  onCancel,
  onEncode,
  canEncode = false,
  onOpenSettings,
  targetViews,
  targetViewId,
  onTargetChange,
}) => {
  const active = isRenderJobActive(job);
  // The log is auxiliary, so it starts collapsed; a running job's progress and
  // Stop button stay visible above it regardless.
  const [logOpen, setLogOpen] = useState(false);

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

      {/* -- Settings: two resizable columns, 1:1 by default. Start / progress
             above and the log below stay full-width, outside this split. In
             still mode the right column is empty, keeping the same shape. -- */}
      <div className="render-panel-body">
        <Allotment defaultSizes={[1, 1]}>
          <Allotment.Pane minSize={120}>
            <div className="render-panel-col">{leftPanel}</div>
          </Allotment.Pane>
          <Allotment.Pane minSize={120}>
            <div className="render-panel-col">{rightPanel}</div>
          </Allotment.Pane>
        </Allotment>
      </div>

      {/* -- Log: auxiliary, collapsed by default. -- */}
      <div className="render-panel-logsection">
        <button
          type="button"
          className="render-panel-log-toggle"
          onClick={() => setLogOpen((v) => !v)}
        >
          <AppIcon
            name={logOpen ? "ui.caretDown" : "ui.caretRight"}
            aria-hidden
          />
          <span className="type-label">Log</span>
        </button>
        <Collapse isOpen={logOpen}>
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
        </Collapse>
      </div>
    </div>
  );
};
