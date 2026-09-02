/**
 * @file main/menuAccelerators.test.ts
 * @description Pins which platform registers the template accelerators with
 * the native menu.
 *
 * On macOS the native menu owns every shortcut, so `CmdOrCtrl+V` and friends
 * must be on the built template. On Windows / Linux the renderer keybinding
 * dispatcher owns them (shell/keybindings) and the hidden native menu must
 * register none, or the two would compete for the same key. `isMac` is read
 * at module load, so each case stubs `process.platform` and imports fresh.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

vi.mock('electron', () => {
  const buildFromTemplate = vi.fn((template: unknown) => ({ template, getMenuItemById: () => null }))
  return {
    app: { name: 'CueMol', on: vi.fn() },
    Menu: {
      setApplicationMenu: vi.fn(),
      getApplicationMenu: vi.fn(() => null),
      buildFromTemplate,
    },
    webContents: { getFocusedWebContents: vi.fn(() => null) },
    nativeImage: { createFromBitmap: vi.fn(() => ({})) },
  }
})

vi.mock('@main/recentFiles', () => ({
  getExistingRecents: vi.fn(() => []),
  refreshRecentsExistence: vi.fn(() => Promise.resolve()),
}))

const fakeWindow = { webContents: { send: vi.fn(), id: 1 } } as never

/** Depth-first lookup of a built template item by id. */
function findItem(
  items: MenuItemConstructorOptions[],
  id: string,
): MenuItemConstructorOptions | undefined {
  for (const item of items) {
    if (item.id === id) return item
    if (Array.isArray(item.submenu)) {
      const hit = findItem(item.submenu, id)
      if (hit) return hit
    }
  }
  return undefined
}

/** Stub the platform, import main/menu.ts fresh, build, and return the template. */
async function buildOn(platform: string): Promise<MenuItemConstructorOptions[]> {
  vi.resetModules()
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: platform })
  try {
    const { createMenu } = await import('@main/menu')
    const { Menu } = await import('electron')
    createMenu(fakeWindow)
    const build = Menu.buildFromTemplate as unknown as ReturnType<typeof vi.fn>
    return build.mock.calls[build.mock.calls.length - 1][0] as MenuItemConstructorOptions[]
  } finally {
    Object.defineProperty(process, 'platform', { value: original })
  }
}

describe('native menu accelerators per platform', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('macOS registers the template accelerators (the menu owns the keys)', async () => {
    const template = await buildOn('darwin')
    expect(findItem(template, 'paste')?.accelerator).toBe('CmdOrCtrl+V')
    expect(findItem(template, 'open-file')?.accelerator).toBe('CmdOrCtrl+O')
    // The mac-specific override is what lands on darwin.
    expect(findItem(template, 'redo')?.accelerator).toBe('Shift+CmdOrCtrl+Z')
  })

  it('Windows registers none (the renderer keybinding dispatcher owns them)', async () => {
    const template = await buildOn('win32')
    const paste = findItem(template, 'paste')
    expect(paste).toBeDefined()
    expect(paste?.accelerator).toBeUndefined()
    expect(findItem(template, 'open-file')?.accelerator).toBeUndefined()
    expect(findItem(template, 'redo')?.accelerator).toBeUndefined()
    // The item still has its click handler: mouse picks on the menu work.
    expect(typeof paste?.click).toBe('function')
  })
})
