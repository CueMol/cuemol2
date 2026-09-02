/**
 * @file shared/menuAccel.test.ts
 * @description Pins how an Electron accelerator string is read: the display
 * text is covered elsewhere (welcomePane.test), so this file covers the parse
 * + match half that the Windows / Linux keybinding dispatcher relies on, and
 * the template invariant that every text-edit item actually declares a key.
 */
import { describe, it, expect } from 'vitest'
import { acceleratorMatchesKey, parseAccelerator } from '@shared/menuAccel'
import { APP_MENU, TEXT_EDIT_MENU_IDS } from '@shared/menuTemplate'
import type { AppMenuItem } from '@shared/menuTemplate'

describe('parseAccelerator', () => {
  it('resolves CmdOrCtrl to Control off macOS and to Command on it', () => {
    expect(parseAccelerator('CmdOrCtrl+V', false)).toEqual({
      ctrl: true, shift: false, alt: false, meta: false, key: 'v',
    })
    expect(parseAccelerator('CmdOrCtrl+V', true)).toEqual({
      ctrl: false, shift: false, alt: false, meta: true, key: 'v',
    })
  })

  it('reads every modifier token and lowercases the key', () => {
    expect(parseAccelerator('Shift+CmdOrCtrl+Z', false)).toEqual({
      ctrl: true, shift: true, alt: false, meta: false, key: 'z',
    })
    expect(parseAccelerator('Ctrl+Alt+K', true)).toEqual({
      ctrl: true, shift: false, alt: true, meta: false, key: 'k',
    })
    // A bare Cmd is the OS key on every platform (KeyboardEvent.metaKey).
    expect(parseAccelerator('Cmd+,', false).meta).toBe(true)
  })
})

describe('acceleratorMatchesKey', () => {
  const ctrlV = parseAccelerator('CmdOrCtrl+V', false)
  const ev = (over: Partial<Parameters<typeof acceleratorMatchesKey>[1]>) => ({
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, key: 'v', ...over,
  })

  it('matches the exact modifier set, case-insensitively on the key', () => {
    expect(acceleratorMatchesKey(ctrlV, ev({ ctrlKey: true }))).toBe(true)
    expect(acceleratorMatchesKey(ctrlV, ev({ ctrlKey: true, key: 'V' }))).toBe(true)
  })

  it('rejects an extra or missing modifier and a different key', () => {
    expect(acceleratorMatchesKey(ctrlV, ev({ ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(acceleratorMatchesKey(ctrlV, ev({ ctrlKey: true, metaKey: true }))).toBe(false)
    expect(acceleratorMatchesKey(ctrlV, ev({}))).toBe(false)
    expect(acceleratorMatchesKey(ctrlV, ev({ ctrlKey: true, key: 'c' }))).toBe(false)
  })
})

describe('APP_MENU text-edit items', () => {
  function findById(items: AppMenuItem[], id: string): AppMenuItem | undefined {
    for (const item of items) {
      if (item.id === id) return item
      if (item.submenu) {
        const hit = findById(item.submenu, id)
        if (hit) return hit
      }
    }
    return undefined
  }

  // The renderer owns these keys on Windows / Linux by reading the template,
  // so an item that lost its accelerator would silently lose its shortcut.
  it('every TEXT_EDIT_MENU_IDS item declares an accelerator and a channel', () => {
    for (const id of TEXT_EDIT_MENU_IDS) {
      const item = APP_MENU.map((g) => findById(g.submenu, id)).find(Boolean)
      expect(item, id).toBeDefined()
      expect(item!.accelerator, id).toMatch(/^CmdOrCtrl\+/)
      expect(item!.ipcChannel, id).toBeTruthy()
    }
  })
})
