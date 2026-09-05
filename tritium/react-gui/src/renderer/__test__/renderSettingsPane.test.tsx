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
import { fixtureBackendProps, fixtureProps } from '@renderer/__test__/fixtures/renderSettingsValues';
import { act } from 'react';
import { mountTree, openAccordion } from '@renderer/__test__/helpers/testHarness';

void React;

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}));
vi.mock('@renderer/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));

import { RenderSettingsPane } from '@renderer/features/render/renderwindow/RenderSettingsPane';
import {
  RENDER_COMMON_PROPS,
  RENDER_SIZE_PRESETS,
  MOVIE_SIZE_PRESETS,
  DEFAULT_MOVIE_SETTINGS,
  type RenderBackendId,
  type RenderMode,
} from '@renderer/data/renderSettings';
import { parseHatchSpec } from '@renderer/data/hatchSpec';
import type { HatchLookEditorProps } from '@renderer/features/inspector/HatchLookEditor';

function mountPane(
  opts: {
    backend?: RenderBackendId;
    mode?: RenderMode;
    movie?: Partial<typeof DEFAULT_MOVIE_SETTINGS>;
    onUseTempDir?: () => void;
    onUseCustomDir?: () => void;
    hatch?: HatchLookEditorProps;
  } = {},
): ReturnType<typeof mountTree> {
  const backend = opts.backend ?? 'povray';
  const mode = opts.mode ?? 'still';
  return mountTree(
    <RenderSettingsPane
      backend={backend}
      commonProps={fixtureProps(RENDER_COMMON_PROPS)}
      backendProps={fixtureBackendProps(backend)}
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
      onUseTempDir={opts.onUseTempDir ?? vi.fn()}
      onUseCustomDir={opts.onUseCustomDir ?? vi.fn()}
      onPickFolder={vi.fn()}
      hatch={opts.hatch}
    />,
  );
}

/** Props of the NPR hatch layer editor with a three-layer template. */
function hatchProps(over: Partial<HatchLookEditorProps> = {}): HatchLookEditorProps {
  return {
    styleName: 'richardson',
    density: 1,
    widthScale: 1,
    supersample: 3,
    env: { aoEnabled: false, baseIsAlbedo: false },
    spec: parseHatchSpec('layer: kind=line\nlayer: kind=dot\nlayer: kind=stipple\ntone: strength=1'),
    dirty: false,
    status: 'ready',
    error: null,
    onLayerChange: vi.fn(),
    onLayerAdd: vi.fn(),
    onLayerRemove: vi.fn(),
    onLayerDuplicate: vi.fn(),
    onToneChange: vi.fn(),
    onInkChange: vi.fn(),
    onReset: vi.fn(),
    ...over,
  };
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

// The pane is titled and switched with the same chrome as the main window's
// Inspector. Pinned by class because that IS the mechanism: the roles carry
// the height, typography and strip padding, so a pane that stops using them
// silently drifts away from the Inspector again.
describe('RenderSettingsPane chrome', () => {
  it('titles the pane with the shared panel-header role', () => {
    const { container, unmount } = mountPane();
    const header = container.querySelector('.render-window-settings-header');
    expect(header?.classList.contains('panel-header')).toBe(true);
    const name = header?.querySelector('.panel-header-name');
    expect(name?.textContent).toBe('Render Settings');
    expect(name?.classList.contains('type-panel-title')).toBe(true);
    unmount();
  });

  it('puts the tab strip in the shared mode-bar role', () => {
    const { container, unmount } = mountPane();
    const bar = container.querySelector('.render-window-settings-tabbar');
    expect(bar?.classList.contains('mode-bar')).toBe(true);
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

  /** The Location radio carrying the given value. */
  function locationRadio(container: HTMLElement, value: string): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>(
      `.h3-form-radio-group input[type="radio"][value="${value}"]`,
    );
    expect(input, `no Location radio for ${value}`).not.toBeNull();
    return input!;
  }

  // A radio group, not a segmented control: a segmented control inside the
  // settings section reads as a second row of tabs under the Image / Render
  // strip, which is what the pane header already uses.
  it('offers the location as a radio group, not a segmented control', () => {
    const onUseTempDir = vi.fn();
    const onUseCustomDir = vi.fn();
    const { container, unmount } = mountPane({
      mode: 'movie',
      movie: { useTempDir: true, outputDir: '/tmp/cuemol-movies/session-x' },
      onUseTempDir,
      onUseCustomDir,
    });
    selectTab(container, 'Image');

    // No "Temporary" / "Custom" tab-like buttons anywhere in the pane.
    const labels = Array.from(container.querySelectorAll('button')).map((b) =>
      (b.textContent ?? '').trim(),
    );
    expect(labels).not.toContain('Custom');

    expect(locationRadio(container, 'temp').checked).toBe(true);
    // Choosing Custom only leaves the app-managed folder; naming one is the
    // browse button's job, so no dialog is opened from here.
    act(() => locationRadio(container, 'custom').click());
    expect(onUseCustomDir).toHaveBeenCalledTimes(1);
    expect(onUseTempDir).not.toHaveBeenCalled();
    unmount();
  });

  it('switches back to the app-managed folder when Temporary is picked', () => {
    const onUseTempDir = vi.fn();
    const { container, unmount } = mountPane({
      mode: 'movie',
      movie: { useTempDir: false, outputDir: '/Users/me/renders' },
      onUseTempDir,
    });
    selectTab(container, 'Image');

    expect(locationRadio(container, 'custom').checked).toBe(true);
    act(() => locationRadio(container, 'temp').click());
    expect(onUseTempDir).toHaveBeenCalledTimes(1);
    unmount();
  });

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

// The NPR hatch layer editor is its own "Detail" tab: the Render tab keeps
// the style pick and its multipliers, the tab holds the loaded style's layers
// (as rows), Strength / Curve as the only always-visible shading controls,
// and the template actions. The tab exists only with the editor props (NPR).
describe('RenderSettingsPane Detail tab', () => {
  const tabLabels = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.mode-bar button')).map((b) => (b.textContent ?? '').trim());

  it('offers the tab only with the editor props', () => {
    const plain = mountPane({ backend: 'umbreon_npr' });
    expect(tabLabels(plain.container)).not.toContain('Detail');
    plain.unmount();
    const withEditor = mountPane({ backend: 'umbreon_npr', hatch: hatchProps() });
    expect(tabLabels(withEditor.container)).toContain('Detail');
    withEditor.unmount();
  });

  it('shows the layers and the shading section on the tab, not on the Render tab', () => {
    const { container, unmount } = mountPane({ backend: 'umbreon_npr', hatch: hatchProps() });
    selectTab(container, 'Render');
    expect(container.querySelectorAll('.hatch-layer').length).toBe(0);
    expect(container.textContent ?? '').toContain('Style');
    selectTab(container, 'Detail');
    const text = container.textContent ?? '';
    expect(text).toContain('Style template: richardson');
    expect(text).toContain('Layers');
    expect(text).toContain('Shading');
    expect(container.querySelectorAll('.hatch-layer').length).toBe(3);
    // Strength / Curve stay visible; the rest waits under Advanced.
    expect(text).toContain('Strength');
    expect(text).toContain('Curve');
    expect(text).not.toContain('Contour darkening');
    // Line rows show the width, dot rows the dot scale.
    expect(text).toContain('Width');
    expect(text).toContain('Dot scale');
    unmount();
  });

  it('wires the add button and gates Reset on an edited look', () => {
    const props = hatchProps();
    const { container, unmount } = mountPane({ backend: 'umbreon_npr', hatch: props });
    selectTab(container, 'Detail');
    const buttons = Array.from(container.querySelectorAll('button'));
    const addLine = buttons.find((b) => (b.textContent ?? '').trim() === 'Line');
    expect(addLine).toBeDefined();
    act(() => { addLine!.click(); });
    expect(props.onLayerAdd).toHaveBeenCalledWith('line');
    const reset = buttons.find((b) => (b.textContent ?? '').includes('Reset to style')) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    unmount();
    const edited = mountPane({ backend: 'umbreon_npr', hatch: hatchProps({ dirty: true }) });
    selectTab(edited.container, 'Detail');
    const reset2 = Array.from(edited.container.querySelectorAll('button'))
      .find((b) => (b.textContent ?? '').includes('Reset to style')) as HTMLButtonElement;
    expect(reset2.disabled).toBe(false);
    expect(edited.container.textContent ?? '').toContain('Edited');
    edited.unmount();
  });

  it('shows the Render tab multipliers as effective values, only when they are not 1', () => {
    const neutral = mountPane({ backend: 'umbreon_npr', hatch: hatchProps() });
    selectTab(neutral.container, 'Detail');
    expect(neutral.container.textContent ?? '').not.toContain('Render tab multipliers');
    expect(neutral.container.querySelectorAll('.hatch-effective').length).toBe(0);
    neutral.unmount();
    const scaled = mountPane({
      backend: 'umbreon_npr',
      hatch: hatchProps({
        density: 2,
        widthScale: 1.5,
        spec: parseHatchSpec('layer: kind=line,spacing=10,width=1\nlayer: kind=dot,spacing=5,dotscale=2'),
      }),
    });
    selectTab(scaled.container, 'Detail');
    const text = scaled.container.textContent ?? '';
    expect(text).toContain('Mark density x2, Mark width x1.5');
    // Pitch / density, line width and dot scale * width scale.
    expect(text).toContain('effective 5 px at Mark density x2');
    expect(text).toContain('effective 1.5 px at Mark width x1.5');
    expect(text).toContain('effective 3 at Mark width x1.5');
    scaled.unmount();
  });

  it('hides fields a layer kind ignores and flags a pitch pinned at the minimum', () => {
    const { container, unmount } = mountPane({
      backend: 'umbreon_npr',
      hatch: hatchProps({
        supersample: 3,
        spec: parseHatchSpec('layer: kind=stipple,spacing=0.5'),
      }),
    });
    selectTab(container, 'Detail');
    openAccordion(container, 'Randomness / Advanced');
    const text = container.textContent ?? '';
    expect(text).toContain('Shape exponent');
    expect(text).not.toContain('Nesting levels');
    expect(text).not.toContain('Merge to solid');
    // 0.5 px * ss 3 = 1.5 px on the ink grid: below the 2 px minimum.
    expect(text).toContain('minimum pitch');
    unmount();
  });

  it('shows the load status while the template is missing', () => {
    const { container, unmount } = mountPane({
      backend: 'umbreon_npr',
      hatch: hatchProps({ spec: null, status: 'error', error: 'unknown hatch style: x' }),
    });
    selectTab(container, 'Detail');
    expect(container.textContent ?? '').toContain('unknown hatch style: x');
    expect(container.querySelectorAll('.hatch-layer').length).toBe(0);
    unmount();
  });
});
