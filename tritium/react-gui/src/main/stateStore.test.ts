/**
 * @file main/stateStore.test.ts
 * @description Pins that a damaged app-state.json cannot stop the app booting.
 *
 * `new Store({ name, defaults })` without a schema leaves conf's
 * `clearInvalidConfig` at false, so unparseable JSON makes the *constructor*
 * throw. The first store read happens inside `app.whenReady()`, which has no
 * catch, so createWindow() never ran: no window was ever created, therefore
 * `window-all-closed` never fired either, and the app sat there as a windowless
 * process with one line on stderr. A truncated write (power loss, full disk) is
 * all it takes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const storeCtor = vi.fn()

vi.mock('electron-store', () => ({
  default: class {
    constructor(opts: unknown) { storeCtor(opts) }
    get() { return undefined }
    set() { /* no-op */ }
  },
}))

const renameSync = vi.fn<(from: string, to: string) => void>()
const existsSync = vi.fn<(p: string) => boolean>(() => true)
vi.mock('fs', () => ({
  default: { renameSync, existsSync },
  renameSync,
  existsSync,
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/userData' },
}))

async function freshStore() {
  vi.resetModules()
  return await import('./stateStore')
}

beforeEach(() => {
  storeCtor.mockReset()
  renameSync.mockReset()
  existsSync.mockReturnValue(true)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('stateStore corrupt-file recovery', () => {
  it('does not throw when the store file is unparseable', async () => {
    let calls = 0
    storeCtor.mockImplementation(() => {
      calls += 1
      if (calls === 1) throw new SyntaxError('Unexpected end of JSON input')
    })
    const { loadUi } = await freshStore()
    expect(() => loadUi()).not.toThrow()
  })

  it('moves the damaged file aside and re-creates the store', async () => {
    let calls = 0
    storeCtor.mockImplementation(() => {
      calls += 1
      if (calls === 1) throw new SyntaxError('Unexpected end of JSON input')
    })
    const { loadUi } = await freshStore()
    loadUi()
    expect(renameSync).toHaveBeenCalledTimes(1)
    const [from, to] = renameSync.mock.calls[0] as [string, string]
    expect(String(from)).toMatch(/app-state\.json$/)
    expect(String(to)).toMatch(/app-state\.json\.corrupt$/)
    expect(calls).toBe(2)
  })

  it('constructs the store once on the happy path', async () => {
    const { loadUi } = await freshStore()
    loadUi()
    loadUi()
    expect(storeCtor).toHaveBeenCalledTimes(1)
    expect(renameSync).not.toHaveBeenCalled()
  })
})
