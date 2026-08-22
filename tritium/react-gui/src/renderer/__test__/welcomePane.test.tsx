/**
 * Degrade-detection tests for the empty-state start screen (WelcomePane),
 * shown when no content tab is open.
 *
 * The pane went stale once already -- it hard-coded "CueMol2" after the
 * product was renamed, and listed two shortcuts ("New Scene", "Run Script")
 * that were never bound. The fix was to quote the product name and every
 * shortcut from their single sources, so these tests pin that the values
 * shown really do come from `APP_PRODUCT_NAME` / `APP_MENU` rather than
 * asserting the current strings (which would just re-freeze a copy).
 */
import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { WelcomePane } from '../components/panes/WelcomePane'
import { APP_PRODUCT_NAME } from '../../shared/appInfo'
import { findMenuItemById } from '../../shared/menuTemplate'
import { formatAccelerator } from '../../shared/menuAccel'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

let active: { root: Root; container: HTMLElement } | null = null

function render(platform: string): HTMLElement {
  ;(globalThis as any).window = globalThis
  ;(window as any).electronAPI = { platform }
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  act(() => {
    root = createRoot(container)
    root.render(React.createElement(WelcomePane))
  })
  active = { root, container }
  return container
}

afterEach(() => {
  if (active) {
    const { root, container } = active
    act(() => root.unmount())
    container.remove()
    active = null
  }
  delete (window as any).electronAPI
})

const rows = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('.shortcut-item')).map((el) => ({
    accel: el.querySelector('.shortcut-key')?.textContent ?? '',
    // Direct child only: Blueprint's Tag nests its own span inside .shortcut-key.
    label: el.querySelector(':scope > span:not(.shortcut-key)')?.textContent ?? '',
  }))

describe('WelcomePane', () => {
  it('shows the product name from the shared constant, not a copy', () => {
    const c = render('darwin')
    expect(c.querySelector('.placeholder-title')?.textContent).toBe(APP_PRODUCT_NAME)
    // Guards the specific drift that happened: a renamed product left behind.
    expect(c.textContent).not.toContain('CueMol2')
  })

  it('renders the app icon asset rather than a text glyph', () => {
    const c = render('darwin')
    const img = c.querySelector('img.placeholder-app-icon')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBeTruthy()
    // Decorative: the title beside it already names the app.
    expect(img?.getAttribute('aria-hidden')).toBe('true')
  })

  it('every shortcut it advertises is really bound in the app menu', () => {
    const c = render('win32')
    const shown = rows(c)
    expect(shown.length).toBeGreaterThan(0)
    for (const row of shown) {
      // Label must be a real menu item, matched by label since that is what
      // the user sees; its accelerator must be the one the menu declares.
      const item = ['new-tab', 'open-file', 'open-scene', 'save-scene']
        .map((id) => findMenuItemById(id))
        .find((i) => i?.label === row.label)
      expect(item, `no menu item labelled "${row.label}"`).toBeTruthy()
      expect(row.accel).toBe(formatAccelerator(item!.accelerator!, false))
    }
  })

  it('prints Cmd glyphs on macOS and Ctrl words elsewhere', () => {
    const mac = rows(render('darwin'))
    act(() => active!.root.unmount())
    active!.container.remove()
    active = null
    const win = rows(render('win32'))

    expect(mac.length).toBe(win.length)
    expect(mac.every((r) => r.accel.includes('⌘'))).toBe(true)
    expect(mac.some((r) => r.accel.includes('⇧'))).toBe(true)
    expect(win.every((r) => r.accel.startsWith('Ctrl+'))).toBe(true)
  })
})

describe('formatAccelerator', () => {
  it('joins modifier words with + off macOS', () => {
    expect(formatAccelerator('CmdOrCtrl+O', false)).toBe('Ctrl+O')
    expect(formatAccelerator('CmdOrCtrl+Shift+O', false)).toBe('Ctrl+Shift+O')
    expect(formatAccelerator('Alt+F4', false)).toBe('Alt+F4')
  })

  it('uses glyphs in canonical macOS order regardless of source order', () => {
    expect(formatAccelerator('CmdOrCtrl+O', true)).toBe('⌘O')
    // Both orderings appear in menuTemplate; both must print the same.
    expect(formatAccelerator('CmdOrCtrl+Shift+O', true)).toBe('⇧⌘O')
    expect(formatAccelerator('Shift+CmdOrCtrl+Z', true)).toBe('⇧⌘Z')
    expect(formatAccelerator('Ctrl+Alt+Shift+Cmd+K', true)).toBe('⌃⌥⇧⌘K')
  })
})
