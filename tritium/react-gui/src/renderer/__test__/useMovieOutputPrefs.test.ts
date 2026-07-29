/**
 * @file __test__/useMovieOutputPrefs.test.ts
 * @description Contract for the Rendering window's movie output defaults and
 * their persistence.
 *
 * Two behaviours the user feels directly: a movie render must be startable
 * without configuring anything (so the output folder resolves to the
 * app-managed one on mount), and the settings must survive the window being
 * closed (so they are written back to UiState). The temporary folder belongs
 * to one app run, so it is deliberately not among the values written back.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, useCallback, useState } from 'react';
import {
  makeRenderHook,
  setupElectronAPI,
  teardownElectronAPI,
  flushPromises,
} from './helpers/testHarness';
import { IPC } from '../../shared/ipcChannels';
import type { MovieRenderPrefs } from '../../shared/ipcTypes';
import { useMovieOutputPrefs } from '../hooks/useMovieOutputPrefs';
import { DEFAULT_MOVIE_SETTINGS, type MovieSettings } from '../data/renderSettings';

const TEMP_DIR = '/tmp/cuemol-movies/session-abc';

let api: Record<string, ReturnType<typeof vi.fn>>;

/**
 * Mount the hook over movie settings held in state, the way RenderWindowApp
 * wires it to useRenderSettings.
 */
function mountHook(initial: Partial<MovieSettings> = {}) {
  return makeRenderHook(() => {
    const [movie, setMovie] = useState<MovieSettings>({
      ...DEFAULT_MOVIE_SETTINGS,
      ...initial,
    });
    const updateMovie = useCallback(
      (patch: Partial<MovieSettings>) => setMovie((prev) => ({ ...prev, ...patch })),
      [],
    );
    return { prefs: useMovieOutputPrefs(movie, updateMovie), movie };
  });
}

/** Route UI_LOAD / RENDER_MOVIE_TEMPDIR; everything else resolves undefined. */
function routeInvoke(prefs?: MovieRenderPrefs, dir: string = TEMP_DIR): void {
  api = setupElectronAPI({
    invoke: vi.fn((channel: string) => {
      if (channel === IPC.UI_LOAD) return Promise.resolve({ movieRender: prefs });
      if (channel === IPC.RENDER_MOVIE_TEMPDIR) return Promise.resolve({ dir });
      return Promise.resolve(undefined);
    }),
  }) as Record<string, ReturnType<typeof vi.fn>>;
}

/** The payload of the last UI_SAVE, or undefined when none was sent. */
function lastSavedPrefs(): MovieRenderPrefs | undefined {
  const call = api.invoke.mock.calls
    .filter((c) => c[0] === IPC.UI_SAVE)
    .pop();
  return (call?.[1] as { movieRender?: MovieRenderPrefs } | undefined)?.movieRender;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  teardownElectronAPI();
  vi.restoreAllMocks();
});

describe('useMovieOutputPrefs', () => {
  it('resolves the output folder to the app-managed one on mount', async () => {
    routeInvoke();
    const handle = mountHook();

    await flushPromises();

    expect(handle.result.prefs.tempDir).toBe(TEMP_DIR);
    expect(handle.result.movie.useTempDir).toBe(true);
    expect(handle.result.movie.outputDir).toBe(TEMP_DIR);
    handle.unmount();
  });

  it('restores a persisted custom folder instead of the temporary one', async () => {
    routeInvoke({ useTempDir: false, outputDir: '/Users/me/renders', baseName: 'spin' });
    const handle = mountHook();

    await flushPromises();

    expect(handle.result.movie.useTempDir).toBe(false);
    expect(handle.result.movie.outputDir).toBe('/Users/me/renders');
    expect(handle.result.movie.baseName).toBe('spin');
    handle.unmount();
  });

  it('falls back to the temporary folder when the stored custom one is blank', async () => {
    routeInvoke({ useTempDir: false, outputDir: '' });
    const handle = mountHook();

    await flushPromises();

    expect(handle.result.movie.useTempDir).toBe(true);
    expect(handle.result.movie.outputDir).toBe(TEMP_DIR);
    handle.unmount();
  });

  it('ignores a stored format this build no longer knows', async () => {
    routeInvoke({ movieFormat: 'avi_h264', fps: 60 });
    const handle = mountHook();

    await flushPromises();

    expect(handle.result.movie.movieFormat).toBe(DEFAULT_MOVIE_SETTINGS.movieFormat);
    expect(handle.result.movie.fps).toBe(60);
    handle.unmount();
  });

  it('writes the settings back, without this run\'s temporary folder', async () => {
    routeInvoke();
    const handle = mountHook({ baseName: 'spin', fps: 60 });

    await flushPromises();
    act(() => vi.advanceTimersByTime(1000));

    const saved = lastSavedPrefs();
    expect(saved).toBeDefined();
    expect(saved!.useTempDir).toBe(true);
    expect(saved!.baseName).toBe('spin');
    expect(saved!.fps).toBe(60);
    // The temporary folder belongs to this run only; storing it would point
    // the next run at a swept path.
    expect(saved!.outputDir).toBeUndefined();
    handle.unmount();
  });

  it('stores a custom folder so the next window opens on it', async () => {
    routeInvoke();
    const handle = mountHook();
    await flushPromises();

    act(() => handle.result.prefs.selectCustomDir('/Users/me/renders'));
    act(() => vi.advanceTimersByTime(1000));

    expect(handle.result.movie.useTempDir).toBe(false);
    expect(lastSavedPrefs()?.outputDir).toBe('/Users/me/renders');
    handle.unmount();
  });

  it('goes back to the app-managed folder on demand', async () => {
    routeInvoke({ useTempDir: false, outputDir: '/Users/me/renders' });
    const handle = mountHook();
    await flushPromises();

    act(() => handle.result.prefs.selectTempDir());

    expect(handle.result.movie.useTempDir).toBe(true);
    expect(handle.result.movie.outputDir).toBe(TEMP_DIR);
    handle.unmount();
  });

  it('does not write anything before the stored settings have loaded', async () => {
    routeInvoke({ baseName: 'spin' });
    const handle = mountHook();

    // Timers fire, but the load has not resolved yet: a write here would
    // persist the defaults over what is stored.
    act(() => vi.advanceTimersByTime(1000));
    expect(lastSavedPrefs()).toBeUndefined();

    await flushPromises();
    handle.unmount();
  });
});
