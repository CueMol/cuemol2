/**
 * Degrade-detection tests for the modal-aware menu accelerator block
 * machinery (main side).
 *
 * Unlike `modalMenuBlock.test.tsx` (renderer Provider + IPC fan-out) and
 * `menuStateRetainsAcrossRebuild.test.ts` (pure menuStateApply helpers),
 * NO existing test drove `main/menu.ts`'s own block ref-count, deferred
 * rebuild, or the `updateMenuState` no-op-while-blocked guard. This file
 * pins those three contracts directly so the block machinery can be
 * extracted into `main/menuBlock.ts` without behavior change.
 *
 * Assertions were written and confirmed GREEN against the pre-extraction
 * `main/menu.ts` first, then the import target was switched to the
 * extracted module -- the same assertions must keep passing.
 *
 * Pinned contract:
 *   (a) ref-counted block: setMenuBlocked(reason,true) x2 then
 *       setMenuBlocked(reason,false) x1 stays blocked; the 0 -> 1 edge
 *       disables every item and snapshots their `enabled`, the last
 *       1 -> 0 edge restores them.
 *   (b) deferred rebuild: a rebuild requested while blocked does NOT call
 *       Menu.setApplicationMenu until unblock, then fires exactly once.
 *   (c) updateMenuState is a no-op while blocked (the `if (isBlocked())
 *       return` guard) and applies again after unblock.
 *
 * Electron is mocked with a FakeMenu / FakeMenuItem tree so the machinery
 * runs under jsdom without the real native menu surface.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Fake Electron Menu surface ---

class FakeMenuItem {
  enabled = true
  checked = false
  submenu?: FakeMenu
  constructor(
    public id: string,
    public type: 'normal' | 'separator' = 'normal',
    submenu?: FakeMenu,
  ) {
    this.submenu = submenu
  }
}

class FakeMenu {
  constructor(public items: FakeMenuItem[]) {}
  getMenuItemById(id: string): FakeMenuItem | null {
    for (const item of this.items) {
      if (item.id === id) return item
      if (item.submenu) {
        const found = item.submenu.getMenuItemById(id)
        if (found) return found
      }
    }
    return null
  }
}

vi.mock('electron', () => {
  // FakeMenu/FakeMenuItem are redeclared inside the hoisted factory because
  // vi.mock is lifted above all top-level code -- it cannot close over module
  // scope. The classes mirror the ones above; the test reads spies back off
  // the mocked `Menu` object.
  class MItem {
    enabled = true
    checked = false
    submenu?: MMenu
    constructor(
      public id: string,
      public type: 'normal' | 'separator' = 'normal',
      submenu?: MMenu,
    ) {
      this.submenu = submenu
    }
  }
  class MMenu {
    constructor(public items: MItem[]) {}
    getMenuItemById(id: string): MItem | null {
      for (const item of this.items) {
        if (item.id === id) return item
        if (item.submenu) {
          const found = item.submenu.getMenuItemById(id)
          if (found) return found
        }
      }
      return null
    }
  }
  let installed: MMenu | null = null
  const setApplicationMenu = vi.fn((m: MMenu | null) => {
    installed = m
  })
  const getApplicationMenu = vi.fn(() => installed)
  // buildFromTemplate is invoked by buildAndSetMenu; produce a fresh menu
  // with items at template default (enabled: false) so the deferred-rebuild
  // path is observable.
  const buildFromTemplate = vi.fn(
    () =>
      new MMenu([
        Object.assign(new MItem('a'), { enabled: false }),
        Object.assign(new MItem('b'), { enabled: false }),
      ]),
  )
  return {
    app: { name: 'CueMol', on: vi.fn() },
    Menu: { setApplicationMenu, getApplicationMenu, buildFromTemplate },
    // The Background items carry a generated colour swatch; the drawing
    // itself is not what this file is about.
    nativeImage: { createFromBitmap: vi.fn(() => ({})) },
  }
})

vi.mock('@main/recentFiles', () => ({
  getExistingRecents: vi.fn(() => []),
  refreshRecentsExistence: vi.fn(() => Promise.resolve()),
}))

import { Menu } from 'electron'

const setApplicationMenu = Menu.setApplicationMenu as unknown as ReturnType<typeof vi.fn>
const getApplicationMenu = Menu.getApplicationMenu as unknown as ReturnType<typeof vi.fn>
const buildFromTemplate = Menu.buildFromTemplate as unknown as ReturnType<typeof vi.fn>

import {
  createMenu,
  rebuildApplicationMenu,
  setMenuBlocked,
  resetMenuBlockReason,
  updateMenuState,
  _resetMenuBlockForTest,
} from '@main/menu'
import type { BrowserWindow } from 'electron'

/** Install a fresh, fully-enabled menu as the current application menu. */
function installEnabledMenu(): FakeMenu {
  const menu = new FakeMenu([
    Object.assign(new FakeMenuItem('view-perspective'), { enabled: true }),
    Object.assign(new FakeMenuItem('view-orthographic'), { enabled: true }),
    new FakeMenuItem('sep', 'separator'),
    // Text-edit items: spared by a block so dialogs can still edit text.
    Object.assign(new FakeMenuItem('undo'), { enabled: true }),
    Object.assign(new FakeMenuItem('paste'), { enabled: true }),
  ])
  setApplicationMenu(menu as unknown as never)
  return menu
}

