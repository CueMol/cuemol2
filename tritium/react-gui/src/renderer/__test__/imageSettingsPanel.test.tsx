/**
 * @file __test__/imageSettingsPanel.test.tsx
 * @description Wiring contract for one bottom-pane image-settings column.
 *
 * The panel renders a titled column from an ordered list of Image-group keys:
 * width / height collapse to a single "Size" row, an optional preset dropdown
 * leads, and each remaining key renders its editor. The columns are composed
 * per mode in RenderWindowApp (Size | Output for still, Image | Movie for
 * movie).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { mountTree } from './helpers/testHarness';

void React;

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}));
vi.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));

import { ImageSettingsPanel } from '../components/panels/ImageSettingsPanel';
import { RENDER_COMMON_PROPS, RENDER_SIZE_PRESETS } from '../data/renderSettings';

/** The still "Size" column: preset + W x H row + unit + DPI. */
function mountSize() {
  return mountTree(
    <ImageSettingsPanel
      title="Size"
      commonProps={RENDER_COMMON_PROPS}
      onChange={vi.fn()}
      fields={['width', 'height', 'unit', 'dpi']}
      showPreset
      preset="Custom"
      onApplyPreset={vi.fn()}
      sizePresets={RENDER_SIZE_PRESETS}
    />,
  );
}

/** The movie "Image" column: preset + W x H row + output toggles, no DPI/unit. */
function mountMovieImage() {
  return mountTree(
    <ImageSettingsPanel
      title="Image"
      commonProps={RENDER_COMMON_PROPS}
      onChange={vi.fn()}
      fields={['width', 'height', 'transparentBg', 'postBlend', 'pixelLabels']}
      showPreset
      preset="QVGA (320×240)"
      onApplyPreset={vi.fn()}
      sizePresets={RENDER_SIZE_PRESETS}
    />,
  );
}

describe('ImageSettingsPanel size column', () => {
  it('renders width and height on one row as plain number boxes', () => {
    const { container, unmount } = mountSize();
    // Both size boxes are in the single "Size" row.
    const row = container.querySelector('.image-size-row');
    expect(row).not.toBeNull();
    expect(row!.querySelectorAll('.h3-form-numeric').length).toBe(2);
    // No slider / drag on the size boxes.
    expect(container.querySelector('.bp5-slider')).toBeNull();
    unmount();
  });

  it('shows the active size unit (px) on the size boxes', () => {
    const { container, unmount } = mountSize();
    const units = Array.from(container.querySelectorAll('.h3-form-unit')).map(
      (u) => u.textContent,
    );
    expect(units.filter((u) => u === 'px').length).toBe(2);
    unmount();
  });

  it('renders DPI as an editable combobox showing the current value', () => {
    const { container, unmount } = mountSize();
    const combo = container.querySelector('.h3-form-combobox');
    expect(combo).not.toBeNull();
    const input = combo!.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('600');
    unmount();
  });
});

describe('ImageSettingsPanel movie image column', () => {
  it('has the size row and output toggles but no DPI / unit', () => {
    const { container, unmount } = mountMovieImage();
    const text = container.textContent ?? '';
    expect(text).not.toContain('Size unit');
    expect(text).not.toContain('DPI');
    // No DPI combobox in the movie image column.
    expect(container.querySelector('.h3-form-combobox')).toBeNull();
    // Size row is still present.
    expect(container.querySelector('.image-size-row')).not.toBeNull();
    unmount();
  });
});
