/**
 * @file hooks/useWindowTitleSync.ts
 * @description Keeps the OS window title showing the active scene.
 *
 * UXP set `"<product> - <scene>:<view>"` and refreshed it when the active
 * view changed or the scene was renamed (`Qm2Main.setWindowTitle`, called
 * from the view-change path and from a scene `name` PROPCHG handler).
 *
 * tritium already computes exactly that `"<scene>:<view>"` string for the
 * tab strip, and `useMolViewTabTitleSync` keeps it current through the same
 * PROPCHG events. So this hook reads the active tab's title rather than
 * subscribing a second time -- one source, both surfaces.
 *
 * A non-molview tab (Settings) or an empty tab strip sends an empty
 * subtitle, which main renders as the bare product name -- UXP's
 * `setWindowTitle()` with no argument.
 *
 * @module hooks/useWindowTitleSync
 */

import { useEffect, useRef } from 'react'
import type { TabData } from '../types'
import { IPC } from '@shared/ipcChannels'

export function useWindowTitleSync(tabs: TabData[], activeTab: string): void {
  // Skip redundant IPC when an unrelated tab change leaves the title alone.
  const lastSentRef = useRef<string | null>(null)

  useEffect(() => {
    const active = tabs.find((t) => t.id === activeTab)
    const subtitle = active?.type === 'molview' ? active.title : ''
    if (lastSentRef.current === subtitle) return
    lastSentRef.current = subtitle
    window.electronAPI
      ?.invoke(IPC.WINDOW_SET_TITLE, { subtitle })
      .catch((err: unknown) => console.warn('set window title failed:', err))
  }, [tabs, activeTab])
}
