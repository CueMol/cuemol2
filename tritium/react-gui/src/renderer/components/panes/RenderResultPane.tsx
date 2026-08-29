/**
 * @file components/panes/RenderResultPane.tsx
 * @description Rendering-window image area for a completed render.
 *
 * The viewer's toolbar carries the result actions -- history Back / Forward,
 * Save, Copy, the settings-used popover, and open / reveal for an encoded
 * movie -- beside the viewer's own zoom controls.
 *
 * Save and Copy export whatever is on screen: the archived render, or the
 * frame the slider is showing. Both are file operations in the main process,
 * since the image lives on disk (see main/renderHistory.ts) and this window
 * has neither filesystem nor clipboard access.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Popover } from "@blueprintjs/core";
import { AppIcon } from "../AppIcon";
import { Tooltip } from "../../h3-kit/Tooltip";
import { SliderField } from "../../h3-kit/form";
import { IPC } from "@shared/ipcChannels";

import { RenderImageViewer } from "./RenderImageViewer";
import { useTheme } from "../../contexts/ThemeContext";
import type { RenderResult } from "../../data/renderResult";
import type { RenderImageRef } from "@shared/types/renderWindow";
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
  /**
   * Drop every past render, including the images kept in the temp directory.
   * Omit to hide the control.
   */
  onClearHistory?: () => void;
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

/**
 * Which image the export actions act on: the frame under the movie slider once
 * one is shown, else the archived render. Exported so the "export what is on
 * screen" rule can be pinned without driving the slider.
 */
export function exportImageRef(
  result: RenderResult,
  frameIndex: number | null,
): RenderImageRef {
  if (frameIndex !== null && result.movie) {
    return {
      kind: "frame",
      outputDir: result.movie.outputDir,
      baseName: result.movie.baseName,
      frameIndex,
    };
  }
  return { kind: "result", resultId: result.id };
}

/** Default file name offered by the save dialog. */
export function exportFileName(
  result: RenderResult,
  frameIndex: number | null,
): string {
  const frame =
    frameIndex !== null && result.movie ? `-frame${frameIndex + 1}` : "";
  return `${result.sourceSceneName}-${result.width}x${result.height}${frame}.png`;
}

export const RenderResultPane: React.FC<RenderResultPaneProps> = ({
  result,
  imageSrc,
  onClearHistory,
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

  const imageRef = exportImageRef(result, frameIndex);
  const saveName = exportFileName(result, frameIndex);

  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const { theme } = useTheme();

  const handleSave = useCallback(() => {
    void window.electronAPI
      ?.invoke(IPC.RENDER_IMAGE_SAVE, { ref: imageRef, defaultName: saveName })
      .then((res) => setExportError(res?.error ?? null))
      .catch((e: Error) => setExportError(e.message));
  }, [imageRef, saveName]);

  const handleCopy = useCallback(() => {
    void window.electronAPI
      ?.invoke(IPC.RENDER_IMAGE_COPY, { ref: imageRef })
      .then((res) => setExportError(res?.ok ? null : (res?.error ?? null)))
      .catch((e: Error) => setExportError(e.message));
  }, [imageRef]);

  // The movie itself, not a frame of it. With the app-managed folder as the
  // default output, this is how a finished movie is kept past the sweep.
  const handleSaveMovie = useCallback(() => {
    if (!moviePath) return;
    const ext = moviePath.slice(moviePath.lastIndexOf("."));
    void window.electronAPI
      ?.invoke(IPC.RENDER_MOVIE_SAVE, {
        moviePath,
        defaultName: `${result.sourceSceneName}${ext}`,
      })
      .then((res) => setExportError(res?.error ?? null))
      .catch((e: Error) => setExportError(e.message));
  }, [moviePath, result.sourceSceneName]);

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
      {onClearHistory && (
        <Tooltip content="Clear the render history and its temporary images">
          <Button
            small
            icon={<AppIcon name="ui.trash" aria-hidden />}
            aria-label="Clear render history"
            onClick={() => setConfirmClear(true)}
          />
        </Tooltip>
      )}
      <Tooltip content="Save the image to a file">
        <Button
          small
          icon={<AppIcon name="ui.save" aria-hidden />}
          aria-label="Save image"
          onClick={handleSave}
        />
      </Tooltip>
      <Tooltip content="Copy the image to the clipboard">
        <Button
          small
          icon={<AppIcon name="ui.duplicate" aria-hidden />}
          aria-label="Copy image to clipboard"
          onClick={handleCopy}
        />
      </Tooltip>
      <Popover content={settingsPopover} placement="bottom-start">
        {/* Tooltip nested in the Popover so the button has both (Blueprint
            merges the refs). */}
        <Tooltip content="Settings used for this render">
          <Button small icon={<AppIcon name="ui.properties" aria-hidden />} aria-label="Settings used for this render" />
        </Tooltip>
      </Popover>
      {moviePath && (
        <>
          <Tooltip content="Save the movie to a file...">
            <Button
              small
              icon={<AppIcon name="ui.saveAs" aria-hidden />}
              aria-label="Save movie as"
              onClick={handleSaveMovie}
            />
          </Tooltip>
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
        // Keyed on the result, not the shown image: a finished render arrives
        // fitted, while stepping the frame slider keeps the zoom the user set.
        fitKey={result.id}
        name={
          movie
            ? `${result.sourceSceneName} -- frame ${shownFrame + 1} / ${movie.frameCount}`
            : result.sourceSceneName
        }
        actions={actions}
      />
      {/* Clearing throws away images that cannot be re-created without
          re-rendering, so it asks first. */}
      <Alert
        isOpen={confirmClear}
        intent="danger"
        icon="trash"
        confirmButtonText="Clear"
        cancelButtonText="Cancel"
        className={theme === "dark" ? "bp5-dark" : undefined}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          onClearHistory?.();
        }}
      >
        <p>
          Discard every render in the history and delete the temporary images
          kept for them? The rendered scenes are unaffected.
        </p>
      </Alert>

      {/* A failed export is worth saying out loud: the button otherwise looks
          like it worked. */}
      <Alert
        isOpen={exportError !== null}
        intent="danger"
        icon="error"
        confirmButtonText="OK"
        className={theme === "dark" ? "bp5-dark" : undefined}
        onClose={() => setExportError(null)}
      >
        <p>{exportError}</p>
      </Alert>

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
