/**
 * @file shared/menuNodes.ts
 * @description Platform-neutral menu tree shared by every menu surface.
 *
 * A `MenuNode<T>` carries its action as a plain value (`action?: T`) instead
 * of an Electron `click` closure, so the same template builders can feed both
 * presentation paths:
 *   - Windows / Linux: rendered in the renderer by `MenuPanel` (React), which
 *     resolves the picked node's `action` back to the caller.
 *   - macOS: converted in the main process to a native Electron menu by
 *     `main/menuNodeAdapter.ts` (`toElectronTemplate`), which wraps each
 *     `action` value in a `click` closure.
 */

/** Non-separator menu row. Leaf rows carry `action`; parents carry `submenu`. */
export interface MenuActionNode<T> {
  type?: 'normal' | 'checkbox' | 'radio'
  label: string
  /** Defaults to true when omitted. */
  enabled?: boolean
  checked?: boolean
  /** Accelerator in Electron format; display conversion happens at render. */
  accelerator?: string
  submenu?: MenuNode<T>[]
  /** Action payload resolved when the item is picked (leaf items only). */
  action?: T
}

export interface MenuSeparatorNode {
  type: 'separator'
}

export type MenuNode<T> = MenuSeparatorNode | MenuActionNode<T>

/** Narrow a node to the separator variant. */
export function isSeparatorNode<T>(node: MenuNode<T>): node is MenuSeparatorNode {
  return node.type === 'separator'
}
