/**
 * AtomIntrRenderer property-section wiring contract.
 *
 * Pins the observable behaviour of the `atomintr` renderer's inspector page
 * migrated from the UXP `atomintr-propdlg` "Interaction" tab. The page is
 * composed from four registry sections (Interaction / Dashed line / 3D tube /
 * Value label).
 *
 * The pins:
 *   - the registry resolves `type_name === "atomintr"` to the four sections in
 *     order, all expanded;
 *   - each row renders only when its property exists;
 *   - the Width unit follows the mode (Angstrom while fancy, pixels while
 *     simple);
 *   - the "Dashed" toggle is synthetic: it reads dashed-ness from the stipple
 *     values and rewrites all six in one `onSetMany` call (on -> a single
 *     dash/gap pair, off -> all -1); the per-segment fields are disabled while
 *     the line is solid;
 *   - 3D tube controls are disabled while mode is simple, and the arrow size
 *     fields are disabled unless a cap is "arrow";
 *   - label font controls are disabled while showlabel is off;
 *   - PropertiesTab shows the four sections with no "Renderer settings"
 *     placeholder for `atomintr`.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import type { GenericPropEntry } from '../worker/server/services/genericProps.service'

void React

// PropertiesTab -> RendererCommonSection -> MaterialRow uses useCueMol.
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

// Stub the colour leaf so ColorField renders without the ColorPicker context.
vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
  CueColorField: ({ value, onCommit, disabled }: any) => (
    <button
      data-testid="color"
      data-disabled={String(!!disabled)}
      onClick={() => onCommit('red')}
    >
      {value}
    </button>
  ),
}))

import {
  AtomIntrMainSection,
  AtomIntrDashedSection,
  AtomIntrTubeSection,
  AtomIntrLabelSection,
} from '../components/inspector/AtomIntrRendererSection'
import {
  getRendererPropSections,
  RENDERER_SECTION_REGISTRY,
} from '../components/inspector/rendererPropSections'
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

/** Set a controlled input's value via the native setter, then fire `input`. */
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Find the PropertyField row whose label text matches. */
function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.h3-form-prop-row') as HTMLElement) : null
}

/** Full atomintr property list at C++ defaults. */
function fullEntries(over: Record<string, GenericPropEntry> = {}): GenericPropEntry[] {
  const base: Record<string, GenericPropEntry> = {
    mode: entry({ key: 'mode', type: 'enum', value: 'fancy', enumdef: ['simple', 'fancy'] }),
    showlabel: entry({ key: 'showlabel', type: 'boolean', value: false }),
    width: entry({ key: 'width', type: 'real', value: 0.1 }),
    color: entry({ key: 'color', type: 'object<AbstractColor>', value: 'rgb(255,255,0)' }),
    stipple0: entry({ key: 'stipple0', type: 'real', value: 1 }),
    stipple1: entry({ key: 'stipple1', type: 'real', value: 1 }),
    stipple2: entry({ key: 'stipple2', type: 'real', value: -1 }),
    stipple3: entry({ key: 'stipple3', type: 'real', value: -1 }),
    stipple4: entry({ key: 'stipple4', type: 'real', value: -1 }),
    stipple5: entry({ key: 'stipple5', type: 'real', value: -1 }),
    detail: entry({ key: 'detail', type: 'integer', value: 5 }),
    captype_start: entry({
      key: 'captype_start',
      type: 'enum',
      value: 'sphere',
      enumdef: ['flat', 'sphere', 'arrow'],
    }),
    captype_end: entry({
      key: 'captype_end',
      type: 'enum',
      value: 'sphere',
      enumdef: ['flat', 'sphere', 'arrow'],
    }),
    arrowheight: entry({ key: 'arrowheight', type: 'real', value: 1.0 }),
    arrowwidth: entry({ key: 'arrowwidth', type: 'real', value: 2.0 }),
    font_size: entry({ key: 'font_size', type: 'real', value: 12.0 }),
    font_name: entry({ key: 'font_name', type: 'string', value: 'sans-serif' }),
    font_style: entry({ key: 'font_style', type: 'string', value: 'normal' }),
    font_weight: entry({ key: 'font_weight', type: 'string', value: 'normal' }),
  }
  return Object.values({ ...base, ...over })
}

