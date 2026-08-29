/**
 * @file renderer/__test__/macAppMenu.test.tsx
 * @description Degrade test pinning the observable macOS App-menu behavior so
 * the removal of the dead group-level darwinOnly placeholder in
 * shared/menuTemplate.ts stays provably safe.
 *
 * Two observable contracts are pinned:
 *  1. The renderer MenuBar (used only on Windows/Linux) never surfaces a
 *     darwinOnly group / item -- it filters them out.
 *  2. APP_MENU carries NO group-level darwinOnly group; the canonical macOS
 *     App menu is the live `macOnlyGroups` constructed in src/main/menu.ts and
 *     still yields About / Preferences (Cmd+,) / Quit items.
 *
 * The main-process Menu construction in menu.ts is not cleanly unit-testable
 * from vitest (it depends on the electron `app` object and the buildGroup
 * helper), so contract (2) for the live group is pinned structurally by
 * parsing the menu.ts source for the macOnlyGroups item ids / accelerators.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { APP_MENU } from '@shared/menuTemplate'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
// MenuBar reads its state from the providers; stub them at rest.
vi.mock('../state/activeView', () => ({
  useActiveViewValues: () => ({ viewProjection: null, viewCenterMark: null, sceneBgColor: null, exportAvailable: null }),
}))
vi.mock('../state/workspace', () => ({ useActiveScene: () => ({ activeSceneId: undefined, activeMolViewId: undefined, hasScene: false }) }))
vi.mock('../hooks/useRecentFiles', () => ({ useRecentFiles: () => [] }))

// Must import after mocks
const { MenuBar } = await import('../components/MenuBar')
const { CommandProvider } = await import('../commands/CommandRegistry')

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

  it('live macOnlyGroups in menu.ts yields About / Preferences (Cmd+,) / Quit', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const menuSrc = readFileSync(resolve(here, '../../main/menu.ts'), 'utf8')
    const macStart = menuSrc.indexOf('macOnlyGroups')
    expect(macStart).toBeGreaterThan(0)
    // Restrict to the macOnlyGroups literal block to avoid matching APP_MENU.
    const macBlock = menuSrc.slice(macStart, macStart + 700)
    expect(macBlock).toContain("id: 'about-mac'")
    expect(macBlock).toContain('About ${app.name}')
    expect(macBlock).toContain("id: 'mac-prefs'")
    expect(macBlock).toContain("accelerator: 'Cmd+,'")
    expect(macBlock).toContain("role: 'quit'")
  })
})
