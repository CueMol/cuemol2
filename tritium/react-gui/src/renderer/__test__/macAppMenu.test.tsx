/**
 * @file __test__/macAppMenu.test.tsx
 * @description Degrade test pinning the observable macOS App-menu behavior so
 * the removal of the dead group-level darwinOnly placeholder in
 * shared/menuTemplate.ts stays provably safe.
 *
 * Two observable contracts are pinned:
 *  1. The renderer MenuBar (used only on Windows/Linux) never surfaces a
 *     darwinOnly group / item -- it filters them out.
 *  2. APP_MENU carries NO group-level darwinOnly group; the canonical macOS
 *     App menu is `macAppMenuGroup(appName)`, and it still yields About /
 *     Preferences (Cmd+,) / Quit items.
 *
 * Contract (2) used to be pinned by reading main/menu.ts as text and grepping
 * for item ids, because the group was a literal buried inside the Menu
 * builder. It is data now, so the test asserts on the group itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { APP_MENU, macAppMenuGroup } from '@shared/menuTemplate'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
// MenuBar reads its state from the providers; stub them at rest.
vi.mock('@renderer/state/activeView', () => ({
  useActiveViewValues: () => ({ viewProjection: null, viewCenterMark: null, sceneBgColor: null, exportAvailable: null }),
}))
vi.mock('@renderer/state/workspace', () => ({ useActiveScene: () => ({ activeSceneId: undefined, activeMolViewId: undefined, hasScene: false }) }))
vi.mock('@renderer/features/file-io/useRecentFiles', () => ({ useRecentFiles: () => [] }))

// Must import after mocks
const { MenuBar } = await import('@renderer/shell/MenuBar')
const { CommandProvider } = await import('@renderer/commands/CommandRegistry')

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function setupElectronAPI(platform: string): void {
  ;(globalThis as any).window = globalThis
  ;(window as any).electronAPI = {
    platform,
    invokeMenuRole: vi.fn(),
    invoke: vi.fn().mockResolvedValue(undefined),
    onPush: vi.fn().mockReturnValue(() => undefined),
  }
}

function render(): { container: HTMLElement; root: Root; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  act(() => {
    root = createRoot(container)
    root.render(
      React.createElement(
        CommandProvider,
        null,
        React.createElement(MenuBar),
      ),
    )
  })
  return {
    container,
    root,
    unmount() {
      act(() => root.unmount())
      document.body.removeChild(container)
    },
  }
}

describe('macOS App menu', () => {
  beforeEach(() => {
    setupElectronAPI('win32')
  })

  afterEach(() => {
    delete (window as any).electronAPI
  })

  it('APP_MENU has no group-level darwinOnly group', () => {
    expect(APP_MENU.some((g) => g.darwinOnly)).toBe(false)
    // The macOS-only app group must not leak in as a normal renderer group.
    expect(APP_MENU.some((g) => g.label === 'CueMol2' || g.label === 'CueMol3')).toBe(false)
  })

  it('MenuBar on win32 does not render the macOS App group', () => {
    const { container, unmount } = render()
    const labels = Array.from(container.querySelectorAll('.menubar__item')).map(
      (el) => el.textContent ?? '',
    )
    expect(labels.some((t) => t.includes('File'))).toBe(true)
    // No top-level CueMol app group on Windows/Linux.
    expect(labels.some((t) => t === 'CueMol2' || t === 'CueMol3')).toBe(false)
    unmount()
  })

  it('the macOS App group carries About / Preferences (Cmd+,) / Quit', () => {
    const group = macAppMenuGroup('CueMol3')
    expect(group.label).toBe('CueMol3')

    const ids = group.submenu.map((i) => i.id).filter(Boolean)
    expect(ids).toContain('about-mac')
    expect(ids).toContain('mac-prefs')

    const about = group.submenu.find((i) => i.id === 'about-mac')
    expect(about?.label).toBe('About CueMol3')
    const prefs = group.submenu.find((i) => i.id === 'mac-prefs')
    expect(prefs?.accelerator).toBe('Cmd+,')
    // Quit stays a role: the platform owns its label, placement and shortcut.
    expect(group.submenu.some((i) => i.role === 'quit')).toBe(true)
  })
})
