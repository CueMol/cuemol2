/**
 * Degrade-detection tests for `makeMolSurf` (worker service backing the UXP
 * "Mol surface generation" tool dialog, `tools/makesurf`).
 *
 * Pins the wire contract:
 *   - compiles the selection via `makeSel(ctx, selStr, scene.uid)`
 *   - creates a MolSurfObj and calls
 *     `createSESFromMol(mol, sel, density, probeRadius)` with coerced numerics,
 *     then adds + embeds the object and attaches a `molsurf` renderer
 *     (target = mol name, colormode = molecule, CPKColoring), all inside a
 *     single "Create mol surface" undo txn
 *   - the renderer selection is only assigned when a selection string is given
 *   - numeric inputs are clamped (density >= 1, probe radius >= 0.1)
 *   - a blank object name falls back to a unique `sf_<molname>`
 *   - a throwing build rolls back the whole txn
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn(() => ({ __sel: true })),
}))

import { services } from '@renderer/worker/server/services/makeMolSurf.service'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'

const { makeMolSurf, proposeMolSurfName } = services
const SEL = { __sel: true }

interface FakeRend {
    name?: string
    target?: string
    sel?: unknown
    colormode?: unknown
    coloring?: unknown
}

function makeSurfObj(uid: number) {
    const rend: FakeRend = {}
    const setBackend = vi.fn()
    const surf = {
        uid,
        name: '',
        get sesbackend(): string { return 'auto' },
        set sesbackend(v: string) { setBackend(v) },
        createSESFromMol: vi.fn(),
        forceEmbed: vi.fn(),
        createRenderer: vi.fn(() => rend),
    }
    return { surf, rend, setBackend }
}

function makeCtx(opts: {
    mol?: unknown
    surfUid?: number
    existingObjNames?: string[]
    existingRendNames?: string[]
    sceneId?: number
}) {
    const sid = opts.sceneId ?? 100
    const { surf, rend, setBackend } = makeSurfObj(opts.surfUid ?? 555)
    const objNames = new Set(opts.existingObjNames ?? [])
    const rendNames = new Set(opts.existingRendNames ?? [])
    const scene = {
        uid: sid,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn((id: number) => (id === 1 ? opts.mol ?? null : null)),
        getObjectByName: vi.fn((n: string) => (objNames.has(n) ? {} : null)),
        getRendByName: vi.fn((n: string) => (rendNames.has(n) ? {} : null)),
        addObject: vi.fn(),
    }
    const createObj = vi.fn((name: string) =>
        name === 'MolSurfObj' ? surf : { __coloring: name },
    )
    const ctx = {
        sceMgr: { getScene: vi.fn((id: number) => (id === sid ? scene : null)) },
        svc: { createObj },
    } as unknown as WorkerContext
    return { ctx, scene, surf, rend, createObj, setBackend }
}

describe('makeMolSurf', () => {
    beforeEach(() => {
        ;(makeSel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(SEL)
        vi.clearAllMocks()
        ;(makeSel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(SEL)
    })

    it('builds the surface and renderer inside a Create mol surface txn', () => {
        const mol = { name: '1crn' }
        const { ctx, scene, surf, rend, createObj } = makeCtx({ mol })

        const res = makeMolSurf(ctx, {
            sceneId: 100, objId: 1, selStr: '', surfName: 'mysurf',
            density: 12, probeRadius: 1.4,
        })

        expect(res.ok).toBe(true)
        expect(res.newObjId).toBe(555)
        expect(res.newObjName).toBe('mysurf')
        expect(makeSel).toHaveBeenCalledWith(ctx, '', 100)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Create mol surface')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(createObj).toHaveBeenCalledWith('MolSurfObj')
        expect(surf.createSESFromMol).toHaveBeenCalledWith(mol, SEL, 12, 1.4)
        expect(scene.addObject).toHaveBeenCalledWith(surf)
        expect(surf.forceEmbed).toHaveBeenCalled()
        expect(surf.name).toBe('mysurf')
        expect(rend.target).toBe('1crn')
        expect(rend.colormode).toBe('molecule')
        expect(rend.coloring).toEqual({ __coloring: 'CPKColoring' })
        // No selection string -> renderer sel is left untouched.
        expect(rend.sel).toBeUndefined()
    })

    it('assigns the renderer selection only when a selection string is given', () => {
        const { ctx, rend } = makeCtx({ mol: { name: 'm' } })
        makeMolSurf(ctx, {
            sceneId: 100, objId: 1, selStr: 'chain A', surfName: 's',
            density: 5, probeRadius: 1.4,
        })
        expect(rend.sel).toBe(SEL)
    })

    it('clamps density (>=1) and probe radius (>=0.1) like UXP', () => {
        const { ctx, surf } = makeCtx({ mol: { name: 'm' } })
        makeMolSurf(ctx, {
            sceneId: 100, objId: 1, selStr: '', surfName: 's',
            density: 0, probeRadius: 0,
        })
        expect(surf.createSESFromMol).toHaveBeenCalledWith({ name: 'm' }, SEL, 1, 1.4)
    })

    it('falls back to a unique sf_<molname> when the name is blank', () => {
        const { ctx, surf } = makeCtx({
            mol: { name: '1crn' },
            existingObjNames: ['sf_1crn'],
        })
        const res = makeMolSurf(ctx, {
            sceneId: 100, objId: 1, selStr: '', surfName: '   ',
            density: 5, probeRadius: 1.4,
        })
        expect(res.newObjName).toBe('sf_1crn(1)')
        expect(surf.name).toBe('sf_1crn(1)')
    })

    it('rolls back the txn when the build throws', () => {
        const { ctx, scene, surf } = makeCtx({ mol: { name: 'm' } })
        surf.createSESFromMol.mockImplementation(() => {
            throw new Error('boom')
        })
        const res = makeMolSurf(ctx, {
            sceneId: 100, objId: 1, selStr: '', surfName: 's',
            density: 5, probeRadius: 1.4,
        })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/boom/)
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('returns ok=false without building when the selection fails to compile', () => {
        ;(makeSel as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
        const { ctx, createObj } = makeCtx({ mol: { name: 'm' } })
        const res = makeMolSurf(ctx, {
            sceneId: 100, objId: 1, selStr: 'bogus(', surfName: 's',
            density: 5, probeRadius: 1.4,
        })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/selection/)
        expect(createObj).not.toHaveBeenCalled()
    })

    it('returns ok=false when the molecule is missing', () => {
        const { ctx } = makeCtx({ mol: null })
        const res = makeMolSurf(ctx, {
            sceneId: 100, objId: 1, selStr: '', surfName: 's',
            density: 5, probeRadius: 1.4,
        })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/molecule/)
    })
})

describe('makeMolSurf backend selection', () => {
    beforeEach(() => vi.clearAllMocks())

    it('sets sesbackend when an explicit backend is requested', () => {
        const { ctx, surf, setBackend } = makeCtx({ mol: { name: 'm' } })
        makeMolSurf(ctx, {
            sceneId: 100, objId: 1, selStr: '', surfName: 's',
            density: 1, probeRadius: 1.4, backend: 'ball',
        })
        expect(setBackend).toHaveBeenCalledWith('ball')
        // The property is set BEFORE the generation it applies to.
        expect(setBackend.mock.invocationCallOrder[0]).toBeLessThan(
            (surf.createSESFromMol as ReturnType<typeof vi.fn>)
                .mock.invocationCallOrder[0],
        )
    })

    it.each([['auto'], [undefined]])(
        'leaves sesbackend untouched for backend=%s',
        (backend) => {
            const { ctx, setBackend } = makeCtx({ mol: { name: 'm' } })
            makeMolSurf(ctx, {
                sceneId: 100, objId: 1, selStr: '', surfName: 's',
                density: 1, probeRadius: 1.4,
                backend: backend as 'auto' | undefined,
            })
            expect(setBackend).not.toHaveBeenCalled()
        },
    )
})

describe('proposeMolSurfName', () => {
    it('suggests sf_<molname> for the target molecule (UXP makeSugName)', () => {
        const { ctx } = makeCtx({ mol: { name: '1crn' } })
        expect(proposeMolSurfName(ctx, { sceneId: 100, objId: 1 })).toEqual({
            name: 'sf_1crn',
        })
    })

    it('appends a (N) suffix when the bare name is taken', () => {
        const { ctx } = makeCtx({
            mol: { name: '1crn' },
            existingObjNames: ['sf_1crn', 'sf_1crn(1)'],
        })
        expect(proposeMolSurfName(ctx, { sceneId: 100, objId: 1 })).toEqual({
            name: 'sf_1crn(2)',
        })
    })

    it('returns an empty name when the molecule is missing', () => {
        const { ctx } = makeCtx({ mol: null })
        expect(proposeMolSurfName(ctx, { sceneId: 100, objId: 1 })).toEqual({
            name: '',
        })
    })
})
