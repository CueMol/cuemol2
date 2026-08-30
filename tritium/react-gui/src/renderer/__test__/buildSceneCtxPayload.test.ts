/**
 * Pre-fetch payload builder for the scene-tree right-click menu. The unit
 * tests verify the per-node-type gating that drives which submenus the
 * main process renders -- the gates double as the visibility filter.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
    buildSceneCtxPayload,
    nodeMenuLabel,
} from '@renderer/hooks/sceneContextMenu/buildSceneCtxPayload'
import { IPC } from '@shared/ipcChannels'
import { setupElectronAPI, teardownElectronAPI } from '@renderer/__test__/helpers/testHarness'

/**
 * Stub the OS-clipboard peek. Paste gating no longer asks the worker: the
 * clipboard lives in the main process so a copy made in another app (or
 * another CueMol window) is visible here.
 */
function stubClipboardPeek(res: { kind: string; name: string } | null): void {
    setupElectronAPI({
        invoke: vi.fn((ch: string) =>
            Promise.resolve(ch === IPC.CLIPBOARD_CUEMOL_PEEK ? res : undefined),
        ) as never,
    })
}

afterEach(() => {
    teardownElectronAPI()
})

const objectNode = (overrides: Record<string, unknown> = {}): any => ({
    id: 1, type: 'object', name: 'mol1', className: 'MolCoord',
    visible: true, children: [], ...overrides,
})

const rendererNode = (overrides: Record<string, unknown> = {}): any => ({
    id: 10, type: 'renderer', name: 'simple1', className: 'simple',
    visible: true, children: [], ...overrides,
})

function makeCm(overrides: Record<string, any> = {}): any {
    return {
        invokeService: vi.fn(async (name: string) => {
            if (overrides[name]) return overrides[name]
            return null
        }),
    }
}

describe('nodeMenuLabel', () => {
    it('prefixes scene rows with "Scene: "', () => {
        const node: any = { type: 'scene', name: 'untitled.qsc' }
        expect(nodeMenuLabel(node)).toBe('Scene: untitled.qsc')
    })

    it('falls back to Untitled for unnamed scenes', () => {
        const node: any = { type: 'scene', name: '' }
        expect(nodeMenuLabel(node)).toBe('Scene: Untitled')
    })

    it('appends className in parens for object/renderer rows', () => {
        expect(nodeMenuLabel(objectNode())).toBe('mol1 (MolCoord)')
        expect(nodeMenuLabel(rendererNode())).toBe('simple1 (simple)')
    })

    it('omits className when missing', () => {
        const node: any = { type: 'object', name: 'x', className: '' }
        expect(nodeMenuLabel(node)).toBe('x')
    })
})

