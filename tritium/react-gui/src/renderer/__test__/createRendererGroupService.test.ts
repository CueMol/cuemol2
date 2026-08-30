import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/rend/rend.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

interface FixtureOpts {
    /** Scene-wide renderer names already present (drives uniq-name + reject). */
    existingRends?: string[]
    /** When false, scene lookup fails. */
    sceneExists?: boolean
    /** When false, scene.getObject fails. */
    objExists?: boolean
}

function makeFixture(opts: FixtureOpts = {}) {
    const {
        existingRends = [],
        sceneExists = true,
        objExists = true,
    } = opts

    const setRendName = vi.fn()
    let _rendName = ''
    const newRend: Record<string, unknown> = {
        uid: 333,
        get name() { return _rendName },
        set name(v: string) { _rendName = v; setRendName(v) },
    }

    const createRenderer = vi.fn((_type: string) => newRend)
    const obj = { createRenderer }

    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const scene = {
        getObject: vi.fn(() => (objExists ? obj : null)),
        getRendByName: vi.fn((n: string) =>
            existingRends.includes(n) ? { __r: n } : null,
        ),
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
    } as unknown as WorkerContext

    return {
        ctx, scene, obj, newRend, createRenderer, setRendName,
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }
}

describe('createRendererGroup.service', () => {
    it('auto-generates "group1" when name is omitted and scene has no groups', () => {
        const f = makeFixture()
        const res = services.createRendererGroup(f.ctx, { sceneId: 1, objId: 2 })

        expect(res).toEqual({ ok: true, newRendId: 333, newName: 'group1' })
        expect(f.createRenderer).toHaveBeenCalledWith('*group')
        expect(f.setRendName).toHaveBeenCalledWith('group1')
        expect(f.startUndoTxn).toHaveBeenCalledWith('Create renderer group: group1')
        expect(f.commitUndoTxn).toHaveBeenCalledTimes(1)
        expect(f.rollbackUndoTxn).not.toHaveBeenCalled()
    })

    it('auto-generates the next free groupN when group1/group2 are taken', () => {
        const f = makeFixture({ existingRends: ['group1', 'group2'] })
        const res = services.createRendererGroup(f.ctx, { sceneId: 1, objId: 2 })

        expect(res.ok).toBe(true)
        expect(res.newName).toBe('group3')
        expect(f.setRendName).toHaveBeenCalledWith('group3')
        expect(f.startUndoTxn).toHaveBeenCalledWith('Create renderer group: group3')
    })

    it('accepts a user-supplied name and uses it verbatim', () => {
        const f = makeFixture({ existingRends: ['group1'] })
        const res = services.createRendererGroup(f.ctx, {
            sceneId: 1, objId: 2, name: 'myGroup',
        })

        expect(res.ok).toBe(true)
        expect(res.newName).toBe('myGroup')
        expect(f.setRendName).toHaveBeenCalledWith('myGroup')
        expect(f.startUndoTxn).toHaveBeenCalledWith('Create renderer group: myGroup')
    })

    it('trims whitespace from a user-supplied name before checking uniqueness', () => {
        const f = makeFixture()
        const res = services.createRendererGroup(f.ctx, {
            sceneId: 1, objId: 2, name: '  spaced  ',
        })

        expect(res.ok).toBe(true)
        expect(res.newName).toBe('spaced')
        expect(f.setRendName).toHaveBeenCalledWith('spaced')
    })

    it('rejects a user-supplied name that is already taken scene-wide', () => {
        const f = makeFixture({ existingRends: ['conflict'] })
        const res = services.createRendererGroup(f.ctx, {
            sceneId: 1, objId: 2, name: 'conflict',
        })

        expect(res).toEqual({ ok: false })
        expect(f.createRenderer).not.toHaveBeenCalled()
        expect(f.startUndoTxn).not.toHaveBeenCalled()
    })

    it('returns ok:false when the scene cannot be resolved', () => {
        const f = makeFixture({ sceneExists: false })
        const res = services.createRendererGroup(f.ctx, { sceneId: 99, objId: 2 })

        expect(res).toEqual({ ok: false })
        expect(f.createRenderer).not.toHaveBeenCalled()
    })

    it('returns ok:false when the target object cannot be resolved', () => {
        const f = makeFixture({ objExists: false })
        const res = services.createRendererGroup(f.ctx, { sceneId: 1, objId: 99 })

        expect(res).toEqual({ ok: false })
        expect(f.createRenderer).not.toHaveBeenCalled()
    })
})
