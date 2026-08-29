/**
 * @file shared/types/textCtxMenu.ts
 * @description Text-editing context menu actions and payloads.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 */

/** Edit-role picked from the text clipboard context menu. */
export type TextCtxAction = 'cut' | 'copy' | 'paste' | 'selectAll'

/**
 * A native text-editing action run against the focused element by the main
 * process (`webContents.cut()` and friends).
 *
 * Superset of the context menu's roles: the Edit-menu shortcuts route here
 * when focus is in a text field, and that includes undo / redo, which the
 * context menu never offers.
 */
export type TextEditAction = 'cut' | 'copy' | 'paste' | 'undo' | 'redo' | 'selectAll'

/** Subset of Electron's `ContextMenuParams.editFlags` the menu consumes. */
export interface TextCtxEditFlags {
  canCut: boolean
  canCopy: boolean
  canPaste: boolean
  canSelectAll: boolean
}

/**
 * Push payload for the Windows/Linux React text context menu: the
 * right-click position plus the `webContents 'context-menu'` params the
 * template builder needs.
 */
export interface TextCtxShowPayload {
  x: number
  y: number
  isEditable: boolean
  selectionText: string
  editFlags: TextCtxEditFlags
}
