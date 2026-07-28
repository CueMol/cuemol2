/**
 * @file __test__/renderSettingsEditor.test.tsx
 * @description Wiring contract for the "Render" tab of the Rendering window's
 * settings pane.
 *
 * This tab shows only the backend-driven groups (Camera / Quality / Edges /
 * POV-Ray), with the common settings filtered per backend. Image settings live
 * in the sibling Image tab (see renderSettingsPane test) and the backend
 * selector in the run bar (see renderPanel test), so neither belongs here.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
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
import {
  RENDER_COMMON_PROPS,
  type RenderLightingMode,
} from '../data/renderSettings';
import { RENDER_BACKENDS } from '../data/renderBackends';

function mountFor(
  backend: 'povray' | 'umbreon',
  opts: { lighting?: RenderLightingMode } = {},
) {
  return mountTree(
    <RenderSettingsEditor
      backend={backend}
      commonProps={RENDER_COMMON_PROPS}
      backendProps={RENDER_BACKENDS[backend].props}
      onChange={vi.fn()}
      lighting={opts.lighting ?? 'none'}
      qualitySteps={{}}
      onLightingChange={vi.fn()}
      onQualityStepChange={vi.fn()}
    />,
  );
}

describe('RenderSettingsEditor excludes image and backend selection', () => {
  it('does not render the Image group (it lives in the Image tab)', () => {
    const { container, unmount } = mountFor('povray');
    const text = container.textContent ?? '';
    // The Image-only labels are absent here.
    expect(text).not.toContain('Size unit');
    expect(text).not.toContain('DPI');
    // ... and the size number boxes are not rendered by this tab.
    expect(container.querySelectorAll('.h3-form-numeric').length).toBe(0);
    unmount();
  });

  it('does not render the backend selector (it lives in the run bar)', () => {
    const { container, unmount } = mountFor('povray');
    expect(container.textContent ?? '').not.toContain('Backend');
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

describe('RenderSettingsEditor quality section', () => {
  /** All <select> elements of the Quality section, in document order. */
  function qualitySelects(container: HTMLElement): HTMLSelectElement[] {
    return Array.from(
      container.querySelectorAll('.insp-render-quality select'),
    ) as HTMLSelectElement[];
  }

  /** The label text of every row in the Quality section. */
  function qualityLabels(container: HTMLElement): string[] {
    return Array.from(
      container.querySelectorAll('.insp-render-quality .h3-form-field-label'),
    ).map((l) => (l.textContent ?? '').trim());
  }

  it('shows the Lighting selector and one dropdown per applicable axis', () => {
    const { container, unmount } = mountFor('umbreon', { lighting: 'gi' });
    // The method-independent axes plus the GI axis; the AO axis does not apply.
    expect(qualityLabels(container)).toEqual([
      'Lighting',
      'Supersampling',
      'GI quality',
      'Shadows',
    ]);
    const [lightingSel, aaSel] = qualitySelects(container);
    expect(Array.from(lightingSel.options).map((o) => o.value)).toEqual([
      'none',
      'ao',
      'gi',
    ]);
    // Supersampling is a dropdown of ladder steps, not a free number box.
    expect(Array.from(aaSel.options).map((o) => o.value)).toEqual([
      'low',
      'medium',
      'high',
      'ultra',
      'custom',
    ]);
    unmount();
  });

  it('swaps the depth-cue axis with the method', () => {
    const { container, unmount } = mountFor('umbreon', { lighting: 'ao' });
    expect(qualityLabels(container)).toContain('AO quality');
    expect(qualityLabels(container)).not.toContain('GI quality');
    unmount();
  });

  it('offers no depth-cue axis for Raytrace only', () => {
    const { container, unmount } = mountFor('umbreon', { lighting: 'none' });
    // The shared axes stay -- they are independent of the depth cue.
    expect(qualityLabels(container)).toEqual([
      'Lighting',
      'Supersampling',
      'Shadows',
    ]);
    unmount();
  });

  it('reports the picked method and the axis step separately', () => {
    const onLightingChange = vi.fn();
    const onQualityStepChange = vi.fn();
    const { container, unmount } = mountTree(
      <RenderSettingsEditor
        backend="umbreon"
        commonProps={RENDER_COMMON_PROPS}
        backendProps={RENDER_BACKENDS.umbreon.props}
        onChange={vi.fn()}
        lighting="gi"
        qualitySteps={{ aa: 'medium', gi: 'medium', shadows: 'off' }}
        onLightingChange={onLightingChange}
        onQualityStepChange={onQualityStepChange}
      />,
    );
    const [lightingSel, aaSel, , shadowSel] = qualitySelects(container);
    act(() => {
      lightingSel.value = 'ao';
      lightingSel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onLightingChange).toHaveBeenCalledWith('ao');
    act(() => {
      aaSel.value = 'ultra';
      aaSel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onQualityStepChange).toHaveBeenCalledWith('aa', 'ultra');
    act(() => {
      shadowSel.value = 'soft';
      shadowSel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onQualityStepChange).toHaveBeenCalledWith('shadows', 'soft');
    unmount();
  });

  /**
   * Accordion group headers. The method names also appear as Lighting
   * dropdown options, so group visibility must be read from the headers.
   */
  function groupHeaders(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.insp-accordion-header')).map(
      (h) => (h.textContent ?? '').trim(),
    );
  }

  it('shows only the selected method group and hides the switches it owns', () => {
    const { container, unmount } = mountFor('umbreon', { lighting: 'gi' });
    const groups = groupHeaders(container);
    expect(groups).toContain('Global Illumination');
    expect(groups).not.toContain('Ambient Occlusion');
    // The Lighting dropdown owns these, so the raw switches are not repeated.
    const text = container.textContent ?? '';
    expect(text).not.toContain('Enable AO');
    expect(text).not.toContain('Enable GI');
    unmount();
  });

  it('hides both method groups while no depth cue is selected', () => {
    const { container, unmount } = mountFor('umbreon', { lighting: 'none' });
    const groups = groupHeaders(container);
    expect(groups).not.toContain('Ambient Occlusion');
    expect(groups).not.toContain('Global Illumination');
    // Method-independent groups stay.
    expect(groups).toContain('Shadows');
    unmount();
  });

  it('has no quality section for a backend without a preset table', () => {
    const { container, unmount } = mountFor('povray');
    expect(container.querySelector('.insp-render-quality')).toBeNull();
    unmount();
  });
});
