/**
 * @file components/menu/ContextMenuProvider.tsx
 * @description React-rendered context menu host for Windows / Linux.
 *
 * `useShowContextMenu()` returns `show(nodes, {x, y})`, which displays a
 * `MenuPanel` at the given viewport position and resolves with the picked
 * node's action value, or `null` on dismiss (click-away / Escape /
 * right-click elsewhere). Visuals are the shared menu kit, so these menus
 * match the menu bar dropdowns exactly. macOS keeps native context menus
 * (`Menu.popup` in the main process) and never calls this.
 *
 * Only one menu can be open at a time: a second `show` while one is open
 * resolves the first with `null` and replaces it.
 */
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MenuPanel } from './MenuPanel'
import type { MenuNode } from '../../../shared/menuNodes'

export type ShowContextMenuFn = <T>(nodes: ReadonlyArray<MenuNode<T>>, pos: { x: number; y: number }) => Promise<T | null>

interface PendingMenu {
  nodes: ReadonlyArray<MenuNode<unknown>>
  x: number
  y: number
  resolve: (action: unknown) => void
}

const ContextMenuContext = createContext<ShowContextMenuFn | null>(null)

/** Access the context menu opener; must be used under `ContextMenuProvider`. */
export function useShowContextMenu(): ShowContextMenuFn {
  const fn = useContext(ContextMenuContext)
  if (!fn) throw new Error('useShowContextMenu must be used within ContextMenuProvider')
  return fn
}

export const ContextMenuProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingMenu | null>(null)

  const show = useCallback(
    <T,>(nodes: ReadonlyArray<MenuNode<T>>, pos: { x: number; y: number }): Promise<T | null> =>
      new Promise<T | null>((resolve) => {
        setPending((prev) => {
          prev?.resolve(null)
          return {
            nodes: nodes as ReadonlyArray<MenuNode<unknown>>,
            x: pos.x,
            y: pos.y,
            resolve: resolve as (action: unknown) => void,
          }
        })
      }),
    [],
  ) as ShowContextMenuFn

  const settle = useCallback((action: unknown) => {
    setPending((prev) => {
      prev?.resolve(action)
      return null
    })
  }, [])

  return (
    <ContextMenuContext.Provider value={show}>
      {children}
      {pending && (
        <ContextMenuHost
          nodes={pending.nodes}
          x={pending.x}
          y={pending.y}
          onPick={(a) => settle(a)}
          onDismiss={() => settle(null)}
        />
      )}
    </ContextMenuContext.Provider>
  )
}

/** Margin (px) kept between the panel and the viewport edge when clamping. */
const EDGE_MARGIN = 4

/**
 * Full-screen capture layer plus the positioned root panel. The panel is
 * clamped into the viewport after the first layout measure (a menu opened
 * near the right / bottom edge slides back inside instead of overflowing).
 */
function ContextMenuHost({
  nodes,
  x,
  y,
  onPick,
  onDismiss,
}: {
  nodes: ReadonlyArray<MenuNode<unknown>>
  x: number
  y: number
  onPick: (action: unknown) => void
  onDismiss: () => void
}): React.ReactElement {
  const posRef = useRef<HTMLDivElement>(null)
  const [adjusted, setAdjusted] = useState<{ left: number; top: number }>({ left: x, top: y })

  useLayoutEffect(() => {
    const el = posRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let left = x
    let top = y
    if (left + rect.width > window.innerWidth) {
      left = Math.max(EDGE_MARGIN, window.innerWidth - rect.width - EDGE_MARGIN)
    }
    if (top + rect.height > window.innerHeight) {
      top = Math.max(EDGE_MARGIN, window.innerHeight - rect.height - EDGE_MARGIN)
    }
    setAdjusted({ left, top })
  }, [x, y])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onDismiss()
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [onDismiss])

  return (
    <div
      className="ctx-menu-overlay"
      onMouseDown={onDismiss}
      onContextMenu={(e) => {
        e.preventDefault()
        onDismiss()
      }}
    >
      <div
        ref={posRef}
        className="ctx-menu-pos"
        style={{ left: adjusted.left, top: adjusted.top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <MenuPanel nodes={nodes} onPick={onPick} />
      </div>
    </div>
  )
}
