/**
 * @file shell/menu/useMenuBarState.ts
 * @description The live state the shared `APP_MENU` template is resolved
 * against: View-menu radio values, scene-operation gating, exporter
 * availability and the recent-files list.
 *
 * Two consumers resolve the template on Windows / Linux and must agree on
 * which items are enabled: the React menu bar (what the user sees) and the
 * keybinding dispatcher (what a shortcut does). Reading the providers here,
 * once, keeps them from drifting.
 */
import { useMemo } from 'react'
import { useRecentFiles } from '@renderer/features/file-io/useRecentFiles'
import { useActiveViewValues } from '@renderer/state/activeView'
import { useActiveScene } from '@renderer/state/workspace'
import type { MenuBarStateContext } from './resolveAppMenu'

/**
 * Subscribe to the provider slices the menu template depends on.
 *
 * @returns a memoized context for `resolveAppMenuNodes`; its identity changes
 *   only when one of the underlying values does, so callers can memoize on it.
 */
export function useMenuBarState(): MenuBarStateContext {
  const { viewProjection, viewCenterMark, sceneBgColor, exportAvailable } = useActiveViewValues()
  const { hasScene } = useActiveScene()
  const recentFiles = useRecentFiles()
  return useMemo(
    () => ({ viewProjection, viewCenterMark, sceneBgColor, hasScene, exportAvailable, recentFiles }),
    [viewProjection, viewCenterMark, sceneBgColor, hasScene, exportAvailable, recentFiles],
  )
}
