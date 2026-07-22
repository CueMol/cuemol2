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

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Allotment } from "allotment";
import { Alert } from "@blueprintjs/core";
import "allotment/dist/style.css";

import { useTheme } from "../../contexts/ThemeContext";
import { RenderResultPane } from "../panes/RenderResultPane";
import { RenderImageViewer } from "../panes/RenderImageViewer";
import { RenderPanel } from "../panels/RenderPanel";
import { ImageSettingsPanel } from "../panels/ImageSettingsPanel";
import { MovieSettingsPanel } from "../panels/MovieSettingsPanel";
import { RenderSettingsEditor } from "../inspector/RenderSettingsEditor";
import { useRenderSettings } from "../../hooks/useRenderSettings";
import { isRenderJobActive } from "../../hooks/useRenderJob";
import { useRenderWindowClient } from "../../hooks/useRenderWindowClient";
import { RENDER_BACKEND_IDS } from "../../data/renderBackends";
import { sizePresetsForMode } from "../../data/renderSettings";
import { IPC } from "../../../shared/ipcChannels";

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

  // Re-encode gate: how many contiguous frames sit in the movie output folder.
  // Re-checked when the movie output settings change and after a job settles
  // (a render just wrote frames, or an encode consumed them). Only meaningful
  // in movie mode.
  const [availFrames, setAvailFrames] = useState(0);
  const isMovieMode = settings.mode === "movie";
  const { outputDir, baseName } = settings.movie;
  const jobStatus = client.state.job?.status;
  const refreshFrames = useCallback(() => {
    if (!isMovieMode) {
      setAvailFrames(0);
      return;
    }
    void client.checkFrames(outputDir, baseName).then(setAvailFrames);
  }, [client, isMovieMode, outputDir, baseName]);
  useEffect(() => {
    refreshFrames();
  }, [refreshFrames, jobStatus]);

  /** Re-encode the frames already on disk (no rendering). */
  const handleEncode = useCallback(() => {
    if (availFrames > 0) client.encode(settings.getSnapshot(), availFrames);
  }, [client, settings, availFrames]);

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
  const sizePresets = sizePresetsForMode(settings.mode);
  const handleApplyPreset = useCallback(
    (label: string) => {
      const preset = sizePresets.find((p) => p.label === label);
      if (preset?.dynamic) {
        void client.getViewSize().then((size) => {
          if (size) settings.applyPreset(label, size);
          else settings.applyPreset(label);
        });
        return;
      }
      settings.applyPreset(label);
    },
    [client, settings, sizePresets],
  );

  const { job, result, views, preview } = client.state;
  const canRender = client.target !== null;

  // Surface a failed render / encode in a message box (the log is collapsed).
  // Keyed off the job's startedAt so each failure alerts once.
  const { theme } = useTheme();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const shownErrorRef = useRef<number>(0);
  useEffect(() => {
    if (job?.status === "error" && job.startedAt !== shownErrorRef.current) {
      shownErrorRef.current = job.startedAt;
      setErrorMsg(job.error ?? "The render failed.");
    }
  }, [job?.status, job?.startedAt, job?.error]);

  // The bottom pane's two columns are composed per mode, split so neither is
  // overloaded: still shows Size | Output, movie shows Image | Movie.
  const isMovie = settings.mode === "movie";
  const leftPanel = isMovie ? (
    <ImageSettingsPanel
      title="Image"
      commonProps={settings.commonProps}
      onChange={settings.handleChange}
      fields={["width", "height", "transparentBg", "postBlend", "pixelLabels"]}
      showPreset
      preset={settings.preset}
      onApplyPreset={handleApplyPreset}
      sizePresets={sizePresets}
    />
  ) : (
    <ImageSettingsPanel
      title="Size"
      commonProps={settings.commonProps}
      onChange={settings.handleChange}
      fields={["width", "height", "unit", "dpi"]}
      showPreset
      preset={settings.preset}
      onApplyPreset={handleApplyPreset}
      sizePresets={sizePresets}
    />
  );
  const rightPanel = isMovie ? (
    <MovieSettingsPanel
      title="Movie"
      settings={settings.movie}
      onChange={settings.updateMovie}
      onPickFolder={handlePickFolder}
      disabled={isRenderJobActive(job)}
    />
  ) : (
    <ImageSettingsPanel
      title="Output"
      commonProps={settings.commonProps}
      onChange={settings.handleChange}
      fields={["transparentBg", "postBlend", "pixelLabels"]}
    />
  );

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
                {preview ? (
                  /* A movie render in flight: show the frames as they land,
                     which is the only feedback until the job completes. */
                  <RenderImageViewer
                    src={preview.dataUrl}
                    imgWidth={preview.width}
                    imgHeight={preview.height}
                    name={`${client.target?.sceneName ?? "Scene"} -- frame ${
                      preview.frameIndex + 1
                    }`}
                  />
                ) : result ? (
                  <RenderResultPane result={result} />
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
                leftPanel={leftPanel}
                rightPanel={rightPanel}
                renderable={canRender}
                onStart={handleStart}
                onCancel={client.cancel}
                onEncode={isMovieMode ? handleEncode : undefined}
                canEncode={availFrames > 0}
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
            />
          </div>
        </Allotment.Pane>
      </Allotment>
      </div>

      <Alert
        isOpen={errorMsg !== null}
        intent="danger"
        icon="error"
        confirmButtonText="OK"
        className={theme === "dark" ? "bp5-dark" : undefined}
        onClose={() => setErrorMsg(null)}
      >
        <p>{errorMsg}</p>
      </Alert>
    </div>
  );
};
