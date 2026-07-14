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

/**
 * Drop leading / trailing separators and collapse runs of consecutive ones
 * to a single separator. Templates place separators around optional groups
 * (e.g. a paste item that is absent when the clipboard is empty); without
 * this a dropped group leaves two adjacent separators that render as a
 * double rule. Applied per level by both render paths, so callers do not
 * need to recurse.
 */
export function collapseSeparators<T>(nodes: ReadonlyArray<MenuNode<T>>): MenuNode<T>[] {
  const out: MenuNode<T>[] = []
  for (const node of nodes) {
    if (isSeparatorNode(node)) {
      if (out.length === 0 || isSeparatorNode(out[out.length - 1])) continue
    }
    out.push(node)
  }
  while (out.length > 0 && isSeparatorNode(out[out.length - 1])) out.pop()
  return out
}
