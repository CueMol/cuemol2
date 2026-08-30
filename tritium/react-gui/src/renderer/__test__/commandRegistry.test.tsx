/**
 * Degrade-detection test for CommandRegistry (post-D).
 *
 * After D, register/dispatch are generic over CommandMap. The tests below
 * exercise the runtime mechanics through real CmdIds:
 *   - SceneNew:  args=void, result=void
 *   - TabClose:  args=string, result=void
 *   - Undo:      args=void, result=void (async handler shape)
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { CommandProvider, useCommands, useRegisterCommand } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import { makeRenderHook, flushPromises } from '@renderer/__test__/helpers/testHarness'

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(CommandProvider, null, children)

describe('CommandRegistry', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    warnSpy?.mockRestore()
  })

  it('dispatch invokes the registered sync handler', async () => {
    const calls: string[] = []
    const h = makeRenderHook(() => {
      useRegisterCommand(CmdId.SceneNew, () => { calls.push('called') })
      return useCommands()
    }, Wrapper)

    await h.result.dispatch(CmdId.SceneNew)
    expect(calls).toEqual(['called'])
    h.unmount()
  })

  it('dispatch awaits Promise-returning handler', async () => {
    const calls: number[] = []
    const h = makeRenderHook(() => {
      useRegisterCommand(CmdId.Undo, async () => {
        await Promise.resolve()
        calls.push(1)
      })
      return useCommands()
    }, Wrapper)

    await h.result.dispatch(CmdId.Undo)
    expect(calls).toEqual([1])
    h.unmount()
  })

  it('dispatch forwards typed args (TabClose: string)', async () => {
    let received: string | undefined
    const h = makeRenderHook(() => {
      useRegisterCommand(CmdId.TabClose, (id) => { received = id })
      return useCommands()
    }, Wrapper)

    await h.result.dispatch(CmdId.TabClose, 'tab-42')
    expect(received).toBe('tab-42')
    h.unmount()
  })

  it('dispatch on unregistered id rejects', async () => {
    const h = makeRenderHook(() => useCommands(), Wrapper)
    await expect(h.result.dispatch(CmdId.SceneNew)).rejects.toThrow(/unknown command/i)
    h.unmount()
  })

  // A handler that throws synchronously must still come back as a rejected
  // promise. Every call site attaches `.catch(logErr(...))` to the returned
  // promise; if dispatch throws instead, that catch is never attached and the
  // error escapes through the IPC push callback into window.onerror.
  it('a synchronously throwing handler rejects instead of throwing', async () => {
    const h = makeRenderHook(() => {
      useRegisterCommand(CmdId.SceneNew, () => {
        throw new Error('handler blew up')
      })
      return useCommands()
    }, Wrapper)
    await flushPromises()

    let threw = false
    let promise: Promise<unknown> | undefined
    try {
      promise = h.result.dispatch(CmdId.SceneNew)
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    await expect(promise).rejects.toThrow(/handler blew up/)
    h.unmount()
  })

  it('has() reflects registration state', async () => {
    const h = makeRenderHook(() => {
      useRegisterCommand(CmdId.FileSave, () => false)
      return useCommands()
    }, Wrapper)
    await flushPromises()
    expect(h.result.has(CmdId.FileSave)).toBe(true)
    expect(h.result.has(CmdId.SceneNew)).toBe(false)
    h.unmount()
  })

  it('unmount removes the registered command', async () => {
    const h = makeRenderHook(() => {
      useRegisterCommand(CmdId.FileSave, () => false)
      return useCommands()
    }, Wrapper)
    await flushPromises()
    const cmds = h.result
    expect(cmds.has(CmdId.FileSave)).toBe(true)
    h.unmount()
    expect(cmds.has(CmdId.FileSave)).toBe(false)
  })

  it('overriding an existing id warns; latest handler wins', async () => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const calls: number[] = []
    const h = makeRenderHook(() => {
      const cmds = useCommands()
      cmds.register(CmdId.SceneNew, () => { calls.push(1) })
      cmds.register(CmdId.SceneNew, () => { calls.push(2) })
      return cmds
    }, Wrapper)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered'))
    await h.result.dispatch(CmdId.SceneNew)
    expect(calls).toEqual([2])
    h.unmount()
  })

  it('useCommands throws when used outside provider', () => {
    expect(() => makeRenderHook(() => useCommands())).toThrow(/inside <CommandProvider>/)
  })

  it('handler closure sees latest value via useRegisterCommand ref', async () => {
    let counter = 0
    const captures: number[] = []
    const h = makeRenderHook(() => {
      counter += 1
      const local = counter
      useRegisterCommand(CmdId.SceneNew, () => { captures.push(local) })
      return useCommands()
    }, Wrapper)
    h.rerender()
    h.rerender()
    await flushPromises()
    await h.result.dispatch(CmdId.SceneNew)
    expect(captures).toEqual([counter])
    h.unmount()
  })
})
