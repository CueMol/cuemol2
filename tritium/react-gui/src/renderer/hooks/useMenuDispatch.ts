/**
 * @file hooks/useMenuDispatch.ts
 * @description Maps IPC menu channel names to command dispatch calls.
 *
 * Used by both useElectronIpc (native menu IPC events) and MenuBar (React
 * custom menu clicks) so both code paths share the same logic.
 *
 * Every menu action is a plain no-arg command now: the actions that used to
 * be special cases here (Select All, cut / copy / paste, undo / redo,
 * Clear Recent, Close Tab) are commands that resolve focus or the active tab
 * themselves -- see commands/useFocusEditCommands.ts and useTabCommands.ts.
 * This file therefore does one thing: channel -> command id -> dispatch.
 */

import { useCallback } from 'react'
import { useCommands } from '../commands/CommandRegistry'
import { CmdId } from '../commands/ids'
import type { CommandKey } from '../commands/CommandMap'
import type { RecentFileEntry } from '@shared/types/recent'
import {
  MENU_ACTION_MAP,
  isMenuActionChannel,
  isUnimplementedMenuAction,
} from '@shared/menuActionMap'

export function useMenuDispatch(): {
  dispatchMenuChannel: (channel: string) => void
  dispatchOpenRecent: (entry: RecentFileEntry) => void
} {
  const { dispatch } = useCommands()

  const dispatchMenuChannel = useCallback(
    (channel: string) => {
      const logErr = (prefix: string) => (e: unknown) => console.error(prefix, e)

      if (!isMenuActionChannel(channel) || isUnimplementedMenuAction(channel)) {
        console.warn('menu action not yet implemented:', channel)
        return
      }

      // The dispatch field is a no-arg command id (menuActionMap mirrors the
      // CmdId values; `menuActionMap.pureCmdIds.test.tsx` pins that). The cast
      // sidesteps the variadic-tuple union without weakening the contract.
      const dispatchNoArg = dispatch as (id: CommandKey) => Promise<unknown>
      dispatchNoArg(MENU_ACTION_MAP[channel].dispatch as CommandKey).catch(logErr(`${channel}:`))
    },
    [dispatch],
  )

  const dispatchOpenRecent = useCallback(
    (entry: RecentFileEntry) => {
      const logErr = (prefix: string) => (e: unknown) => console.error(prefix, e)
      if (entry.ftype === 'scene') {
        dispatch(CmdId.OpenSceneByPath, entry.path).catch(logErr('recent.scene:'))
      } else if (entry.readerName) {
        // Reader recorded at first open: reuse it directly (UXP MRU parity).
        // contentFirst is irrelevant once readerName pins the reader.
        dispatch(CmdId.OpenObjByPath, {
          name: entry.path, path: entry.path,
          contentFirst: false, readerName: entry.readerName,
        }).catch(logErr('recent.obj:'))
      } else {
        // Legacy entry without a stored reader: no filter context, so
        // default to content-first sniff (qdf* readers are excluded by
        // pickReaderName) to resolve a renamed / extension-spoofed file.
        dispatch(CmdId.OpenObjByPath, { name: entry.path, path: entry.path, contentFirst: true })
          .catch(logErr('recent.obj:'))
      }
    },
    [dispatch],
  )

  return { dispatchMenuChannel, dispatchOpenRecent }
}
