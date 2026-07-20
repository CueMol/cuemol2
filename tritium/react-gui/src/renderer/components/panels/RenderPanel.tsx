/**
 * @file components/panels/RenderPanel.tsx
 * @description Render execution controls, progress and log (hosted in the
 * Rendering window's bottom pane).
 *
 * Detailed settings (including image size) live in the adjacent Render
 * Settings pane; this panel owns the state-changing operations (Start / Stop),
 * the target selector, the progress bar and the render log. The optional
 * `onOpenSettings` shortcut is for hosts where the settings editor is not
 * permanently visible.
 */

import React, { useCallback, useRef, useState } from "react";
import { ProgressBar, type Intent } from "@blueprintjs/core";
import { SelectField, FormButton, SegmentField } from "../../h3-kit/form";
import { AppIcon } from "../AppIcon";
import { useCollapsibleLabels } from "../../hooks/useCollapsibleLabels";
import { type RenderJob, isRenderJobActive } from "../../hooks/useRenderJob";
import type { RenderMode } from "../../data/renderSettings";
import type { RenderTargetViewWire } from "../../../shared/ipcTypes";

/** Which detail tab the bottom pane shows. */
type RenderPanelTab = "render" | "movie";

interface RenderPanelProps {
  /** Current render job, or null when none has run yet. */
  job: RenderJob | null;
  /** Still or movie output. Gates the Movie tab. */
  mode: RenderMode;
  /** Switch the output mode. */
  onModeChange: (mode: RenderMode) => void;
  /**
   * Contents of the Movie tab. Passed in rather than built here so this panel
   * stays unaware of the movie settings themselves.
   */
  movieTab?: React.ReactNode;
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
  movieTab,
  renderable,
  onStart,
  onCancel,
  onOpenSettings,
  targetViews,
  targetViewId,
  onTargetChange,
}) => {
  const active = isRenderJobActive(job);
  const [tab, setTab] = useState<RenderPanelTab>("render");
  // The Movie tab only applies to a movie render; leaving it selected after a
  // switch back to Still would show settings that do not affect the result.
  const activeTab = mode === "movie" ? tab : "render";

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
      {/* -- Detail tabs. Movie settings share this area with the log rather
             than taking their own strip, so the result image keeps its
             height when the mode changes. -- */}
      <div className="render-panel-tabs">
        <button
          type="button"
          className={`render-panel-tab${activeTab === "render" ? " active" : ""}`}
          onClick={() => setTab("render")}
        >
          Render
        </button>
        <button
          type="button"
          className={`render-panel-tab${activeTab === "movie" ? " active" : ""}`}
          onClick={() => setTab("movie")}
          disabled={mode !== "movie"}
          title={
            mode !== "movie" ? "Switch the output to Movie to edit these" : undefined
          }
        >
          Movie
        </button>
      </div>

      <div className="render-panel-tabcontent">
        {activeTab === "movie" ? (
          movieTab
        ) : (
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
        )}
      </div>

      {/* -- Action bar. Mode, Start/Stop and progress stay outside the tabs:
             an in-flight render must remain visible and cancellable whichever
             tab is open. -- */}
      <div ref={barRef} className="render-panel-bar">
        <SegmentField<RenderMode>
          value={mode}
          onValueChange={onModeChange}
          fill={false}
          options={[
            { label: "Still", value: "still" },
            { label: "Movie", value: "movie" },
          ]}
        />

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
          <span className="render-panel-status">
            {job.phase} · {job.progress}% · {elapsedSec(job)}s
          </span>
        </div>
      )}
    </div>
  );
};
