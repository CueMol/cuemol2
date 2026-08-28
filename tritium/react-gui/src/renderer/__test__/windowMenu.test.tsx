/**
 * @file __test__/windowMenu.test.tsx
 * @description Degrade-detection test for the Window menu (main <-> Rendering
 * window switching).
 *
 * Pins the whole chain as a wire contract rather than an implementation:
 *   menuTemplate item ipcChannel -> useMenuDispatch -> command -> electronAPI
 *   .invoke(<main-process channel>)
 * so the menu entry, the action-map row, the command id and the IPC channel
 * all have to stay in agreement. Both entries raise a window; "Rendering
 * Window" opens the window when it is not up yet, without touching its output
 * mode (that is what the Rendering menu's own two entries are for).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { CommandProvider } from '../commands/CommandRegistry'
import { IPC } from '@shared/ipcChannels'
import { APP_MENU } from '@shared/menuTemplate'
import type { AppMenuItem } from '@shared/menuTemplate'
import { useMenuDispatch } from '../hooks/useMenuDispatch'
import { useRenderCommands } from '../commands/useRenderCommands'
import { useWindowCommands } from '../commands/useWindowCommands'
import { makeRenderHook, setupElectronAPI, teardownElectronAPI } from './helpers/testHarness'

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(CommandProvider, null, children)

/** The Window group's items, or an empty list when the group is gone. */
function windowGroupItems(): AppMenuItem[] {
  return APP_MENU.find((g) => g.label === 'Window')?.submenu ?? []
}

describe('Window menu -- template', () => {
  it('exposes Main Window and Rendering Window on their menu channels', () => {
    expect(
      windowGroupItems().map((i) => [i.id, i.label, i.ipcChannel]),
    ).toEqual([
      ['window-main', 'Main Window', IPC.MENU_WINDOW_MAIN],
      ['window-render', 'Rendering Window', IPC.MENU_WINDOW_RENDER],
    ])
  })
})

describe('Window menu -- dispatch reaches the main process', () => {
  let api: Record<string, any>

  beforeEach(() => {
    api = setupElectronAPI()
  })

  afterEach(() => {
    teardownElectronAPI()
  })

  /** Mount the two command registrations plus the menu dispatcher. */
  function setup() {
    return makeRenderHook(() => {
      useRenderCommands()
      useWindowCommands()
      return useMenuDispatch('molview-1')
    }, Wrapper)
  }

  it('Main Window invokes WINDOW_FOCUS_MAIN', async () => {
    const h = setup()
    h.result.dispatchMenuChannel(IPC.MENU_WINDOW_MAIN)
    await Promise.resolve()
    expect(api.invoke).toHaveBeenCalledWith(IPC.WINDOW_FOCUS_MAIN)
    h.unmount()
  })

  it('Rendering Window opens the window without pinning a mode', async () => {
    const h = setup()
    h.result.dispatchMenuChannel(IPC.MENU_WINDOW_RENDER)
    await Promise.resolve()
    expect(api.invoke).toHaveBeenCalledWith(IPC.RENDER_WINDOW_OPEN, {})
    h.unmount()
  })
})
