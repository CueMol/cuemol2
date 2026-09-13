/**
 * @file shared/pluginMenu.test.ts
 * @description The wire contract of a plugin-contributed menu row.
 *
 * Both menu surfaces build from `buildAppMenu`, and the main process -- which
 * cannot see the renderer's plugin registry -- routes a contributed row purely
 * by the shape of its ipcChannel. Three things therefore have to hold, and
 * none of them is checked by the type system: the channel carries the command
 * id, the row lands where the manifest said, and `APP_MENU` itself is left
 * alone so disabling a plugin actually removes the row.
 */

import { describe, expect, it, vi } from 'vitest'
import { APP_MENU } from '@shared/menuTemplate'
import type { AppMenuItem } from '@shared/menuTemplate'
import {
  buildAppMenu,
  isPluginMenuChannel,
  pluginCommandFromChannel,
  pluginMenuChannel,
} from '@shared/pluginMenu'
import type { PluginMenuContribution } from '@shared/types/pluginContrib'

/** The File group's item ids, in order. */
function fileItemIds(groups: ReturnType<typeof buildAppMenu>): string[] {
  const file = groups.find((g) => g.label === 'File')
  if (!file) throw new Error('no File group')
  return file.submenu.map((i: AppMenuItem) => i.id ?? `<${i.type ?? 'item'}>`)
}

const CONTRIB: PluginMenuContribution = {
  group: 'file',
  after: 'open-file',
  items: [{ id: 'demo-row', label: 'Demo...', command: 'plugin.demo.run' }],
}

describe('plugin menu channels', () => {
  it('round-trip the command id through the channel', () => {
    const ch = pluginMenuChannel('plugin.demo.run')
    expect(isPluginMenuChannel(ch)).toBe(true)
    expect(pluginCommandFromChannel(ch)).toBe('plugin.demo.run')
    // A built-in menu action must not be mistaken for a plugin one.
    expect(isPluginMenuChannel('menu:open-file')).toBe(false)
  })
})

describe('buildAppMenu', () => {
  it('inserts the row after the named item, carrying its command channel', () => {
    const ids = fileItemIds(buildAppMenu([CONTRIB]))
    expect(ids[ids.indexOf('open-file') + 1]).toBe('demo-row')

    const file = buildAppMenu([CONTRIB]).find((g) => g.label === 'File')!
    const row = file.submenu.find((i) => i.id === 'demo-row')!
    expect(row.ipcChannel).toBe('menu:plugin:plugin.demo.run')
  })

  it('appends when the anchor item is not there', () => {
    const ids = fileItemIds(buildAppMenu([{ ...CONTRIB, after: 'no-such-item' }]))
    expect(ids[ids.length - 1]).toBe('demo-row')
  })

  it('leaves APP_MENU untouched, so disabling the plugin drops the row', () => {
    const before = fileItemIds(APP_MENU)
    buildAppMenu([CONTRIB])
    expect(fileItemIds(APP_MENU)).toEqual(before)
    expect(fileItemIds(buildAppMenu([]))).toEqual(before)
  })

  it('warns and drops a contribution naming a group that does not exist', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const groups = buildAppMenu([
      { ...CONTRIB, group: 'nowhere' as PluginMenuContribution['group'] },
    ])
    expect(groups.every((g) => g.submenu.every((i) => i.id !== 'demo-row'))).toBe(true)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nowhere'))
    warn.mockRestore()
  })
})
