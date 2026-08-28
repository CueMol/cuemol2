/**
 * @file components/MenuBar.tsx
 * @description Custom HTML menu bar for Windows / Linux.
 *
 * Renders the shared `APP_MENU` template as VS Code-style dropdowns. macOS
 * uses the native application menu instead, so `darwinOnly` groups / items
 * are excluded here. Each open group's items are resolved to platform-neutral
 * `MenuNode`s by `resolveAppMenuNodes` (deriving live View-menu radio state,
 * scene-op gating and the recent-files submenu from props) and rendered by
 * the shared `MenuPanel`, so dropdowns and the React context menus share one
 * look. Item picks dispatch either an `ipcChannel` (custom action), a `role`
 * (standard edit role), or a recent-file open.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import appIcon from '../assets/app-icon.png'
import { APP_MENU } from '@shared/menuTemplate'
import type { AppMenuRole } from '@shared/menuTemplate'
import type { RecentFileEntry, SceneBgColor, ViewCenterMark } from '@shared/ipcTypes'
import { IPC } from '@shared/ipcChannels'
import { useMenuDispatch } from '../hooks/useMenuDispatch'
import { MenuPanel } from './menu/MenuPanel'
import { resolveAppMenuNodes } from './menu/resolveAppMenu'
import type { MenuBarPick } from './menu/resolveAppMenu'

interface MenuBarProps {
  activeTab: string | null
  viewProjection?: boolean | null
  viewCenterMark?: ViewCenterMark | null
  sceneBgColor?: SceneBgColor | null
  /** Whether a molview tab is active; gates scene-operation items. */
  hasScene?: boolean
  /**
   * Scene-exporter nicknames available in this libcuemol2 build; export items
   * whose exporter is absent are hidden. `null` = unknown (show all).
   */
  exportAvailable?: string[] | null
  recentFiles?: RecentFileEntry[]
}


/**
 * Windows / Linux menu bar. Owns the open-menu and dropdown-position state
 * plus the click-away / Escape close handlers, and renders each non-darwin
 * `APP_MENU` group as a `MenuPanel` dropdown.
 */
export const MenuBar: React.FC<MenuBarProps> = ({ activeTab, viewProjection = null, viewCenterMark = null, sceneBgColor = null, hasScene = false, exportAvailable = null, recentFiles = [] }) => {
  const { dispatchMenuChannel, dispatchOpenRecent } = useMenuDispatch(activeTab)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState<{ left: number }>({ left: 0 })
  const barRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpenMenu(null), [])

  useEffect(() => {
    if (!openMenu) return
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenu, close])

  useEffect(() => {
    if (!openMenu) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        e.stopPropagation()
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [openMenu, close])

  const handleMenuToggle = (groupId: string, el: HTMLElement) => {
    if (openMenu === groupId) {
      close()
    } else {
      const rect = el.getBoundingClientRect()
      setDropdownPos({ left: rect.left })
      setOpenMenu(groupId)
    }
  }

  const handlePick = useCallback(
    (pick: MenuBarPick) => {
      close()
      if (pick.kind === 'recent') {
        dispatchOpenRecent(pick.entry)
        return
      }
      const item = pick.item
      if (item.ipcChannel) {
        dispatchMenuChannel(item.ipcChannel)
      } else if (item.role) {
        handleRole(item.role)
      }
    },
    [close, dispatchMenuChannel, dispatchOpenRecent],
  )

  // MenuBar is only used on Windows/Linux: exclude darwinOnly groups
  const visibleGroups = APP_MENU.filter((g) => !g.darwinOnly)

  return (
    // data-keep-clipboard-scope: clicking the menu must not clear which panel
    // the user was working in, or Edit > Copy would have no target.
    <div className="menubar" ref={barRef} role="menubar" data-keep-clipboard-scope>
      {/* App icon at the left edge (VS Code-style), before the menu groups. */}
      <img className="menubar__app-icon" src={appIcon} alt="" aria-hidden="true" />
      {visibleGroups.map((group) => {
        const groupId = group.label
        const isOpen = openMenu === groupId

        return (
          <div
            key={groupId}
            className={`menubar__item${isOpen ? ' menubar__item--open' : ''}`}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={isOpen}
            onClick={(e) => handleMenuToggle(groupId, e.currentTarget)}
            onMouseEnter={(e) => {
              if (openMenu && openMenu !== groupId) {
                handleMenuToggle(groupId, e.currentTarget)
              }
            }}
          >
            {group.label}

            {isOpen && (
              <div className="menubar__dropdown" style={{ left: dropdownPos.left }}>
                <MenuPanel
                  nodes={resolveAppMenuNodes(group.submenu, {
                    viewProjection,
                    viewCenterMark,
                    sceneBgColor,
                    hasScene,
                    exportAvailable,
                    recentFiles,
                  })}
                  onPick={handlePick}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Run a standard menu role through the main process.
 *
 * The clipboard roles used to be handled here with `document.execCommand`,
 * but Cut / Copy / Paste and Select All are all channel-backed menu items
 * now (they resolve by focus -- see utils/editClipboard.ts), so nothing
 * reaches this function with an edit role any more.
 */
function handleRole(role: AppMenuRole): void {
  window.electronAPI?.invoke(IPC.MENU_INVOKE_ROLE, role)
}
