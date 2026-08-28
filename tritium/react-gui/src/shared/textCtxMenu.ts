/**
 * @file shared/textCtxMenu.ts
 * @description Template for the generic text clipboard context menu
 * (editable fields and selectable text such as the log panel), as
 * platform-neutral `MenuNode`s. Used by the React `MenuPanel` path on
 * Windows / Linux; macOS keeps the native role-based popup built in
 * `main/textContextMenu.ts`. The branch gating mirrors that builder:
 *
 * - Editable field: Cut / Copy / Paste (enabled per the edit flags) +
 *   Select All.
 * - Non-editable but with selected text: Copy + Select All only.
 * - Non-editable with no selection: empty array (no menu) -- the gate that
 *   keeps this from colliding with the scene-tree / navi context menus.
 */
import type { MenuNode } from './menuNodes'
import type { TextCtxAction, TextCtxShowPayload } from './types/textCtxMenu'

type Node = MenuNode<TextCtxAction>

/** Build the clipboard context-menu nodes; empty when nothing applies. */
export function buildTextCtxMenuNodes(params: Omit<TextCtxShowPayload, 'x' | 'y'>): Node[] {
  const { isEditable, selectionText, editFlags } = params
  const hasSelection = selectionText.trim().length > 0

  if (!isEditable && !hasSelection) return []

  const nodes: Node[] = []
  if (isEditable) {
    nodes.push({ label: 'Cut', enabled: editFlags.canCut, action: 'cut' })
  }
  nodes.push({ label: 'Copy', enabled: editFlags.canCopy, action: 'copy' })
  if (isEditable) {
    nodes.push({ label: 'Paste', enabled: editFlags.canPaste, action: 'paste' })
  }
  nodes.push({ type: 'separator' })
  nodes.push({ label: 'Select All', action: 'selectAll' })
  return nodes
}
