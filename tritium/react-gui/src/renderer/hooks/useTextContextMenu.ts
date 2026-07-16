/**
 * @file hooks/useTextContextMenu.ts
 * @description Windows / Linux handler for the text clipboard context menu.
 *
 * Subscribes to `IPC.TEXT_CTX_SHOW` (pushed by main's
 * `registerTextContextMenu` on right-clicks over editable / selected text),
 * renders the shared template with the React context menu, and executes the
 * pick: cut / copy / paste are invoked back on the main process
 * (`IPC.TEXT_CTX_ACTION` -> `webContents.cut()` etc.), while Select All runs
 * the renderer-scoped `selectAllInScope` so it never selects the whole
 * document. macOS never pushes this channel (native popup instead).
 */
import { useEffect } from 'react'
import { IPC } from '../../shared/ipcChannels'
import { buildTextCtxMenuNodes } from '../../shared/textCtxMenu'
import { selectAllInScope } from '../utils/selectAllScope'
import { useShowContextMenu } from '../components/menu/ContextMenuProvider'

export function useTextContextMenu(): void {
  const showContextMenu = useShowContextMenu()

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    return api.onPush(IPC.TEXT_CTX_SHOW, (payload) => {
      void (async () => {
        const nodes = buildTextCtxMenuNodes(payload)
        if (nodes.length === 0) return
        const action = await showContextMenu(nodes, { x: payload.x, y: payload.y })
        if (!action) return
        if (action === 'selectAll') {
          selectAllInScope()
        } else {
          await api.invoke(IPC.TEXT_CTX_ACTION, action)
        }
      })()
    })
  }, [showContextMenu])
}
