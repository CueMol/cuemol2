/**
 * @file worker/server/catalog/ops/loadFormatOps.test.ts
 * @description A format's load op: it reads with its own reader and never
 * sniffs, and its arguments become that reader's options (a value turns its
 * switch on).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FileOpenOptions, FormatOptions } from '@renderer/worker/shared/fileOpenTypes'
import type { OpContext } from '../op'

const { loads, pickReaderName } = vi.hoisted(() => ({
  loads: [] as Array<{ readerName?: string; contentFirst: boolean; options: FileOpenOptions }>,
  // What a sniff would say: a CCP4 header used to sniff as NAMD coordinates.
  pickReaderName: vi.fn(() => 'namdcoor'),
}))

const DEFAULTS: Record<string, FormatOptions> = {
  ccp4map: {
    kind: 'ccp4map',
    options: { normalize: false, truncateMinEnabled: false, truncateMin: 0, truncateMaxEnabled: false, truncateMax: 5, mapType: 'auto', subsample: 1 },
  },
  mtzmap: {
    kind: 'mtz',
    options: { columnF: 'FP', columnPhi: '', phaseEnabled: false, columnW: '', weightEnabled: false, resolutionLimit: 2, gridSpacing: 0.5 },
  },
}

vi.mock('@renderer/worker/server/services/helpers/pickReaderName', () => ({ OBJREADER_CATEGORY: 0, pickReaderName }))
vi.mock('@renderer/worker/server/services/file/getCompatibleRendererNames', () => ({
  getCompatibleRendererNames: () => ({ types: [], objType: '', readerName: pickReaderName() }),
}))
vi.mock('@renderer/worker/server/services/file/getOpenFilters', () => ({
  // .map is claimed by two readers, so load_file would sniff it.
  getOpenFilters: (_ctx: unknown, { catId }: { catId: number }) =>
    catId === 0
      ? [{ name: 'CCP4', extensions: ['map', 'mrc'] }, { name: 'XPLOR', extensions: ['map'] }, { name: 'MTZ', extensions: ['mtz'] }]
      : [{ name: 'Scene', extensions: ['qsc'] }],
}))
vi.mock('@renderer/worker/server/services/file/headlessOpen', () => ({
  buildHeadlessFileOpenOptions: (_ctx: unknown, { readerName }: { readerName: string }) => ({
    format: structuredClone(DEFAULTS[readerName]),
    renderer: {},
  }),
}))
vi.mock('@renderer/worker/server/services/file/loadObject', () => ({
  loadObject: (_ctx: unknown, args: (typeof loads)[number]) => {
    loads.push(args)
    return { ok: true, objId: 1 }
  },
}))

import { loadCcp4, loadMtz } from './loadFormatOps'

const oc = { sceneId: 1 } as OpContext
const RENDER = { rendererType: null, selection: null, name: null, rendererName: null, preset: null, centerView: null, mapCenterPolicy: null }

beforeEach(() => {
  loads.length = 0
  pickReaderName.mockClear()
})

describe('format load ops', () => {
  it('load_ccp4 reads with ccp4map even when the content would sniff as another reader', async () => {
    const args = { ...RENDER, path: '/w/emd.map', normalize: null, truncateMin: null, truncateMax: null, mapType: null, subsample: null }
    expect(await loadCcp4.run({} as never, args, oc)).toMatchObject({ ok: true })

    expect(pickReaderName).not.toHaveBeenCalled()
    expect(loads).toHaveLength(1)
    expect(loads[0]).toMatchObject({ readerName: 'ccp4map', contentFirst: false })
  })

  it('load_mtz writes the given options over the defaults and turns on the column it names', async () => {
    const args = { ...RENDER, path: '/w/a.mtz', columnF: 'FWT', columnPhi: 'PHWT', columnWeight: null, resolutionLimit: null, gridSpacing: null }
    expect(await loadMtz.run({} as never, args, oc)).toMatchObject({ ok: true })

    expect(loads[0].readerName).toBe('mtzmap')
    expect(loads[0].options.format.options).toMatchObject({ columnF: 'FWT', columnPhi: 'PHWT', phaseEnabled: true, weightEnabled: false, resolutionLimit: 2 })
  })
})
