/**
 * @file __test__/renderMenuModes.test.tsx
 * @description Degrade-detection test for the Rendering menu's two mode
 * entries (Image rendering / Movie rendering).
 *
 * Pins the wire contract of the chain
 *   menuTemplate item ipcChannel -> useMenuDispatch -> command
 *   -> electronAPI.invoke(RENDER_WINDOW_OPEN, { mode })
 * so the menu label, the action-map row, the command id and the mode carried
 * to the main process stay in agreement. The main-process relay of that mode
 * to the Rendering window, and the window's mirroring of it, are pinned in
 * useRenderWindowClient.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { CommandProvider } from '../commands/CommandRegistry'
import { IPC } from '@shared/ipcChannels'
import { APP_MENU } from '@shared/menuTemplate'
import { useMenuDispatch } from '../hooks/useMenuDispatch'
import { useRenderCommands } from '../commands/useRenderCommands'
import { makeRenderHook, setupElectronAPI, teardownElectronAPI } from './helpers/testHarness'

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(CommandProvider, null, children)

describe('Rendering menu -- mode entries', () => {
  let api: Record<string, any>

  beforeEach(() => {
    api = setupElectronAPI()
  })

  afterEach(() => {
    teardownElectronAPI()
  })

  it('the template leads with Image rendering and Movie rendering', () => {
    const items = APP_MENU.find((g) => g.label === 'Rendering')?.submenu ?? []
    expect(items.slice(0, 2).map((i) => [i.id, i.label, i.ipcChannel])).toEqual([
      ['image-render', 'Image rendering...', IPC.MENU_IMAGE_RENDER],
      ['movie-render', 'Movie rendering...', IPC.MENU_MOVIE_RENDER],
    ])
  })

  const cases: Array<[string, string]> = [
    [IPC.MENU_IMAGE_RENDER, 'still'],
    [IPC.MENU_MOVIE_RENDER, 'movie'],
  ]

  for (const [channel, mode] of cases) {
    it(`${channel} opens the Rendering window in "${mode}" mode`, async () => {
      const h = makeRenderHook(() => {
        useRenderCommands()
        return useMenuDispatch()
      }, Wrapper)

      h.result.dispatchMenuChannel(channel)
      await Promise.resolve()
      expect(api.invoke).toHaveBeenCalledWith(IPC.RENDER_WINDOW_OPEN, { mode })
      h.unmount()
    })
  }
})