const fakeWindow = {} as unknown as BrowserWindow

describe('menu block machinery (main side)', () => {
  beforeEach(() => {
    _resetMenuBlockForTest()
    setApplicationMenu(null) // clear the installed menu inside the mock
    setApplicationMenu.mockClear()
    getApplicationMenu.mockClear()
    buildFromTemplate.mockClear()
  })

  it('(a) ref-counts: x2 true then x1 false stays blocked; edges snapshot+restore', () => {
    const menu = installEnabledMenu()
    setApplicationMenu.mockClear()

    // 0 -> 1: disable all and snapshot
    setMenuBlocked('blueprint', true)
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(false)

    // 1 -> 2: same reason again; still blocked, idempotent on the items
    setMenuBlocked('blueprint', true)
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(false)

    // 2 -> 1: still blocked; items NOT yet restored
    setMenuBlocked('blueprint', false)
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(false)

    // 1 -> 0: last decrement restores the snapshotted enabled values
    setMenuBlocked('blueprint', false)
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(true)
    expect(menu.getMenuItemById('view-orthographic')!.enabled).toBe(true)
  })

  // On macOS the application menu owns Cmd+X/C/V/A/Z, so blocking these would
  // leave a modal dialog's text fields unable to paste at all.
  it('(a) text-edit items stay enabled through a block', () => {
    const menu = installEnabledMenu()

    setMenuBlocked('blueprint', true)
    expect(menu.getMenuItemById('paste')!.enabled).toBe(true)
    expect(menu.getMenuItemById('undo')!.enabled).toBe(true)
    // ... and are not touched on the way out either.
    setMenuBlocked('blueprint', false)
    expect(menu.getMenuItemById('paste')!.enabled).toBe(true)
    expect(menu.getMenuItemById('undo')!.enabled).toBe(true)
  })

  it('(a) two distinct reasons each hold the block independently', () => {
    const menu = installEnabledMenu()

    setMenuBlocked('blueprint', true) // 0 -> 1
    setMenuBlocked('native', true) // 1 -> 2
    setMenuBlocked('blueprint', false) // 2 -> 1, still blocked
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(false)

    setMenuBlocked('native', false) // 1 -> 0, restored
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(true)
  })

  it('(b) rebuild requested while blocked defers until unblock, then fires once', () => {
    createMenu(fakeWindow)
    expect(setApplicationMenu).toHaveBeenCalledTimes(1) // initial build
    setApplicationMenu.mockClear()

    setMenuBlocked('blueprint', true)
    expect(setApplicationMenu).not.toHaveBeenCalled() // block does not rebuild

    rebuildApplicationMenu()
    rebuildApplicationMenu()
    // Deferred: no rebuild while blocked.
    expect(setApplicationMenu).not.toHaveBeenCalled()

    setMenuBlocked('blueprint', false)
    // Exactly one rebuild on unblock, regardless of how many were requested.
    expect(setApplicationMenu).toHaveBeenCalledTimes(1)
  })

  it('(b) rebuild while NOT blocked fires immediately', () => {
    createMenu(fakeWindow)
    setApplicationMenu.mockClear()

    rebuildApplicationMenu()
    expect(setApplicationMenu).toHaveBeenCalledTimes(1)
  })

  it('(c) updateMenuState does not touch the live menu while blocked', () => {
    const menu = installEnabledMenu()

    setMenuBlocked('blueprint', true)
    // Writing here would fight the block snapshot, which restores the
    // pre-block enabled values on unblock.
    updateMenuState({ viewProjection: { enabled: true, perspective: true } })
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(false)
  })

  /**
   * State pushed during a block must not be dropped. Nothing prompts the
   * renderer to re-emit: useUndoRedoState only pushes on a scene undo event or
   * a tab switch, and useActiveViewState only on a tab switch or an explicit
   * user action. An edit committed from inside a dialog therefore left
   * Edit > Undo greyed out until some later scene event happened to fire one.
   */
  it('(c2) state pushed while blocked is applied on unblock without a re-emit', () => {
    const menu = installEnabledMenu()

    setMenuBlocked('blueprint', true)
    updateMenuState({ viewProjection: { enabled: true, perspective: true } })
    setMenuBlocked('blueprint', false)

    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(true)
    expect(menu.getMenuItemById('view-perspective')!.checked).toBe(true)
  })

  /**
   * The 'blueprint' count is incremented and decremented from the renderer. A
   * reload between the two destroys the component that owed the decrement, so
   * the menu stayed disabled -- Cmd+Q included -- for the rest of the run, with
   * no way back: a later open/close goes 1 -> 2 -> 1.
   */
  it('(d) resetMenuBlockReason lifts a block the renderer can no longer release', () => {
    const menu = installEnabledMenu()

    setMenuBlocked('blueprint', true)
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(false)

    resetMenuBlockReason('blueprint')
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(true)

    // And the counter really is zero: one open/close cycle unblocks again.
    setMenuBlocked('blueprint', true)
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(false)
    setMenuBlocked('blueprint', false)
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(true)
  })

  it('(e) resetMenuBlockReason leaves an unrelated reason blocking', () => {
    const menu = installEnabledMenu()

    setMenuBlocked('blueprint', true)
    setMenuBlocked('native', true)
    resetMenuBlockReason('blueprint')
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(false)

    setMenuBlocked('native', false)
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(true)
  })
})
