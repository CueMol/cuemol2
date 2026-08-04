/**
 * Degrade-detection test for useMenuDispatch.
 *
 * Refactor target: A (IPC channel literal cleanup). After A, the 5 string
 * literals ('menu:center-mark-cross', 'menu:center-mark-axis',
 * 'menu:center-mark-none', 'menu:bg-white', 'menu:bg-black', 'menu:about')
 * become IPC.MENU_CENTER_MARK_*, IPC.MENU_BG_*, IPC.MENU_ABOUT constants.
 *
 * This test pins the channel-string -> CmdId mapping using the LITERAL
 * channel strings on purpose, so that a wrong channel-name change in A is
 * detected. Pre-existing channels are exercised via the IPC constant.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { CommandProvider, useCommands } from '../commands/CommandRegistry'
import { CmdId } from '../commands/ids'
import type { CommandKey } from '../commands/CommandMap'
import { IPC } from '../../shared/ipcChannels'
import { useMenuDispatch } from '../hooks/useMenuDispatch'
import { makeRenderHook } from './helpers/testHarness'

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(CommandProvider, null, children)

interface Captured { id: string; args: unknown }

function setupHarness(activeTab: string | null = 'molview-1') {
  const captured: Captured[] = []

  const h = makeRenderHook(() => {
    const cmds = useCommands()
    const { dispatchMenuChannel, dispatchOpenRecent } = useMenuDispatch(activeTab)
    return { cmds, dispatchMenuChannel, dispatchOpenRecent }
  }, Wrapper)

  // Register a wildcard catcher for every CmdId in use.
  const allCmds = Object.values(CmdId) as CommandKey[]
  for (const id of allCmds) {
    h.result.cmds.register(id, ((args: unknown) => {
      captured.push({ id, args })
    }) as never)
  }

  return { h, captured }
}

describe('useMenuDispatch -- channel to CmdId mapping', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
    errSpy.mockRestore()
  })

  // Each row: [channel string passed to dispatchMenuChannel, expected CmdId, args]
  // The channel column intentionally mixes IPC.* constants and the bare strings
  // that A will replace. Using literals on the LHS for the to-be-replaced rows
  // documents the current channel name so that A's renaming is detected.
  const cases: Array<[string, string, unknown]> = [
    [IPC.MENU_OPEN_FILE,        CmdId.UiOpenObjDialog,    undefined],
    [IPC.MENU_SAVE,             CmdId.FileSave,           undefined],
    [IPC.MENU_NEW_TAB,          CmdId.TabNew,             undefined],
    [IPC.MENU_CLOSE_TAB,        CmdId.TabClose,           'molview-1'],
    [IPC.MENU_UNDO,             CmdId.Undo,               undefined],
    [IPC.MENU_REDO,             CmdId.Redo,               undefined],
    [IPC.MENU_NEW_SCENE,        CmdId.SceneNew,           undefined],
    [IPC.MENU_OPEN_SCENE,       CmdId.UiOpenSceneDialog,  undefined],
    [IPC.MENU_VIEW_PERSPECTIVE, CmdId.ViewPerspective,    undefined],
    [IPC.MENU_VIEW_ORTHOGRAPHIC,CmdId.ViewOrthographic,   undefined],
    // The following 6 strings are currently bare literals in useMenuDispatch.
    // After A they become IPC.MENU_CENTER_MARK_*, IPC.MENU_BG_*, IPC.MENU_ABOUT.
    // The literal channel string itself must NOT change (only the source of the
    // string should move to ipcChannels.ts).
    ['menu:center-mark-cross',  CmdId.ViewCenterMarkCross, undefined],
    ['menu:center-mark-axis',   CmdId.ViewCenterMarkAxis,  undefined],
    ['menu:center-mark-none',   CmdId.ViewCenterMarkNone,  undefined],
    ['menu:bg-white',           CmdId.SceneBgWhite,        undefined],
    ['menu:bg-black',           CmdId.SceneBgBlack,        undefined],
    ['menu:about',              CmdId.UiAboutDialog,       undefined],
    [IPC.MENU_GET_PDB,          CmdId.UiGetPdbDialog,      undefined],
    ['menu:change-chain-id',    CmdId.UiChangeChainIdDialog, undefined],
    ['menu:delete-mol-atoms',   CmdId.UiDeleteMolDialog,    undefined],
    ['menu:change-resid-num',   CmdId.UiChangeResidueIndexDialog, undefined],
    ['menu:merge-mol',          CmdId.UiMergeMolDialog,    undefined],
    ['menu:reassign-2ndry',     CmdId.UiReassignProt2ndryDialog, undefined],
    ['menu:save-file-as',       CmdId.ObjectSaveAs,        undefined],
    ['menu:save-current-view',  CmdId.SaveCurrentView,     undefined],
    ['menu:reload-scene',       CmdId.SceneReload,         undefined],
    ['menu:view-props',         CmdId.UiViewProperty,      undefined],
    // macOS App > Preferences... and non-macOS Edit > Options share this channel.
    [IPC.MENU_OPTIONS,          CmdId.UiSettingsTab,       undefined],
  ]

  for (const [channel, expectedId, expectedArgs] of cases) {
    it(`dispatches ${channel} -> ${expectedId}`, async () => {
      const { h, captured } = setupHarness()
      h.result.dispatchMenuChannel(channel)
      await Promise.resolve()
      expect(captured.length).toBe(1)
      expect(captured[0].id).toBe(expectedId)
      expect(captured[0].args).toBe(expectedArgs)
      h.unmount()
    })
  }

  it('MENU_CLOSE_TAB without active tab dispatches nothing', async () => {
    const { h, captured } = setupHarness(null)
    h.result.dispatchMenuChannel(IPC.MENU_CLOSE_TAB)
    await Promise.resolve()
    expect(captured.length).toBe(0)
    h.unmount()
  })

  it('unknown channel logs warning and dispatches nothing', () => {
    const { h, captured } = setupHarness()
    h.result.dispatchMenuChannel('menu:never-existed')
    expect(captured.length).toBe(0)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not yet implemented'),
      'menu:never-existed',
    )
    h.unmount()
  })
})

describe('useMenuDispatch -- dispatchOpenRecent (MRU reader reuse)', () => {
  it('obj entry WITH readerName opens with that reader, contentFirst false', async () => {
    const { h, captured } = setupHarness()
    h.result.dispatchOpenRecent({ path: '/x/foo.pdb', ftype: 'obj', readerName: 'pdb' })
    await Promise.resolve()
    expect(captured.length).toBe(1)
    expect(captured[0].id).toBe(CmdId.OpenObjByPath)
    expect(captured[0].args).toEqual({
      name: '/x/foo.pdb', path: '/x/foo.pdb', contentFirst: false, readerName: 'pdb',
    })
    h.unmount()
  })

  it('legacy obj entry WITHOUT readerName falls back to contentFirst sniff', async () => {
    const { h, captured } = setupHarness()
    h.result.dispatchOpenRecent({ path: '/x/foo.pdb', ftype: 'obj' })
    await Promise.resolve()
    expect(captured.length).toBe(1)
    expect(captured[0].id).toBe(CmdId.OpenObjByPath)
    expect(captured[0].args).toEqual({
      name: '/x/foo.pdb', path: '/x/foo.pdb', contentFirst: true,
    })
    h.unmount()
  })

  it('scene entry routes to OpenSceneByPath', async () => {
    const { h, captured } = setupHarness()
    h.result.dispatchOpenRecent({ path: '/x/s.qsc', ftype: 'scene' })
    await Promise.resolve()
    expect(captured.length).toBe(1)
    expect(captured[0].id).toBe(CmdId.OpenSceneByPath)
    expect(captured[0].args).toBe('/x/s.qsc')
    h.unmount()
  })
})
