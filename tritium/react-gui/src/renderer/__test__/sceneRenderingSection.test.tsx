/**
 * Scene property-section wiring contract (inspector Properties tab, node
 * `type === "scene"`).
 *
 * Pins:
 *   - the registry resolves `type_name === "scene"` to the four curated
 *     sections (Ambient occlusion / Anti-aliasing / Background / Color proofing);
 *   - the AO/AA sections are preset-only: AO renders Enabled + Preset, AA
 *     renders Quality, and none of the individual tuning knobs (radius /
 *     intensity / slices / steps / half-res / method / jitter /
 *     aaSmaaThreshold) gets a row (they live in the generic property tree);
 *   - the AO Preset / AA Quality dropdowns derive their step from the live
 *     values (default entries read Low / Standard, never Custom), apply a
 *     step as ONE `onSetMany` multi-write, offer Custom only while true, and
 *     ignore props outside their patch (aoSlices);
 *   - the AO Preset is disabled while AO is off; the AA Quality is not (AA is
 *     independent of AO in the C++ frame pipeline);
 *   - enabling colour proofing with no profile seeds the default ICC profile in
 *     one multi-write (`onSetMany`); with a profile it is a plain toggle;
 *   - PropertiesTab shows the four scene sections (no placeholder) for `scene`.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
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
import {
  SCENE_AO_PRESET_AXIS,
  SCENE_AA_QUALITY_AXIS,
  sceneStepOf,
} from '../data/sceneQualityPresets'
import { RENDER_QUALITY_CUSTOM } from '../data/renderSettings'
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
  it('renders Enabled + Preset only; the tuning knobs have no rows', () => {
    const { container, unmount } = mountTree(
      <SceneAmbientOcclusionSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Enabled')).not.toBeNull()
    expect(rowByLabel(container, 'Preset')).not.toBeNull()
    // The individual knobs live in the generic property tree, not here.
    for (const label of ['Radius', 'Intensity', 'Slices', 'Steps', 'Half resolution']) {
      expect(rowByLabel(container, label)).toBeNull()
    }
    expect(container.querySelectorAll('.h3-form-prop-row').length).toBe(2)
    unmount()
  })

  it('keeps the Enabled toggle active while AO is off', () => {
    const { container, unmount } = mountTree(
      <SceneAmbientOcclusionSection
        entries={fullEntries(false)}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(
      (rowByLabel(container, 'Enabled')!.querySelector('input') as HTMLInputElement).disabled,
    ).toBe(false)
    unmount()
  })
})

describe('SceneAntialiasingSection', () => {
  it('renders the Quality dropdown only; method / jitter / threshold have no rows', () => {
    const { container, unmount } = mountTree(
      <SceneAntialiasingSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Quality')).not.toBeNull()
    for (const label of ['Method', 'Jitter SS', 'SMAA threshold']) {
      expect(rowByLabel(container, label)).toBeNull()
    }
    expect(container.querySelectorAll('.h3-form-prop-row').length).toBe(1)
    unmount()
  })
})

describe('Scene quality presets', () => {
  const read = (entries: GenericPropEntry[]) => (k: string) =>
    entries.find((e) => e.key === k)?.value

  it('every step of an axis writes the same key set', () => {
    for (const axis of [SCENE_AO_PRESET_AXIS, SCENE_AA_QUALITY_AXIS]) {
      const keys = Object.keys(axis.steps[0].patch).sort()
      for (const step of axis.steps) {
        expect(Object.keys(step.patch).sort()).toEqual(keys)
      }
    }
  })

  it('the default steps match the C++ defaults (a fresh scene is not Custom)', () => {
    expect(sceneStepOf(SCENE_AO_PRESET_AXIS, read(fullEntries()))).toBe('low')
    expect(sceneStepOf(SCENE_AA_QUALITY_AXIS, read(fullEntries()))).toBe('standard')
  })

  it('sceneStepOf tolerates float round-trip noise (epsilon compare)', () => {
    const entries = fullEntries().map((e) =>
      e.key === 'aoIntensity'
        ? entry({ key: 'aoIntensity', type: 'real', value: 2.2000000001 })
        : e,
    )
    expect(sceneStepOf(SCENE_AO_PRESET_AXIS, read(entries))).toBe('low')
  })

  // The costlier AO rungs take the adaptive half-resolution path so tumbling
  // stays responsive; Low stays full-res (and must, to match the C++ default).
  it('AO presets drive aoHalfRes: off on Low, on from Medium up', () => {
    const halfResOf = (id: string) =>
      SCENE_AO_PRESET_AXIS.steps.find((s) => s.id === id)?.patch.aoHalfRes
    expect(halfResOf('low')).toBe(false)
    expect(halfResOf('medium')).toBe(true)
    expect(halfResOf('high')).toBe(true)
  })

  it('a scene with Medium values but half-res off reads Custom', () => {
    const entries = fullEntries().map((e) => {
      if (e.key === 'aoRadius') return entry({ key: 'aoRadius', type: 'real', value: 8 })
      if (e.key === 'aoSteps') return entry({ key: 'aoSteps', type: 'integer', value: 4 })
      if (e.key === 'aoIntensity') return entry({ key: 'aoIntensity', type: 'real', value: 1.9 })
      return e
    })
    expect(sceneStepOf(SCENE_AO_PRESET_AXIS, read(entries))).toBe(RENDER_QUALITY_CUSTOM)
    const withHalfRes = entries.map((e) =>
      e.key === 'aoHalfRes' ? entry({ key: 'aoHalfRes', type: 'boolean', value: true }) : e,
    )
    expect(sceneStepOf(SCENE_AO_PRESET_AXIS, read(withHalfRes))).toBe('medium')
  })

  it('editing a prop outside the patch (aoSlices) keeps the AO preset step', () => {
    const entries = fullEntries().map((e) =>
      e.key === 'aoSlices' ? entry({ key: 'aoSlices', type: 'integer', value: 12 }) : e,
    )
    expect(sceneStepOf(SCENE_AO_PRESET_AXIS, read(entries))).toBe('low')
  })

  it('AO Preset reads "low" on defaults and applies a step as one multi-write', () => {
    const onSet = vi.fn()
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <SceneAmbientOcclusionSection
        entries={fullEntries()}
        onSet={onSet}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const sel = rowByLabel(container, 'Preset')!.querySelector('select') as HTMLSelectElement
    expect(sel.value).toBe('low')
    // Custom is only offered while it is the truth -- not on a step.
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['low', 'medium', 'high'])
    act(() => {
      sel.value = 'medium'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSetMany).toHaveBeenCalledTimes(1)
    expect(onSetMany).toHaveBeenCalledWith([
      { key: 'aoRadius', valueType: 'real', value: 8 },
      { key: 'aoSteps', valueType: 'integer', value: 4 },
      { key: 'aoIntensity', valueType: 'real', value: 1.9 },
      { key: 'aoHalfRes', valueType: 'boolean', value: true },
    ])
    expect(onSet).not.toHaveBeenCalled()
    unmount()
  })

  it('AO Preset reads Custom (offered only then) after a patched prop was edited', () => {
    const entries = fullEntries().map((e) =>
      e.key === 'aoRadius' ? entry({ key: 'aoRadius', type: 'real', value: 6.0 }) : e,
    )
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <SceneAmbientOcclusionSection
        entries={entries}
        onSet={vi.fn()}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const sel = rowByLabel(container, 'Preset')!.querySelector('select') as HTMLSelectElement
    expect(sel.value).toBe('custom')
    expect(Array.from(sel.options).map((o) => o.value)).toEqual([
      'low', 'medium', 'high', 'custom',
    ])
    // Re-picking "custom" is a read-back state, not an applicable choice.
    act(() => {
      sel.value = 'custom'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSetMany).not.toHaveBeenCalled()
    unmount()
  })

  it('disables the AO Preset while AO is off; the AA Quality stays enabled', () => {
    const ao = mountTree(
      <SceneAmbientOcclusionSection
        entries={fullEntries(false)}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(
      (rowByLabel(ao.container, 'Preset')!.querySelector('select') as HTMLSelectElement).disabled,
    ).toBe(true)
    ao.unmount()

    const aa = mountTree(
      <SceneAntialiasingSection
        entries={fullEntries(false)}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(
      (rowByLabel(aa.container, 'Quality')!.querySelector('select') as HTMLSelectElement).disabled,
    ).toBe(false)
    aa.unmount()
  })

  it('AA Quality reads "standard" on defaults and applies a step as one multi-write', () => {
    const onSet = vi.fn()
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <SceneAntialiasingSection
        entries={fullEntries()}
        onSet={onSet}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const sel = rowByLabel(container, 'Quality')!.querySelector('select') as HTMLSelectElement
    expect(sel.value).toBe('standard')
    act(() => {
      sel.value = 'ultra'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSetMany).toHaveBeenCalledTimes(1)
    expect(onSetMany).toHaveBeenCalledWith([
      { key: 'aa_method', valueType: 'enum', value: 'fxaa' },
      { key: 'aaJitterLevel', valueType: 'integer', value: 5 },
    ])
    expect(onSet).not.toHaveBeenCalled()
    unmount()
  })

  it('AA Quality reads Custom when SMAA is picked in the Method row', () => {
    const entries = fullEntries().map((e) =>
      e.key === 'aa_method'
        ? entry({ key: 'aa_method', type: 'enum', value: 'smaa', enumdef: ['fxaa', 'none', 'smaa'] })
        : e,
    )
    const { container, unmount } = mountTree(
      <SceneAntialiasingSection
        entries={entries}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(
      (rowByLabel(container, 'Quality')!.querySelector('select') as HTMLSelectElement).value,
    ).toBe('custom')
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
