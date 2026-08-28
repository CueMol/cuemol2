/**
 * @file __test__/startupResilience.test.tsx
 * @description Pins that a failure on a launch path leaves the app usable.
 *
 * Both hooks here gate something the whole window depends on, and both awaited
 * a promise with no rejection handling:
 *
 *   - useLayoutPersistence.loaded gates `{loaded && <Allotment>}` in App, i.e.
 *     the entire main content area. If LAYOUT_LOAD or UI_LOAD rejected, the
 *     flag stayed false and the user got a permanently blank window.
 *   - useAppInitialization.initialSceneSettled gates the shell/command-line
 *     file-open drain in useShellOpenFiles. If the first scene failed to
 *     create, the gate never opened and a file passed on the command line or
 *     via Finder was silently dropped for the rest of the session.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeRenderHook, flushPromises, setupElectronAPI, teardownElectronAPI } from './helpers/testHarness'
import { IPC } from '@shared/ipcChannels'
import { useLayoutPersistence } from '../hooks/useLayoutPersistence'
import { useAppInitialization } from '../hooks/useAppInitialization'

void React

describe('useLayoutPersistence load failure', () => {
  afterEach(() => { teardownElectronAPI(); vi.restoreAllMocks() })

  it('still sets loaded when LAYOUT_LOAD rejects, so the UI renders', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setupElectronAPI({
      invoke: vi.fn((channel: string) =>
        channel === IPC.LAYOUT_LOAD
          ? Promise.reject(new Error('store read failed'))
          : Promise.resolve(undefined),
      ),
    })

    const h = makeRenderHook(() => useLayoutPersistence())
    await flushPromises()
    await flushPromises()
    expect(h.result.loaded).toBe(true)
    h.unmount()
  })

  it('still sets loaded when UI_LOAD rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setupElectronAPI({
      invoke: vi.fn((channel: string) =>
        channel === IPC.UI_LOAD
          ? Promise.reject(new Error('store read failed'))
          : Promise.resolve(undefined),
      ),
    })

    const h = makeRenderHook(() => useLayoutPersistence())
    await flushPromises()
    await flushPromises()
    expect(h.result.loaded).toBe(true)
    h.unmount()
  })
})

describe('useAppInitialization launch failure', () => {
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
  afterEach(() => { vi.restoreAllMocks() })

  it('settles the gate when the first scene rejects', async () => {
    const newScene = vi.fn(() => Promise.reject(new Error('createNewSceneAndView failed')))
    const h = makeRenderHook(() =>
      useAppInitialization({ cueMolReady: true, newScene: newScene as never }),
    )
    await flushPromises()
    await flushPromises()
    expect(newScene).toHaveBeenCalledTimes(1)
    expect(h.result.initialSceneSettled).toBe(true)
    h.unmount()
  })

  it('settles the gate when the first scene returns falsy', async () => {
    const newScene = vi.fn(() => Promise.resolve(undefined))
    const h = makeRenderHook(() =>
      useAppInitialization({ cueMolReady: true, newScene: newScene as never }),
    )
    await flushPromises()
    await flushPromises()
    expect(h.result.initialSceneSettled).toBe(true)
    h.unmount()
  })
})
