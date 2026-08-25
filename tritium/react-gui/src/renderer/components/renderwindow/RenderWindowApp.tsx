/**
 * @file components/renderwindow/RenderWindowApp.tsx
 * @description Root component of the modeless Rendering window.
 *
 * Layout (Allotment splits):
 *   [ image area (RenderResultPane)   | Render Settings pane ]
 *   [ RenderPanel (run bar + log)     |  (right pane, full height) ]
 *
 * Every setting lives in the right pane (RenderSettingsPane: Render / Image
 * tabs); the bottom pane is the run controls (including the Backend and Target
 * dropdowns) plus the log.
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
import { RenderSettingsPane } from "./RenderSettingsPane";
import { useRenderSettings } from "../../hooks/useRenderSettings";
import { useHatchTemplate } from "../../hooks/useHatchTemplate";
import type { HatchLookEditorProps } from "../inspector/HatchLookEditor";
import { useMovieOutputPrefs } from "../../hooks/useMovieOutputPrefs";
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
  // NPR hatch layer editor: the selected style is loaded from the C++ side as
  // an editable template (through the main window's worker).
  const isNpr = settings.backend === "umbreon_npr";
  const hatchTemplate = useHatchTemplate({
    enabled: isNpr,
    style: settings.hatchStyle,
    loaded: settings.hatchLoaded,
    fetchSpec: client.getHatchStyleSpec,
    onLoaded: settings.applyHatchTemplate,
  });
  const numSetting = (key: string, def: number): number => {
    const v = Number(settings.backendProps.find((p) => p.key === key)?.value);
    return Number.isFinite(v) ? v : def;
  };
  // The fill under the marks: the Coloring pick, or the style's own base.
  const coloring = String(settings.backendProps.find((p) => p.key === "hatchColoring")?.value ?? "");
  const baseIsAlbedo =
    coloring === "Style default"
      ? settings.hatch.spec?.ink.base === "albedo"
      : coloring.includes("color fill");
  const hatchEditor: HatchLookEditorProps | undefined = isNpr
    ? {
        styleName: settings.hatchStyle,
        density: numSetting("hatchDensity", 1),
        widthScale: numSetting("hatchWidthScale", 1),
        supersample: numSetting("supersample", 3),
        env: { aoEnabled: settings.lighting === "ao", baseIsAlbedo },
        spec: settings.hatch.spec,
        dirty: settings.hatchDirty,
        status: hatchTemplate.status,
        error: hatchTemplate.error,
        onLayerChange: settings.updateHatchLayer,
        onLayerAdd: settings.addHatchLayer,
        onLayerRemove: settings.removeHatchLayer,
        onLayerDuplicate: settings.duplicateHatchLayer,
        onToneChange: settings.updateHatchTone,
        onInkChange: settings.updateHatchInk,
        onReset: settings.resetHatchToTemplate,
      }
    : undefined;
  // Default the movie output to the app-managed folder and remember the
  // settings across window closes (see hooks/useMovieOutputPrefs.ts).
  const movieOutput = useMovieOutputPrefs(settings.movie, settings.updateMovie);
  // Both umbreon-based backends (plain and NPR) ride the same in-process
  // exporter, so one availability flag gates them together.
  const backendIds = umbreonAvailable
    ? RENDER_BACKEND_IDS
    : RENDER_BACKEND_IDS.filter((id) => id !== "umbreon" && id !== "umbreon_npr");

  // Rendering > Image / Movie rendering both open this window and pin its
  // output mode. The request is a state object with a seq, so re-picking the
  // mode the window is already in still re-runs this (and re-applies that
  // mode's default size preset). setMode is read through a ref to keep the
  // effect keyed on the request alone.
  const { modeRequest } = client.state;
  const setModeRef = useRef(settings.setMode);
  setModeRef.current = settings.setMode;
  useEffect(() => {
    if (modeRequest) setModeRef.current(modeRequest.mode);
  }, [modeRequest]);

  // macOS traffic-light inset for the custom title bar (hiddenInset frame),
  // mirroring App.tsx. Windows/Linux reserve overlay space in CSS instead.
  useEffect(() => {
    if (window.electronAPI?.platform === "darwin") {
      document.documentElement.style.setProperty("--titlebar-inset", "78px");
    }
  }, []);

  /** Start a render of the main window's active scene. */
  const startRender = useCallback(() => {
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

  // Clean up: delete the intermediate frames and the output movie, after a
  // confirmation.
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const handleConfirmCleanup = useCallback(() => {
    setConfirmCleanup(false);
    void client.cleanupFrames(outputDir, baseName).then(() => refreshFrames());
  }, [client, outputDir, baseName, refreshFrames]);

  /** Pick the folder the movie frames are written to. */
  const handlePickFolder = useCallback(() => {
    void (async () => {
      const res = await window.electronAPI?.invoke(IPC.DIALOG_PICK_PATH, {
        title: "Choose the folder for the rendered frames",
        directory: true,
      });
      if (res && !res.canceled && res.filePath) {
        movieOutput.setCustomDir(res.filePath);
      }
    })();
  }, [movieOutput]);

  // A movie render clears the output folder's existing frames for this base
  // name first, so a folder the user chose is confirmed before that happens.
  // The app-managed folder is not: asking every time is exactly the setup
  // burden the temporary default removes.
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const handleStart = useCallback(() => {
    if (isMovieMode && !settings.movie.useTempDir && availFrames > 0) {
      setConfirmOverwrite(true);
      return;
    }
    startRender();
  }, [isMovieMode, settings.movie.useTempDir, availFrames, startRender]);
  const handleConfirmOverwrite = useCallback(() => {
    setConfirmOverwrite(false);
    startRender();
  }, [startRender]);

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

  const { job, views, preview, history, historyIndex } = client.state;
  const shownImage = client.shownImage;
  const jobActive = isRenderJobActive(job);
  const canRender = client.target !== null;
  // The image on screen is a history entry, so a parameter change can be
  // compared against the previous attempt instead of replacing it.
  const result = client.shownResult;

  // Step through the render history, restoring the settings that produced the
  // entry now shown -- the point of going back is to get that render's
  // parameters back, not just its picture.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const clientRef = useRef(client);
  clientRef.current = client;
  const handleBack = useCallback(() => {
    const shown = clientRef.current.goBack();
    if (shown) settingsRef.current.restore(shown.settingsSnapshot);
  }, []);
  const handleForward = useCallback(() => {
    const shown = clientRef.current.goForward();
    if (shown) settingsRef.current.restore(shown.settingsSnapshot);
  }, []);

  // Default the Camera settings to what the selected target view shows, so a
  // render starts from the projection the user is looking at. Re-read on every
  // target change; a manual edit stands until the target changes again.
  const targetViewId = client.targetViewId;
  useEffect(() => {
    if (targetViewId === null) return;
    let cancelled = false;
    void clientRef.current.getViewCamera(targetViewId).then((camera) => {
      if (!cancelled && camera) settingsRef.current.applyViewCamera(camera);
    });
    return () => {
      cancelled = true;
    };
  }, [targetViewId]);

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
                  <RenderResultPane
                    result={result}
                    imageSrc={shownImage}
                    onClearHistory={client.clearHistory}
                    onBack={handleBack}
                    onForward={handleForward}
                    canBack={historyIndex > 0}
                    canForward={historyIndex < history.length - 1}
                    historyLabel={
                      history.length > 1
                        ? `${historyIndex + 1} / ${history.length}`
                        : undefined
                    }
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
                renderable={canRender}
                onStart={handleStart}
                onCancel={client.cancel}
                onEncode={isMovieMode ? handleEncode : undefined}
                canEncode={availFrames > 0}
                onCleanup={isMovieMode ? () => setConfirmCleanup(true) : undefined}
                canCleanup={availFrames > 0}
                backend={settings.backend}
                backendIds={backendIds}
                onBackendChange={settings.setBackend}
                targetViews={views}
                targetViewId={client.targetViewId}
                onTargetChange={client.setTargetViewId}
              />
            </Allotment.Pane>
          </Allotment>
        </Allotment.Pane>

        {/* Right: Render Settings pane (always visible). The min widths
            must satisfy leftMin + settingsMin + sash <= window minWidth
            (480, windowManager.ts) so the window can actually reach its
            minimum and the render bar can get narrow enough to collapse
            its button labels. */}
        <Allotment.Pane minSize={150} preferredSize={300}>
          <RenderSettingsPane
            backend={settings.backend}
            commonProps={settings.commonProps}
            backendProps={settings.backendProps}
            onChange={settings.handleChange}
            lighting={settings.lighting}
            qualitySteps={settings.qualitySteps}
            onLightingChange={settings.setLighting}
            onQualityStepChange={settings.setQualityStep}
            mode={settings.mode}
            preset={settings.preset}
            sizePresets={sizePresets}
            onApplyPreset={handleApplyPreset}
            movie={settings.movie}
            onMovieChange={settings.updateMovie}
            onUseTempDir={movieOutput.selectTempDir}
            onUseCustomDir={movieOutput.selectCustomDir}
            onPickFolder={handlePickFolder}
            movieDisabled={jobActive}
            hatch={hatchEditor}
          />
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

      <Alert
        isOpen={confirmOverwrite}
        intent="warning"
        icon="warning-sign"
        confirmButtonText="Render"
        cancelButtonText="Cancel"
        className={theme === "dark" ? "bp5-dark" : undefined}
        onCancel={() => setConfirmOverwrite(false)}
        onConfirm={handleConfirmOverwrite}
      >
        <p>
          The output folder already holds {availFrames} frame
          {availFrames === 1 ? "" : "s"} named &quot;{baseName}&quot;. They and
          any movie encoded from them will be deleted before this render
          starts.
        </p>
      </Alert>

      <Alert
        isOpen={confirmCleanup}
        intent="danger"
        icon="trash"
        confirmButtonText="Delete"
        cancelButtonText="Cancel"
        className={theme === "dark" ? "bp5-dark" : undefined}
        onCancel={() => setConfirmCleanup(false)}
        onConfirm={handleConfirmCleanup}
      >
        <p>
          Delete the {availFrames} rendered frame
          {availFrames === 1 ? "" : "s"} and any encoded movie in the output
          folder? This cannot be undone.
        </p>
      </Alert>
    </div>
  );
};
