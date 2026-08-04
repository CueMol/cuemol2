/**
 * Pure menu-state helpers shared between main and renderer tests.
 *
 * main/menu.ts holds a `lastMenuState` cache because the native menu
 * is rebuilt after every MRU change (RECENT_ADD / RECENT_CLEAR), which
 * replaces every MenuItem instance -- the `enabled` / `checked` flags
 * that `updateMenuState()` wrote to the previous MenuItems are
 * therefore lost unless we reapply them to the new ones.
 *
 * `mergeMenuState` keeps the cache up-to-date when partial updates
 * arrive (the renderer sends only the slices that changed, e.g.
 * `viewProjection` alone after a UI toggle). `applyMenuStateTo` then
 * writes the merged cache onto whichever menu we have at hand -- old
 * one in the steady-state path, freshly built one in the post-rebuild
 * path.
 */

import type { MenuState } from './ipcTypes'
import { SCENE_EXPORT_MENU_EXPORTERS } from './menuTemplate'

/**
 * Menu item ids (from `menuTemplate.ts`) of implemented actions that operate on
 * an existing scene and therefore must be disabled when no molview tab is
 * active. Kept here (shared) so main and renderer agree on the set.
 *
 * Excludes items already gated by their own state slice (background colour,
 * perspective / orthographic, center mark) and the not-yet-ported placeholders
 * (scene-props, color-proof, image-render, ...), whose disabled-ness is a
 * separate concern.
 */
export const SCENE_REQUIRING_MENU_IDS: readonly string[] = [
    // File
    'save-file-as',
    'save-current-view',
    'reload-scene',
    'save-scene',
    'save-scene-as',
    // Edit (molecule operations)
    'merge-mol',
    'delete-mol-atoms',
    'change-chain-id',
    'change-resid-num',
    // Rendering
    'export-scene',
    // View
    'view-props',
    // Tools (molecule operations)
    'mol-superpose',
    'interaction',
    'reassign-2ndry',
    'mol-surf',
    'surf-cutter',
]

/** Minimal MenuItem surface that the apply helper mutates. */
export interface MenuItemLike {
    enabled: boolean
    checked: boolean
    /** Electron MenuItem visibility; toggled for capability-gated export items. */
    visible?: boolean
}

/** Minimal Menu surface used by the apply helper. */
export interface MenuLike {
    getMenuItemById(id: string): MenuItemLike | null
}

/**
 * Merge a new partial state into an existing cache. Each top-level
 * slice (`viewProjection` / `viewCenterMark` / `sceneBgColor`) is
 * replaced atomically -- that mirrors how the renderer sends them
 * (always a complete slice, never field-level patches).
 */
export function mergeMenuState(
    current: MenuState | null,
    update: MenuState,
): MenuState {
    return {
        viewProjection: update.viewProjection ?? current?.viewProjection,
        viewCenterMark: update.viewCenterMark ?? current?.viewCenterMark,
        sceneBgColor: update.sceneBgColor ?? current?.sceneBgColor,
        undo: update.undo ?? current?.undo,
        redo: update.redo ?? current?.redo,
        sceneOps: update.sceneOps ?? current?.sceneOps,
        exportCaps: update.exportCaps ?? current?.exportCaps,
    }
}

/**
 * Write a (possibly merged) state onto a menu by id-based lookup.
 * Items that the menu doesn't have are skipped silently -- callers
 * may pass a state slice for a menu that was just rebuilt and is
 * still missing the right ids.
 */
export function applyMenuStateTo(menu: MenuLike, state: MenuState): void {
    if (state.viewProjection) {
        const { enabled, perspective } = state.viewProjection
        const perspectiveItem = menu.getMenuItemById('view-perspective')
        const orthographicItem = menu.getMenuItemById('view-orthographic')
        if (perspectiveItem) {
            perspectiveItem.enabled = enabled
            perspectiveItem.checked = enabled && perspective === true
        }
        if (orthographicItem) {
            orthographicItem.enabled = enabled
            orthographicItem.checked = enabled && perspective === false
        }
    }

    if (state.viewCenterMark) {
        const { enabled, centerMark } = state.viewCenterMark
        const markItems = [
            { id: 'center-mark-none', value: 'none' as const },
            { id: 'center-mark-cross', value: 'crosshair' as const },
            { id: 'center-mark-axis', value: 'axis' as const },
        ]
        for (const { id, value } of markItems) {
            const item = menu.getMenuItemById(id)
            if (item) {
                item.enabled = enabled
                item.checked = enabled && centerMark === value
            }
        }
    }

    if (state.sceneBgColor) {
        const { enabled, bgColor } = state.sceneBgColor
        const bgItems = [
            { id: 'bg-white', value: 'white' as const },
            { id: 'bg-black', value: 'black' as const },
        ]
        for (const { id, value } of bgItems) {
            const item = menu.getMenuItemById(id)
            if (item) {
                item.enabled = enabled
                item.checked = enabled && bgColor === value
            }
        }
    }

    if (state.undo) {
        const item = menu.getMenuItemById('undo')
        if (item) item.enabled = state.undo.enabled
    }

    if (state.redo) {
        const item = menu.getMenuItemById('redo')
        if (item) item.enabled = state.redo.enabled
    }

    if (state.sceneOps) {
        for (const id of SCENE_REQUIRING_MENU_IDS) {
            const item = menu.getMenuItemById(id)
            if (item) item.enabled = state.sceneOps.enabled
        }
    }

    // Hide scene-export menu items whose exporter is not registered in this
    // libcuemol2 build (e.g. Umbreon without HAVE_UMBREON). Gating is fail-open:
    // an empty availability set (unknown / probe failed) leaves every item
    // visible, since a successful probe always includes the always-built 'png'.
    if (state.exportCaps && state.exportCaps.available.length > 0) {
        const available = new Set(state.exportCaps.available)
        for (const [id, exporter] of Object.entries(SCENE_EXPORT_MENU_EXPORTERS)) {
            const item = menu.getMenuItemById(id)
            if (item) item.visible = available.has(exporter)
        }
    }
}
