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
import { fakeObject, fakeRenderer, fakeScene, fakeView, makeWorkerCtx } from '@renderer/worker/testing'

/**
 * One object in one scene. Renderers the service creates through
 * `mol.createRenderer` / `createPresetRenderer` land in `mol.renderers`,
 * so a test reads the created renderer back from there.
 */
function makeFixture(opts: { className: string; viewIds?: number[]; hasGetCenter?: boolean }) {
    const log: string[] = []
    const scene = fakeScene({ uid: 100, views: (opts.viewIds ?? []).map((uid) => fakeView({ uid })), log })
    const mol = fakeObject({
        className: opts.className, scene, log,
        rendererDefaults: { hasCenter: opts.hasGetCenter !== false },
    })
    const { ctx, cmdMgr } = makeWorkerCtx({ scenes: [scene] })
    return { ctx, mol, scene, log, getCmd: cmdMgr.getCmd, rend: () => mol.renderers[0] }
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
        const { ctx, mol, getCmd } = makeFixture({ className: 'MolCoord' })
        setupRenderer(ctx, mol as unknown, baseOpts)
        expect(mol.createRenderer).toHaveBeenCalledWith('simple')
        expect(getCmd).not.toHaveBeenCalled()
    })

    it('returns null and skips downstream work when createRenderer returns null', () => {
        const { ctx, mol } = makeFixture({ className: 'MolCoord' })
        mol.createRenderer.mockReturnValueOnce(null)
        const result = setupRenderer(ctx, mol as unknown, baseOpts)
        expect(result).toBeNull()
        expect(molPostProc).not.toHaveBeenCalled()
    })

    it('sets renderer name, applies default style, then runs molPostProc (in that order)', () => {
        const { ctx, mol, log } = makeFixture({ className: 'MolCoord' })
        setupRenderer(ctx, mol as unknown, baseOpts)
        // createRenderer first, then name, then applyStyles. molPostProc runs after.
        expect(log).toEqual([
            'mol.createRenderer(simple)',
            'rend.name=simple1',
            'rend.applyStyles(DefaultStyle)',
        ])
        expect(molPostProc).toHaveBeenCalledTimes(1)
    })

    it('centerView=true recenters all views via scene.view_uids -> scene.getView -> setViewCenter', () => {
        const { ctx, mol, scene, rend } = makeFixture({ className: 'MolCoord', viewIds: [10, 11] })
        setupRenderer(ctx, mol as unknown, { ...baseOpts, centerView: true })
        expect(rend().getCenter).toHaveBeenCalled()
        expect(scene.getView).toHaveBeenCalledWith(10)
        expect(scene.getView).toHaveBeenCalledWith(11)
        for (const view of scene.views) {
            expect(view.setViewCenter).toHaveBeenCalledTimes(1)
            expect(view.setViewCenter).toHaveBeenCalledWith({ __pos: true })
        }
    })

    it('centerView=false does not touch the views', () => {
        const { ctx, mol, scene, rend } = makeFixture({ className: 'MolCoord', viewIds: [10] })
        setupRenderer(ctx, mol as unknown, { ...baseOpts, centerView: false })
        expect(rend().getCenter).not.toHaveBeenCalled()
        expect(scene.views[0].setViewCenter).not.toHaveBeenCalled()
    })

    it('centerView=true but renderer lacks getCenter() -> skips silently', () => {
        const { ctx, mol, scene } = makeFixture({ className: 'MolCoord', hasGetCenter: false, viewIds: [10] })
        expect(() =>
            setupRenderer(ctx, mol as unknown, { ...baseOpts, centerView: true })
        ).not.toThrow()
        expect(scene.views[0].setViewCenter).not.toHaveBeenCalled()
    })

    // --- Selection gate (preserved from the prior contract) ---

    it('selectionEnabled=false skips sel even when selection is non-default', () => {
        const { ctx, mol, rend } = makeFixture({ className: 'MolCoord' })
        setupRenderer(ctx, mol as unknown, { ...baseOpts, selectionEnabled: false, selection: 'protein' })
        expect(makeSel).not.toHaveBeenCalled()
        expect(rend().sets.sel).not.toHaveBeenCalled()
    })

    it('selectionEnabled=true with concrete selection assigns sel via makeSel', () => {
        const { ctx, mol, rend } = makeFixture({ className: 'MolCoord' })
        setupRenderer(ctx, mol as unknown, { ...baseOpts, selectionEnabled: true, selection: 'protein' })
        expect(makeSel).toHaveBeenCalledTimes(1)
        expect(rend().sets.sel).toHaveBeenCalledTimes(1)
        expect(rend().sets.sel).toHaveBeenCalledWith({ __sel: true })
    })

    it('selectionEnabled=true with selection="*" still skips sel (full-molecule shorthand)', () => {
        const { ctx, mol, rend } = makeFixture({ className: 'MolCoord' })
        setupRenderer(ctx, mol as unknown, { ...baseOpts, selectionEnabled: true, selection: '*' })
        expect(makeSel).not.toHaveBeenCalled()
        expect(rend().sets.sel).not.toHaveBeenCalled()
    })

    it('NON_MOL class skips sel + molPostProc even when selectionEnabled=true', () => {
        const { ctx, mol, rend } = makeFixture({ className: 'DensityMap' })
        setupRenderer(ctx, mol as unknown, { ...baseOpts, selectionEnabled: true, selection: 'protein' })
        expect(makeSel).not.toHaveBeenCalled()
        expect(rend().sets.sel).not.toHaveBeenCalled()
        expect(molPostProc).not.toHaveBeenCalled()
    })
})

