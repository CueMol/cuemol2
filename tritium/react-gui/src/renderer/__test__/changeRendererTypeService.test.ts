import { describe, it, expect, vi } from 'vitest'
import { services as changeServices } from '../worker/server/services/changeRendererType.service'
import { services as fetchServices } from '../worker/server/services/getRendererChangeTypes.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

interface ChangeFixtureOpts {
    oldType?: string
    newType?: string
    sceneExists?: boolean
    rendExists?: boolean
    objExists?: boolean
    /** Mock the XML round-trip — set to null to simulate toXML2 failure. */
    fromXMLReturns?: unknown
    toXML2Returns?: unknown
}

function makeChangeFixture(opts: ChangeFixtureOpts = {}) {
    const {
        oldType = 'simple',
        newType = 'cartoon',
        sceneExists = true,
        rendExists = true,
        objExists = true,
        fromXMLReturns,
        toXML2Returns,
    } = opts

    const oldRend = {
        uid: 100,
        name: 'rend1',
        type_name: oldType,
        getClientObj: vi.fn(() => obj),
    }

    const applyStyles = vi.fn()
    const newRend = {
        uid: 200,
        name: 'rend1',
        type_name: newType,
        applyStyles,
    }
    const restored = fromXMLReturns === undefined ? newRend : fromXMLReturns

    const destroyRenderer = vi.fn()
    const attachRenderer = vi.fn()
    const obj = objExists
        ? { destroyRenderer, attachRenderer }
        : null

    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const scene = {
        getRenderer: vi.fn(() => (rendExists ? oldRend : null)),
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }

    const toXML2 = vi.fn(() =>
        toXML2Returns === undefined ? { __xml: true } : toXML2Returns,
    )
    const fromXML = vi.fn(() => restored)

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
        strMgr: { toXML2, fromXML },
    } as unknown as WorkerContext

    return {
        ctx, scene, oldRend, newRend,
        obj, destroyRenderer, attachRenderer, applyStyles,
        toXML2, fromXML,
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }
}

