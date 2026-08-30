/**
 * @file shell/AppBoot.tsx
 * @description Window-level wiring that has no UI of its own.
 *
 * The launch scene, the OS integrations (files handed over by the shell, the
 * window title, the text context menu, the scoped Select All / clipboard
 * trackers) and the close funnel. It renders nothing, so the subscriptions it
 * needs -- the tab strip, the CueMol bridge -- do not re-render the chrome.
 */

import React, { useCallback, useEffect } from 'react'
import { IPC } from '@shared/ipcChannels'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useWorkspaceDispatch, useWorkspaceTabs } from '@renderer/state/workspace'
import { useLayout, useLayoutDispatch } from '@renderer/state/layout'
import { useTheme } from '@renderer/contexts/ThemeContext'
import { useRevealWindow } from '@renderer/shell/reveal/useRevealWindow'
import { useAppInitialization } from '@renderer/hooks/useAppInitialization'
import { useNewSceneAction } from '@renderer/hooks/useNewSceneAction'
import { useShellOpenFiles } from '@renderer/features/file-io/useShellOpenFiles'
import { useWindowCloseHandler } from '@renderer/hooks/useWindowCloseHandler'
import { useWindowTitleSync } from '@renderer/hooks/useWindowTitleSync'
import { useTextContextMenu } from '@renderer/hooks/useTextContextMenu'
import { installSelectAllScope } from '@renderer/utils/selectAllScope'
import { installClipboardScopeTracking } from '@renderer/utils/editClipboard'

export const AppBoot: React.FC = () => {
  const { cueMolReady, cm } = useCueMol()
  const { activateTab, closeTab, tabsRef } = useWorkspaceDispatch()
  const { tabs, activeTabId } = useWorkspaceTabs()
  const { flushPendingSaves } = useLayoutDispatch()
  const { loaded: layoutLoaded } = useLayout()
  const { loaded: themeLoaded } = useTheme()

  // Persist user-defined style defaults (atom labels, view-input scalars) to
  // the user style file when the window closes -- UXP `Qm2Main.onUnLoad`
  // parity. The path is resolved by Main via APP_PATH.
  const saveUserStyleOnClose = useCallback(async (): Promise<void> => {
    // Closing the window does not unmount the renderer, so the debounced
    // layout / UI writes have no other chance to land: dragging a splitter and
    // closing straight after used to lose the new layout.
    await flushPendingSaves()
    if (!cm) return
    // Stop anything still running before the worker goes away with the window.
    // Renders and APBS runs are external processes (posix_spawn children of
    // this app), so they outlive it unless they are killed -- and their work
    // directory is only registered for cleanup on completion, so it would be
    // left behind too.
    try {
      const stopped = await cm.invokeService('cancelAllJobs', {})
      if (stopped.render > 0 || stopped.apbs > 0) {
        console.log(
          `[close] cancelled ${stopped.render} render / ${stopped.apbs} apbs job(s)`,
        )
      }
    } catch (err: unknown) {
      console.warn('cancelling in-flight jobs failed:', err)
    }
    const info = await window.electronAPI?.invoke(IPC.APP_PATH)
    const path = info?.userStylePath
    if (path) await cm.saveUserStyle(path)
  }, [cm, flushPendingSaves])

  useWindowCloseHandler({
    tabsRef,
    handleCloseTab: closeTab,
    setActiveTab: activateTab,
    onBeforeProceed: saveUserStyleOnClose,
  })

  // First scene/view on launch (StrictMode guarded); the same "create scene
  // + view + register tab" action the New Tab dialog uses.
  const newScene = useNewSceneAction({ cm })
  const { initialSceneSettled } = useAppInitialization({ cueMolReady, newScene })

  // The window is created hidden. It goes on screen once the persisted
  // layout and theme are applied and the first scene's tab is in -- before
  // that the user watched the splitters appear, the colours flip and the
  // welcome pane give way to the molview.
  useRevealWindow(layoutLoaded && themeLoaded && initialSceneSettled)

  // OS shell / command-line file open (UXP openFromShell parity).
  useShellOpenFiles({ cm, cueMolReady, initialSceneSettled })

  // OS window title follows the active scene (UXP setWindowTitle).
  useWindowTitleSync(tabs, activeTabId)

  // Text clipboard context menu (Windows/Linux React menu path).
  useTextContextMenu()

  // Track the active selectable region so Cmd+A / Edit > Select All target
  // only the focused field or that region (e.g. the log panel), never the
  // whole GUI.
  useEffect(() => installSelectAllScope(), [])

  // Remember which panel the user last worked in, so Edit > Cut/Copy/Paste
  // reaches it even when the click moved focus into the menu itself.
  useEffect(() => installClipboardScopeTracking(), [])

  // macOS traffic-light inset.
  useEffect(() => {
    if (window.electronAPI?.platform === 'darwin') {
      document.documentElement.style.setProperty('--titlebar-inset', '78px')
    }
  }, [])

  return null
}
