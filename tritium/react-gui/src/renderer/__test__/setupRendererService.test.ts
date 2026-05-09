import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import type { RendererOptions } from '../components/fopen-opt-dlgs/types'

vi.mock('../worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn(() => ({ __sel: true })),
}))
vi.mock('../worker/server/services/helpers/molPostProc', () => ({
    molPostProc: vi.fn(),
}))
vi.mock('../worker/server/services/helpers/getDefaultStyleName', () => ({
    getDefaultStyleName: vi.fn(() => 'DefaultStyle'),
}))

import { setupRenderer } from '../worker/server/services/setupRenderer.service'
import { makeSel } from '../worker/server/services/helpers/makeSel'

function makeFixture(className: string) {
    const setSel = vi.fn()
    const rend = {
        get sel() { return undefined },
        set sel(v: unknown) { setSel(v) },
    }
    const cmd = {
        target_object: null as unknown,
        renderer_type: '',
        renderer_name: '',
        recenter_view: false,
        default_style_name: '',
        run: vi.fn(),
        result_renderer: rend,
    }
    const ctx = {
        cmdMgr: { getCmd: vi.fn(() => cmd) },
    } as unknown as WorkerContext

    const mol = {
        getClassName: () => className,
    }

    return { ctx, mol, setSel }
}

const baseOpts: RendererOptions = {
    objectName: 'm',
    rendererType: 'simple',
    rendererName: 'simple1',
    selectionEnabled: false,
    selection: 'protein',
    centerView: true,
}

describe('setupRenderer — selection gate', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('selectionEnabled=false skips sel even when selection is non-default', () => {
        const { ctx, mol, setSel } = makeFixture('MolCoord')
        setupRenderer(ctx, mol, { ...baseOpts, selectionEnabled: false, selection: 'protein' })
        expect(makeSel).not.toHaveBeenCalled()
        expect(setSel).not.toHaveBeenCalled()
    })

    it('selectionEnabled=true with concrete selection assigns sel via makeSel', () => {
        const { ctx, mol, setSel } = makeFixture('MolCoord')
        setupRenderer(ctx, mol, { ...baseOpts, selectionEnabled: true, selection: 'protein' })
        expect(makeSel).toHaveBeenCalledTimes(1)
        expect(setSel).toHaveBeenCalledTimes(1)
        expect(setSel).toHaveBeenCalledWith({ __sel: true })
    })

    it('selectionEnabled=true with selection="*" still skips sel (full-molecule shorthand)', () => {
        const { ctx, mol, setSel } = makeFixture('MolCoord')
        setupRenderer(ctx, mol, { ...baseOpts, selectionEnabled: true, selection: '*' })
        expect(makeSel).not.toHaveBeenCalled()
        expect(setSel).not.toHaveBeenCalled()
    })

    it('NON_MOL class skips sel even when selectionEnabled=true', () => {
        const { ctx, mol, setSel } = makeFixture('DensityMap')
        setupRenderer(ctx, mol, { ...baseOpts, selectionEnabled: true, selection: 'protein' })
        expect(makeSel).not.toHaveBeenCalled()
        expect(setSel).not.toHaveBeenCalled()
    })
})
