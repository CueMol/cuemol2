/**
 * Pins that AtomLabelPreview renders the sample in the live label typography:
 * the composed CSS font shorthand (family/size/weight/style) plus the chosen
 * colour are applied to the sample element, so it is a true WYSIWYG preview.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

vi.mock('../contexts/AppSettingsContext', () => ({
  useAppSettings: () => ({
    labelDefaults: {
      fontName: 'Helvetica',
      fontSize: 20,
      color: '#ff0000',
      bold: true,
      italic: true,
    },
    setLabelDefault: vi.fn(),
    viewInputParams: { tbrad: 0.8, hitprec: 10 },
    setViewInputParam: vi.fn(),
  }),
}))

import { AtomLabelPreview } from '../components/panes/settings/AtomLabelPreview'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

function mount(node: React.ReactElement): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    root = createRoot(container!)
    root.render(node)
  })
  return container
}

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

describe('AtomLabelPreview', () => {
  it('applies the composed font shorthand and colour to the sample text', () => {
    const el = mount(<AtomLabelPreview />)
    const sample = el.querySelector('.config-label-preview-text') as HTMLElement
    expect(sample).toBeTruthy()
    expect(sample.textContent && sample.textContent.length).toBeGreaterThan(0)

    const style = sample.getAttribute('style') ?? ''
    // Font shorthand pieces (from buildLabelFontCss): italic bold 20px Helvetica.
    expect(style).toContain('italic')
    expect(style).toContain('bold')
    expect(style).toContain('20px')
    expect(style).toContain('Helvetica')
    // Colour applied (jsdom serialises #ff0000 -> rgb(255, 0, 0)).
    expect(sample.style.color).toBe('rgb(255, 0, 0)')
  })
})
