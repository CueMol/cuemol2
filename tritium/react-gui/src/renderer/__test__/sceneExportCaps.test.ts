/**
 * @file __test__/sceneExportCaps.test.ts
 * @description Pins the scene-exporter capability gate (option B): the worker
 * probe that enumerates category-2 exporters, and the menu-state application
 * that hides export items whose exporter is not built in (e.g. Umbreon without
 * HAVE_UMBREON). Wire contract: `getInfoJSON2` cat-2 names -> `exportCaps`
 * slice -> `MenuItem.visible` per `SCENE_EXPORT_MENU_EXPORTERS`.
 */
import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { services } from '@renderer/worker/server/services/scene/scene.service'
import {
    applyMenuStateTo,
    type MenuItemLike,
    type MenuLike,
} from '@shared/menuStateApply'
import { SCENE_EXPORT_MENU_EXPORTERS } from '@shared/menuTemplate'

// --- Worker probe: getAvailableSceneExporters ---

/** Build a ctx whose StreamManager.getInfoJSON2 returns the given JSON string. */
function makeCtx(infoJSON: string): WorkerContext {
    return {
        strMgr: { getInfoJSON2: vi.fn(() => infoJSON) },
    } as unknown as WorkerContext
}

describe('getAvailableSceneExporters', () => {
    it('returns only the category-2 (IOH_CAT_RENDTOFILE) exporter names', () => {
        const info = JSON.stringify([
            { name: 'pdb', category: 0 }, // obj reader -- excluded
            { name: 'png', category: 2 },
            { name: 'umbreon', category: 2 },
            { name: 'pov', category: 2 },
            { name: 'qdfmol', category: 1 }, // obj writer -- excluded
        ])
        const res = services.getAvailableSceneExporters(makeCtx(info))
        expect(res.ok).toBe(true)
        expect(res.names).toEqual(['png', 'umbreon', 'pov'])
    })

    it('omits umbreon on a build without HAVE_UMBREON', () => {
        const info = JSON.stringify([
            { name: 'png', category: 2 },
            { name: 'pov', category: 2 },
            { name: 'stl', category: 2 },
            { name: 'mqo', category: 2 },
        ])
        const res = services.getAvailableSceneExporters(makeCtx(info))
        expect(res.ok).toBe(true)
        expect(res.names).not.toContain('umbreon')
    })

    it('fails closed (ok:false, empty names) when the JSON cannot be parsed', () => {
        const res = services.getAvailableSceneExporters(makeCtx('not json'))
        expect(res.ok).toBe(false)
        expect(res.names).toEqual([])
    })
})

// --- Menu-state gate: applyMenuStateTo exportCaps ---

class FakeMenuItem implements MenuItemLike {
    enabled = true
    checked = false
    visible = true
}

/** A menu whose export items are looked up by id. */
function makeMenu(): { menu: MenuLike; items: Record<string, FakeMenuItem> } {
    const items: Record<string, FakeMenuItem> = {}
    for (const id of Object.keys(SCENE_EXPORT_MENU_EXPORTERS)) {
        items[id] = new FakeMenuItem()
    }
    const menu: MenuLike = {
        getMenuItemById: (id: string) => items[id] ?? null,
    }
    return { menu, items }
}

describe('applyMenuStateTo -- exportCaps gate', () => {
    it('hides export items whose exporter is not in the available set', () => {
        const { menu, items } = makeMenu()
        applyMenuStateTo(menu, {
            exportCaps: { available: ['png', 'pov', 'stl', 'mqo'] },
        })
        expect(items['export-umbreon'].visible).toBe(false)
        expect(items['export-png'].visible).toBe(true)
        expect(items['export-pov'].visible).toBe(true)
    })

    it('shows every export item when all exporters are available', () => {
        const { menu, items } = makeMenu()
        applyMenuStateTo(menu, {
            exportCaps: { available: ['png', 'umbreon', 'pov', 'stl', 'mqo'] },
        })
        for (const id of Object.keys(SCENE_EXPORT_MENU_EXPORTERS)) {
            expect(items[id].visible).toBe(true)
        }
    })

    it('fails open: an empty availability set hides nothing', () => {
        const { menu, items } = makeMenu()
        applyMenuStateTo(menu, { exportCaps: { available: [] } })
        for (const id of Object.keys(SCENE_EXPORT_MENU_EXPORTERS)) {
            expect(items[id].visible).toBe(true)
        }
    })
})