describe('AtomIntrRenderer section registry', () => {
  it('resolves type_name "atomintr" to the four sections in order', () => {
    const sections = getRendererPropSections('atomintr')
    expect(sections.map((s) => s.title)).toEqual([
      'Interaction',
      'Dashed line',
      '3D tube',
      'Value label',
    ])
    expect(sections.every((s) => s.defaultExpanded)).toBe(true)
    expect(sections[0].Component).toBe(AtomIntrMainSection)
    expect(sections[1].Component).toBe(AtomIntrDashedSection)
    expect(sections[2].Component).toBe(AtomIntrTubeSection)
    expect(sections[3].Component).toBe(AtomIntrLabelSection)
    expect(RENDERER_SECTION_REGISTRY.atomintr).toBe(sections)
  })
})

describe('AtomIntrMainSection', () => {
  it('renders mode, width, color and show-label rows', () => {
    const { container, unmount } = mountTree(
      <AtomIntrMainSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Mode')).not.toBeNull()
    expect(rowByLabel(container, 'Width')).not.toBeNull()
    expect(rowByLabel(container, 'Color')).not.toBeNull()
    expect(rowByLabel(container, 'Show label')).not.toBeNull()
    unmount()
  })

  it('shows the Angstrom width unit while fancy and pixels while simple', () => {
    const fancy = mountTree(
      <AtomIntrMainSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(
      rowByLabel(fancy.container, 'Width')!.querySelector('.h3-form-drag-unit')!.textContent,
    ).toBe('Å')
    fancy.unmount()

    const simple = mountTree(
      <AtomIntrMainSection
        entries={fullEntries({
          mode: entry({ key: 'mode', type: 'enum', value: 'simple', enumdef: ['simple', 'fancy'] }),
        })}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(
      rowByLabel(simple.container, 'Width')!.querySelector('.h3-form-drag-unit')!.textContent,
    ).toBe('px')
    simple.unmount()
  })

  it('commits a friendly-labelled mode change as the raw enum id', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <AtomIntrMainSection
        entries={fullEntries()}
        onSet={onSet}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const select = rowByLabel(container, 'Mode')!.querySelector('select') as HTMLSelectElement
    // Friendly labels, raw values.
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['Simple line', '3D tube'])
    act(() => {
      select.value = 'simple'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSet).toHaveBeenCalledWith('mode', 'enum', 'simple')
    unmount()
  })
})

describe('AtomIntrDashedSection', () => {
  it('renders the Dashed toggle and six compact stipple cells with dash/gap captions', () => {
    const { container, unmount } = mountTree(
      <AtomIntrDashedSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    // Six compact number cells in one row.
    const cells = container.querySelectorAll('.atomintr-stipple-row .h3-form-number-cell')
    expect(cells).toHaveLength(6)
    // Captions alternate dash / gap.
    const captions = Array.from(
      container.querySelectorAll('.atomintr-stipple-caption'),
    ).map((c) => c.textContent)
    expect(captions).toEqual(['dash', 'gap', 'dash', 'gap', 'dash', 'gap'])
    // The synthetic Dashed toggle is a plain Field.
    const dashedLabel = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
      (l) => l.textContent === 'Dashed',
    )
    expect(dashedLabel).not.toBeUndefined()
    unmount()
  })

  it('shows blank cells for unused (negative) segments and the value otherwise', () => {
    const { container, unmount } = mountTree(
      <AtomIntrDashedSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const cells = Array.from(
      container.querySelectorAll('.atomintr-stipple-row .h3-form-number-cell'),
    ) as HTMLInputElement[]
    // stipple0=1, stipple1=1, stipple2..5 = -1 -> blank.
    expect(cells.map((c) => c.value)).toEqual(['1', '1', '', '', '', ''])
    unmount()
  })

  it('disables the stipple cells while the line is solid', () => {
    const off = fullEntries({
      stipple0: entry({ key: 'stipple0', type: 'real', value: -1 }),
      stipple1: entry({ key: 'stipple1', type: 'real', value: -1 }),
    })
    const { container, unmount } = mountTree(
      <AtomIntrDashedSection
        entries={off}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const toggle = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(toggle.checked).toBe(false)
    const cells = Array.from(
      container.querySelectorAll('.atomintr-stipple-row .h3-form-number-cell'),
    ) as HTMLInputElement[]
    expect(cells.every((c) => c.disabled)).toBe(true)
    unmount()
  })

  it('commits an edited stipple cell as a parsed number, blank as -1', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <AtomIntrDashedSection
        entries={fullEntries()}
        onSet={onSet}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const cells = Array.from(
      container.querySelectorAll('.atomintr-stipple-row .h3-form-number-cell'),
    ) as HTMLInputElement[]
    // Type a value into the third cell (stipple2, currently -1 -> blank).
    act(() => typeInto(cells[2], '0.5'))
    act(() =>
      cells[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    )
    expect(onSet).toHaveBeenCalledWith('stipple2', 'real', 0.5)
    unmount()
  })

  it('turning Dashed off rewrites all six stipples to -1 in one onSetMany', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <AtomIntrDashedSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const toggle = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    act(() => toggle.click())
    expect(onSetMany).toHaveBeenCalledTimes(1)
    expect(onSetMany.mock.calls[0][0]).toEqual([
      { key: 'stipple0', valueType: 'real', value: -1 },
      { key: 'stipple1', valueType: 'real', value: -1 },
      { key: 'stipple2', valueType: 'real', value: -1 },
      { key: 'stipple3', valueType: 'real', value: -1 },
      { key: 'stipple4', valueType: 'real', value: -1 },
      { key: 'stipple5', valueType: 'real', value: -1 },
    ])
    unmount()
  })

  it('turning Dashed on restores a single dash/gap pair in one onSetMany', () => {
    const onSetMany = vi.fn()
    const solid = fullEntries({
      stipple0: entry({ key: 'stipple0', type: 'real', value: -1 }),
      stipple1: entry({ key: 'stipple1', type: 'real', value: -1 }),
    })
    const { container, unmount } = mountTree(
      <AtomIntrDashedSection
        entries={solid}
        onSet={vi.fn()}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const toggle = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    act(() => toggle.click())
    expect(onSetMany.mock.calls[0][0]).toEqual([
      { key: 'stipple0', valueType: 'real', value: 1 },
      { key: 'stipple1', valueType: 'real', value: 1 },
      { key: 'stipple2', valueType: 'real', value: -1 },
      { key: 'stipple3', valueType: 'real', value: -1 },
      { key: 'stipple4', valueType: 'real', value: -1 },
      { key: 'stipple5', valueType: 'real', value: -1 },
    ])
    unmount()
  })

  it('renders nothing when no stipple property is present', () => {
    const { container, unmount } = mountTree(
      <AtomIntrDashedSection
        entries={[entry({ key: 'width', type: 'real', value: 0.1 })]}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    unmount()
  })
})

describe('AtomIntrTubeSection', () => {
  it('disables detail and cap controls while mode is simple', () => {
    const { container, unmount } = mountTree(
      <AtomIntrTubeSection
        entries={fullEntries({
          mode: entry({ key: 'mode', type: 'enum', value: 'simple', enumdef: ['simple', 'fancy'] }),
        })}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const detailArrow = rowByLabel(container, 'Detail')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    expect(detailArrow.disabled).toBe(true)
    const startSelect = rowByLabel(container, 'Start cap')!.querySelector(
      'select',
    ) as HTMLSelectElement
    expect(startSelect.disabled).toBe(true)
    unmount()
  })

  it('enables detail and caps while fancy but keeps arrow size disabled without an arrow cap', () => {
    const { container, unmount } = mountTree(
      <AtomIntrTubeSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const detailArrow = rowByLabel(container, 'Detail')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    expect(detailArrow.disabled).toBe(false)
    const arrowHArrow = rowByLabel(container, 'Arrow height')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    expect(arrowHArrow.disabled).toBe(true)
    unmount()
  })

  // Degrade guard for the shared-MappedEnumRow extraction (theme T4 Step 1):
  // the atomintr cap selects use a LOCAL CAP_LABELS (flat/sphere/arrow ->
  // Flat/Round/Arrow) that diverges from the exported CAP_LABELS
  // (sphere/flat/none). Pin the option text+order so the row swap does not
  // accidentally pull in the exported labels.
  it('shows the local CAP_LABELS option text on Start/End cap', () => {
    const { container, unmount } = mountTree(
      <AtomIntrTubeSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const startSelect = rowByLabel(container, 'Start cap')!.querySelector(
      'select',
    ) as HTMLSelectElement
    expect(Array.from(startSelect.options).map((o) => o.text)).toEqual([
      'Flat',
      'Round',
      'Arrow',
    ])
    expect(startSelect.value).toBe('sphere')
    const endSelect = rowByLabel(container, 'End cap')!.querySelector(
      'select',
    ) as HTMLSelectElement
    expect(Array.from(endSelect.options).map((o) => o.text)).toEqual([
      'Flat',
      'Round',
      'Arrow',
    ])
    unmount()
  })

  it('enables arrow size once a cap is set to arrow', () => {
    const { container, unmount } = mountTree(
      <AtomIntrTubeSection
        entries={fullEntries({
          captype_end: entry({
            key: 'captype_end',
            type: 'enum',
            value: 'arrow',
            enumdef: ['flat', 'sphere', 'arrow'],
          }),
        })}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const arrowWArrow = rowByLabel(container, 'Arrow width')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    expect(arrowWArrow.disabled).toBe(false)
    unmount()
  })
})

describe('AtomIntrLabelSection', () => {
  it('disables font controls while showlabel is off and enables them when on', () => {
    const off = mountTree(
      <AtomIntrLabelSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const sizeArrow = rowByLabel(off.container, 'Font size')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    expect(sizeArrow.disabled).toBe(true)
    const styleSelect = rowByLabel(off.container, 'Font style')!.querySelector(
      'select',
    ) as HTMLSelectElement
    expect(styleSelect.disabled).toBe(true)
    off.unmount()

    const on = mountTree(
      <AtomIntrLabelSection
        entries={fullEntries({
          showlabel: entry({ key: 'showlabel', type: 'boolean', value: true }),
        })}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const sizeArrowOn = rowByLabel(on.container, 'Font size')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    expect(sizeArrowOn.disabled).toBe(false)
    on.unmount()
  })
})

describe('PropertiesTab atomintr section dispatch', () => {
  const commonProps = {
    onSet: vi.fn(),
    onSetMany: vi.fn(),
    onReset: vi.fn(),
    sceneId: 1,
  }

  function accordionTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
      (t) => t.textContent ?? '',
    )
  }

  it('shows the four atomintr sections (no placeholder)', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab entries={fullEntries()} rendererType="atomintr" {...commonProps} />,
    )
    const titles = accordionTitles(container)
    expect(titles).toContain('Interaction')
    expect(titles).toContain('Dashed line')
    expect(titles).toContain('3D tube')
    expect(titles).toContain('Value label')
    expect(titles).not.toContain('Renderer settings')
    unmount()
  })
})