describe('buildSceneCtxPayload — gating', () => {
    it('hasVisibility is true for object / renderer / rendGroup, false otherwise', async () => {
        const cm = makeCm()
        const obj = await buildSceneCtxPayload(cm, 7, objectNode())
        const rend = await buildSceneCtxPayload(cm, 7, rendererNode())
        const grp = await buildSceneCtxPayload(cm, 7,
            { id: 99, type: 'rendGroup', name: 'g', visible: true, children: [] } as any)
        const scene = await buildSceneCtxPayload(cm, 7,
            { id: 0, type: 'scene', name: 's', visible: true, children: [] } as any)
        expect(obj.hasVisibility).toBe(true)
        expect(rend.hasVisibility).toBe(true)
        expect(grp.hasVisibility).toBe(true)
        expect(scene.hasVisibility).toBe(false)
    })

    it('supportsColoring is false for object / scene; true for normal renderers', async () => {
        const cm = makeCm()
        expect((await buildSceneCtxPayload(cm, 7, objectNode())).supportsColoring).toBe(false)
        expect((await buildSceneCtxPayload(cm, 7, rendererNode())).supportsColoring).toBe(true)
    })

    it('supportsColoring is false for *selection / *namelabel / atomintr renderers', async () => {
        const cm = makeCm()
        for (const className of ['*selection', '*namelabel', 'atomintr']) {
            const p = await buildSceneCtxPayload(cm, 7, rendererNode({ className }))
            expect(p.supportsColoring).toBe(false)
        }
    })

    it('supportsChangeSel is false for *selection renderers, true for others', async () => {
        const cm = makeCm()
        const sel = await buildSceneCtxPayload(cm, 7, rendererNode({ className: '*selection' }))
        const simple = await buildSceneCtxPayload(cm, 7, rendererNode())
        expect(sel.supportsChangeSel).toBe(false)
        expect(simple.supportsChangeSel).toBe(true)
    })

    it('canGenSurfObj is true only for isosurf renderers', async () => {
        const cm = makeCm()
        const iso = await buildSceneCtxPayload(cm, 7, rendererNode({ className: 'isosurf' }))
        const simple = await buildSceneCtxPayload(cm, 7, rendererNode())
        expect(iso.canGenSurfObj).toBe(true)
        expect(simple.canGenSurfObj).toBe(false)
    })

    it('canRegenSurface is true only for MolSurfObj object rows', async () => {
        const cm = makeCm()
        const surf = await buildSceneCtxPayload(cm, 7,
            objectNode({ className: 'MolSurfObj' }))
        const mol = await buildSceneCtxPayload(cm, 7, objectNode())
        const rend = await buildSceneCtxPayload(cm, 7,
            rendererNode({ className: 'MolSurfObj' }))
        expect(surf.canRegenSurface).toBe(true)
        expect(mol.canRegenSurface).toBe(false)
        expect(rend.canRegenSurface).toBe(false)
    })
})

describe('buildSceneCtxPayload — regenerate surface gate', () => {
    it('enables the item from the pre-fetched canRegen flag', async () => {
        const cm = makeCm({ getMolSurfRegenInfo: { ok: true, canRegen: true } })
        const p = await buildSceneCtxPayload(cm, 7, objectNode({ className: 'MolSurfObj' }))
        expect(cm.invokeService).toHaveBeenCalledWith('getMolSurfRegenInfo',
            { sceneId: 7, objId: 1 })
        expect(p.canRegenSurface).toBe(true)
        expect(p.regenSurfaceEnabled).toBe(true)
    })

    it('keeps the item visible but disabled when the origin molecule is gone', async () => {
        const cm = makeCm({ getMolSurfRegenInfo: { ok: true, canRegen: false } })
        const p = await buildSceneCtxPayload(cm, 7, objectNode({ className: 'MolSurfObj' }))
        expect(p.canRegenSurface).toBe(true)
        expect(p.regenSurfaceEnabled).toBe(false)
    })

    it('does not pre-fetch for non-MolSurfObj object rows', async () => {
        const cm = makeCm()
        const p = await buildSceneCtxPayload(cm, 7, objectNode())
        const names = cm.invokeService.mock.calls.map((c: unknown[]) => c[0])
        expect(names).not.toContain('getMolSurfRegenInfo')
        expect(p.regenSurfaceEnabled).toBe(false)
    })

    it('degrades to disabled when the pre-fetch throws', async () => {
        const cm = {
            invokeService: vi.fn(async (name: string) => {
                if (name === 'getMolSurfRegenInfo') throw new Error('boom')
                return null
            }),
        } as any
        const p = await buildSceneCtxPayload(cm, 7, objectNode({ className: 'MolSurfObj' }))
        expect(p.canRegenSurface).toBe(true)
        expect(p.regenSurfaceEnabled).toBe(false)
    })
})

