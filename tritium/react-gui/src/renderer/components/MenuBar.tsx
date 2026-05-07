import React, { useCallback, useEffect, useRef, useState } from 'react'
import { APP_MENU, getRoleLabel } from '../../shared/menuTemplate'
import type { AppMenuItem, AppMenuRole } from '../../shared/menuTemplate'
import type { SceneBgColor, ViewCenterMark } from '../../shared/ipcTypes'
import { IPC } from '../../shared/ipcChannels'
import { useMenuDispatch } from '../hooks/useMenuDispatch'

interface MenuBarProps {
  activeTab: string | null
  viewProjection?: boolean | null
  viewCenterMark?: ViewCenterMark | null
  sceneBgColor?: SceneBgColor | null
}

/** Convert an Electron accelerator string to a display string for Windows/Linux. */
function toDisplayAccel(acc: string): string {
  return acc.replace('CmdOrCtrl', 'Ctrl').replace('CommandOrControl', 'Ctrl')
}

const EXEC_COMMAND_ROLES = new Set<AppMenuRole>(['cut', 'copy', 'paste', 'selectAll'])

function getItemLabel(item: AppMenuItem): string {
  if (item.label) return item.label
  if (item.role) return getRoleLabel(item.role)
  return ''
}

interface DropdownItemProps {
  item: AppMenuItem
  onAction: (item: AppMenuItem) => void
  viewProjection?: boolean | null
  viewCenterMark?: ViewCenterMark | null
  sceneBgColor?: SceneBgColor | null
}

const getViewProjectionState = (
  item: AppMenuItem,
  viewProjection: boolean | null | undefined,
): { enabled: boolean; checked: boolean } | null => {
  if (item.id === 'view-perspective') {
    return { enabled: viewProjection !== null && viewProjection !== undefined, checked: viewProjection === true }
  }
  if (item.id === 'view-orthographic') {
    return { enabled: viewProjection !== null && viewProjection !== undefined, checked: viewProjection === false }
  }
  return null
}

const getViewCenterMarkState = (
  item: AppMenuItem,
  viewCenterMark: ViewCenterMark | null | undefined,
): { enabled: boolean; checked: boolean } | null => {
  const itemValues: Record<string, ViewCenterMark> = {
    'center-mark-none': 'none',
    'center-mark-cross': 'crosshair',
    'center-mark-axis': 'axis',
  }
  if (!item.id || !(item.id in itemValues)) return null
  return {
    enabled: viewCenterMark !== null && viewCenterMark !== undefined,
    checked: viewCenterMark === itemValues[item.id],
  }
}

const getSceneBgColorState = (
  item: AppMenuItem,
  sceneBgColor: SceneBgColor | null | undefined,
): { enabled: boolean; checked: boolean } | null => {
  const itemValues: Record<string, SceneBgColor> = {
    'bg-white': 'white',
    'bg-black': 'black',
  }
  if (!item.id || !(item.id in itemValues)) return null
  return {
    enabled: sceneBgColor !== null && sceneBgColor !== undefined,
    checked: sceneBgColor === itemValues[item.id],
  }
}

const DropdownItem: React.FC<DropdownItemProps> = ({ item, onAction, viewProjection, viewCenterMark, sceneBgColor }) => {
  const [submenuOpen, setSubmenuOpen] = useState(false)
  const itemRef = useRef<HTMLDivElement>(null)

  if (item.type === 'separator') {
    return <div className="menubar__dropdown-separator" role="separator" />
  }

  const label = getItemLabel(item)
  const accel = item.accelerator ? toDisplayAccel(item.accelerator) : undefined
  const hasSubmenu = !!item.submenu?.length
  const projectionState = getViewProjectionState(item, viewProjection)
  const centerMarkState = getViewCenterMarkState(item, viewCenterMark)
  const bgColorState = getSceneBgColorState(item, sceneBgColor)
  const enabled = projectionState?.enabled ?? centerMarkState?.enabled ?? bgColorState?.enabled ?? item.enabled ?? true
  const checked = projectionState?.checked ?? centerMarkState?.checked ?? bgColorState?.checked ?? item.checked ?? false
  const isCheckable = item.type === 'checkbox' || item.type === 'radio'
  const className = `menubar__dropdown-item${enabled ? '' : ' menubar__dropdown-item--disabled'}`

  if (hasSubmenu) {
    return (
      <div
        ref={itemRef}
        className={`${className} menubar__dropdown-item--has-submenu`}
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={submenuOpen}
        onMouseEnter={() => setSubmenuOpen(true)}
        onMouseLeave={() => setSubmenuOpen(false)}
      >
        <span>{label}</span>
        <span className="menubar__dropdown-arrow">{'▶'}</span>
        {submenuOpen && (
          <div className="menubar__submenu" role="menu">
            {item.submenu!.map((sub, idx) => (
              <DropdownItem
                key={sub.id ?? idx}
                item={sub}
                onAction={onAction}
                viewProjection={viewProjection}
                viewCenterMark={viewCenterMark}
                sceneBgColor={sceneBgColor}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={className}
      role={item.type === 'radio' ? 'menuitemradio' : isCheckable ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={isCheckable ? checked : undefined}
      aria-disabled={!enabled}
      onClick={(e) => {
        e.stopPropagation()
        if (!enabled) return
        onAction(item)
      }}
    >
      {isCheckable && (
        <span className="menubar__dropdown-check">{checked ? '\u2713' : ''}</span>
      )}
      <span>{label}</span>
      {accel && (
        <span className="menubar__dropdown-accelerator">{accel}</span>
      )}
    </div>
  )
}

export const MenuBar: React.FC<MenuBarProps> = ({ activeTab, viewProjection = null, viewCenterMark = null, sceneBgColor = null }) => {
  const { dispatchMenuChannel } = useMenuDispatch(activeTab)
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

  const handleItemAction = useCallback(
    (item: AppMenuItem) => {
      close()
      if (item.ipcChannel) {
        dispatchMenuChannel(item.ipcChannel)
      } else if (item.role) {
        handleRole(item.role)
      }
    },
    [close, dispatchMenuChannel],
  )

  // MenuBar is only used on Windows/Linux: exclude darwinOnly groups
  const visibleGroups = APP_MENU.filter((g) => !g.darwinOnly)

  return (
    <div className="menubar" ref={barRef} role="menubar">
      {visibleGroups.map((group) => {
        const groupId = group.label
        const isOpen = openMenu === groupId
        const visibleItems = group.submenu.filter((item) => !item.darwinOnly)

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
              <div
                className="menubar__dropdown"
                role="menu"
                style={{ left: dropdownPos.left }}
              >
                {visibleItems.map((item, idx) => (
                  <DropdownItem
                    key={item.id ?? idx}
                    item={item}
                    onAction={handleItemAction}
                    viewProjection={viewProjection}
                    viewCenterMark={viewCenterMark}
                    sceneBgColor={sceneBgColor}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function handleRole(role: AppMenuRole): void {
  if (EXEC_COMMAND_ROLES.has(role)) {
    // execCommand is deprecated but remains the most reliable way to trigger
    // cut/copy/paste/selectAll on the focused element in a sandboxed renderer.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand(role === 'selectAll' ? 'selectAll' : role)
  } else {
    window.electronAPI?.invoke(IPC.MENU_INVOKE_ROLE, role)
  }
}
