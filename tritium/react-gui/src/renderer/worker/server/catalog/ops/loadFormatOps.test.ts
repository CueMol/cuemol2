/**
 * @file worker/server/catalog/ops/loadFormatOps.test.ts
 * @description A format's load op: its arguments become that format's reader
 * options (a value turns its switch on), and a file of another format is
 * refused.
 */

import { describe, it, expect, vi } from 'vitest'
import type { FormatOptions } from '@renderer/worker/shared/fileOpenTypes'
import type { OpContext } from '../op'

const { loaded, reader } = vi.hoisted(() => ({ loaded: [] as FormatOptions[], reader: { name: 'mtzmap' } }))

vi.mock('../fileLoad', () => ({
  openTarget: (_ctx: unknown, raw: string) => ({ scene: false, filePath: raw, readerName: reader.name, contentFirst: false }),
  formatOf: (name: string) => (name === 'mtzmap' ? 'mtz' : 'pdb'),
  loadObjectFile: (_c: unknown, _o: unknown, _t: unknown, _a: unknown, adjust: (f: FormatOptions) => FormatOptions) => {
    loaded.push(adjust({
      kind: 'mtz',
      options: { columnF: 'FP', columnPhi: '', phaseEnabled: false, columnW: '', weightEnabled: false, resolutionLimit: 2, gridSpacing: 0.5 },
    }))
    return { ok: true }
  },
}))

import { loadMtz } from './loadFormatOps'

const oc = {} as OpContext
const ARGS = { path: '/w/a.mtz', rendererType: null, selection: null, name: null, columnF: 'FWT', columnPhi: 'PHWT', columnWeight: null, resolutionLimit: null, gridSpacing: null }

describe('load_mtz', () => {
  it('writes the given options over the defaults, turns on the column it names, and refuses another format', async () => {
    expect(await loadMtz.run({} as never, ARGS, oc)).toEqual({ ok: true })
    expect(loaded[0].options).toMatchObject({ columnF: 'FWT', columnPhi: 'PHWT', phaseEnabled: true, weightEnabled: false, resolutionLimit: 2 })

    reader.name = 'pdb'
    const res = await loadMtz.run({} as never, { ...ARGS, path: '/w/1crn.pdb' }, oc)
    expect(res).toEqual({ ok: false, error: '/w/1crn.pdb is not an MTZ file (it reads as pdb).' })
  })
})
