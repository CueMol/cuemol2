/**
 * Pin the contract that the View / Scene state cached by updateMenuState
 * survives an MRU-triggered menu rebuild.
 *
 * History: when File > Open Recent was first wired (RECENT_ADD /
 * RECENT_CLEAR -> `rebuildApplicationMenu()`), opening a file silently
 * reset View > Perspective / Orthographic / Center mark / Scene >
 * Background to the static template defaults (`enabled: false`). The
 * fix is to cache the last MenuState in main/menu.ts and reapply it
 * to the freshly built menu inside `buildAndSetMenu`. This test pins
 * both halves of that contract via the pure helpers in
 * `shared/menuStateApply.ts`.
 *
 * The integration "buildAndSetMenu calls applyMenuStateTo when
 * lastMenuState is non-null" is a single-line invocation in main code
 * that depends on the Electron Menu surface -- checked manually + by
 * type-check. The retention pattern itself (cache hold-over and re-
 * applied to a brand new menu instance) is what was missed before; we
 * pin it here.
 */
import { describe, it, expect } from 'vitest'
import type { MenuState } from './types/menuState'
import {
    applyMenuStateTo,
    mergeMenuState,
    SCENE_REQUIRING_MENU_IDS,
    type MenuItemLike,
    type MenuLike,
} from '@shared/menuStateApply'

class FakeMenuItem implements MenuItemLike {
    constructor(public id: string) {}
    enabled = false
    checked = false
}

function makeFakeMenu(): MenuLike & { items: Map<string, FakeMenuItem> } {
    const items = new Map<string, FakeMenuItem>()
    for (const id of [
        'view-perspective',
        'view-orthographic',
        'center-mark-none',
        'center-mark-cross',
        'center-mark-axis',
        'bg-white',
        'bg-black',
        'undo',
        'redo',
        ...SCENE_REQUIRING_MENU_IDS,
    ]) {
        items.set(id, new FakeMenuItem(id))
    }
    return {
        items,
        getMenuItemById(id: string) {
            return items.get(id) ?? null
        },
    }
}

describe('mergeMenuState', () => {
    it('keeps unset slices from the previous cache', () => {
        const cache: MenuState = {
            viewProjection: { enabled: true, perspective: true },
            viewCenterMark: { enabled: true, centerMark: 'axis' },
        }
        const merged = mergeMenuState(cache, {
            sceneBgColor: { enabled: true, bgColor: 'white' },
        })
        expect(merged.viewProjection).toEqual({ enabled: true, perspective: true })
        expect(merged.viewCenterMark).toEqual({ enabled: true, centerMark: 'axis' })
        expect(merged.sceneBgColor).toEqual({ enabled: true, bgColor: 'white' })
    })

    it('replaces an existing slice atomically', () => {
        const cache: MenuState = {
            viewProjection: { enabled: true, perspective: true },
        }
        const merged = mergeMenuState(cache, {
            viewProjection: { enabled: true, perspective: false },
        })
        expect(merged.viewProjection).toEqual({ enabled: true, perspective: false })
    })

    it('treats null current as empty', () => {
        const merged = mergeMenuState(null, {
            viewProjection: { enabled: true, perspective: true },
        })
        expect(merged.viewProjection).toEqual({ enabled: true, perspective: true })
        expect(merged.viewCenterMark).toBeUndefined()
        expect(merged.sceneBgColor).toBeUndefined()
        expect(merged.undo).toBeUndefined()
        expect(merged.redo).toBeUndefined()
    })

    it('carries undo/redo slices across an unrelated update', () => {
        const cache: MenuState = {
            undo: { enabled: true },
            redo: { enabled: false },
        }
        const merged = mergeMenuState(cache, {
            viewProjection: { enabled: true, perspective: true },
        })
        expect(merged.undo).toEqual({ enabled: true })
        expect(merged.redo).toEqual({ enabled: false })
    })

    it('carries the sceneOps slice across an unrelated update', () => {
        const cache: MenuState = { sceneOps: { enabled: false } }
        const merged = mergeMenuState(cache, {
            viewProjection: { enabled: true, perspective: true },
        })
        expect(merged.sceneOps).toEqual({ enabled: false })
    })
})

