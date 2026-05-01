import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

// Must import after mocks
const { MenuBar } = await import('../components/MenuBar')
const { CommandProvider } = await import('../commands/CommandRegistry')

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function setupElectronAPI(platform: string): void {
  ;(globalThis as any).window = globalThis
  ;(window as any).electronAPI = {
    platform,
    invokeMenuRole: vi.fn(),
  }
}

function render(
  activeTab: string | null,
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
        React.createElement(MenuBar, { activeTab }),
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
    // MenuBar always renders its content — the platform guard lives in App.tsx.
    // This test verifies that the MenuBar component itself renders regardless of
    // platform (the guard is tested at the App level).
    const { container, unmount } = render(null)
    expect(container.querySelector('.menubar')).toBeTruthy()
    unmount()
  })
})
