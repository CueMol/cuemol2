/**
 * @file __test__/renderSettingsPane.test.tsx
 * @description Wiring contract for the Rendering window's Render Settings pane
 * -- the Render / Image tab split.
 *
 * Pins where each setting lives now that the bottom pane holds only the run
 * controls and the log: the Render tab keeps the backend-driven groups, and
 * the Image tab owns every "what comes out" setting (Size, Output, and the
 * Movie section while the mode is "movie"). Also pins that the Image tab hides
 * output settings the active backend does not honor, exactly as the Render tab
 * hides unsupported group props.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { mountTree } from './helpers/testHarness';

void React;

vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}));
vi.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));

import { RenderSettingsPane } from '../components/renderwindow/RenderSettingsPane';
import {
  RENDER_COMMON_PROPS,
  RENDER_SIZE_PRESETS,
  MOVIE_SIZE_PRESETS,
  DEFAULT_MOVIE_SETTINGS,
  type RenderBackendId,
  type RenderMode,
} from '../data/renderSettings';
import { RENDER_BACKENDS } from '../data/renderBackends';

function mountPane(
  opts: {
    backend?: RenderBackendId;
    mode?: RenderMode;
    movie?: Partial<typeof DEFAULT_MOVIE_SETTINGS>;
  } = {},
): ReturnType<typeof mountTree> {
  const backend = opts.backend ?? 'povray';
  const mode = opts.mode ?? 'still';
  return mountTree(
    <RenderSettingsPane
      backend={backend}
      commonProps={RENDER_COMMON_PROPS}
      backendProps={RENDER_BACKENDS[backend].props}
      onChange={vi.fn()}
      lighting="none"
      qualitySteps={{}}
      onLightingChange={vi.fn()}
      onQualityStepChange={vi.fn()}
      mode={mode}
      preset="Custom"
      sizePresets={mode === 'movie' ? MOVIE_SIZE_PRESETS : RENDER_SIZE_PRESETS}
      onApplyPreset={vi.fn()}
      movie={{ ...DEFAULT_MOVIE_SETTINGS, ...opts.movie }}
      onMovieChange={vi.fn()}
      onUseTempDir={vi.fn()}
      onPickFolder={vi.fn()}
    />,
  );
}

/** Click the tab button carrying the given label. */
function selectTab(container: HTMLElement, label: string): void {
  const btn = Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === label,
  );
  expect(btn).toBeDefined();
  act(() => btn!.click());
}

describe('RenderSettingsPane tabs', () => {
  it('opens on the Image tab: size + output, no backend groups', () => {
    const { container, unmount } = mountPane();
    const text = container.textContent ?? '';
    // Size section: preset + W x H + unit / DPI (still mode).
    expect(container.querySelector('.image-size-row')).not.toBeNull();
    expect(text).toContain('Preset');
    expect(text).toContain('Size unit');
    expect(text).toContain('DPI');
    // Output section.
    expect(text).toContain('Transparent background');
    // The Render tab's groups are not rendered at the same time.
    expect(text).not.toContain('Projection');
    unmount();
  });

  it('switches to the Render tab: backend groups, no image settings', () => {
    const { container, unmount } = mountPane();
    selectTab(container, 'Render');
    expect(container.textContent ?? '').toContain('Projection'); // Camera group
    expect(container.querySelector('.image-size-row')).toBeNull();
    unmount();
  });

  it('returns to the Image tab when Image is selected again', () => {
    const { container, unmount } = mountPane();
    selectTab(container, 'Render');
    selectTab(container, 'Image');
    expect(container.querySelector('.image-size-row')).not.toBeNull();
    expect(container.textContent ?? '').not.toContain('Projection');
    unmount();
  });
});

describe('RenderSettingsPane Image tab per mode', () => {
  it('has no Movie section in still mode', () => {
    const { container, unmount } = mountPane({ mode: 'still' });
    selectTab(container, 'Image');
    const text = container.textContent ?? '';
    expect(text).not.toContain('Base name');
    expect(text).not.toContain('Frame rate');
    unmount();
  });

  it('adds the Movie section in movie mode and drops unit / DPI', () => {
    const { container, unmount } = mountPane({ mode: 'movie' });
    selectTab(container, 'Image');
    const text = container.textContent ?? '';
    // Movie output settings moved here from the bottom pane.
    expect(text).toContain('Base name');
    expect(text).toContain('Frame rate');
    expect(text).toContain('Encode movie');
    // Movie sizes are exact pixels, so the unit / DPI pair is not offered.
    expect(text).not.toContain('Size unit');
    expect(text).not.toContain('DPI');
    // The size row itself stays.
    expect(container.querySelector('.image-size-row')).not.toBeNull();
    unmount();
  });
});

// The output folder defaults to the app-managed one so a movie render needs no
// setup; picking a folder is what makes it editable and required.
describe('RenderSettingsPane movie output location', () => {
  /** The Folder row's text input. */
  function folderInput(container: HTMLElement): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="Choose a folder for the rendered frames"]',
    );
    expect(input).not.toBeNull();
    return input!;
  }

  it('shows the temporary folder read-only, with a note about its lifetime', () => {
    const { container, unmount } = mountPane({
      mode: 'movie',
      movie: { useTempDir: true, outputDir: '/tmp/cuemol-movies/session-x' },
    });
    selectTab(container, 'Image');

    const input = folderInput(container);
    expect(input.value).toBe('/tmp/cuemol-movies/session-x');
    expect(input.readOnly).toBe(true);
    // Not flagged as missing: an unset-looking field the user never has to
    // fill is exactly what this replaces.
    expect(container.querySelector('.movie-settings-hint')).not.toBeNull();
    unmount();
  });

  it('lets a custom folder be edited and flags it while empty', () => {
    const { container, unmount } = mountPane({
      mode: 'movie',
      movie: { useTempDir: false, outputDir: '' },
    });
    selectTab(container, 'Image');

    const input = folderInput(container);
    expect(input.readOnly).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    // The temporary-folder note does not apply to a folder the user owns.
    expect(container.querySelector('.movie-settings-hint')).toBeNull();
    unmount();
  });
});

describe('RenderSettingsPane Image tab backend filtering', () => {
  it('hides output settings Umbreon does not honor', () => {
    const { container, unmount } = mountPane({ backend: 'umbreon' });
    selectTab(container, 'Image');
    const text = container.textContent ?? '';
    expect(text).toContain('Transparent background');
    expect(text).not.toContain('Post-render alpha blending');
    expect(text).not.toContain('Pixel labels');
    unmount();
  });

  it('keeps them for the POV-Ray backend', () => {
    const { container, unmount } = mountPane({ backend: 'povray' });
    selectTab(container, 'Image');
    const text = container.textContent ?? '';
    expect(text).toContain('Post-render alpha blending');
    expect(text).toContain('Pixel labels');
    unmount();
  });
});
