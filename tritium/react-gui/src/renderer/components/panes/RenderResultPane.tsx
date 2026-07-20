/**
 * @file components/panes/RenderResultPane.tsx
 * @description Rendering-window image area for a completed render.
 *
 * Top toolbar carries the result actions (Save / Copy / Show Settings /
 * Re-render / Show Source Scene); below it a `RenderImageViewer` shows the
 * image. The settings snapshot is shown in a popover.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Button, Divider, Popover } from "@blueprintjs/core";
import { AppIcon } from "../AppIcon";
import { SliderField } from "../../h3-kit/form";
import { IPC } from "../../../shared/ipcChannels";

import { RenderImageViewer } from "./RenderImageViewer";
import type { RenderResult } from "../../data/renderResult";
import type { PropDef } from "../../data/rendererProperties";
import { RENDER_BACKENDS } from "../../data/renderBackends";

interface RenderResultPaneProps {
  /** The render result shown in this pane. */
  result: RenderResult;
  /** Re-render using this result's settings snapshot. */
  onReRender: (result: RenderResult) => void;
  /** Switch to the source scene's molview tab. */
  onShowSourceScene: (result: RenderResult) => void;
  /**
   * Open the live Render Settings editor. Omit when the editor is
   * permanently visible next to this pane -- the button is then hidden.
   */
  onOpenSettings?: () => void;
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
  onReRender,
  onShowSourceScene,
  onOpenSettings,
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

  const handleSave = useCallback(() => {
    const a = document.createElement("a");
    a.href = result.imageDataUrl;
    a.download = `${result.sourceSceneName}-${result.width}x${result.height}.png`;
    a.click();
  }, [result]);

  const handleCopy = useCallback(async () => {
    try {
      const blob = await (await fetch(result.imageDataUrl)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
    } catch (err) {
      console.warn("copy render image to clipboard failed:", err);
    }
  }, [result]);

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

  // Result actions, rendered at the start of the viewer's single toolbar
  // (icon-only buttons; label shown via the native title tooltip).
  const actions = (
    <>
      <Button
        small
        icon={<AppIcon name="ui.save" aria-hidden />}
        title="Save image"
        onClick={handleSave}
      />
      <Button
        small
        icon={<AppIcon name="ui.duplicate" aria-hidden />}
        title="Copy image to clipboard"
        onClick={handleCopy}
      />
      <Popover content={settingsPopover} placement="bottom-start">
        <Button small icon={<AppIcon name="ui.properties" aria-hidden />} title="Settings used for this render" />
      </Popover>
      <Divider />
      {onOpenSettings && (
        <Button
          small
          icon={<AppIcon name="ui.settings" aria-hidden />}
          title="Open Render Settings"
          onClick={onOpenSettings}
        />
      )}
      <Button
        small
        icon={<AppIcon name="ui.refresh" aria-hidden />}
        title="Re-render"
        onClick={() => onReRender(result)}
      />
      <Button
        small
        icon={<AppIcon name="ui.cube" aria-hidden />}
        title="Show source scene"
        onClick={() => onShowSourceScene(result)}
      />
    </>
  );

  const movie = result.movie;

  return (
    <div className="render-result-pane">
      <RenderImageViewer
        src={frameUrl ?? result.imageDataUrl}
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
