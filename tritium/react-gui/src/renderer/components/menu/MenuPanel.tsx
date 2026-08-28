/**
 * @file components/menu/MenuPanel.tsx
 * @description Generic VS Code-style menu panel shared by the Windows/Linux
 * menu bar dropdowns and the React context menus.
 *
 * Renders a `MenuNode<T>` tree: check gutter, label, right-aligned
 * accelerator or submenu chevron, separators, and hover-opened submenu
 * flyouts that flip / shift at the viewport edges. Purely presentational --
 * resolving item state (enabled / checked) happens where the nodes are
 * built; a picked leaf's `action` value is passed to `onPick` verbatim.
 * Styles live in `styles/_menu-kit.css`.
 */
import React, { useLayoutEffect, useRef, useState } from 'react'
import { AppIcon } from '../AppIcon'
import { collapseSeparators, isSeparatorNode } from '@shared/menuNodes'
import type { MenuActionNode, MenuNode } from '@shared/menuNodes'
import { formatAccelerator } from '@shared/menuAccel'

export interface MenuPanelProps<T> {
  nodes: ReadonlyArray<MenuNode<T>>
  /** Called with the picked leaf's action value. */
  onPick: (action: T) => void
  className?: string
}

/** Convert an Electron accelerator string to a display string. This menu is
 *  only mounted on Windows/Linux, so the macOS glyph form never applies. */
function toDisplayAccel(acc: string): string {
  return formatAccelerator(acc, false)
}

/** Margin (px) kept between a shifted flyout and the viewport edge. */
const EDGE_MARGIN = 4

export function MenuPanel<T>({ nodes, onPick, className }: MenuPanelProps<T>): React.ReactElement {
  // Collapse separators per level (a dropped optional group must not leave a
  // double rule); MenuPanel recurses for submenus, so each level is covered.
  const items = collapseSeparators(nodes)
  return (
    <div className={`menu-panel${className ? ` ${className}` : ''}`} role="menu">
      {items.map((node, idx) =>
        isSeparatorNode(node) ? (
          <div key={idx} className="menu-separator" role="separator" />
        ) : node.submenu && node.submenu.length > 0 ? (
          <SubmenuRow key={idx} node={node} onPick={onPick} />
        ) : (
          <LeafRow key={idx} node={node} onPick={onPick} />
        ),
      )}
    </div>
  )
}

function LeafRow<T>({ node, onPick }: { node: MenuActionNode<T>; onPick: (a: T) => void }): React.ReactElement {
  const enabled = node.enabled !== false
  const isCheckable = node.type === 'checkbox' || node.type === 'radio'
  const checked = node.checked === true
  return (
    <div
      className={`menu-item type-row${enabled ? '' : ' menu-item--disabled'}`}
      role={node.type === 'radio' ? 'menuitemradio' : node.type === 'checkbox' ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={isCheckable ? checked : undefined}
      aria-disabled={!enabled}
      onClick={(e) => {
        e.stopPropagation()
        if (!enabled || node.action === undefined) return
        onPick(node.action)
      }}
    >
      {/* Check gutter on every row (not just checkables) so labels align. */}
      <span className="menu-item__check" aria-hidden>
        {isCheckable && checked ? <AppIcon name="ui.check" size="sm" aria-hidden /> : null}
      </span>
      <span className="menu-item__label">{node.label}</span>
      {node.accelerator && <span className="menu-item__accel">{toDisplayAccel(node.accelerator)}</span>}
    </div>
  )
}

function SubmenuRow<T>({ node, onPick }: { node: MenuActionNode<T>; onPick: (a: T) => void }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const enabled = node.enabled !== false
  return (
    <div
      className={`menu-item type-row menu-item--has-submenu${enabled ? '' : ' menu-item--disabled'}${open ? ' menu-item--submenu-open' : ''}`}
      role="menuitem"
      aria-haspopup="true"
      aria-expanded={open}
      aria-disabled={!enabled}
      onMouseEnter={() => { if (enabled) setOpen(true) }}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="menu-item__check" aria-hidden />
      <span className="menu-item__label">{node.label}</span>
      <span className="menu-item__chevron" aria-hidden>
        <AppIcon name="ui.caretRight" size="sm" aria-hidden />
      </span>
      {open && (
        <SubmenuFlyout>
          <MenuPanel nodes={node.submenu!} onPick={onPick} />
        </SubmenuFlyout>
      )}
    </div>
  )
}

/**
 * Positioning wrapper for a submenu panel: opens at the parent row's right
 * edge, flips to the left edge when it would overflow the viewport width,
 * and shifts up when it would overflow the viewport height.
 */
function SubmenuFlyout({ children }: { children: React.ReactNode }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [flipX, setFlipX] = useState(false)
  const [shiftY, setShiftY] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.right > window.innerWidth && rect.left - rect.width >= 0) {
      setFlipX(true)
    }
    const overflowY = rect.bottom - window.innerHeight
    if (overflowY > 0) {
      // Shift up, but never above the viewport top.
      setShiftY(-Math.min(overflowY + EDGE_MARGIN, rect.top))
    }
  }, [])

  return (
    <div
      ref={ref}
      className={`menu-flyout${flipX ? ' menu-flyout--flip-x' : ''}`}
      style={shiftY !== 0 ? { transform: `translateY(${shiftY}px)` } : undefined}
    >
      {children}
    </div>
  )
}