describe('buildSceneCtxPayload — pre-fetch dispatch', () => {
    it('renderer node fans out the four parallel pre-fetches, plus clipboardKind', async () => {
        stubClipboardPeek({ kind: 'object', name: 'mol1' })
        const cm = makeCm({
            getPaintColoringStyles: { entries: [{ name: 'a', label: 'A' }] },
            getRendererPaintInfo: { canPaint: true },
            getRendererStyleEntries: { ok: true, typeStyles: [], edgeStyles: [] },
            getRendererChangeTypes: { typeNames: ['ballstick', 'trace'] },
        })
        const p = await buildSceneCtxPayload(cm, 7, rendererNode())
        expect(p.clipboardKind).toBe('object')
        expect(p.paintStyles).toEqual([{ name: 'a', label: 'A' }])
        expect(p.canPaint).toBe(true)
        expect(p.rendStyle).toEqual({ typeStyles: [], edgeStyles: [] })
        expect(p.rendChangeTypes).toEqual(['ballstick', 'trace'])
        const calledServices = cm.invokeService.mock.calls.map((c: any[]) => c[0])
        expect(calledServices).toContain('getPaintColoringStyles')
        expect(calledServices).toContain('getRendererPaintInfo')
        expect(calledServices).toContain('getRendererStyleEntries')
        expect(calledServices).toContain('getRendererChangeTypes')
    })

    it('skips paint pre-fetch for *selection renderer (supportsColoring=false)', async () => {
        const cm = makeCm({
            getRendererStyleEntries: { ok: true, typeStyles: [], edgeStyles: [] },
            getRendererChangeTypes: { typeNames: [] },
        })
        const p = await buildSceneCtxPayload(cm, 7, rendererNode({ className: '*selection' }))
        const calledServices = cm.invokeService.mock.calls.map((c: any[]) => c[0])
        expect(calledServices).not.toContain('getPaintColoringStyles')
        expect(calledServices).not.toContain('getRendererPaintInfo')
        expect(p.paintStyles).toEqual([])
        expect(p.canPaint).toBe(false)
    })

    it('object node only pre-fetches getObjectPaintInfo for canPaint (no renderer fetches)', async () => {
        const cm = makeCm({
            getObjectPaintInfo: { canPaint: true },
        })
        const p = await buildSceneCtxPayload(cm, 7, objectNode())
        expect(p.canPaint).toBe(true)
        const calledServices = cm.invokeService.mock.calls.map((c: any[]) => c[0])
        expect(calledServices).not.toContain('getRendererPaintInfo')
        expect(calledServices).toContain('getObjectPaintInfo')
    })

    it('scene node fetches bgColor + colorProofing only', async () => {
        const cm = makeCm({
            getSceneBgColor: { bgColor: 'white' },
            getSceneColorProofing: { enabled: true },
        })
        const p = await buildSceneCtxPayload(cm, 7,
            { id: 0, type: 'scene', name: 's', visible: true, children: [] } as any)
        expect(p.bgColor).toBe('white')
        expect(p.colorProofingEnabled).toBe(true)
    })

    it('skips all pre-fetches when cm is null but still returns gates', async () => {
        const p = await buildSceneCtxPayload(null, 7, rendererNode())
        expect(p.supportsColoring).toBe(true)
        expect(p.clipboardKind).toBeNull()
        expect(p.paintStyles).toEqual([])
    })

    it('reports no pasteable node when the clipboard holds paint rows', async () => {
        // Paint rows share the OS clipboard with scene nodes, so the scene
        // ctxmenu has to reject them rather than offer a Paste that fails.
        stubClipboardPeek({ kind: 'paint', name: '' })
        const p = await buildSceneCtxPayload(makeCm(), 7, rendererNode())
        expect(p.clipboardKind).toBeNull()
    })

    it('passes node.styleInfo through for style nodes', async () => {
        const cm = makeCm()
        const styleInfo = { scopeId: 0, src: '/x.qsl', readonly: true, modified: false }
        const p = await buildSceneCtxPayload(cm, 7,
            { id: 5, type: 'style', name: 'st', visible: true, children: [], styleInfo } as any)
        expect(p.styleInfo).toEqual(styleInfo)
    })
})
