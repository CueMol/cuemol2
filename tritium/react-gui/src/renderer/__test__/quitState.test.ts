/**
 * Degrade-detection test for main/quitState.ts.
 *
 * Pins the two state scopes the window-close funnel depends on:
 *   - per-window `confirmed` / `inFlight` flags are isolated per window
 *     (a WeakMap keyed by BrowserWindow), default false for an unseen window;
 *   - the app-level `appQuitting` flag is a single shared boolean.
 *
 * If per-window state ever leaked across windows, closing one window would
 * wrongly let another close without its own confirm walk.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// quitState lives in src/main (tsconfig.node project). A string-variable
// dynamic import keeps tsc's cross-project check (TS6307) off this file
// while Vitest still resolves it at runtime -- same trick as
// preloadElectronApi.test.ts.
const quitStateEntry = '../../main/quitState'

interface QuitStateModule {
  isCloseConfirmed(win: object): boolean
  setCloseConfirmed(win: object, value: boolean): void
  isCloseInFlight(win: object): boolean
  setCloseInFlight(win: object, value: boolean): void
  isAppQuitting(): boolean
  setAppQuitting(value: boolean): void
}

let mod: QuitStateModule

beforeEach(async () => {
  // Fresh module instance per test: resets the WeakMap and appQuitting.
  vi.resetModules()
  mod = (await import(quitStateEntry)) as unknown as QuitStateModule
})

describe('quitState -- per-window close state', () => {
  it('defaults to false for a window that was never touched', () => {
    const win = {}
    expect(mod.isCloseConfirmed(win)).toBe(false)
    expect(mod.isCloseInFlight(win)).toBe(false)
  })

  it('keeps `confirmed` isolated per window', () => {
    const winA = {}
    const winB = {}
    mod.setCloseConfirmed(winA, true)
    expect(mod.isCloseConfirmed(winA)).toBe(true)
    expect(mod.isCloseConfirmed(winB)).toBe(false)
  })

  it('keeps `inFlight` isolated per window', () => {
    const winA = {}
    const winB = {}
    mod.setCloseInFlight(winA, true)
    expect(mod.isCloseInFlight(winA)).toBe(true)
    expect(mod.isCloseInFlight(winB)).toBe(false)
  })

  it('tracks `confirmed` and `inFlight` independently for the same window', () => {
    const win = {}
    mod.setCloseInFlight(win, true)
    expect(mod.isCloseInFlight(win)).toBe(true)
    expect(mod.isCloseConfirmed(win)).toBe(false)

    mod.setCloseConfirmed(win, true)
    mod.setCloseInFlight(win, false)
    expect(mod.isCloseConfirmed(win)).toBe(true)
    expect(mod.isCloseInFlight(win)).toBe(false)
  })
})

describe('quitState -- app-level quit flag', () => {
  it('defaults to false and toggles', () => {
    expect(mod.isAppQuitting()).toBe(false)
    mod.setAppQuitting(true)
    expect(mod.isAppQuitting()).toBe(true)
    mod.setAppQuitting(false)
    expect(mod.isAppQuitting()).toBe(false)
  })
})
