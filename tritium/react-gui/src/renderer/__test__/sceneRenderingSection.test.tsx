/**
 * Scene property-section wiring contract (inspector Properties tab, node
 * `type === "scene"`).
 *
 * Pins:
 *   - the registry resolves `type_name === "scene"` to the four curated
 *     sections (Ambient occlusion / Anti-aliasing / Background / Color proofing);
 *   - each row renders only when its property exists;
 *   - AO sub-controls are disabled while `aoEnabled` is off;
 *   - a numeric AO row commits a realtime single-step `onSet`;
 *   - the AA method shows friendly labels and commits the raw enum id;
 *   - the AA controls (method / jitter) are never gated on the AO flag (AA is
 *     independent of AO in the C++ frame pipeline);
 *   - the SMAA threshold row is active for smaa and disabled for other methods;
 *   - enabling colour proofing with no profile seeds the default ICC profile in
 *     one multi-write (`onSetMany`); with a profile it is a plain toggle;
 *   - PropertiesTab shows the four scene sections (no placeholder) for `scene`.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree, pressStepArrow } from './helpers/testHarness'
import type { GenericPropEntry } from '../worker/server/services/genericProps.service'

void React

// PropertiesTab -> RendererCommonSection -> MaterialRow uses useCueMol.
vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

// Stub the colour leaf so ColorField (background) renders without the
// ColorPicker / Theme context.
vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
  CueColorField: ({ value, onCommit }: { value: string; onCommit: (v: string) => void }) => (
    <button data-testid="bgcolor" onClick={() => onCommit('#ffffff')}>
      {value}
    </button>
  ),
}))

import {
  SceneAmbientOcclusionSection,
  SceneAntialiasingSection,
  SceneBackgroundSection,
  SceneColorProofingSection,
} from '../components/inspector/SceneRenderingSection'
import { getRendererPropSections } from '../components/inspector/rendererPropSections'
import { PropertiesTab } from '../components/inspector/PropertiesTab'

function entry(over: Partial<GenericPropEntry>): GenericPropEntry {
  return {
    key: '',
    type: 'string',
    value: '',
    readonly: false,
    hasdefault: false,
    isdefault: false,
    isContainer: false,
    depth: 0,
    ...over,
  } as GenericPropEntry
}

function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.h3-form-prop-row') as HTMLElement) : null
}

/** All AO/AA/background/proofing scene properties (C++ defaults), AO on. */
function fullEntries(aoOn = true): GenericPropEntry[] {
  return [
    entry({ key: 'aoEnabled', type: 'boolean', value: aoOn }),
    entry({ key: 'aoRadius', type: 'real', value: 4.0 }),
    entry({ key: 'aoIntensity', type: 'real', value: 2.2 }),
    entry({ key: 'aoSlices', type: 'integer', value: 9 }),
    entry({ key: 'aoSteps', type: 'integer', value: 3 }),
    entry({ key: 'aoHalfRes', type: 'boolean', value: false }),
    // enumdef arrives from C++ getPropsJSON in alphabetical order; the section
    // must impose the natural None/FXAA/SMAA display order itself.
    entry({ key: 'aa_method', type: 'enum', value: 'fxaa', enumdef: ['fxaa', 'none', 'smaa'] }),
    entry({ key: 'aaSmaaThreshold', type: 'real', value: 0.05 }),
    entry({ key: 'aaJitterLevel', type: 'integer', value: 0 }),
    entry({ key: 'bgcolor', type: 'object', value: '#000000' }),
    entry({ key: 'use_colproof', type: 'boolean', value: false }),
    entry({ key: 'icc_filename', type: 'string', value: '' }),
    entry({
      key: 'icc_intent',
      type: 'enum',
      value: 'perceptual',
      enumdef: ['perceptual', 'relative_colorimetric', 'saturation', 'absolute_colorimetric'],
    }),
  ]
}

describe('Scene section registry', () => {
  // The registry is keyed by the typeLabel PropertiesTab receives as
  // `rendererType` -- genericProps `typeLabelOf` returns "Scene" for a scene
  // node, NOT the lowercase tree node type.
  it('resolves the scene typeLabel "Scene" to the four curated sections', () => {
    const sections = getRendererPropSections('Scene')
    expect(sections.map((s) => s.title)).toEqual([
      'Ambient occlusion',
      'Anti-aliasing',
      'Background',
      'Color proofing',
    ])
  })
})