describe('applyMenuStateTo — sets enabled/checked correctly', () => {
    it('viewProjection: perspective=true checks Perspective, leaves Orthographic enabled but unchecked', () => {
        const menu = makeFakeMenu()
        applyMenuStateTo(menu, {
            viewProjection: { enabled: true, perspective: true },
        })
        expect(menu.items.get('view-perspective')!.enabled).toBe(true)
        expect(menu.items.get('view-perspective')!.checked).toBe(true)
        expect(menu.items.get('view-orthographic')!.enabled).toBe(true)
        expect(menu.items.get('view-orthographic')!.checked).toBe(false)
    })

    it('viewProjection: enabled=false leaves both Perspective and Orthographic disabled and unchecked', () => {
        const menu = makeFakeMenu()
        applyMenuStateTo(menu, {
            viewProjection: { enabled: false, perspective: null },
        })
        expect(menu.items.get('view-perspective')!.enabled).toBe(false)
        expect(menu.items.get('view-perspective')!.checked).toBe(false)
        expect(menu.items.get('view-orthographic')!.enabled).toBe(false)
        expect(menu.items.get('view-orthographic')!.checked).toBe(false)
    })

    it('viewCenterMark: axis checks Axis only', () => {
        const menu = makeFakeMenu()
        applyMenuStateTo(menu, {
            viewCenterMark: { enabled: true, centerMark: 'axis' },
        })
        expect(menu.items.get('center-mark-axis')!.checked).toBe(true)
        expect(menu.items.get('center-mark-cross')!.checked).toBe(false)
        expect(menu.items.get('center-mark-none')!.checked).toBe(false)
        for (const id of ['center-mark-axis', 'center-mark-cross', 'center-mark-none']) {
            expect(menu.items.get(id)!.enabled).toBe(true)
        }
    })

    it('sceneBgColor: white checks bg-white only', () => {
        const menu = makeFakeMenu()
        applyMenuStateTo(menu, {
            sceneBgColor: { enabled: true, bgColor: 'white' },
        })
        expect(menu.items.get('bg-white')!.checked).toBe(true)
        expect(menu.items.get('bg-black')!.checked).toBe(false)
        expect(menu.items.get('bg-white')!.enabled).toBe(true)
        expect(menu.items.get('bg-black')!.enabled).toBe(true)
    })

    it('undo/redo: writes the enabled flag to the undo/redo items', () => {
        const menu = makeFakeMenu()
        applyMenuStateTo(menu, {
            undo: { enabled: true },
            redo: { enabled: false },
        })
        expect(menu.items.get('undo')!.enabled).toBe(true)
        expect(menu.items.get('redo')!.enabled).toBe(false)
    })

    it('sceneOps: disables every scene-requiring item when enabled=false', () => {
        const menu = makeFakeMenu()
        // Pre-enable them to prove the apply turns them off.
        for (const id of SCENE_REQUIRING_MENU_IDS) menu.items.get(id)!.enabled = true
        applyMenuStateTo(menu, { sceneOps: { enabled: false } })
        for (const id of SCENE_REQUIRING_MENU_IDS) {
            expect(menu.items.get(id)!.enabled).toBe(false)
        }
    })

    it('sceneOps: enables every scene-requiring item when enabled=true', () => {
        const menu = makeFakeMenu()
        applyMenuStateTo(menu, { sceneOps: { enabled: true } })
        for (const id of SCENE_REQUIRING_MENU_IDS) {
            expect(menu.items.get(id)!.enabled).toBe(true)
        }
        // An unrelated item (no sceneOps gate) is untouched.
        expect(menu.items.get('bg-white')!.enabled).toBe(false)
    })

    it('does not touch items belonging to unset slices', () => {
        const menu = makeFakeMenu()
        // Pre-set center-mark-axis to a non-default state.
        menu.items.get('center-mark-axis')!.enabled = true
        menu.items.get('center-mark-axis')!.checked = true
        applyMenuStateTo(menu, {
            viewProjection: { enabled: true, perspective: true },
        })
        // Center-mark items must survive unchanged.
        expect(menu.items.get('center-mark-axis')!.enabled).toBe(true)
        expect(menu.items.get('center-mark-axis')!.checked).toBe(true)
    })
})

describe('retention across rebuild (cache + apply pattern)', () => {
    it('applying merged cache to a brand-new menu restores every slice', () => {
        // Simulate the renderer pushing slices over time.
        let cache: MenuState | null = null
        cache = mergeMenuState(cache, {
            viewProjection: { enabled: true, perspective: true },
            viewCenterMark: { enabled: true, centerMark: 'axis' },
            sceneBgColor: { enabled: true, bgColor: 'white' },
        })
        // Renderer toggles projection later.
        cache = mergeMenuState(cache, {
            viewProjection: { enabled: true, perspective: false },
        })

        // First (pre-rebuild) menu -- apply the latest cache.
        const before = makeFakeMenu()
        applyMenuStateTo(before, cache)
        expect(before.items.get('view-orthographic')!.checked).toBe(true)
        expect(before.items.get('center-mark-axis')!.checked).toBe(true)
        expect(before.items.get('bg-white')!.checked).toBe(true)

        // MRU change triggers a full rebuild -- a fresh menu instance
        // appears with template defaults (enabled: false everywhere).
        const after = makeFakeMenu()
        for (const item of after.items.values()) {
            expect(item.enabled).toBe(false)
            expect(item.checked).toBe(false)
        }

        // buildAndSetMenu re-applies the cached state.
        applyMenuStateTo(after, cache)

        // All three slices restored on the fresh MenuItem instances.
        expect(after.items.get('view-perspective')!.enabled).toBe(true)
        expect(after.items.get('view-perspective')!.checked).toBe(false)
        expect(after.items.get('view-orthographic')!.enabled).toBe(true)
        expect(after.items.get('view-orthographic')!.checked).toBe(true)
        expect(after.items.get('center-mark-axis')!.enabled).toBe(true)
        expect(after.items.get('center-mark-axis')!.checked).toBe(true)
        expect(after.items.get('bg-white')!.enabled).toBe(true)
        expect(after.items.get('bg-white')!.checked).toBe(true)
    })

    it('no cache yet (null) leaves the fresh menu at template defaults', () => {
        const cache: MenuState | null = null
        const after = makeFakeMenu()
        // Mirrors `if (lastMenuState) applyMenuStateTo(...)` in
        // buildAndSetMenu -- when no state has arrived yet, we must not
        // accidentally apply an empty MenuState (which would still
        // enter the three if-blocks if the helper were sloppy).
        if (cache) applyMenuStateTo(after, cache)
        for (const item of after.items.values()) {
            expect(item.enabled).toBe(false)
            expect(item.checked).toBe(false)
        }
    })
})
