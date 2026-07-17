/**
 * @file __test__/renderSettingsEditor.test.tsx
 * @description Wiring contract for the Inspector Render Settings editor.
 *
 * Pins the image-size field rendering: width / height are compact plain number
 * boxes (`.h3-form-numeric`, no slider, no drag) that surface the active size
 * unit as a suffix (`.h3-form-unit`); DPI is an editable combobox.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { mountTree } from './helpers/testHarness';

void React;

// DragNumericField -> AppIcon and the editor pull nothing from useCueMol, but
// mock it defensively so an unrelated context change cannot break this test.
vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}));

// The DPI ComboBoxField reads the theme; provide it without a ThemeProvider.
vi.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));

import { RenderSettingsEditor } from '../components/inspector/RenderSettingsEditor';
import { RENDER_COMMON_PROPS } from '../data/renderSettings';
import { RENDER_BACKENDS, RENDER_BACKEND_IDS } from '../data/renderBackends';

function mountEditor() {
  return mountTree(
    <RenderSettingsEditor
      backend="povray"
      backendIds={RENDER_BACKEND_IDS}
      commonProps={RENDER_COMMON_PROPS}
      backendProps={RENDER_BACKENDS.povray.props}
      onBackendChange={vi.fn()}
      onChange={vi.fn()}
      preset="Custom"
      onApplyPreset={vi.fn()}
    />,
  );
}

describe('RenderSettingsEditor numeric fields', () => {
  it('renders width/height as plain number boxes (no drag, no slider)', () => {
    const { container, unmount } = mountEditor();
    // The Image group is expanded by default: width + height are the two plain
    // NumericField boxes there (dpi is a combobox, unit a select).
    expect(container.querySelectorAll('.h3-form-numeric').length).toBe(2);
    // Neither a slider nor a drag field backs the size boxes.
    expect(container.querySelector('.bp5-slider')).toBeNull();
    // Laid out inline (label beside the box), not the two-row stacked form.
    expect(container.querySelector('.h3-form-field-row.h3-form-inline')).not.toBeNull();
    unmount();
  });

  it('shows the active size unit (px) inside the width/height fields', () => {
    const { container, unmount } = mountEditor();
    const units = Array.from(container.querySelectorAll('.h3-form-unit')).map(
      (u) => u.textContent,
    );
    // width + height both carry the unit suffix; default unit is px.
    expect(units.filter((u) => u === 'px').length).toBe(2);
    unmount();
  });

  it('renders DPI as an editable combobox showing the current value', () => {
    const { container, unmount } = mountEditor();
    const combo = container.querySelector('.h3-form-combobox');
    expect(combo).not.toBeNull();
    const input = combo!.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('600');
    unmount();
  });
});

describe('RenderSettingsEditor backend-specific common filtering', () => {
  function mountFor(backend: 'povray' | 'umbreon') {
    return mountTree(
      <RenderSettingsEditor
        backend={backend}
        backendIds={RENDER_BACKEND_IDS}
        commonProps={RENDER_COMMON_PROPS}
        backendProps={RENDER_BACKENDS[backend].props}
        onBackendChange={vi.fn()}
        onChange={vi.fn()}
        preset="Custom"
        onApplyPreset={vi.fn()}
      />,
    );
  }

  it('hides POV-Ray-only common settings when Umbreon is active', () => {
    const { container, unmount } = mountFor('umbreon');
    // Camera group is expanded by default: Projection stays, stereo is gone.
    const text = container.textContent ?? '';
    expect(text).toContain('Projection');
    expect(text).not.toContain('Stereo mode');
    expect(text).not.toContain('Stereo depth');
    unmount();
  });

  it('keeps those common settings for the POV-Ray backend', () => {
    const { container, unmount } = mountFor('povray');
    const text = container.textContent ?? '';
    expect(text).toContain('Stereo mode');
    unmount();
  });

  it('merges into one group set (no separate "Umbreon Quality" section)', () => {
    const { container, unmount } = mountFor('umbreon');
    const text = container.textContent ?? '';
    expect(text).not.toContain('Umbreon Quality');
    // A single unified "Quality" accordion header is still present.
    expect(text).toContain('Quality');
    unmount();
  });
});
