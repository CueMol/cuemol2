/**
 * Degrade-detection tests for `setupRenderer` (worker service).
 *
 * Pins the new direct-API contract introduced after we replaced the
 * `NewRendererCommand` property-setter pattern with `mol.createRenderer()`:
 *
 *   - `mol.createRenderer(type)` is the only renderer-creation call;
 *     `ctx.cmdMgr.getCmd('new_renderer')` MUST NOT be invoked (avoids
 *     the `cmd.target_object = mol` parent-linkage corruption that
 *     silently broke coloring undo)
 *   - rend.name + applyStyles + recenter-views happen in the same order
 *     as `NewRendererCommand::run()`
 *   - the existing selection / molPostProc gates still hold
 *
 * The "does NOT call getCmd('new_renderer')" assertion is the regression
 * tripwire for re-introducing the buggy command path.
 */

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
import { molPostProc } from '../worker/server/services/helpers/molPostProc'

function makeFixture(opts: {
    className: string
    scene?: {
        view_uids?: string
        getView?: (uid: number) => { setViewCenter: (pos: unknown) => void } | null
    }
    hasGetCenter?: boolean
}) {
    const calls: string[] = []
    const setSel = vi.fn((v: unknown) => { calls.push(`sel=${JSON.stringify(v)}`) })
    const setName = vi.fn((v: string) => { calls.push(`name=${v}`) })
    const applyStyles = vi.fn((s: string) => { calls.push(`applyStyles(${s})`) })

    const getCenter = vi.fn(() => ({ __pos: true }))
    const rendBase: Record<string, unknown> = {
        get name() { return '' },
        set name(v: string) { setName(v) },
        get sel() { return undefined },
        set sel(v: unknown) { setSel(v) },
        applyStyles,
    }
    if (opts.hasGetCenter !== false) {
        rendBase.getCenter = getCenter
    }
    const rend = rendBase

    const createRenderer = vi.fn((type: string) => {
        calls.push(`createRenderer(${type})`)
        return rend
    })

    const scene = opts.scene ?? { view_uids: '' }

    const mol = {
        createRenderer,
        getClassName: () => opts.className,
        getScene: () => scene,
    }

    const getCmd = vi.fn(() => {
        throw new Error('getCmd should NOT be called in the direct-API path')
    })

    const ctx = {
        cmdMgr: { getCmd },
    } as unknown as WorkerContext

    return { ctx, mol, rend, scene, calls, setSel, setName, applyStyles, getCenter, createRenderer, getCmd }
}

const baseOpts: RendererOptions = {
    objectName: 'm',
    rendererType: 'simple',
    rendererName: 'simple1',
    selectionEnabled: false,
    selection: 'protein',
    centerView: false,
}

describe('setupRenderer — direct API (no NewRendererCommand)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('uses mol.createRenderer(type), never asks cmdMgr for new_renderer', () => {
        const { ctx, mol, createRenderer, getCmd } = makeFixture({ className: 'MolCoord' })
        setupRenderer(ctx, mol as unknown, baseOpts)
        expect(createRenderer).toHaveBeenCalledWith('simple')
        expect(getCmd).not.toHaveBeenCalled()
    })

    it('returns null and skips downstream work when createRenderer returns null', () => {
        const { ctx, mol } = makeFixture({ className: 'MolCoord' })
        ;(mol.createRenderer as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
        const result = setupRenderer(ctx, mol as unknown, baseOpts)
        expect(result).toBeNull()
        expect(molPostProc).not.toHaveBeenCalled()
    })

    it('sets renderer name, applies default style, then runs molPostProc (in that order)', () => {
        const { ctx, mol, calls } = makeFixture({ className: 'MolCoord' })
        setupRenderer(ctx, mol as unknown, baseOpts)
        // createRenderer first, then name, then applyStyles. molPostProc runs after.
        expect(calls).toEqual([
            'createRenderer(simple)',
            'name=simple1',
            'applyStyles(DefaultStyle)',
        ])
        expect(molPostProc).toHaveBeenCalledTimes(1)
    })

    it('centerView=true recenters all views via scene.view_uids -> scene.getView -> setViewCenter', () => {
        const setViewCenter = vi.fn()
        const getView = vi.fn((_uid: number) => ({ setViewCenter }))
        const { ctx, mol, getCenter } = makeFixture({
            className: 'MolCoord',
            scene: { view_uids: '10, 11', getView },
        })
        setupRenderer(ctx, mol as unknown, { ...baseOpts, centerView: true })
        expect(getCenter).toHaveBeenCalled()
        expect(getView).toHaveBeenCalledWith(10)
        expect(getView).toHaveBeenCalledWith(11)
        expect(setViewCenter).toHaveBeenCalledTimes(2)
        expect(setViewCenter).toHaveBeenCalledWith({ __pos: true })
    })

    it('centerView=false does not touch the views', () => {
        const setViewCenter = vi.fn()
        const getView = vi.fn(() => ({ setViewCenter }))
        const { ctx, mol, getCenter } = makeFixture({
            className: 'MolCoord',
            scene: { view_uids: '10', getView },
        })
        setupRenderer(ctx, mol as unknown, { ...baseOpts, centerView: false })
        expect(getCenter).not.toHaveBeenCalled()
        expect(setViewCenter).not.toHaveBeenCalled()
    })

    it('centerView=true but renderer lacks getCenter() -> skips silently', () => {
        const setViewCenter = vi.fn()
        const getView = vi.fn(() => ({ setViewCenter }))
        const { ctx, mol } = makeFixture({
            className: 'MolCoord',
            hasGetCenter: false,
            scene: { view_uids: '10', getView },
        })
        expect(() =>
            setupRenderer(ctx, mol as unknown, { ...baseOpts, centerView: true })
        ).not.toThrow()
        expect(setViewCenter).not.toHaveBeenCalled()
    })

    // --- Selection gate (preserved from the prior contract) ---

    it('selectionEnabled=false skips sel even when selection is non-default', () => {
        const { ctx, mol, setSel } = makeFixture({ className: 'MolCoord' })
        setupRenderer(ctx, mol as unknown, { ...baseOpts, selectionEnabled: false, selection: 'protein' })
        expect(makeSel).not.toHaveBeenCalled()
        expect(setSel).not.toHaveBeenCalled()
    })

    it('selectionEnabled=true with concrete selection assigns sel via makeSel', () => {
        const { ctx, mol, setSel } = makeFixture({ className: 'MolCoord' })
        setupRenderer(ctx, mol as unknown, { ...baseOpts, selectionEnabled: true, selection: 'protein' })
        expect(makeSel).toHaveBeenCalledTimes(1)
        expect(setSel).toHaveBeenCalledTimes(1)
        expect(setSel).toHaveBeenCalledWith({ __sel: true })
    })

    it('selectionEnabled=true with selection="*" still skips sel (full-molecule shorthand)', () => {
        const { ctx, mol, setSel } = makeFixture({ className: 'MolCoord' })
        setupRenderer(ctx, mol as unknown, { ...baseOpts, selectionEnabled: true, selection: '*' })
        expect(makeSel).not.toHaveBeenCalled()
        expect(setSel).not.toHaveBeenCalled()
    })

    it('NON_MOL class skips sel + molPostProc even when selectionEnabled=true', () => {
        const { ctx, mol, setSel } = makeFixture({ className: 'DensityMap' })
        setupRenderer(ctx, mol as unknown, { ...baseOpts, selectionEnabled: true, selection: 'protein' })
        expect(makeSel).not.toHaveBeenCalled()
        expect(setSel).not.toHaveBeenCalled()
        expect(molPostProc).not.toHaveBeenCalled()
    })
})