describe('changeRendererType.service', () => {
    it('happy path: toXML2 → fromXML → applyStyles → destroy + attach under undo txn', () => {
        const f = makeChangeFixture({ oldType: 'simple', newType: 'cartoon' })
        const res = changeServices.changeRendererType(f.ctx, {
            sceneId: 1, rendId: 100, newType: 'cartoon',
        })
        expect(res).toEqual({ ok: true, newRendId: 200, newName: 'rend1' })
        expect(f.toXML2).toHaveBeenCalledWith(f.oldRend, 'cartoon')
        expect(f.fromXML).toHaveBeenCalledWith({ __xml: true }, 1)
        expect(f.applyStyles).toHaveBeenCalledWith('DefaultCartoon,DefaultHSCPaint')
        expect(f.startUndoTxn).toHaveBeenCalledWith('Change rend type')
        expect(f.destroyRenderer).toHaveBeenCalledWith(100)
        expect(f.attachRenderer).toHaveBeenCalledWith(f.newRend)
        expect(f.commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it('passes the correct default-style preset for ribbon', () => {
        const f = makeChangeFixture({ oldType: 'simple', newType: 'ribbon' })
        changeServices.changeRendererType(f.ctx, {
            sceneId: 1, rendId: 100, newType: 'ribbon',
        })
        expect(f.applyStyles).toHaveBeenCalledWith('DefaultRibbon,DefaultHSCPaint')
    })

    it('rejects synthetic source renderer (*selection)', () => {
        const f = makeChangeFixture({ oldType: '*selection' })
        const res = changeServices.changeRendererType(f.ctx, {
            sceneId: 1, rendId: 100, newType: 'cartoon',
        })
        expect(res.ok).toBe(false)
        expect(f.toXML2).not.toHaveBeenCalled()
        expect(f.destroyRenderer).not.toHaveBeenCalled()
    })

    it('rejects when new type matches current type', () => {
        const f = makeChangeFixture({ oldType: 'cartoon' })
        const res = changeServices.changeRendererType(f.ctx, {
            sceneId: 1, rendId: 100, newType: 'cartoon',
        })
        expect(res.ok).toBe(false)
        expect(f.toXML2).not.toHaveBeenCalled()
    })

    it('rejects when new type is synthetic / atomintr / disorder', () => {
        const f = makeChangeFixture({ oldType: 'simple' })
        for (const bad of ['*group', 'atomintr', 'disorder', '']) {
            const res = changeServices.changeRendererType(f.ctx, {
                sceneId: 1, rendId: 100, newType: bad,
            })
            expect(res.ok).toBe(false)
        }
        expect(f.toXML2).not.toHaveBeenCalled()
    })

    it('rejects when fromXML returns null (deserialize fail)', () => {
        const f = makeChangeFixture({ fromXMLReturns: null })
        const res = changeServices.changeRendererType(f.ctx, {
            sceneId: 1, rendId: 100, newType: 'cartoon',
        })
        expect(res.ok).toBe(false)
        expect(f.destroyRenderer).not.toHaveBeenCalled()
    })

    it('rejects when scene cannot be resolved', () => {
        const f = makeChangeFixture({ sceneExists: false })
        const res = changeServices.changeRendererType(f.ctx, {
            sceneId: 9, rendId: 100, newType: 'cartoon',
        })
        expect(res.ok).toBe(false)
    })

    it('rejects when source renderer cannot be resolved', () => {
        const f = makeChangeFixture({ rendExists: false })
        const res = changeServices.changeRendererType(f.ctx, {
            sceneId: 1, rendId: 99, newType: 'cartoon',
        })
        expect(res.ok).toBe(false)
    })
})

interface FetchFixtureOpts {
    rendType?: string
    /** Comma-separated CSV from searchCompatibleRendererNames. */
    compatibleCsv?: string
    sceneExists?: boolean
    rendExists?: boolean
    objExists?: boolean
}

function makeFetchFixture(opts: FetchFixtureOpts = {}) {
    const {
        rendType = 'simple',
        compatibleCsv = 'simple,cartoon,ballstick,*group,atomintr,disorder, ,tube',
        sceneExists = true,
        rendExists = true,
        objExists = true,
    } = opts

    const obj = objExists
        ? { searchCompatibleRendererNames: vi.fn(() => compatibleCsv) }
        : null
    const rend = {
        type_name: rendType,
        getClientObj: vi.fn(() => obj),
    }
    const scene = {
        getRenderer: vi.fn(() => (rendExists ? rend : null)),
    }
    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
    } as unknown as WorkerContext
    return { ctx, scene, rend, obj }
}

describe('getRendererChangeTypes.service', () => {
    it('filters current type, *-prefixed, atomintr/disorder, blanks', () => {
        const f = makeFetchFixture({ rendType: 'simple' })
        const res = fetchServices.getRendererChangeTypes(f.ctx, {
            sceneId: 1, rendId: 10,
        })
        expect(res.typeNames).toEqual(['cartoon', 'ballstick', 'tube'])
    })

    it('returns empty list for synthetic source renderer (*selection)', () => {
        const f = makeFetchFixture({ rendType: '*selection' })
        const res = fetchServices.getRendererChangeTypes(f.ctx, {
            sceneId: 1, rendId: 10,
        })
        expect(res.typeNames).toEqual([])
    })

    it('returns empty list for *group source renderer', () => {
        const f = makeFetchFixture({ rendType: '*group' })
        const res = fetchServices.getRendererChangeTypes(f.ctx, {
            sceneId: 1, rendId: 10,
        })
        expect(res.typeNames).toEqual([])
    })

    it('returns empty list for atomintr source renderer', () => {
        const f = makeFetchFixture({ rendType: 'atomintr' })
        const res = fetchServices.getRendererChangeTypes(f.ctx, {
            sceneId: 1, rendId: 10,
        })
        expect(res.typeNames).toEqual([])
    })

    it('returns empty list when scene cannot be resolved', () => {
        const f = makeFetchFixture({ sceneExists: false })
        const res = fetchServices.getRendererChangeTypes(f.ctx, {
            sceneId: 99, rendId: 10,
        })
        expect(res.typeNames).toEqual([])
    })
})