describe('setupRenderer — preset renderer group (presetName set)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    const presetOpts: RendererOptions = {
        ...baseOpts,
        presetName: 'Default1RendPreset',
        rendererName: 'default1_1',
    }

    it('creates via createPresetRenderer(preset, name, name); no createRenderer / name / applyStyles / getCmd', () => {
        const f = makeFixture({ className: 'MolCoord' })
        const result = setupRenderer(f.ctx, f.mol as unknown, presetOpts)
        expect(f.mol.createPresetRenderer).toHaveBeenCalledWith(
            'Default1RendPreset', 'default1_1', 'default1_1',
        )
        expect(f.mol.createRenderer).not.toHaveBeenCalled()
        // C++ setName(grp_name) already named the group; children carry
        // their styles from the preset definition.
        expect(f.rend().sets.name).not.toHaveBeenCalled()
        expect(f.rend().applyStyles).not.toHaveBeenCalled()
        expect(f.getCmd).not.toHaveBeenCalled()
        expect(result).toBe(f.rend())
    })

    it('runs molPostProc for a mol class but never assigns sel (RendGroup has none)', () => {
        const f = makeFixture({ className: 'MolCoord' })
        setupRenderer(f.ctx, f.mol as unknown, {
            ...presetOpts, selectionEnabled: true, selection: 'protein',
        })
        expect(molPostProc).toHaveBeenCalledTimes(1)
        expect(makeSel).not.toHaveBeenCalled()
        expect(f.rend().sets.sel).not.toHaveBeenCalled()
    })

    it('skips molPostProc for a NON_MOL class', () => {
        const f = makeFixture({ className: 'DensityMap' })
        setupRenderer(f.ctx, f.mol as unknown, presetOpts)
        expect(molPostProc).not.toHaveBeenCalled()
    })

    it('centerView=true recenters through the group getCenter (member average)', () => {
        const f = makeFixture({ className: 'MolCoord', viewIds: [10] })
        setupRenderer(f.ctx, f.mol as unknown, { ...presetOpts, centerView: true })
        expect(f.rend().getCenter).toHaveBeenCalled()
        expect(f.scene.views[0].setViewCenter).toHaveBeenCalledWith({ __pos: true })
    })

    it('returns null (no molPostProc) when createPresetRenderer throws', () => {
        const f = makeFixture({ className: 'MolCoord' })
        f.mol.createPresetRenderer.mockImplementationOnce(() => {
            throw new Error('Unknown renderer preset')
        })
        const result = setupRenderer(f.ctx, f.mol as unknown, presetOpts)
        expect(result).toBeNull()
        expect(molPostProc).not.toHaveBeenCalled()
    })
})

/**
 * A disorder overlay draws along a main-chain renderer named by its `target`
 * property, so one created with no target draws nothing. UXP seeds it in
 * `molPostProc` ("setup disorder renderer"); these pin that tritium does the
 * same, and only for `disorder`.
 */
describe('setupRenderer - disorder target seeding', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    const disoOpts: RendererOptions = { ...baseOpts, rendererType: 'disorder', rendererName: 'diso1' }

    it('points a new disorder renderer at the first main-chain sibling', () => {
        const f = makeFixture({ className: 'MolCoord' })
        f.mol.attachRenderer(fakeRenderer({ type: 'simple', name: 'simple1' }))
        f.mol.attachRenderer(fakeRenderer({ type: 'ribbon', name: 'ribbon1' }))
        f.mol.attachRenderer(fakeRenderer({ type: 'cartoon', name: 'cartoon1' }))

        setupRenderer(f.ctx, f.mol as unknown, disoOpts)

        // 'simple' is not a main-chain type; 'ribbon' comes first among those.
        const diso = f.mol.renderers.find((r) => r.type_name === 'disorder')
        expect((diso as unknown as { target?: string }).target).toBe('ribbon1')
    })

    it('leaves the target unset when the molecule has no main-chain renderer', () => {
        const f = makeFixture({ className: 'MolCoord' })
        f.mol.attachRenderer(fakeRenderer({ type: 'simple', name: 'simple1' }))

        setupRenderer(f.ctx, f.mol as unknown, disoOpts)

        const diso = f.mol.renderers.find((r) => r.type_name === 'disorder')
        expect((diso as unknown as { target?: string }).target).toBeUndefined()
    })

    it('does not touch the target of a renderer of any other type', () => {
        const f = makeFixture({ className: 'MolCoord' })
        f.mol.attachRenderer(fakeRenderer({ type: 'tube', name: 'tube1' }))

        setupRenderer(f.ctx, f.mol as unknown, baseOpts)

        const rend = f.mol.renderers.find((r) => r.type_name === 'simple')
        expect((rend as unknown as { target?: string }).target).toBeUndefined()
    })
})
