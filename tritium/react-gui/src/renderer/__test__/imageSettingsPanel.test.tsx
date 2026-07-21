/**
 * @file __test__/imageSettingsPanel.test.tsx
 * @description Wiring contract for the bottom-pane image-size settings.
 *
 * Pins the image-size field rendering (moved here from the Render Settings
 * pane): width / height are compact plain number boxes with a unit suffix and
 * DPI is an editable combobox -- and the movie variant hides the DPI and the
 * unit selector, since movie output is pixel-based.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { mountTree } from './helpers/testHarness';

void React;

vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}));
vi.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));

import { ImageSettingsPanel } from '../components/panels/ImageSettingsPanel';
import { RENDER_COMMON_PROPS, RENDER_SIZE_PRESETS } from '../data/renderSettings';

function mount(movie = false) {
  return mountTree(
    <ImageSettingsPanel
      commonProps={RENDER_COMMON_PROPS}
      onChange={vi.fn()}
      preset="Custom"
      onApplyPreset={vi.fn()}
      sizePresets={RENDER_SIZE_PRESETS}
      movie={movie}
    />,
  );
}

describe('ImageSettingsPanel (still)', () => {
  it('renders width/height as plain number boxes (no drag, no slider)', () => {
    const { container, unmount } = mount();
    expect(container.querySelectorAll('.h3-form-numeric').length).toBe(2);
    expect(container.querySelector('.bp5-slider')).toBeNull();
    expect(container.querySelector('.h3-form-field-row.h3-form-inline')).not.toBeNull();
    unmount();
  });

  it('shows the active size unit (px) inside the width/height fields', () => {
    const { container, unmount } = mount();
    const units = Array.from(container.querySelectorAll('.h3-form-unit')).map(
      (u) => u.textContent,
    );
    expect(units.filter((u) => u === 'px').length).toBe(2);
    unmount();
  });

  it('renders DPI as an editable combobox showing the current value', () => {
    const { container, unmount } = mount();
    const combo = container.querySelector('.h3-form-combobox');
    expect(combo).not.toBeNull();
    const input = combo!.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('600');
    unmount();
  });
});

describe('ImageSettingsPanel (movie)', () => {
  it('hides DPI and the unit selector (movie output is pixel-based)', () => {
    const { container, unmount } = mount(true);
    const text = container.textContent ?? '';
    expect(text).not.toContain('Size unit');
    expect(text).not.toContain('DPI');
    // No DPI combobox in movie mode.
    expect(container.querySelector('.h3-form-combobox')).toBeNull();
    // Width / height boxes are still there.
    expect(container.querySelectorAll('.h3-form-numeric').length).toBe(2);
    unmount();
  });
});
