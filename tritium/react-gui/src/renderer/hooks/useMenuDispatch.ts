/**
 * @file hooks/useMenuDispatch.ts
 * @description Maps IPC menu channel names to command dispatch calls.
 *
 * Used by both useElectronIpc (native menu IPC events) and MenuBar
 * (React custom menu clicks) so both code paths share the same logic.
 */

import { useCallback } from 'react'
import { useCommands } from '../commands/CommandRegistry'
import { CmdId } from '../commands/ids'
import type { CommandKey } from '../commands/CommandMap'
import { IPC } from '../../shared/ipcChannels'
import type { RecentFileEntry } from '../../shared/ipcTypes'
import {
  MENU_ACTION_MAP,
  MENU_DISPATCH_RECENT_CLEAR,
  MENU_DISPATCH_SELECT_ALL,
  MENU_DISPATCH_EDIT_CUT,
  MENU_DISPATCH_EDIT_COPY,
  MENU_DISPATCH_EDIT_PASTE,
  isMenuActionChannel,
  isUnimplementedMenuAction,
  type MenuActionChannel,
} from '../../shared/menuActionMap'
import { selectAllInScope } from '../utils/selectAllScope'
import { dispatchEditClipboard, dispatchEditUndoRedo } from '../utils/editClipboard'

/** Dependencies a per-channel menu handler needs from the hook closure. */
interface MenuDispatchCtx {
  dispatch: ReturnType<typeof useCommands>['dispatch']
  activeTab: string | null
  logErr: (prefix: string) => (e: unknown) => void
}

/**
 * Special-cased menu channels that do NOT dispatch a plain no-arg command:
 *   - MENU_CLOSE_TAB    : dispatches with the active tab id, guarded on it
 *   - MENU_SELECT_ALL   : runs selectAllInScope() directly (no command bus)
 *   - MENU_EDIT_*       : resolve by focus (utils/editClipboard.ts)
 *   - MENU_UNDO/REDO    : native text undo while a field has focus, otherwise
 *                         the scene-level command
 *   - MENU_CLEAR_RECENT : invokes IPC.RECENT_CLEAR directly
 * Every other channel uses the generic path: dispatch(map.dispatch) with no
 * args. Genuinely-unimplemented channels are caught before lookup and warn.
 *
 * The `satisfies Partial<Record<...>>` keeps the keys typed against the action
 * map so a renamed channel is a compile error.
 */
const SPECIAL_HANDLERS = {
  [IPC.MENU_CLOSE_TAB]: ({ dispatch, activeTab, logErr }: MenuDispatchCtx) => {
    if (activeTab) dispatch('tab.close', activeTab).catch(logErr('tab.close:'))
  },
  [IPC.MENU_SELECT_ALL]: () => {
    // Scoped Select All: focused field or active selectable region only,
    // never the whole document. See utils/selectAllScope.ts.
    selectAllInScope()
  },
  // Clipboard actions resolve by focus: text field -> native edit, scene
  // tree -> node copy/paste, paint deck -> row copy/paste.
  [IPC.MENU_EDIT_CUT]: () => { dispatchEditClipboard('cut') },
  [IPC.MENU_EDIT_COPY]: () => { dispatchEditClipboard('copy') },
  [IPC.MENU_EDIT_PASTE]: () => { dispatchEditClipboard('paste') },
  // Undo / Redo are scene-level, EXCEPT while a text field has focus -- there
  // the user means the typing, not the scene. Without this the scene undo
  // fires whenever the scene has an undo stack, whatever is focused.
  [IPC.MENU_UNDO]: ({ dispatch, logErr }: MenuDispatchCtx) => {
    if (dispatchEditUndoRedo('undo')) return
    dispatch('edit.undo').catch(logErr('edit.undo:'))
  },
  [IPC.MENU_REDO]: ({ dispatch, logErr }: MenuDispatchCtx) => {
    if (dispatchEditUndoRedo('redo')) return
    dispatch('edit.redo').catch(logErr('edit.redo:'))
  },
  [IPC.MENU_CLEAR_RECENT]: ({ logErr }: MenuDispatchCtx) => {
    window.electronAPI?.invoke(IPC.RECENT_CLEAR).catch(logErr('recent.clear:'))
  },
} satisfies Partial<Record<MenuActionChannel, (ctx: MenuDispatchCtx) => void>>

export function useMenuDispatch(activeTab: string | null): {
  dispatchMenuChannel: (channel: string) => void
  dispatchOpenRecent: (entry: RecentFileEntry) => void
} {
  const { dispatch } = useCommands()

  const dispatchMenuChannel = useCallback(
    (channel: string) => {
      const logErr = (prefix: string) => (e: unknown) => console.error(prefix, e)

      if (!isMenuActionChannel(channel)) {
        console.warn('menu action not yet implemented:', channel)
        return
      }

      const entry = MENU_ACTION_MAP[channel]
      if (isUnimplementedMenuAction(channel)) {
        console.warn('menu action not yet implemented:', channel)
        return
      }

      const special = (SPECIAL_HANDLERS as Record<string, (ctx: MenuDispatchCtx) => void>)[channel]
      if (special) {
        special({ dispatch, activeTab, logErr })
        return
      }

      // Generic path: the dispatch field is a no-arg command-id string. The
      // action map mirrors CmdId values. The only arg-taking menu command
      // (tab.close) is in SPECIAL_HANDLERS, so this path is always no-arg; the
      // cast sidesteps the variadic-tuple union without weakening that contract.
      if (
        entry.dispatch === MENU_DISPATCH_SELECT_ALL ||
        entry.dispatch === MENU_DISPATCH_RECENT_CLEAR ||
        entry.dispatch === MENU_DISPATCH_EDIT_CUT ||
        entry.dispatch === MENU_DISPATCH_EDIT_COPY ||
        entry.dispatch === MENU_DISPATCH_EDIT_PASTE
      ) {
        // These markers must be handled by SPECIAL_HANDLERS above; reaching
        // here means the table and the markers drifted.
        console.warn('menu action marker has no handler:', channel)
        return
      }
      const dispatchNoArg = dispatch as (id: CommandKey) => Promise<unknown>
      dispatchNoArg(entry.dispatch as CommandKey).catch(logErr(`${channel}:`))
    },
    [dispatch, activeTab],
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