describe('SceneAmbientOcclusionSection', () => {
  it('renders the AO rows; Radius carries the Angstrom unit', () => {
    const { container, unmount } = mountTree(
      <SceneAmbientOcclusionSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    for (const label of ['Enabled', 'Radius', 'Intensity', 'Slices', 'Steps', 'Half resolution']) {
      expect(rowByLabel(container, label)).not.toBeNull()
    }
    expect(
      rowByLabel(container, 'Radius')!.querySelector('.h3-form-drag-unit')!.textContent,
    ).toBe('Å')
    unmount()
  })

  it('disables the AO sub-controls while aoEnabled is off', () => {
    const { container, unmount } = mountTree(
      <SceneAmbientOcclusionSection
        entries={fullEntries(false)}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    // Radius (DragNumericField) dimmed, Half resolution (switch) input disabled.
    expect(
      rowByLabel(container, 'Radius')!.querySelector('.h3-form-drag-disabled'),
    ).not.toBeNull()
    expect(
      (rowByLabel(container, 'Half resolution')!.querySelector('input') as HTMLInputElement)
        .disabled,
    ).toBe(true)
    // The Enabled toggle itself stays enabled.
    expect(
      (rowByLabel(container, 'Enabled')!.querySelector('input') as HTMLInputElement).disabled,
    ).toBe(false)
    unmount()
  })

  it('commits a realtime single-step change of Radius on the step arrow', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SceneAmbientOcclusionSection
        entries={fullEntries()}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const incr = rowByLabel(container, 'Radius')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    pressStepArrow(incr)
    // step 0.1 from 4.0 -> 4.1, committed live (preview restored to original first).
    expect(onSet).toHaveBeenCalledWith('aoRadius', 'real', 4.1, {
      mode: 'commit',
      originalValue: 4.0,
      originalWasDefault: false,
    })
    unmount()
  })
})

describe('SceneAntialiasingSection', () => {
  it('shows friendly method labels in None/FXAA/SMAA order and commits the raw enum id', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SceneAntialiasingSection
        entries={fullEntries()}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const sel = rowByLabel(container, 'Method')!.querySelector('select') as HTMLSelectElement
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(['None', 'FXAA', 'SMAA'])
    act(() => {
      sel.value = 'smaa'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSet).toHaveBeenCalledWith('aa_method', 'enum', 'smaa')
    unmount()
  })

  it('keeps the AA controls enabled while AO is off (AA is independent of AO)', () => {
    const { container, unmount } = mountTree(
      <SceneAntialiasingSection
        entries={fullEntries(false)}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const method = rowByLabel(container, 'Method')!.querySelector('select') as HTMLSelectElement
    const jitter = rowByLabel(container, 'Jitter SS')!.querySelector('select') as HTMLSelectElement
    expect(method.disabled).toBe(false)
    expect(jitter.disabled).toBe(false)
    unmount()
  })

  it('enables the SMAA threshold row for smaa and disables it for other methods', () => {
    // aa_method is fxaa (the C++ default) in fullEntries -> threshold dimmed.
    const { container, unmount } = mountTree(
      <SceneAntialiasingSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(
      rowByLabel(container, 'SMAA threshold')!.querySelector('.h3-form-drag-disabled'),
    ).not.toBeNull()
    unmount()

    const withSmaa = fullEntries().map((e) =>
      e.key === 'aa_method'
        ? entry({ key: 'aa_method', type: 'enum', value: 'smaa', enumdef: ['fxaa', 'none', 'smaa'] })
        : e,
    )
    const second = mountTree(
      <SceneAntialiasingSection
        entries={withSmaa}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(
      rowByLabel(second.container, 'SMAA threshold')!.querySelector('.h3-form-drag-disabled'),
    ).toBeNull()
    second.unmount()
  })

  it('Jitter SS is a 0-5 dropdown (not a numeric stepper) and commits a number', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SceneAntialiasingSection
        entries={fullEntries()}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const row = rowByLabel(container, 'Jitter SS')!
    // A dropdown (SelectField), not the NumericField/DragNumericField stepper.
    const sel = row.querySelector('select') as HTMLSelectElement
    expect(sel).not.toBeNull()
    expect(row.querySelector('.h3-form-numeric, .h3-form-drag')).toBeNull()
    expect(Array.from(sel.options).map((o) => [o.value, o.textContent])).toEqual([
      ['0', 'Off'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'],
    ])
    act(() => {
      sel.value = '3'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSet).toHaveBeenCalledWith('aaJitterLevel', 'integer', 3)
    unmount()
  })
})

describe('SceneBackgroundSection', () => {
  it('renders the background Color row', () => {
    const { container, unmount } = mountTree(
      <SceneBackgroundSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Color')).not.toBeNull()
    unmount()
  })
})

describe('SceneColorProofingSection', () => {
  it('seeds the default ICC profile (one multi-write) when enabled with no profile', () => {
    const onSet = vi.fn()
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <SceneColorProofingSection
        entries={fullEntries()}
        onSet={onSet}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const sw = rowByLabel(container, 'Enabled')!.querySelector('input') as HTMLInputElement
    act(() => sw.click())
    expect(onSetMany).toHaveBeenCalledWith([
      { key: 'use_colproof', valueType: 'boolean', value: true },
      { key: 'icc_filename', valueType: 'string', value: 'GenericCMYK.icm' },
    ])
    expect(onSet).not.toHaveBeenCalled()
    unmount()
  })

  it('is a plain toggle when a profile is already set', () => {
    const onSet = vi.fn()
    const onSetMany = vi.fn()
    const withProfile = fullEntries().map((e) =>
      e.key === 'icc_filename' ? entry({ key: 'icc_filename', type: 'string', value: 'p.icm' }) : e,
    )
    const { container, unmount } = mountTree(
      <SceneColorProofingSection
        entries={withProfile}
        onSet={onSet}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const sw = rowByLabel(container, 'Enabled')!.querySelector('input') as HTMLInputElement
    act(() => sw.click())
    expect(onSet).toHaveBeenCalledWith('use_colproof', 'boolean', true)
    expect(onSetMany).not.toHaveBeenCalled()
    unmount()
  })
})

describe('PropertiesTab scene dispatch', () => {
  function accordionTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
      (t) => t.textContent ?? '',
    )
  }

  it('shows the four scene sections (no placeholder) for the Scene typeLabel', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={fullEntries()}
        rendererType="Scene"
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const titles = accordionTitles(container)
    expect(titles).toContain('Ambient occlusion')
    expect(titles).toContain('Anti-aliasing')
    expect(titles).toContain('Background')
    expect(titles).toContain('Color proofing')
    expect(titles).not.toContain('Renderer settings')
    unmount()
  })
})
