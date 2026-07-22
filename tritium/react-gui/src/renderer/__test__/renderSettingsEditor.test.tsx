/**
 * @file __test__/renderSettingsEditor.test.tsx
 * @description Wiring contract for the Rendering window's Render Settings pane.
 *
 * Image-size settings live in the bottom pane now (see imageSettingsPanel test),
 * so this pane must NOT render them: it shows the backend selector and the
 * backend-driven groups (Camera / Quality / Edges / POV-Ray), with the common
 * settings filtered per backend.
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

function mountFor(backend: 'povray' | 'umbreon') {
  return mountTree(
    <RenderSettingsEditor
      backend={backend}
      backendIds={RENDER_BACKEND_IDS}
      commonProps={RENDER_COMMON_PROPS}
      backendProps={RENDER_BACKENDS[backend].props}
      onBackendChange={vi.fn()}
      onChange={vi.fn()}
    />,
  );
}

describe('RenderSettingsEditor excludes image-size settings', () => {
  it('does not render the Image group (it lives in the bottom pane)', () => {
    const { container, unmount } = mountFor('povray');
    const text = container.textContent ?? '';
    // The Image-only labels are absent here.
    expect(text).not.toContain('Size unit');
    expect(text).not.toContain('DPI');
    // ... and the size number boxes are not rendered by this pane.
    expect(container.querySelectorAll('.h3-form-numeric').length).toBe(0);
    unmount();
  });
});

describe('RenderSettingsEditor backend-specific common filtering', () => {
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
