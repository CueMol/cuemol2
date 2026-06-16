/**
 * Degrade-detection test for main/contextMenu/sceneCtxTemplates.ts.
 *
 * `buildTemplate` was extracted out of sceneContextMenu.ts. These tests
 * pin the per-node-type menu structure (item labels, the SceneCtxAction
 * each `click` carries, and the enabled/checked gates) so future edits to
 * the template can be checked against a fixed contract.
 *
 * buildTemplate is a pure function -- no Electron APIs, no module state --
 * so it runs directly under Vitest without mocking `electron`.
 */

import { describe, it, expect } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { buildTemplate } from '../../main/contextMenu/sceneCtxTemplates'
import type { SceneCtxAction, SceneCtxMenuPayload } from '../../shared/ipcTypes'
import type { SceneCtxActionFn } from '../../main/contextMenu/sceneCtxItems'

// Recording action: maps each produced `click` fn back to its SceneCtxAction.
function makeAction(): {
    action: SceneCtxActionFn
    kindOf: (click: MenuItemConstructorOptions['click']) => string | undefined
} {
    const actions = new Map<unknown, SceneCtxAction>()
    const action: SceneCtxActionFn = (a: SceneCtxAction) => {
        const fn = (): void => {}
        actions.set(fn, a)
        return fn
    }
    return { action, kindOf: (click) => actions.get(click)?.kind }
}

function payload(o: Partial<SceneCtxMenuPayload>): SceneCtxMenuPayload {
    return {
        x: 0, y: 0, nodeType: 'object', nodeLabel: '', isVisible: true,
        hasVisibility: true, clipboardKind: null, ...o,
    }
}

/** Recursively find the first item (incl. submenus) with the given label. */
function findItem(
    items: MenuItemConstructorOptions[],
    label: string,
): MenuItemConstructorOptions | undefined {
    for (const it of items) {
        if (it.label === label) return it
        if (Array.isArray(it.submenu)) {
            const found = findItem(it.submenu, label)
            if (found) return found
        }
    }
    return undefined
}

describe('buildTemplate — multi-select', () => {
    it('renders the multi-only menu when more than one node is selected', () => {
        const { action, kindOf } = makeAction()
        const tpl = buildTemplate(payload({ multiNodeIds: [1, 2, 3] }), action)
        expect(tpl[0].label).toBe('3 items selected')
        expect(tpl[0].enabled).toBe(false)
        expect(kindOf(findItem(tpl, 'Show')?.click)).toBe('multiShow')
        expect(kindOf(findItem(tpl, 'Hide')?.click)).toBe('multiHide')
        expect(kindOf(findItem(tpl, 'Delete')?.click)).toBe('multiDelete')
    })

    it('falls through to the type-specific branch for a single node', () => {
        const { action } = makeAction()
        const tpl = buildTemplate(
            payload({ nodeType: 'object', multiNodeIds: [42] }), action,
        )
        // object branch carries rename/property; multi branch does not.
        expect(findItem(tpl, 'Rename…')).toBeTruthy()
    })
})

describe('buildTemplate — node-type branches', () => {
    it('scene: header + paste + property', () => {
        const { action, kindOf } = makeAction()
        const tpl = buildTemplate(
            payload({ nodeType: 'scene', nodeLabel: 'scene1' }), action,
        )
        expect(tpl[0].label).toBe('scene1')
        expect(tpl[0].enabled).toBe(false)
        expect(kindOf(findItem(tpl, 'Properties…')?.click)).toBe('property')
    })

    it('object: show/hide + rename + delete + property', () => {
        const { action, kindOf } = makeAction()
        const tpl = buildTemplate(payload({ nodeType: 'object' }), action)
        expect(kindOf(findItem(tpl, 'Rename…')?.click)).toBe('rename')
        expect(kindOf(findItem(tpl, 'Delete')?.click)).toBe('delete')
        expect(kindOf(findItem(tpl, 'Copy')?.click)).toBe('copy')
    })

    it('renderer: change-type/style entries present', () => {
        const { action } = makeAction()
        const tpl = buildTemplate(
            payload({
                nodeType: 'renderer',
                rendChangeTypes: ['cartoon', 'simple'],
            }),
            action,
        )
        expect(findItem(tpl, 'Edit style…')).toBeTruthy()
        expect(findItem(tpl, 'Create style…')).toBeTruthy()
    })

    it('unknown node type: single disabled header item', () => {
        const { action } = makeAction()
        const tpl = buildTemplate(
            payload({ nodeType: 'bogus' as never, nodeLabel: 'X' }), action,
        )
        expect(tpl).toHaveLength(1)
        expect(tpl[0].enabled).toBe(false)
    })
})

describe('buildTemplate — camera gates', () => {
    it('Reload follows cameraInfo.src; Clear vis flags follows visSize', () => {
        const { action } = makeAction()
        const withSrc = buildTemplate(
            payload({
                nodeType: 'camera',
                cameraInfo: { src: '/cam.qsc', visSize: 3 },
            }),
            action,
        )
        expect(findItem(withSrc, 'Reload')?.enabled).toBe(true)
        expect(findItem(withSrc, 'Clear vis flags')?.enabled).toBe(true)

        const noSrc = buildTemplate(
            payload({
                nodeType: 'camera',
                cameraInfo: { src: '', visSize: 0 },
            }),
            action,
        )
        expect(findItem(noSrc, 'Reload')?.enabled).toBe(false)
        expect(findItem(noSrc, 'Clear vis flags')?.enabled).toBe(false)
    })

    it('cameraRoot: only New Camera + Camera-file Load', () => {
        const { action, kindOf } = makeAction()
        const tpl = buildTemplate(payload({ nodeType: 'cameraRoot' }), action)
        expect(kindOf(findItem(tpl, 'New Camera…')?.click)).toBe('newCamera')
        expect(kindOf(findItem(tpl, 'Load…')?.click)).toBe('cameraLoad')
        // No Delete on the root branch.
        expect(findItem(tpl, 'Delete')).toBeUndefined()
    })
})

describe('buildTemplate — style gates', () => {
    it('global style row (scopeId 0) disables Copy / Delete', () => {
        const { action } = makeAction()
        const tpl = buildTemplate(
            payload({
                nodeType: 'style',
                styleInfo: { scopeId: 0, src: '', readonly: false, modified: false },
            }),
            action,
        )
        expect(findItem(tpl, 'Copy')?.enabled).toBe(false)
        expect(findItem(tpl, 'Delete')?.enabled).toBe(false)
    })

    it('scene-local style row enables Copy / Delete and shows the Read-only checkbox', () => {
        const { action, kindOf } = makeAction()
        const tpl = buildTemplate(
            payload({
                nodeType: 'style',
                styleInfo: { scopeId: 9, src: '', readonly: true, modified: false },
            }),
            action,
        )
        expect(findItem(tpl, 'Copy')?.enabled).toBe(true)
        expect(findItem(tpl, 'Delete')?.enabled).toBe(true)
        const ro = findItem(tpl, 'Read-only')
        expect(ro?.type).toBe('checkbox')
        expect(ro?.checked).toBe(true)
        expect(kindOf(ro?.click)).toBe('styleToggleReadOnly')
    })
})
