/**
 * @file hooks/useMovieOutputPrefs.ts
 * @description Resolve and persist the Rendering window's movie output
 * settings.
 *
 * Two jobs the settings state itself should not carry:
 *
 *  - **Default the output folder.** A still render needs no setup, so a movie
 *    render should not either. On mount this asks main for the app-managed
 *    folder of this run and points `outputDir` at it, unless the user has
 *    chosen a folder of their own.
 *  - **Remember the settings.** The Rendering window is destroyed on close,
 *    which used to lose the folder, base name, frame rate and format every
 *    time (UXP `anim-render-dlg` kept them in prefs). They are stored in
 *    UiState.movieRender and restored here.
 *
 * Kept out of useRenderSettings so that hook stays a pure state container with
 * no IPC of its own.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { IPC } from "../../shared/ipcChannels";
import type { MovieRenderPrefs } from "../../shared/ipcTypes";
import {
  DEFAULT_MOVIE_SETTINGS,
  MOVIE_FORMAT_EXT,
  type MovieFormatId,
  type MovieSettings,
} from "../data/renderSettings";

/** How long an edit rests before it is written back (base name is typed). */
const SAVE_DEBOUNCE_MS = 400;

/** Whether a persisted format id is one this build still knows. */
function knownFormat(id: string | undefined): id is MovieFormatId {
  return id !== undefined && id in MOVIE_FORMAT_EXT;
}

/**
 * Turn persisted preferences into a settings patch, dropping anything that no
 * longer applies. Values written by an older build (or hand-edited) must not
 * be able to put the panel into a state its controls cannot represent.
 */
function patchFromPrefs(prefs: MovieRenderPrefs | undefined): Partial<MovieSettings> {
  if (!prefs) return {};
  const patch: Partial<MovieSettings> = {};
  if (typeof prefs.useTempDir === "boolean") patch.useTempDir = prefs.useTempDir;
  if (typeof prefs.outputDir === "string") patch.outputDir = prefs.outputDir;
  if (typeof prefs.baseName === "string") patch.baseName = prefs.baseName;
  if (typeof prefs.fps === "number" && prefs.fps > 0) patch.fps = prefs.fps;
  if (typeof prefs.makeMovie === "boolean") patch.makeMovie = prefs.makeMovie;
  if (knownFormat(prefs.movieFormat)) patch.movieFormat = prefs.movieFormat;
  if (typeof prefs.dupLastFrame === "boolean") patch.dupLastFrame = prefs.dupLastFrame;
  if (typeof prefs.bitrateKbps === "number" && prefs.bitrateKbps > 0) {
    patch.bitrateKbps = prefs.bitrateKbps;
  }
  return patch;
}

/**
 * What is written back. The temporary folder is this run's and means nothing
 * to the next one, so only a user-picked folder is stored.
 */
function prefsFromSettings(movie: MovieSettings): MovieRenderPrefs {
  return {
    useTempDir: movie.useTempDir,
    ...(movie.useTempDir ? {} : { outputDir: movie.outputDir }),
    baseName: movie.baseName,
    fps: movie.fps,
    makeMovie: movie.makeMovie,
    movieFormat: movie.movieFormat,
    dupLastFrame: movie.dupLastFrame,
    bitrateKbps: movie.bitrateKbps,
  };
}

export interface MovieOutputPrefs {
  /** This run's app-managed output folder ("" until main answers). */
  tempDir: string;
  /** Switch the output back to the app-managed folder. */
  selectTempDir: () => void;
  /** Point the output at a folder the user picked. */
  selectCustomDir: (dir: string) => void;
}

/**
 * @param movie - current movie settings (the source of what gets persisted)
 * @param updateMovie - patch callback from useRenderSettings
 */
export function useMovieOutputPrefs(
  movie: MovieSettings,
  updateMovie: (patch: Partial<MovieSettings>) => void,
): MovieOutputPrefs {
  const [tempDir, setTempDir] = useState("");
  /** Suppress the write-back until the load has been applied. */
  const loadedRef = useRef(false);
  const updateRef = useRef(updateMovie);
  updateRef.current = updateMovie;

  // Load once: persisted preferences, plus the folder main manages for this run.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let prefs: MovieRenderPrefs | undefined;
      let dir = "";
      try {
        const [ui, res] = await Promise.all([
          window.electronAPI?.invoke(IPC.UI_LOAD),
          window.electronAPI?.invoke(IPC.RENDER_MOVIE_TEMPDIR),
        ]);
        prefs = ui?.movieRender;
        dir = res?.dir ?? "";
      } catch {
        // Electron not available (Vite dev server) -- keep the defaults.
      }
      if (cancelled) return;
      setTempDir(dir);
      const patch = patchFromPrefs(prefs);
      const useTemp = patch.useTempDir ?? DEFAULT_MOVIE_SETTINGS.useTempDir;
      // A restored custom folder wins; otherwise this run's folder, which is
      // the whole point of the default.
      if (useTemp || !patch.outputDir) {
        patch.useTempDir = true;
        patch.outputDir = dir;
      }
      updateRef.current(patch);
      loadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Write back after the edits settle. Skipped until the load has landed, so
  // the defaults cannot overwrite what was stored.
  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => {
      void window.electronAPI?.invoke(IPC.UI_SAVE, { movieRender: prefsFromSettings(movie) });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [movie]);

  const selectTempDir = useCallback(() => {
    updateRef.current({ useTempDir: true, outputDir: tempDir });
  }, [tempDir]);

  const selectCustomDir = useCallback((dir: string) => {
    updateRef.current({ useTempDir: false, outputDir: dir });
  }, []);

  return { tempDir, selectTempDir, selectCustomDir };
}
