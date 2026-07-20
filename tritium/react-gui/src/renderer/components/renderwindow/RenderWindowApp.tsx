/**
 * @file components/renderwindow/RenderWindowApp.tsx
 * @description Root component of the modeless Rendering window.
 *
 * Layout (Allotment splits):
 *   [ image area (RenderResultPane)      | Render Settings editor ]
 *   [ RenderPanel (Start/progress/log)   |   (right pane, full height) ]
 *
 * Render settings state (useRenderSettings) lives locally in this window;
 * a Start sends the frozen snapshot to the main window over IPC
 * (useRenderWindowClient), which owns the job lifecycle and pushes job /
 * result state back.
 */

import React, { useCallback, useEffect } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";

import { RenderResultPane } from "../panes/RenderResultPane";
import { RenderPanel } from "../panels/RenderPanel";
import { MovieSettingsPanel } from "../panels/MovieSettingsPanel";
import { RenderSettingsEditor } from "../inspector/RenderSettingsEditor";
import { useRenderSettings } from "../../hooks/useRenderSettings";
import { isRenderJobActive } from "../../hooks/useRenderJob";
import { useRenderWindowClient } from "../../hooks/useRenderWindowClient";
import { RENDER_BACKEND_IDS } from "../../data/renderBackends";
import { RENDER_SIZE_PRESETS } from "../../data/renderSettings";
import { IPC } from "../../../shared/ipcChannels";
import type { RenderResult } from "../../data/renderResult";

export const RenderWindowApp: React.FC = () => {
  const client = useRenderWindowClient();
  // Umbreon is the default backend when the build supports it (forwarded from
  // the main window); otherwise fall back to the static default (POV-Ray).
  const umbreonAvailable = client.state.umbreonAvailable;
  const settings = useRenderSettings({ umbreonAvailable });
  const backendIds = umbreonAvailable
    ? RENDER_BACKEND_IDS
    : RENDER_BACKEND_IDS.filter((id) => id !== "umbreon");

  // macOS traffic-light inset for the custom title bar (hiddenInset frame),
  // mirroring App.tsx. Windows/Linux reserve overlay space in CSS instead.
  useEffect(() => {
    if (window.electronAPI?.platform === "darwin") {
      document.documentElement.style.setProperty("--titlebar-inset", "78px");
    }
  }, []);

  /** Start a render of the main window's active scene. */
  const handleStart = useCallback(() => {
    client.start(settings.getSnapshot());
  }, [client, settings]);

  /** Re-render a previous result: restore its snapshot, render its source. */
  const handleReRender = useCallback(
    (result: RenderResult) => {
      settings.restore(result.settingsSnapshot);
      client.start(result.settingsSnapshot, {
        sceneId: result.sourceSceneId,
        sceneName: result.sourceSceneName,
        viewId: result.sourceViewId,
      });
    },
    [client, settings],
  );

  /** Show the result's source scene in the main window. */
  const handleShowSourceScene = useCallback(() => {
    client.showSource();
  }, [client]);

  /** Pick the folder the movie frames are written to. */
  const handlePickFolder = useCallback(() => {
    void (async () => {
      const res = await window.electronAPI?.invoke(IPC.DIALOG_PICK_PATH, {
        title: "Choose the folder for the rendered frames",
        directory: true,
      });
      if (res && !res.canceled && res.filePath) {
        settings.updateMovie({ outputDir: res.filePath });
      }
    })();
  }, [settings]);

  /**
   * Apply an image-size preset. The "Current view" preset resolves the main
   * window's live canvas pixel size over IPC.
   */
  const handleApplyPreset = useCallback(
    (label: string) => {
      const preset = RENDER_SIZE_PRESETS.find((p) => p.label === label);
      if (preset?.dynamic) {
        void client.getViewSize().then((size) => {
          if (size) settings.applyPreset(label, size);
          else settings.applyPreset(label);
        });
        return;
      }
      settings.applyPreset(label);
    },
    [client, settings],
  );

  const { job, result, views } = client.state;
  const canRender = client.target !== null;

  return (
    <div className="render-window">
      {/* Custom title bar: drag strip matching the main window's chrome */}
      <div className="render-window-titlebar">
        <span className="render-window-titlebar-label type-group-label">
          Rendering
        </span>
      </div>
      <div className="render-window-body">
      <Allotment>
        {/* Left: image area over the render panel */}
        <Allotment.Pane minSize={320}>
          <Allotment vertical>
            <Allotment.Pane minSize={160}>
              <div className="render-window-image">
                {result ? (
                  <RenderResultPane
                    result={result}
                    onReRender={handleReRender}
                    onShowSourceScene={handleShowSourceScene}
                  />
                ) : (
                  <div className="render-window-empty type-body">
                    {canRender
                      ? `No render result yet. Press Start Render to render ${
                          client.target?.sceneName ?? "the target scene"
                        }.`
                      : "Open a scene in the main window to render."}
                  </div>
                )}
              </div>
            </Allotment.Pane>
            <Allotment.Pane minSize={120} preferredSize={200} snap>
              <RenderPanel
                job={job}
                mode={settings.mode}
                onModeChange={settings.setMode}
                movieTab={
                  <MovieSettingsPanel
                    settings={settings.movie}
                    onChange={settings.updateMovie}
                    onPickFolder={handlePickFolder}
                    disabled={isRenderJobActive(job)}
                  />
                }
                renderable={canRender}
                onStart={handleStart}
                onCancel={client.cancel}
                targetViews={views}
                targetViewId={client.targetViewId}
                onTargetChange={client.setTargetViewId}
              />
            </Allotment.Pane>
          </Allotment>
        </Allotment.Pane>

        {/* Right: Render Settings editor (always visible). The min widths
            must satisfy leftMin + settingsMin + sash <= window minWidth
            (480, windowManager.ts) so the window can actually reach its
            minimum and the render bar can get narrow enough to collapse
            its button labels. */}
        <Allotment.Pane minSize={150} preferredSize={300}>
          <div className="render-window-settings">
            <div className="render-window-settings-header type-group-label">
              Render Settings
            </div>
            <RenderSettingsEditor
              backend={settings.backend}
              backendIds={backendIds}
              commonProps={settings.commonProps}
              backendProps={settings.backendProps}
              onBackendChange={settings.setBackend}
              onChange={settings.handleChange}
              preset={settings.preset}
              onApplyPreset={handleApplyPreset}
            />
          </div>
        </Allotment.Pane>
      </Allotment>
      </div>
    </div>
  );
};
