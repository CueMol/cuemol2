/**
 * @file worker/server/services/file/headlessOpen.test.ts
 * @description What a load without a dialog draws when it was not told.
 *
 * Every such load (native console, PyMOL console, MCP, agent) goes through
 * this builder, so the default is pinned here once: a molecule gets the
 * PyMOL-like preset, and anything the caller chose -- a type, a selection --
 * or an object that is not a molecule keeps one renderer. A map given the
 * molecule default would load without an error and draw nothing (C++
 * `createRenderer` does not check compatibility).
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const { compat } = vi.hoisted(() => ({ compat: { types: [] as string[] } }))

vi.mock('./getReaderDefaultOptions', () => ({
  getReaderDefaultOptions: () => ({ ok: false, error: 'none' }),
}))
vi.mock('./getCompatibleRendererNames', () => ({
  getCompatibleRendererNames: () => ({ types: compat.types, objType: '', readerName: 'pdb' }),
}))

import { buildHeadlessFileOpenOptions } from './headlessOpen'

const ctx = {} as WorkerContext
const MOLECULE = ['anisou', 'ballstick', 'cartoon', 'simple', 'tube']

function build(over: { rendererType?: string | null; selection?: string | null }) {
  return buildHeadlessFileOpenOptions(ctx, {
    readerName: 'pdb',
    objectName: '1crn',
    rendererType: null,
    selection: null,
    ...over,
  }).renderer
}

describe('the renderer a load without a dialog creates', () => {
  it('draws a molecule given nothing with the PyMOL-like preset', () => {
    compat.types = MOLECULE
    const r = build({})
    expect(r.presetName).toBe('DefaultPymRendPreset')
    // The GUI's preset naming (presetNamePrefix), not `simple1`.
    expect(r.rendererName).toBe('defaultpym_1')
  })

  it('keeps one renderer for a chosen type, a selection, or a map', () => {
    const one = (r: ReturnType<typeof build>) => [r.rendererType, r.presetName]
    compat.types = MOLECULE
    expect(one(build({ rendererType: 'cartoon' }))).toEqual(['cartoon', undefined])
    // A preset group has no selection to carry it.
    expect(one(build({ selection: 'chain A' }))).toEqual(['simple', undefined])
    compat.types = ['contour', 'isosurf']
    expect(one(build({}))).toEqual(['contour', undefined])
  })
})
