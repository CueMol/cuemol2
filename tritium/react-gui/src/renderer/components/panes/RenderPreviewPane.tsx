/**
 * @file components/panes/RenderPreviewPane.tsx
 * @description Docked render preview pane, split to the right of ContentArea.
 *
 * Shows the latest completed render (single slot, see useRenderPreview) in
 * a header + body layout: the header carries the pane title and a close
 * button; the body reuses RenderResultPane. The body is keyed by the
 * result id so a new render remounts the image viewer and re-runs its
 * one-shot fit-to-container scaling.
 */

import React from "react";
import { Button } from "@blueprintjs/core";
import { AppIcon } from "../AppIcon";

import { RenderResultPane } from "./RenderResultPane";
import type { RenderResult } from "../../data/renderResult";

interface RenderPreviewPaneProps {
  /** The latest render result, or null when nothing has been rendered. */
  result: RenderResult | null;
  /** Close the pane (hides it; the result is kept). */
  onClose: () => void;
  /** Re-render using this result's settings snapshot. */
  onReRender: (result: RenderResult) => void;
  /** Switch to the source scene's molview tab. */
  onShowSourceScene: (result: RenderResult) => void;
  /** Open the live Render Settings editor in the Inspector. */
  onOpenSettings: () => void;
}

export const RenderPreviewPane: React.FC<RenderPreviewPaneProps> = ({
  result,
  onClose,
  onReRender,
  onShowSourceScene,
  onOpenSettings,
}) => {
  if (!result) return null;

  return (
    <div className="render-preview">
      {/* -- Header -- */}
      <div className="render-preview-header">
        <div className="render-preview-header-left">
          <AppIcon
            name="file.render"
            size="md"
            className="render-preview-header-icon"
            aria-hidden
          />
          <span className="render-preview-header-name">Render Preview</span>
        </div>
        <Button
          minimal
          small
          icon={<AppIcon name="ui.close" size="md" aria-hidden />}
          className="render-preview-close-btn"
          aria-label="Close render preview"
          onClick={onClose}
        />
      </div>

      {/* -- Body: keyed so a new result re-runs the viewer's one-shot fit -- */}
      <div className="render-preview-body">
        <RenderResultPane
          key={result.id}
          result={result}
          onReRender={onReRender}
          onShowSourceScene={onShowSourceScene}
          onOpenSettings={onOpenSettings}
        />
      </div>
    </div>
  );
};
