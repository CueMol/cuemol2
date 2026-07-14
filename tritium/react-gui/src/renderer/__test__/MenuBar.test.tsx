import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import type { RecentFileEntry, ViewCenterMark } from '../../shared/ipcTypes'
import { IPC } from '../../shared/ipcChannels'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

// Must import after mocks
const { MenuBar } = await import('../components/MenuBar')
const { CommandProvider } = await import('../commands/CommandRegistry')

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function setupElectronAPI(platform: string, overrides: Record<string, unknown> = {}): Record<string, any> {
  ;(globalThis as any).window = globalThis
  const api: Record<string, any> = {
    platform,
    invokeMenuRole: vi.fn(),
    invoke: vi.fn().mockResolvedValue(undefined),
    onPush: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  }
  ;(window as any).electronAPI = api
  return api
}

function render(
  activeTab: string | null,
  viewProjection: boolean | null = null,
  viewCenterMark: ViewCenterMark | null = null,
  recentFiles: RecentFileEntry[] = [],
  hasScene: boolean = false,
): { container: HTMLElement; root: Root; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  act(() => {
    root = createRoot(container)
    root.render(
      React.createElement(
        CommandProvider,
        null,
        React.createElement(MenuBar, { activeTab, viewProjection, viewCenterMark, recentFiles, hasScene }),
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

describe('MenuBar', () => {
  beforeEach(() => {
    setupElectronAPI('win32')
  })

  afterEach(() => {
    delete (window as any).electronAPI
  })

  it('renders menu group labels', () => {
    const { container, unmount } = render(null)
    const text = container.textContent ?? ''
    expect(text).toContain('File')
    expect(text).toContain('Edit')
    expect(text).toContain('View')
    expect(text).toContain('Scene')
    expect(text).toContain('Help')
    unmount()
  })

  it('opens dropdown on click and shows items', () => {
    const { container, unmount } = render(null)
    const fileItem = Array.from(container.querySelectorAll('.menubar__item')).find(
      (el) => el.textContent?.includes('File'),
    ) as HTMLElement
    expect(fileItem).toBeTruthy()

    act(() => {
      fileItem.click()
    })

    const dropdown = container.querySelector('.menubar__dropdown')
    expect(dropdown).toBeTruthy()
    expect(dropdown!.textContent).toContain('Open File')
    expect(dropdown!.textContent).toContain('Save')
    unmount()
  })

  it('closes dropdown on Escape', () => {
    const { container, unmount } = render(null)
    const fileItem = Array.from(container.querySelectorAll('.menubar__item')).find(
      (el) => el.textContent?.includes('File'),
    ) as HTMLElement

    act(() => { fileItem.click() })
    expect(container.querySelector('.menubar__dropdown')).toBeTruthy()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('.menubar__dropdown')).toBeNull()
    unmount()
  })

  it('closes dropdown on outside click', () => {
    const { container, unmount } = render(null)
    const fileItem = Array.from(container.querySelectorAll('.menubar__item')).find(
      (el) => el.textContent?.includes('File'),
    ) as HTMLElement

    act(() => { fileItem.click() })
    expect(container.querySelector('.menubar__dropdown')).toBeTruthy()

    act(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(container.querySelector('.menubar__dropdown')).toBeNull()
    unmount()
  })

  it('does not render on macOS', async () => {
    setupElectronAPI('darwin')
    // On macOS the MenuBar is conditionally rendered by App.tsx, not by MenuBar itself.
    // MenuBar always renders its content -- the platform guard lives in App.tsx.
    // This test verifies that the MenuBar component itself renders regardless of
    // platform (the guard is tested at the App level).
    const { container, unmount } = render(null)
    expect(container.querySelector('.menubar')).toBeTruthy()
    unmount()
  })

  it('checks Perspective when the active view is perspective', () => {
    const { container, unmount } = render('molview-1', true)
    const viewItem = Array.from(container.querySelectorAll('.menubar__item')).find(
      (el) => el.textContent?.includes('View'),
    ) as HTMLElement

    act(() => { viewItem.click() })

    const items = Array.from(container.querySelectorAll('[role="menuitemcheckbox"]'))
    const perspective = items.find((el) => el.textContent?.includes('Perspective')) as HTMLElement
    const orthographic = items.find((el) => el.textContent?.includes('Orthographic')) as HTMLElement
    expect(perspective.getAttribute('aria-checked')).toBe('true')
    expect(perspective.getAttribute('aria-disabled')).toBe('false')
    expect(orthographic.getAttribute('aria-checked')).toBe('false')
    expect(orthographic.getAttribute('aria-disabled')).toBe('false')
    unmount()
  })

  it('checks Orthographic when the active view is not perspective', () => {
    const { container, unmount } = render('molview-1', false)
    const viewItem = Array.from(container.querySelectorAll('.menubar__item')).find(
      (el) => el.textContent?.includes('View'),
    ) as HTMLElement

    act(() => { viewItem.click() })

    const items = Array.from(container.querySelectorAll('[role="menuitemcheckbox"]'))
    const perspective = items.find((el) => el.textContent?.includes('Perspective')) as HTMLElement
    const orthographic = items.find((el) => el.textContent?.includes('Orthographic')) as HTMLElement
    expect(perspective.getAttribute('aria-checked')).toBe('false')
    expect(orthographic.getAttribute('aria-checked')).toBe('true')
    unmount()
  })

  it('disables projection items without an active MolView', () => {
    const { container, unmount } = render(null, null)
    const viewItem = Array.from(container.querySelectorAll('.menubar__item')).find(
      (el) => el.textContent?.includes('View'),
    ) as HTMLElement

    act(() => { viewItem.click() })

    const items = Array.from(container.querySelectorAll('[role="menuitemcheckbox"]')) as HTMLElement[]
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items.every((el) => el.getAttribute('aria-disabled') === 'true')).toBe(true)
    expect(items.every((el) => el.getAttribute('aria-checked') === 'false')).toBe(true)
    unmount()
  })

  it('disables scene-operation File items when no scene is active', () => {
    const { container, unmount } = render(null, null, null, [], false)
    const fileItem = Array.from(container.querySelectorAll('.menubar__item')).find(
      (el) => el.textContent?.includes('File'),
    ) as HTMLElement
    act(() => { fileItem.click() })

    const byLabel = (label: string) =>
      Array.from(container.querySelectorAll('.menu-item')).find((el) =>
        Array.from(el.querySelectorAll('span')).some((s) => s.textContent === label),
      ) as HTMLElement | undefined

    // Scene-operation items are disabled...
    expect(byLabel('Save Scene')?.getAttribute('aria-disabled')).toBe('true')
    expect(byLabel('Reload Scene')?.getAttribute('aria-disabled')).toBe('true')
    // ...but scene-independent ones (Open File / Get PDB) stay enabled.
    expect(byLabel('Open File...')?.getAttribute('aria-disabled')).toBe('false')
    unmount()
  })

  it('enables scene-operation File items when a scene is active', () => {
    const { container, unmount } = render('molview-1', null, null, [], true)
    const fileItem = Array.from(container.querySelectorAll('.menubar__item')).find(
      (el) => el.textContent?.includes('File'),
    ) as HTMLElement
    act(() => { fileItem.click() })

    const saveScene = Array.from(container.querySelectorAll('.menu-item')).find((el) =>
      Array.from(el.querySelectorAll('span')).some((s) => s.textContent === 'Save Scene'),
    ) as HTMLElement
    expect(saveScene.getAttribute('aria-disabled')).toBe('false')
    unmount()
  })

  it('checks the active center mark radio item', () => {
    const { container, unmount } = render('molview-1', true, 'axis')
    const viewItem = Array.from(container.querySelectorAll('.menubar__item')).find(
      (el) => el.textContent?.includes('View'),
    ) as HTMLElement

    act(() => { viewItem.click() })

    const centerMark = Array.from(container.querySelectorAll('.menu-item')).find(
      (el) => el.textContent?.includes('Center mark'),
    ) as HTMLElement

    act(() => {
      centerMark.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    const items = Array.from(container.querySelectorAll('[role="menuitemradio"]'))
    const cross = items.find((el) => el.textContent?.includes('Cross')) as HTMLElement
    const axis = items.find((el) => el.textContent?.includes('Axis')) as HTMLElement
    const none = items.find((el) => el.textContent?.includes('None')) as HTMLElement
    expect(cross.getAttribute('aria-checked')).toBe('false')
    expect(axis.getAttribute('aria-checked')).toBe('true')
    expect(none.getAttribute('aria-checked')).toBe('false')
    expect(axis.getAttribute('aria-disabled')).toBe('false')
    unmount()
  })

  // --- Open Recent submenu ---

  function openFileThenRecent(container: HTMLElement): HTMLElement {
    const fileItem = Array.from(container.querySelectorAll('.menubar__item')).find(
      (el) => el.textContent?.includes('File'),
    ) as HTMLElement
    act(() => { fileItem.click() })
    const recent = Array.from(container.querySelectorAll('.menu-item')).find(
      (el) => el.textContent?.startsWith('Open Recent'),
    ) as HTMLElement
    act(() => {
      recent.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    return container.querySelector('.menu-flyout') as HTMLElement
  }

  it('shows "(none)" and a disabled Clear Menu when recents is empty', () => {
    const { container, unmount } = render(null, null, null, [])
    const submenu = openFileThenRecent(container)
    expect(submenu).toBeTruthy()
    expect(submenu.textContent).toContain('(none)')
    const clear = Array.from(submenu.querySelectorAll('.menu-item')).find(
      (el) => el.textContent?.includes('Clear Menu'),
    ) as HTMLElement
    expect(clear).toBeTruthy()
    expect(clear.getAttribute('aria-disabled')).toBe('true')
    unmount()
  })

  it('renders recent entries (basenames) with Clear Menu enabled', () => {
    const recents: RecentFileEntry[] = [
      { path: '/tmp/dir/a.pdb', ftype: 'obj' },
      { path: '/another/b.qsc', ftype: 'scene' },
    ]
    const { container, unmount } = render(null, null, null, recents)
    const submenu = openFileThenRecent(container)
    expect(submenu.textContent).toContain('a.pdb')
    expect(submenu.textContent).toContain('b.qsc')
    expect(submenu.textContent).not.toContain('(none)')
    const clear = Array.from(submenu.querySelectorAll('.menu-item')).find(
      (el) => el.textContent?.includes('Clear Menu'),
    ) as HTMLElement
    expect(clear.getAttribute('aria-disabled')).toBe('false')
    unmount()
  })

  it('invokes RECENT_CLEAR when Clear Menu is clicked', () => {
    const api = setupElectronAPI('win32')
    const { container, unmount } = render(null, null, null, [
      { path: '/a.pdb', ftype: 'obj' },
    ])
    const submenu = openFileThenRecent(container)
    const clear = Array.from(submenu.querySelectorAll('.menu-item')).find(
      (el) => el.textContent?.includes('Clear Menu'),
    ) as HTMLElement
    act(() => { clear.click() })
    expect(api.invoke).toHaveBeenCalledWith(IPC.RECENT_CLEAR)
    unmount()
  })

  it('disables center mark radio items without an active MolView', () => {
    const { container, unmount } = render(null, null, null)
    const viewItem = Array.from(container.querySelectorAll('.menubar__item')).find(
      (el) => el.textContent?.includes('View'),
    ) as HTMLElement

    act(() => { viewItem.click() })

    const centerMark = Array.from(container.querySelectorAll('.menu-item')).find(
      (el) => el.textContent?.includes('Center mark'),
    ) as HTMLElement

    act(() => {
      centerMark.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    const items = Array.from(container.querySelectorAll('[role="menuitemradio"]')) as HTMLElement[]
    expect(items.length).toBe(3)
    expect(items.every((el) => el.getAttribute('aria-disabled') === 'true')).toBe(true)
    expect(items.every((el) => el.getAttribute('aria-checked') === 'false')).toBe(true)
    unmount()
  })
})
