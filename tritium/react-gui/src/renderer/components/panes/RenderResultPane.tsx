/**
 * @file components/panes/RenderResultPane.tsx
 * @description ContentArea tab body for a completed render.
 *
 * Top toolbar carries the result actions (Save / Copy / Show Settings /
 * Re-render / Show Source Scene); below it a `RenderImageViewer` shows the
 * image. The settings snapshot is shown in a popover.
 */

import React, { useCallback } from "react";
import { Button, Divider, Popover } from "@blueprintjs/core";
import { AppIcon } from "../AppIcon";

import { RenderImageViewer } from "./RenderImageViewer";
import type { RenderResult } from "../../data/renderResult";
import type { PropDef } from "../../data/rendererProperties";
import { RENDER_BACKENDS } from "../../data/renderBackends";

interface RenderResultPaneProps {
  /** The render result shown in this tab. */
  result: RenderResult;
  /** Re-render using this result's settings snapshot. */
  onReRender: (result: RenderResult) => void;
  /** Switch to the source scene's molview tab. */
  onShowSourceScene: (result: RenderResult) => void;
  /** Open the live Render Settings editor in the Inspector. */
  onOpenSettings: () => void;
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

  return (
    <div className="render-result-pane">
      {/* -- Toolbar -- icon-only buttons, label on hover (title) -- */}
      <div className="render-result-toolbar">
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
        <Button
          small
          icon={<AppIcon name="ui.settings" aria-hidden />}
          title="Open Render Settings"
          onClick={onOpenSettings}
        />
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
        <div className="render-result-info">
          {result.sourceSceneName} · {result.width}×{result.height} ·{" "}
          {result.elapsedSec.toFixed(1)}s
        </div>
      </div>

      {/* -- Image viewer -- */}
      <RenderImageViewer
        src={result.imageDataUrl}
        imgWidth={result.width}
        imgHeight={result.height}
      />
    </div>
  );
};
