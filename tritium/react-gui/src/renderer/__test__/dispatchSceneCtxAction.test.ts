/**
 * Per-action dispatch contract for the scene-tree right-click. Asserts
 * the case-by-case routing of SceneCtxAction to the appropriate ctx
 * callback. Covers a representative subset (basic verbs + multi
 * + dialog-driven case + node-type gates).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const runObjectSaveFlow = vi.fn()
vi.mock('../hooks/sceneContextMenu/runObjectSaveFlow', () => ({
    runObjectSaveFlow: (...args: unknown[]) => runObjectSaveFlow(...args),
}))

import {
    dispatchSceneCtxAction,
    type DispatchSceneCtxActionCtx,
} from '../hooks/sceneContextMenu/dispatchSceneCtxAction'
import type { SceneCtxAction } from '@shared/types/sceneCtxMenu'
import { IPC } from '@shared/ipcChannels'

function makeCtx(overrides: Partial<DispatchSceneCtxActionCtx> = {}): DispatchSceneCtxActionCtx {
    return {
        cm: null,
        sceneId: 7,
        activeViewId: 5,
        toggleVisibility: vi.fn(),
        showErrorAlert: vi.fn().mockResolvedValue(undefined),
        deleteNode: vi.fn().mockResolvedValue(true),
        showProperty: vi.fn(),
        selectObjectMol: vi.fn().mockResolvedValue(true),
        beginInlineRename: vi.fn(),
        copyNode: vi.fn().mockResolvedValue(true),
        pasteNode: vi.fn().mockResolvedValue(true),
        setRendererColoring: vi.fn().mockResolvedValue(true),
        paintRendererSelection: vi.fn().mockResolvedValue(true),
        paintObjectSelection: vi.fn().mockResolvedValue(true),
        applyRendererStyle: vi.fn().mockResolvedValue(true),
        setSceneBackgroundColor: vi.fn().mockResolvedValue(true),
        toggleSceneColorProofing: vi.fn().mockResolvedValue(true),
        setRendererSelection: vi.fn().mockResolvedValue(true),
        generateRendererSurfObj: vi.fn().mockResolvedValue(true),
        createRendererGroup: vi.fn().mockResolvedValue(true),
        changeRendererType: vi.fn().mockResolvedValue(true),
        createRendererOnObject: vi.fn().mockResolvedValue(true),
        bulkSetNodeVisible: vi.fn().mockResolvedValue(true),
        bulkDeleteNodes: vi.fn().mockResolvedValue(true),
        bulkCopyNodes: vi.fn().mockResolvedValue({ ok: true }),
        createStyleSet: vi.fn().mockResolvedValue({ ok: true, newId: 1 }),
        toggleStyleSetReadOnly: vi.fn().mockResolvedValue({ ok: true, readonly: true }),
        loadStyleSetFromFile: vi.fn().mockResolvedValue(true),
        saveStyleSetToFile: vi.fn().mockResolvedValue(true),
        saveStyleSetToCurrentSrc: vi.fn().mockResolvedValue({ ok: true, saved: true }),
        createCamera: vi.fn().mockResolvedValue(true),
        saveViewToCamera: vi.fn().mockResolvedValue(true),
        applyCameraToView: vi.fn().mockResolvedValue(true),
        clearCameraVisFlags: vi.fn().mockResolvedValue(true),
        loadCameraFromFile: vi.fn().mockResolvedValue(true),
        saveCameraToFile: vi.fn().mockResolvedValue(true),
        saveCameraToCurrentSrc: vi.fn().mockResolvedValue({ ok: true, saved: true }),
        reloadCameraFromSrc: vi.fn().mockResolvedValue(true),
        showTextPrompt: vi.fn().mockResolvedValue('typed'),
        showApplyRendStyle: vi.fn().mockResolvedValue(null),
        showCreateRendStyle: vi.fn().mockResolvedValue(null),
        showEditCameraVisFlags: vi.fn().mockResolvedValue(null),
        showEditInteractionList: vi.fn().mockResolvedValue(null),
        showRegenMolSurf: vi.fn().mockResolvedValue(null),
        showStyleEditor: vi.fn().mockResolvedValue(undefined),
        openNewRendererFlow: vi.fn().mockResolvedValue(undefined),
        openNewCameraFlow: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    }
}

const objectNode = (overrides: Record<string, unknown> = {}): any => ({
    id: 42, type: 'object', name: 'mol1', className: 'MolCoord',
    visible: true, children: [], ...overrides,
})
const rendererNode = (overrides: Record<string, unknown> = {}): any => ({
    id: 100, type: 'renderer', name: 'simple1', className: 'simple',
    visible: true, children: [], ...overrides,
})
const cameraNode = (overrides: Record<string, unknown> = {}): any => ({
    id: 200, type: 'camera', name: 'cam1', visible: true, children: [], ...overrides,
})
const styleNode = (overrides: Record<string, unknown> = {}): any => ({
    id: 300, type: 'style', name: 'st1', visible: true, children: [],
    styleInfo: { scopeId: 0, src: '', readonly: false, modified: false },
    ...overrides,
})

describe('dispatchSceneCtxAction — saveAsObject', () => {
    beforeEach(() => vi.clearAllMocks())

    it('alerts with the UXP text when the write fails', async () => {
        runObjectSaveFlow.mockResolvedValue({ status: 'error', path: '/tmp/x.pdb' })
        const ctx = makeCtx({ cm: {} as never })
        await dispatchSceneCtxAction(
            objectNode(), { kind: 'saveAsObject' } as SceneCtxAction, ctx,
        )
        expect(runObjectSaveFlow).toHaveBeenCalledWith(ctx.cm, 7, 42)
        expect(ctx.showErrorAlert).toHaveBeenCalledWith({
            title: 'Save Object As',
            message: 'Failed to save file: /tmp/x.pdb',
        })
    })

    it('stays silent on success and on cancel', async () => {
        for (const status of ['saved', 'cancelled', 'no-writer']) {
            runObjectSaveFlow.mockResolvedValue({ status, path: '/tmp/x.pdb' })
            const ctx = makeCtx({ cm: {} as never })
            await dispatchSceneCtxAction(
                objectNode(), { kind: 'saveAsObject' } as SceneCtxAction, ctx,
            )
            expect(ctx.showErrorAlert).not.toHaveBeenCalled()
        }
    })
})

describe('dispatchSceneCtxAction — simple verbs', () => {
    it('show -> toggleVisibility', async () => {
        const ctx = makeCtx()
        await dispatchSceneCtxAction(objectNode(), { kind: 'show' } as SceneCtxAction, ctx)
        expect(ctx.toggleVisibility).toHaveBeenCalledWith('42')
    })

    it('hide also routes to toggleVisibility (same callback flips state)', async () => {
        const ctx = makeCtx()
        await dispatchSceneCtxAction(objectNode(), { kind: 'hide' } as SceneCtxAction, ctx)
        expect(ctx.toggleVisibility).toHaveBeenCalledWith('42')
    })

    it('rename -> beginInlineRename (not the legacy renameNode dialog)', async () => {
        const ctx = makeCtx()
        await dispatchSceneCtxAction(objectNode(), { kind: 'rename' } as SceneCtxAction, ctx)
        expect(ctx.beginInlineRename).toHaveBeenCalledWith('42')
    })

    it('delete -> deleteNode', async () => {
        const ctx = makeCtx()
        await dispatchSceneCtxAction(objectNode(), { kind: 'delete' } as SceneCtxAction, ctx)
        expect(ctx.deleteNode).toHaveBeenCalledWith('42')
    })

    it('property -> showProperty', async () => {
        const ctx = makeCtx()
        await dispatchSceneCtxAction(objectNode(), { kind: 'property' } as SceneCtxAction, ctx)
        expect(ctx.showProperty).toHaveBeenCalledWith('42')
    })
})

describe('dispatchSceneCtxAction — node-type gating', () => {
    it('selectMol on a non-object node is a no-op', async () => {
        const ctx = makeCtx()
        await dispatchSceneCtxAction(
            rendererNode(),
            { kind: 'selectMol', selectKind: 'all' } as SceneCtxAction,
            ctx,
        )
        expect(ctx.selectObjectMol).not.toHaveBeenCalled()
    })

    it('selectMol on an object node calls selectObjectMol', async () => {
        const ctx = makeCtx()
        await dispatchSceneCtxAction(
            objectNode(),
            { kind: 'selectMol', selectKind: 'all' } as SceneCtxAction,
            ctx,
        )
        expect(ctx.selectObjectMol).toHaveBeenCalledWith('42', 'all')
    })

    it('paintRend routes object nodes to paintObjectSelection (UXP onPaintMol object branch)', async () => {
        const ctx = makeCtx()
        await dispatchSceneCtxAction(
            objectNode(),
            { kind: 'paintRend', colorValue: '#ff0000' } as SceneCtxAction,
            ctx,
        )
        expect(ctx.paintObjectSelection).toHaveBeenCalledWith('42', '#ff0000')
        expect(ctx.paintRendererSelection).not.toHaveBeenCalled()
    })

    it('paintRend routes renderer nodes to paintRendererSelection', async () => {
        const ctx = makeCtx()
        await dispatchSceneCtxAction(
            rendererNode(),
            { kind: 'paintRend', colorValue: '#00ff00' } as SceneCtxAction,
            ctx,
        )
        expect(ctx.paintRendererSelection).toHaveBeenCalledWith('100', '#00ff00')
        expect(ctx.paintObjectSelection).not.toHaveBeenCalled()
    })

    it('cameraSaveFromView is a no-op when activeViewId is undefined', async () => {
        const ctx = makeCtx({ activeViewId: undefined })
        await dispatchSceneCtxAction(
            cameraNode(),
            { kind: 'cameraSaveFromView', withVisFlags: false } as SceneCtxAction,
            ctx,
        )
        expect(ctx.saveViewToCamera).not.toHaveBeenCalled()
    })
})

describe('dispatchSceneCtxAction — multi-select cases', () => {
    const selectedIds = new Set(['42', '43', '44'])

    it('multiShow -> bulkSetNodeVisible(ids, true)', async () => {
        const ctx = makeCtx({ selectedIds })
        await dispatchSceneCtxAction(objectNode(), { kind: 'multiShow' } as SceneCtxAction, ctx)
        expect(ctx.bulkSetNodeVisible).toHaveBeenCalledWith(selectedIds, true)
    })

    it('multiHide -> bulkSetNodeVisible(ids, false)', async () => {
        const ctx = makeCtx({ selectedIds })
        await dispatchSceneCtxAction(objectNode(), { kind: 'multiHide' } as SceneCtxAction, ctx)
        expect(ctx.bulkSetNodeVisible).toHaveBeenCalledWith(selectedIds, false)
    })

    it('multiDelete -> bulkDeleteNodes(ids)', async () => {
        const ctx = makeCtx({ selectedIds })
        await dispatchSceneCtxAction(objectNode(), { kind: 'multiDelete' } as SceneCtxAction, ctx)
        expect(ctx.bulkDeleteNodes).toHaveBeenCalledWith(selectedIds)
    })

    it('multiCopy -> bulkCopyNodes(ids), no alert on success', async () => {
        const ctx = makeCtx({ selectedIds })
        await dispatchSceneCtxAction(objectNode(), { kind: 'multiCopy' } as SceneCtxAction, ctx)
        expect(ctx.bulkCopyNodes).toHaveBeenCalledWith(selectedIds)
        expect(ctx.showErrorAlert).not.toHaveBeenCalled()
    })

    it('multiCopy surfaces UXP\'s wording for each refusal', async () => {
        for (const [reason, message] of [
            ['mixed', 'Multiple items with different types selected.'],
            ['objectUnsupported', 'Multiple copy of object: not supported.'],
        ] as const) {
            const ctx = makeCtx({
                selectedIds,
                bulkCopyNodes: vi.fn().mockResolvedValue({ ok: false, reason }),
            })
            await dispatchSceneCtxAction(objectNode(), { kind: 'multiCopy' } as SceneCtxAction, ctx)
            expect(ctx.showErrorAlert).toHaveBeenCalledWith({ title: 'Copy', message })
        }
    })

    it('multi cases are no-ops when the bulk callbacks are not wired', async () => {
        const ctx = makeCtx({
            selectedIds, bulkSetNodeVisible: undefined, bulkDeleteNodes: undefined,
        })
        await dispatchSceneCtxAction(objectNode(), { kind: 'multiHide' } as SceneCtxAction, ctx)
        await dispatchSceneCtxAction(objectNode(), { kind: 'multiDelete' } as SceneCtxAction, ctx)
        // No throw; callbacks never invoked (they don't exist)
    })
})

describe('dispatchSceneCtxAction — regenSurface', () => {
    const regenInfo = {
        ok: true, canRegen: true, objName: 'sf_1crn', origMol: '1crn',
        origMolFound: true, selStr: 'protein', density: 3, probeRadius: 1.4,
    }
    const cmWith = (info: unknown) =>
        ({ invokeService: vi.fn().mockResolvedValue(info) }) as any

    it('pre-fetches the regen info and opens the dialog with it', async () => {
        const cm = cmWith(regenInfo)
        const ctx = makeCtx({ cm })
        await dispatchSceneCtxAction(
            objectNode({ id: 42, className: 'MolSurfObj' }),
            { kind: 'regenSurface' } as SceneCtxAction, ctx,
        )
        expect(cm.invokeService).toHaveBeenCalledWith('getMolSurfRegenInfo', {
            sceneId: 7, objId: 42,
        })
        expect(ctx.showRegenMolSurf).toHaveBeenCalledWith({
            sceneId: 7, objId: 42, objName: 'sf_1crn', origMol: '1crn',
            selStr: 'protein', density: 3, probeRadius: 1.4,
        })
    })

    it('does not open the dialog when the origin molecule is gone', async () => {
        const ctx = makeCtx({ cm: cmWith({ ...regenInfo, canRegen: false }) })
        await dispatchSceneCtxAction(
            objectNode({ className: 'MolSurfObj' }),
            { kind: 'regenSurface' } as SceneCtxAction, ctx,
        )
        expect(ctx.showRegenMolSurf).not.toHaveBeenCalled()
    })

    it('is a no-op on a non-object node', async () => {
        const cm = cmWith(regenInfo)
        const ctx = makeCtx({ cm })
        await dispatchSceneCtxAction(
            rendererNode(), { kind: 'regenSurface' } as SceneCtxAction, ctx,
        )
        expect(cm.invokeService).not.toHaveBeenCalled()
        expect(ctx.showRegenMolSurf).not.toHaveBeenCalled()
    })
})

describe('dispatchSceneCtxAction — style fall-through', () => {
    beforeEach(() => {
        (window as any).electronAPI = {
            invoke: vi.fn(async () => ({ canceled: false, filePath: '/tmp/x.qsl' })),
        }
    })

    it('styleSave with empty src falls through to Save As (DIALOG_STYLE_SAVE)', async () => {
        const ctx = makeCtx({
            saveStyleSetToCurrentSrc: vi.fn().mockResolvedValue({ ok: true, saved: false }),
        })
        const node = styleNode({ name: 'st1' })
        await dispatchSceneCtxAction(node, { kind: 'styleSave' } as SceneCtxAction, ctx)
        const calls = (window as any).electronAPI.invoke.mock.calls
        expect(calls[0][0]).toBe(IPC.DIALOG_STYLE_SAVE)
        expect(ctx.saveStyleSetToFile).toHaveBeenCalledWith(node.id, 0, '/tmp/x.qsl')
    })

    it('styleSave returns early when the underlying save reported saved:true (no fallback)', async () => {
        const ctx = makeCtx({
            saveStyleSetToCurrentSrc: vi.fn().mockResolvedValue({ ok: true, saved: true }),
        })
        await dispatchSceneCtxAction(styleNode(), { kind: 'styleSave' } as SceneCtxAction, ctx)
        expect((window as any).electronAPI.invoke).not.toHaveBeenCalled()
        expect(ctx.saveStyleSetToFile).not.toHaveBeenCalled()
    })
})
