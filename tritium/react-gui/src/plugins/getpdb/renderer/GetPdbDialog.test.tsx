/**
 * @file plugins/getpdb/renderer/GetPdbDialog.test.tsx
 * @description Get PDB dialog: the history affordance, what a cryo-EM
 * entry's lookup turns the form and its result into, and the keyword path
 * (Enter searches unsearched keywords; a picked hit is the entry).
 *
 * The PDB-id field used to wire a native HTML5 <datalist>, whose dropdown is
 * drawn by the OS: it ignored the app's dark theme (always light), put its
 * chevron out of line with the Blueprint input, and could pop open on focus /
 * typing without the user clicking it. History is now shown only through a
 * themed, click-to-open Blueprint Popover; re-adding a `<datalist>` /
 * `list=` attr would reintroduce all three bugs.
 */

import React from 'react'
import { act } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import type { EntryLookupState } from './useEntryLookup'
import type { PdbSearch } from './usePdbSearch'

// Render the Blueprint Dialog body inline (no portal/overlay) so the field
// mounts deterministically for DOM inspection; keep every other export real.
vi.mock('@blueprintjs/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@blueprintjs/core')
  const InlineDialog = (props: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, props.children)
  return { ...actual, Dialog: InlineDialog }
})
vi.mock('@renderer/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }))
// Non-empty history so the chevron trigger is enabled.
vi.mock('./pdbIdHistory', () => ({
  getHistory: () => ['1abc', '2xyz'],
  pushHistory: () => {},
}))
// The lookup is network-bound; each test hands the dialog its result.
let lookupState: EntryLookupState = { lookup: { status: 'idle' }, emdbInfo: {} }
vi.mock('./useEntryLookup', () => ({ useEntryLookup: () => lookupState }))
// The search is network-bound too: an idle one unless a test sets hits.
const searchMock: PdbSearch = { state: null, run: vi.fn(), more: () => {}, reset: () => {} }
vi.mock('./usePdbSearch', () => ({ usePdbSearch: () => searchMock }))

import { GetPdbDialog } from './GetPdbDialog'

void React

let tree: ReturnType<typeof mountTree> | null = null

afterEach(() => {
  tree?.unmount()
  tree = null
  lookupState = { lookup: { status: 'idle' }, emdbInfo: {} }
  searchMock.state = null
  vi.mocked(searchMock.run).mockClear()
})

function mount(onConfirm = vi.fn()) {
  tree = mountTree(
    React.createElement(GetPdbDialog, { visible: true, onConfirm, onCancel: () => {} }),
  )
  return tree
}

function typeId(container: HTMLElement, value: string): void {
  const input = container.querySelector('#get-pdb-id') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('GetPdbDialog', () => {
  it('shows history through the themed chevron only, closed by default (no native datalist)', () => {
    const { container } = mount()
    expect(container.querySelector('datalist')).toBeNull()
    expect(container.querySelector('#get-pdb-id')!.getAttribute('list')).toBeNull()
    const chevron = container.querySelector('[aria-label="Show history"]') as HTMLButtonElement
    expect(chevron.disabled).toBe(false)
    expect(container.querySelector('.bp5-menu')).toBeNull()
  })

  it('a cryo-EM entry offers its EMDB map at the recommended level, and mmCIF only when PDB format is unavailable', () => {
    const accession = { kind: 'pdb' as const, id: '7a4p' }
    lookupState = {
      lookup: {
        status: 'pdb',
        accession,
        entry: {
          id: '7a4p', title: 'PSI', methods: ['ELECTRON MICROSCOPY'], resolution: 4.2,
          emdbIds: ['EMD-11640'], pdbFormatAvailable: false, kind: 'em',
        },
      },
      emdbInfo: {
        'EMD-11640': { emdbId: 'EMD-11640', title: '', recommendedLevel: 0.01, sizeBytes: 5e8, dims: [512, 512, 512] },
      },
    }
    const onConfirm = vi.fn()
    const { container } = mount(onConfirm)
    typeId(container, '7a4p')

    const text = container.textContent ?? ''
    expect(text).toContain('Cryo-EM maps')
    expect(text).not.toContain('2Fo-Fc')
    expect(text).not.toContain('PDB (RCSB)')

    const download = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Download')!
    act(() => { download.click() })
    expect(onConfirm).toHaveBeenCalledWith({
      accession,
      coord: { serverType: 'RCSB_CIF' },
      map2fofc: null,
      mapFofc: null,
      emMaps: [{ emdbId: 'EMD-11640', serverType: 'WWPDB', contourLevel: 0.01 }],
    })
  })

  it('Enter searches keywords not yet searched; a picked hit is downloaded as that entry', () => {
    const first = mount()
    typeId(first.container, 'photosystem I')
    const input = first.container.querySelector('#get-pdb-id') as HTMLInputElement
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(searchMock.run).toHaveBeenCalledWith('photosystem I', 'all', 'score')
    first.unmount()

    searchMock.state = {
      query: 'photosystem I', method: 'all', sort: 'score', total: 2, loading: false, error: null,
      entries: [
        { id: '1jb0', title: 'PSI', methods: ['X-RAY DIFFRACTION'], resolution: 2.5, emdbIds: [], pdbFormatAvailable: true, kind: 'xtal' },
        { id: '6vpv', title: 'PSI', methods: ['ELECTRON MICROSCOPY'], resolution: 2.7, emdbIds: [], pdbFormatAvailable: true, kind: 'em' },
      ],
    }
    const onConfirm = vi.fn()
    const { container } = mount(onConfirm)
    typeId(container, 'photosystem I')
    const row = Array.from(container.querySelectorAll('.h3-list-row')).find((r) => r.textContent?.includes('6VPV'))!
    act(() => { (row as HTMLElement).click() })
    const download = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Download')!
    act(() => { download.click() })
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ accession: { kind: 'pdb', id: '6vpv' } }))
  })
})
