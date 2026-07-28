/**
 * @file components/panes/RenderResultPane.tsx
 * @description Rendering-window image area for a completed render.
 *
 * Top toolbar carries the result actions (Save / Copy / Show Settings /
 * Re-render / Show Source Scene); below it a `RenderImageViewer` shows the
 * image. The settings snapshot is shown in a popover.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Button, Popover } from "@blueprintjs/core";
import { AppIcon } from "../AppIcon";
import { Tooltip } from "../../h3-kit/Tooltip";
import { SliderField } from "../../h3-kit/form";
import { IPC } from "../../../shared/ipcChannels";

import { RenderImageViewer } from "./RenderImageViewer";
import type { RenderResult } from "../../data/renderResult";
import type { PropDef } from "../../data/rendererProperties";
import { RENDER_BACKENDS } from "../../data/renderBackends";

interface RenderResultPaneProps {
  /** The render result shown in this pane. */
  result: RenderResult;
  /**
   * The result's image, read back from the on-disk archive by the window.
   * Null while it loads, or when the file is gone (evicted past the history
   * limit, or lost with a crashed run).
   */
  imageSrc: string | null;
  /** Show the previous render (and its settings). Omit to hide the control. */
  onBack?: () => void;
  /** Show the next render. Omit to hide the control. */
  onForward?: () => void;
  /** Whether an older / newer render exists to step to. */
  canBack?: boolean;
  canForward?: boolean;
  /** Position in the history, e.g. "2 / 5"; shown beside the arrows. */
  historyLabel?: string;
}

/** Read-only list of a snapshot's property values, shown in the popover. */
const SnapshotList: React.FC<{ title: string; props: PropDef[] }> = ({
  title,
  props,
}) => (
  <div className="rr-snapshot-group">
    <div className="rr-snapshot-group-title">{title}</div>
    {props.map((p) => (
      <div className="rr-snapshot-row" key={p.key}>
        <span className="rr-snapshot-key">{p.label}</span>
        <span className="rr-snapshot-val">{String(p.value)}</span>
      </div>
    ))}
  </div>
);

export const RenderResultPane: React.FC<RenderResultPaneProps> = ({
  result,
  imageSrc,
  onBack,
  onForward,
  canBack = false,
  canForward = false,
  historyLabel,
}) => {
  // Frame slider (movie results). The sequence stays on disk and the shown
  // frame is read back through main on demand -- holding every frame in
  // memory is not viable, and result.imageDataUrl is only the last one.
  const lastFrame = result.movie ? result.movie.frameCount - 1 : 0;
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const shownFrame = frameIndex ?? lastFrame;

  // A new result starts back at its own last frame.
  useEffect(() => {
    setFrameIndex(null);
    setFrameUrl(null);
  }, [result.id]);

  const handleFrameChange = useCallback(
    (displayed: number) => {
      const movie = result.movie;
      if (!movie) return;
      const index = Math.max(
        0,
        Math.min(movie.frameCount - 1, Math.round(displayed) - 1),
      );
      setFrameIndex(index);
      void window.electronAPI
        ?.invoke(IPC.RENDER_FRAME_READ, {
          outputDir: movie.outputDir,
          baseName: movie.baseName,
          frameIndex: index,
        })
        .then((res) => setFrameUrl(res?.dataUrl ?? null))
        .catch(() => setFrameUrl(null));
    },
    [result.movie],
  );

  const settingsPopover = (
    <div className="rr-snapshot-pop">
      <div className="rr-snapshot-backend">
        Backend: {RENDER_BACKENDS[result.settingsSnapshot.backend]?.label ??
          result.settingsSnapshot.backend}
      </div>
      <SnapshotList title="Common" props={result.settingsSnapshot.commonProps} />
      <SnapshotList
        title={RENDER_BACKENDS[result.settingsSnapshot.backend]?.label ?? "Backend"}
        props={result.settingsSnapshot.backendProps}
      />
    </div>
  );

  const movie = result.movie;
  const moviePath = movie?.moviePath;

  const openMovie = useCallback(() => {
    if (moviePath) window.electronAPI?.invoke(IPC.SHELL_OPEN_PATH, { path: moviePath });
  }, [moviePath]);
  const revealMovie = useCallback(() => {
    if (moviePath) window.electronAPI?.invoke(IPC.SHELL_REVEAL_PATH, { path: moviePath });
  }, [moviePath]);

  // Result actions, rendered at the start of the viewer's single toolbar,
  // beside the viewer's own zoom controls: the settings-used popover, plus
  // open / reveal for an encoded movie.
  const actions = (
    <>
      {/* Render history: each step restores that render's image AND the
          settings that produced it, so a parameter change can be compared
          against -- and reverted to -- the previous attempt. */}
      {(onBack || onForward) && (
        <>
          <Tooltip content="Previous render (restores its settings)">
            <Button
              small
              icon={<AppIcon name="ui.caretLeft" aria-hidden />}
              aria-label="Previous render"
              onClick={onBack}
              disabled={!canBack}
            />
          </Tooltip>
          <Tooltip content="Next render (restores its settings)">
            <Button
              small
              icon={<AppIcon name="ui.caretRight" aria-hidden />}
              aria-label="Next render"
              onClick={onForward}
              disabled={!canForward}
            />
          </Tooltip>
          {historyLabel && (
            <span className="rr-history-pos type-label">{historyLabel}</span>
          )}
        </>
      )}
      <Popover content={settingsPopover} placement="bottom-start">
        {/* Tooltip nested in the Popover so the button has both (Blueprint
            merges the refs). */}
        <Tooltip content="Settings used for this render">
          <Button small icon={<AppIcon name="ui.properties" aria-hidden />} aria-label="Settings used for this render" />
        </Tooltip>
      </Popover>
      {moviePath && (
        <>
          <Tooltip content="Open the movie in the default player">
            <Button small icon={<AppIcon name="media.play" aria-hidden />} aria-label="Open movie" onClick={openMovie} />
          </Tooltip>
          <Tooltip content="Reveal the movie in the file browser">
            <Button small icon={<AppIcon name="ui.folder" aria-hidden />} aria-label="Reveal movie in file browser" onClick={revealMovie} />
          </Tooltip>
        </>
      )}
    </>
  );

  return (
    <div className="render-result-pane">
      <RenderImageViewer
        src={frameUrl ?? imageSrc ?? ""}
        imgWidth={result.width}
        imgHeight={result.height}
        name={
          movie
            ? `${result.sourceSceneName} -- frame ${shownFrame + 1} / ${movie.frameCount}`
            : result.sourceSceneName
        }
        actions={actions}
      />
      {movie && movie.frameCount > 1 && (
        <div className="render-result-frames">
          <SliderField
            label="Frame"
            value={shownFrame + 1}
            min={1}
            max={movie.frameCount}
            onCommit={handleFrameChange}
          />
        </div>
      )}
    </div>
  );
};
