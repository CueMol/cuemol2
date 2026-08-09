/**
 * Degrade-detection test for shared/sceneCtxMenu/sceneCtxTemplates.ts.
 *
 * These tests pin the per-node-type menu structure (item labels, the
 * SceneCtxAction each node carries, and the enabled/checked gates) so
 * future edits to the template can be checked against a fixed contract.
 * The same nodes feed both presentation paths (React MenuPanel on
 * Windows/Linux, native Electron menu on macOS), so this contract covers
 * both.
 *
 * buildTemplate is a pure function -- no Electron APIs, no module state --
 * so it runs directly under Vitest without mocking `electron`.
 */

import { describe, it, expect } from 'vitest'
import { buildTemplate } from '../../shared/sceneCtxMenu/sceneCtxTemplates'
import type { SceneCtxNode } from '../../shared/sceneCtxMenu/sceneCtxItems'
import type { SceneCtxMenuPayload } from '../../shared/ipcTypes'
import { isSeparatorNode } from '../../shared/menuNodes'

function payload(o: Partial<SceneCtxMenuPayload>): SceneCtxMenuPayload {
    return {
        x: 0, y: 0, nodeType: 'object', nodeLabel: '', isVisible: true,
        hasVisibility: true, clipboardKind: null, ...o,
    }
}

/** Recursively find the first item (incl. submenus) with the given label. */
function findItem(items: SceneCtxNode[], label: string): SceneCtxNode | undefined {
    for (const it of items) {
        if (isSeparatorNode(it)) continue
        if (it.label === label) return it
        if (it.submenu) {
            const found = findItem(it.submenu, label)
            if (found) return found
        }
    }
    return undefined
}

/** The action kind carried by a node (undefined for separators / parents). */
function kindOf(node: SceneCtxNode | undefined): string | undefined {
    if (!node || isSeparatorNode(node)) return undefined
    return node.action?.kind
}

/** Non-separator accessor for enabled / checked / type assertions. */
function asItem(node: SceneCtxNode | undefined): Exclude<SceneCtxNode, { type: 'separator' }> | undefined {
    if (!node || isSeparatorNode(node)) return undefined
    return node
}

describe('buildTemplate — multi-select', () => {
    it('renders the multi-only menu when more than one node is selected', () => {
        const tpl = buildTemplate(payload({ multiNodeIds: [1, 2, 3] }))
        expect(asItem(tpl[0])?.label).toBe('3 items selected')
        expect(asItem(tpl[0])?.enabled).toBe(false)
        expect(kindOf(findItem(tpl, 'Show'))).toBe('multiShow')
        expect(kindOf(findItem(tpl, 'Hide'))).toBe('multiHide')
        expect(kindOf(findItem(tpl, 'Delete'))).toBe('multiDelete')
    })

    it('falls through to the type-specific branch for a single node', () => {
        const tpl = buildTemplate(payload({ nodeType: 'object', multiNodeIds: [42] }))
        // object branch carries rename/property; multi branch does not.
        expect(findItem(tpl, 'Rename…')).toBeTruthy()
    })
})

describe('buildTemplate — node-type branches', () => {
    it('scene: header + paste + property', () => {
        const tpl = buildTemplate(payload({ nodeType: 'scene', nodeLabel: 'scene1' }))
        expect(asItem(tpl[0])?.label).toBe('scene1')
        expect(asItem(tpl[0])?.enabled).toBe(false)
        expect(kindOf(findItem(tpl, 'Properties…'))).toBe('property')
    })

    it('object: show/hide + rename + delete + property', () => {
        const tpl = buildTemplate(payload({ nodeType: 'object' }))
        expect(kindOf(findItem(tpl, 'Rename…'))).toBe('rename')
        expect(kindOf(findItem(tpl, 'Delete'))).toBe('delete')
        expect(kindOf(findItem(tpl, 'Copy'))).toBe('copy')
    })

    it('renderer: change-type/style entries present', () => {
        const tpl = buildTemplate(
            payload({
                nodeType: 'renderer',
                rendChangeTypes: ['cartoon', 'simple'],
            }),
        )
        expect(findItem(tpl, 'Edit style…')).toBeTruthy()
        expect(findItem(tpl, 'Create style…')).toBeTruthy()
    })

    it('unknown node type: single disabled header item', () => {
        const tpl = buildTemplate(payload({ nodeType: 'bogus' as never, nodeLabel: 'X' }))
        expect(tpl).toHaveLength(1)
        expect(asItem(tpl[0])?.enabled).toBe(false)
    })
})

