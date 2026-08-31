/**
 * Subscribes to the main-process MRU list so MenuBar can render the
 * dynamic "Open Recent" submenu. Loads the persisted list once on mount
 * and refreshes whenever main pushes RECENT_UPDATED (after add / clear).
 */

import { useEffect, useState } from 'react'
import { IPC } from '@shared/ipcChannels'
import type { RecentFileEntry } from '@shared/types/recent'
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard'

export function useRecentFiles(): RecentFileEntry[] {
  const [recents, setRecents] = useState<RecentFileEntry[]>([])

  const guard = useStaleGuard()
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    const token = guard.next()
    api.invoke(IPC.RECENT_LOAD).then((list) => {
      if (guard.isCurrent(token) && Array.isArray(list)) setRecents(list)
    }).catch((e: unknown) => console.error('recent load failed:', e))
    const unsub = api.onPush(IPC.RECENT_UPDATED, (list) => {
      setRecents(Array.isArray(list) ? list : [])
    })
    return () => {
      guard.invalidate()
      unsub()
    }
  }, [guard])

  return recents
}
