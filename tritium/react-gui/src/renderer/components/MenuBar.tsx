import React, { useCallback, useEffect, useRef, useState } from 'react'
import { APP_MENU, getRoleLabel } from '../../shared/menuTemplate'
import type { AppMenuItem, AppMenuRole } from '../../shared/menuTemplate'
import { useMenuDispatch } from '../hooks/useMenuDispatch'

interface MenuBarProps {
  activeTab: string | null
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
}

const DropdownItem: React.FC<DropdownItemProps> = ({ item, onAction }) => {
  const [submenuOpen, setSubmenuOpen] = useState(false)
  const itemRef = useRef<HTMLDivElement>(null)

  if (item.type === 'separator') {
    return <div className="menubar__dropdown-separator" role="separator" />
  }

  const label = getItemLabel(item)
  const accel = item.accelerator ? toDisplayAccel(item.accelerator) : undefined
  const hasSubmenu = !!item.submenu?.length

  if (hasSubmenu) {
    return (
      <div
        ref={itemRef}
        className="menubar__dropdown-item menubar__dropdown-item--has-submenu"
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
              <DropdownItem key={sub.id ?? idx} item={sub} onAction={onAction} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="menubar__dropdown-item"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation()
        onAction(item)
      }}
    >
      <span>{label}</span>
      {accel && (
        <span className="menubar__dropdown-accelerator">{accel}</span>
      )}
    </div>
  )
}

export const MenuBar: React.FC<MenuBarProps> = ({ activeTab }) => {
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
    window.electronAPI?.invokeMenuRole(role)
  }
}
