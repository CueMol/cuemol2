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
  }
})

vi.mock('../../main/recentFiles', () => ({
  getExistingRecents: vi.fn(() => []),
}))

import { Menu } from 'electron'

const setApplicationMenu = Menu.setApplicationMenu as unknown as ReturnType<typeof vi.fn>
const getApplicationMenu = Menu.getApplicationMenu as unknown as ReturnType<typeof vi.fn>
const buildFromTemplate = Menu.buildFromTemplate as unknown as ReturnType<typeof vi.fn>

import {
  createMenu,
  rebuildApplicationMenu,
  setMenuBlocked,
  updateMenuState,
  _resetMenuBlockForTest,
} from '../../main/menu'
import type { BrowserWindow } from 'electron'

/** Install a fresh, fully-enabled menu as the current application menu. */
function installEnabledMenu(): FakeMenu {
  const menu = new FakeMenu([
    Object.assign(new FakeMenuItem('view-perspective'), { enabled: true }),
    Object.assign(new FakeMenuItem('view-orthographic'), { enabled: true }),
    new FakeMenuItem('sep', 'separator'),
    Object.assign(new FakeMenuItem('undo'), { enabled: true }),
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
    expect(menu.getMenuItemById('undo')!.enabled).toBe(false)

    // 1 -> 2: same reason again; still blocked, idempotent on the items
    setMenuBlocked('blueprint', true)
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(false)

    // 2 -> 1: still blocked; items NOT yet restored
    setMenuBlocked('blueprint', false)
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(false)
    expect(menu.getMenuItemById('undo')!.enabled).toBe(false)

    // 1 -> 0: last decrement restores the snapshotted enabled values
    setMenuBlocked('blueprint', false)
    expect(menu.getMenuItemById('view-perspective')!.enabled).toBe(true)
    expect(menu.getMenuItemById('view-orthographic')!.enabled).toBe(true)
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

  it('(c) updateMenuState is a no-op while blocked, applies after unblock', () => {
    const menu = installEnabledMenu()

    setMenuBlocked('blueprint', true)
    // While blocked, updateMenuState must not mutate the live menu.
    updateMenuState({ undo: { enabled: true }, redo: { enabled: true } })
    // (undo item was disabled by the block; the guard prevents re-enabling)
    expect(menu.getMenuItemById('undo')!.enabled).toBe(false)

    setMenuBlocked('blueprint', false)
    // After unblock the renderer re-emits; updateMenuState now applies.
    updateMenuState({ undo: { enabled: true } })
    expect(menu.getMenuItemById('undo')!.enabled).toBe(true)
  })
})
