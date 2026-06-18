/**
 * @file __test__/renderSettingsEditor.test.tsx
 * @description Wiring contract for the Inspector Render Settings editor.
 *
 * Pins two things the renderer property sections also rely on:
 *   - numeric settings use the Blender-style drag field (`DragNumericField`,
 *     `.h3-form-drag`), not the old slider-backed `NumericField`;
 *   - the width / height fields surface the active size unit as the field's
 *     unit suffix (`.h3-form-drag-unit`), so a unit change is visible inline.
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
    />,
  );
}

describe('RenderSettingsEditor numeric fields', () => {
  it('renders numeric settings as drag fields, not sliders', () => {
    const { container, unmount } = mountEditor();
    // The Image group is expanded by default, so its numeric rows are present.
    expect(container.querySelector('.h3-form-drag')).not.toBeNull();
    // The old NumericField slider must be gone.
    expect(container.querySelector('.bp5-slider')).toBeNull();
    unmount();
  });

  it('shows the active size unit (px) inside the width/height fields', () => {
    const { container, unmount } = mountEditor();
    const units = Array.from(container.querySelectorAll('.h3-form-drag-unit')).map(
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