describe('buildTemplate — regenerate surface gate', () => {
    const REGEN = 'Regenerate surface…'

    it('is absent unless the object is a MolSurfObj', () => {
        const tpl = buildTemplate(payload({ nodeType: 'object' }))
        expect(findItem(tpl, REGEN)).toBeUndefined()
    })

    it('is present and enabled when the origin molecule resolves', () => {
        const tpl = buildTemplate(payload({
            nodeType: 'object', canRegenSurface: true, regenSurfaceEnabled: true,
        }))
        expect(kindOf(findItem(tpl, REGEN))).toBe('regenSurface')
        expect(asItem(findItem(tpl, REGEN))?.enabled).toBe(true)
    })

    it('stays visible but disabled when the origin molecule is missing', () => {
        const tpl = buildTemplate(payload({
            nodeType: 'object', canRegenSurface: true, regenSurfaceEnabled: false,
        }))
        expect(asItem(findItem(tpl, REGEN))?.enabled).toBe(false)
    })

    it('is not offered on renderer rows', () => {
        const tpl = buildTemplate(payload({
            nodeType: 'renderer', canRegenSurface: true, regenSurfaceEnabled: true,
        }))
        expect(findItem(tpl, REGEN)).toBeUndefined()
    })
})

describe('buildTemplate — camera gates', () => {
    it('Reload follows cameraInfo.src; Clear vis flags follows visSize', () => {
        const withSrc = buildTemplate(
            payload({
                nodeType: 'camera',
                cameraInfo: { src: '/cam.qsc', visSize: 3 },
            }),
        )
        expect(asItem(findItem(withSrc, 'Reload'))?.enabled).toBe(true)
        expect(asItem(findItem(withSrc, 'Clear vis flags'))?.enabled).toBe(true)

        const noSrc = buildTemplate(
            payload({
                nodeType: 'camera',
                cameraInfo: { src: '', visSize: 0 },
            }),
        )
        expect(asItem(findItem(noSrc, 'Reload'))?.enabled).toBe(false)
        expect(asItem(findItem(noSrc, 'Clear vis flags'))?.enabled).toBe(false)
    })

    it('cameraRoot: only New Camera + Camera-file Load', () => {
        const tpl = buildTemplate(payload({ nodeType: 'cameraRoot' }))
        expect(kindOf(findItem(tpl, 'New Camera…'))).toBe('newCamera')
        expect(kindOf(findItem(tpl, 'Load…'))).toBe('cameraLoad')
        // No Delete on the root branch.
        expect(findItem(tpl, 'Delete')).toBeUndefined()
    })
})

describe('buildTemplate — style gates', () => {
    it('global style row (scopeId 0) disables Copy / Delete', () => {
        const tpl = buildTemplate(
            payload({
                nodeType: 'style',
                styleInfo: { scopeId: 0, src: '', readonly: false, modified: false },
            }),
        )
        expect(asItem(findItem(tpl, 'Copy'))?.enabled).toBe(false)
        expect(asItem(findItem(tpl, 'Delete'))?.enabled).toBe(false)
    })

    it('scene-local style row enables Copy / Delete and shows the Read-only checkbox', () => {
        const tpl = buildTemplate(
            payload({
                nodeType: 'style',
                styleInfo: { scopeId: 9, src: '', readonly: true, modified: false },
            }),
        )
        expect(asItem(findItem(tpl, 'Copy'))?.enabled).toBe(true)
        expect(asItem(findItem(tpl, 'Delete'))?.enabled).toBe(true)
        const ro = asItem(findItem(tpl, 'Read-only'))
        expect(ro?.type).toBe('checkbox')
        expect(ro?.checked).toBe(true)
        expect(kindOf(ro)).toBe('styleToggleReadOnly')
    })
})
