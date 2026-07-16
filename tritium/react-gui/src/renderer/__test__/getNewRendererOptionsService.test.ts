import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/getNewRendererOptions.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

interface FixtureOpts {
    objClassName?: string
    objName?: string
    objUid?: number
    /** CSV that searchCompatibleRendererNames returns. */
    compatible?: string
    /** Existing scene-wide rend names (for default-name skip). */
    existingRends?: string[]
    /** Type stored on the renderer fixture (for renderer source nodes). */
    rendType?: string
    /** group string on the renderer fixture. */
    rendGroup?: string
    /** name on the renderer fixture (for rendGroup source). */
    rendName?: string
    objExists?: boolean
    rendExists?: boolean
    sceneExists?: boolean
    /** The mol's current selection string (mol.sel.toString()); '' = none. */
    sel?: string
}

function makeFixture(opts: FixtureOpts = {}) {
    const {
        objClassName = 'PDBMol',
        objName = 'mol1',
        objUid = 10,
        compatible = 'simple,cartoon,*group,atomintr,ballstick',
        existingRends = [],
        rendType = 'simple',
        rendGroup = '',
        rendName = 'grp1',
        objExists = true,
        rendExists = true,
        sceneExists = true,
        sel = '',
    } = opts

    const searchCompatibleRendererNames = vi.fn(() => compatible)
    const obj = objExists
        ? {
            uid: objUid,
            name: objName,
            // C++ wrapper exposes getClassName() as a method, not a property.
            getClassName: vi.fn(() => objClassName),
            searchCompatibleRendererNames,
            // MolCoord.sel -- toString() yields the current selection expr.
            sel: { toString: () => sel },
        }
        : null
    const rend = rendExists
        ? {
            uid: 100,
            name: rendName,
            type_name: rendType,
            group: rendGroup,
            getClientObj: vi.fn(() => obj),
        }
        : null
    const scene = {
        getObject: vi.fn(() => obj),
        getRenderer: vi.fn(() => rend),
        getRendByName: vi.fn((n: string) => existingRends.includes(n) ? { __r: n } : null),
    }
    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
    } as unknown as WorkerContext
    return { ctx, scene, obj, rend }
}

describe('getNewRendererOptions.service', () => {
    it('object source: returns target obj + empty group + filtered types', () => {
        const f = makeFixture({})
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 10, sourceNodeType: 'object',
        })
        expect(res.ok).toBe(true)
        expect(res.targetObjId).toBe(10)
        expect(res.groupName).toBe('')
        expect(res.rendererTypes).toEqual(['simple', 'cartoon', 'ballstick'])
        expect(res.isMol).toBe(true)
        expect(res.defaultName).toBe('simple1')
        // objClassName is the renderer-type history key -- must be the
        // class name from getClassName(), not an empty string.
        expect(res.objClassName).toBe('PDBMol')
    })

    it('renderer source: resolves parent obj via getClientObj + inherits rend.group', () => {
        const f = makeFixture({ rendGroup: 'grpA' })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 100, sourceNodeType: 'renderer',
        })
        expect(res.ok).toBe(true)
        expect(res.targetObjId).toBe(10)
        expect(res.groupName).toBe('grpA')
    })

    it('rendGroup source: resolves parent obj + groupName from rend.name', () => {
        const f = makeFixture({ rendName: 'myGrp' })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 100, sourceNodeType: 'rendGroup',
        })
        expect(res.ok).toBe(true)
        expect(res.targetObjId).toBe(10)
        expect(res.groupName).toBe('myGrp')
    })

    it('non-mol object (MolSurfObj) reports isMol=false', () => {
        const f = makeFixture({ objClassName: 'MolSurfObj' })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 10, sourceNodeType: 'object',
        })
        expect(res.ok).toBe(true)
        expect(res.isMol).toBe(false)
    })

    it('reports the mol current selection (mol.sel) as currentSel', () => {
        const f = makeFixture({ sel: "chain 'A'" })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 10, sourceNodeType: 'object',
        })
        expect(res.currentSel).toBe("chain 'A'")
    })

    it('currentSel is empty when the mol has no selection', () => {
        const f = makeFixture({ sel: '' })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 10, sourceNodeType: 'object',
        })
        expect(res.currentSel).toBe('')
    })

    it('currentSel is empty for a non-mol object even if it exposes sel', () => {
        const f = makeFixture({ objClassName: 'MolSurfObj', sel: "chain 'A'" })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 10, sourceNodeType: 'object',
        })
        expect(res.currentSel).toBe('')
    })

    it('default name skips already-taken slots scene-wide', () => {
        const f = makeFixture({ existingRends: ['simple1', 'simple2'] })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 10, sourceNodeType: 'object',
        })
        expect(res.defaultName).toBe('simple3')
    })

    it('returns ok:false when scene cannot be resolved', () => {
        const f = makeFixture({ sceneExists: false })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 99, sourceNodeId: 10, sourceNodeType: 'object',
        })
        expect(res.ok).toBe(false)
    })

    it('returns ok:false when renderer source has no client obj', () => {
        const f = makeFixture({ objExists: false })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 100, sourceNodeType: 'renderer',
        })
        expect(res.ok).toBe(false)
    })
})
