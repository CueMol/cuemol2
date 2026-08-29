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
    /**
     * scopeId -> getStyleNamesJSON payload. When omitted the ctx has NO
     * styleMgr at all, exercising the fetchStyleEntries fallback.
     */
    styleEntries?: Record<number, string>
}

function makeFixture(opts: FixtureOpts = {}) {
    const {
        objClassName = 'PDBMol',
        objName = 'mol1',
        objUid = 10,
        compatible = 'simple,cartoon,*group,atomintr,ms2test,ballstick',
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
    const getStyleNamesJSON = vi.fn(
        (scopeId: number) => opts.styleEntries?.[scopeId] ?? '[]',
    )
    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
        ...(opts.styleEntries ? { styleMgr: { getStyleNamesJSON } } : {}),
    } as unknown as WorkerContext
    return { ctx, scene, obj, rend, getStyleNamesJSON }
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
        // Synthetic ('*') and developer-only (ms2test / symm) types are
        // dropped; atomintr and disorder are NOT -- UXP offers both when
        // creating a renderer and only hides them when CONVERTING one
        // (fopen-renderopt-page.js setupRendTypeBox vs workspace_panel.js).
        expect(res.rendererTypes).toEqual(['simple', 'cartoon', 'atomintr', 'ballstick'])
        expect(res.isMol).toBe(true)
        expect(res.defaultName).toBe('simple1')
        // objClassName is the renderer-type history key -- must be the
        // class name from getClassName(), not an empty string.
        expect(res.objClassName).toBe('PDBMol')
    })

    it('hides legacy renderer types (gpu_mapmesh) from the type list', () => {
        const f = makeFixture({
            objClassName: 'DensityMap',
            compatible: 'contour,isosurf,gpu_mapmesh,gpu_mapvol,*unitcell',
        })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 10, sourceNodeType: 'object',
        })
        expect(res.ok).toBe(true)
        expect(res.rendererTypes).toEqual(['contour', 'isosurf', 'gpu_mapvol'])
        expect(res.defaultName).toBe('contour1')
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

// --- renderer presets (`<objClassName>-rendpreset` styles) ---

const GLOBAL_STYLES = JSON.stringify([
    { name: 'Default1RendPreset', desc: 'Default preset 1', type: 'PDBMol-rendpreset' },
    { name: 'DefaultRibbon', desc: '', type: 'renderer' },
    { name: 'MapPreset', desc: 'map', type: 'DensityMap-rendpreset' },
    { name: 'NoDescRendPreset', type: 'PDBMol-rendpreset' },
])
const SCENE_STYLES = JSON.stringify([
    { name: 'LocalRendPreset', desc: 'Scene local', type: 'PDBMol-rendpreset' },
])

describe('getNewRendererOptions presets', () => {
    it('collects global then scene-local presets filtered to <objClass>-rendpreset', () => {
        const f = makeFixture({ styleEntries: { 0: GLOBAL_STYLES, 1: SCENE_STYLES } })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 10, sourceNodeType: 'object',
        })
        expect(f.getStyleNamesJSON).toHaveBeenCalledWith(0)
        expect(f.getStyleNamesJSON).toHaveBeenCalledWith(1)
        // Global entries first (UXP concat order); non-matching types
        // dropped; missing desc normalised to ''.
        expect(res.presetTypes).toEqual([
            { name: 'Default1RendPreset', desc: 'Default preset 1' },
            { name: 'NoDescRendPreset', desc: '' },
            { name: 'LocalRendPreset', desc: 'Scene local' },
        ])
    })

    it('hides presets when the flow targets a group (renderer row with group)', () => {
        const f = makeFixture({
            styleEntries: { 0: GLOBAL_STYLES },
            rendGroup: 'grpA',
        })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 100, sourceNodeType: 'renderer',
        })
        expect(res.ok).toBe(true)
        expect(res.presetTypes).toEqual([])
    })

    it('hides presets when launched from a rendGroup row', () => {
        const f = makeFixture({
            styleEntries: { 0: GLOBAL_STYLES },
            rendName: 'myGrp',
        })
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 100, sourceNodeType: 'rendGroup',
        })
        expect(res.presetTypes).toEqual([])
    })

    it('reports empty presets when styleMgr is unavailable', () => {
        const f = makeFixture({})
        const res = services.getNewRendererOptions(f.ctx, {
            sceneId: 1, sourceNodeId: 10, sourceNodeType: 'object',
        })
        expect(res.ok).toBe(true)
        expect(res.presetTypes).toEqual([])
    })
})

describe('getRendPresetTypes.service', () => {
    it('returns presets for the given class name', () => {
        const f = makeFixture({ styleEntries: { 0: GLOBAL_STYLES, 7: SCENE_STYLES } })
        const res = services.getRendPresetTypes(f.ctx, {
            sceneId: 7, objClassName: 'PDBMol',
        })
        expect(res.presets.map((p) => p.name)).toEqual([
            'Default1RendPreset', 'NoDescRendPreset', 'LocalRendPreset',
        ])
    })

    it('returns [] for an empty class name without touching the style manager', () => {
        const f = makeFixture({ styleEntries: { 0: GLOBAL_STYLES } })
        const res = services.getRendPresetTypes(f.ctx, {
            sceneId: 1, objClassName: '',
        })
        expect(res.presets).toEqual([])
        expect(f.getStyleNamesJSON).not.toHaveBeenCalled()
    })
})
