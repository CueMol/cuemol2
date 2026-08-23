/**
 * @file utils/editClipboard.ts
 * @description Focus-aware routing for the Edit menu's Cut / Copy / Paste
 * (and the text half of Undo / Redo).
 *
 * The same keystroke means different things depending on where the user is:
 * Cmd+C in a text field copies text, in the scene tree copies the selected
 * node, in the paint deck copies the selected row. Electron's clipboard
 * roles cannot express that -- a role runs natively before the renderer sees
 * the key -- so `shared/menuTemplate.ts` declares the items as custom
 * channels and they land here.
 *
 * Resolution order for a clipboard action:
 *   1. text context -> the native edit, run by main against the focused
 *      element (`IPC.TEXT_CTX_ACTION`);
 *   2. the `[data-clipboard-scope]` ancestor of the focused element;
 *   3. the last such scope the user interacted with;
 *   4. nothing to route to -> fall back to the native edit, which is a no-op
 *      outside a field.
 *
 * Step 3 is not a nicety. On Windows / Linux the Edit menu is a React
 * component, so clicking Copy moves DOM focus into the menu and step 2 would
 * find nothing. Tracking the last scope keeps the menu and the keyboard
 * doing the same thing.
 *
 * Register a panel with `useClipboardScope` and tag its container with the
 * matching `data-clipboard-scope` attribute.
 */

import { IPC } from '../../shared/ipcChannels'
import type { TextEditAction } from '../../shared/ipcTypes'

/** What a registered panel can do with the clipboard. */
export interface ClipboardScopeHandlers {
  cut: () => void
  copy: () => void
  paste: () => void
}

export type ClipboardAction = 'cut' | 'copy' | 'paste'

const scopes = new Map<string, ClipboardScopeHandlers>()

/** Id of the scope the user last interacted with; see the file header. */
let lastScopeId: string | null = null

/**
 * Register a panel's clipboard handlers under `id`.
 * @returns an unregister function.
 */
export function registerClipboardScope(
  id: string,
  handlers: ClipboardScopeHandlers,
): () => void {
  scopes.set(id, handlers)
  return () => {
    scopes.delete(id)
    if (lastScopeId === id) lastScopeId = null
  }
}

/** Test seam: forget every registration and the last-scope memory. */
export function _resetClipboardScopesForTest(): void {
  scopes.clear()
  lastScopeId = null
}

/** Test seam: the handlers registered under `id`, if any. */
export function getClipboardScopeForTest(
  id: string,
): ClipboardScopeHandlers | null {
  return scopes.get(id) ?? null
}

/** The `data-clipboard-scope` id an element sits inside, if any. */
function scopeIdOf(el: Element | null): string | null {
  const host = el?.closest<HTMLElement>('[data-clipboard-scope]')
  return host?.dataset.clipboardScope ?? null
}

/**
 * Remember which scope the user is working in.
 *
 * Pointer-down rather than focus, because a scene-tree row is a `<div>`: the
 * click lands on something unfocusable and focus bubbles to the pane
 * wrapper. Interacting outside every scope clears the memory, so a stale
 * scope cannot answer for a panel the user has left -- except when the click
 * is on a menu, which is exactly when we need the memory to survive.
 */
function onPointerDown(e: Event): void {
  const target = e.target as HTMLElement | null
  const id = scopeIdOf(target)
  if (id) {
    lastScopeId = id
    return
  }
  if (target?.closest('[data-keep-clipboard-scope]')) return
  lastScopeId = null
}

/**
 * Start tracking the active clipboard scope. Call once at app startup.
 * @returns a cleanup function.
 */
export function installClipboardScopeTracking(): () => void {
  document.addEventListener('pointerdown', onPointerDown, true)
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true)
    lastScopeId = null
  }
}

/** Whether the focused element edits text (so the native edit should win). */
export function isEditableFocused(): boolean {
  const ae = document.activeElement as HTMLElement | null
  if (!ae) return false
  const tag = ae.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  // Coerced: `isContentEditable` is undefined on elements that do not
  // implement it, and callers branch on a strict boolean.
  return ae.isContentEditable === true
}

/** Whether the document carries a non-empty text selection. */
function hasTextSelection(): boolean {
  const sel = window.getSelection()
  return !!sel && !sel.isCollapsed && sel.toString().length > 0
}

/** Ask main to run a native edit against the focused element. */
function runNativeEdit(action: TextEditAction): void {
  window.electronAPI
    ?.invoke(IPC.TEXT_CTX_ACTION, action)
    .catch((err: unknown) => console.warn(`native ${action} failed:`, err))
}

/** The scope that should answer, or null when none applies. */
function resolveScope(): ClipboardScopeHandlers | null {
  const focused = scopeIdOf(document.activeElement)
  const id = focused ?? lastScopeId
  if (!id) return null
  return scopes.get(id) ?? null
}

/**
 * Route one clipboard action (see the file header for the order).
 *
 * Copy additionally defers to a plain text selection -- selecting log output
 * and pressing Cmd+C must copy that text even though the log panel is inside
 * no clipboard scope. Cut and Paste have no such case: they need an editable
 * target, and a selection alone is not one.
 */
export function dispatchEditClipboard(action: ClipboardAction): void {
  if (isEditableFocused() || (action === 'copy' && hasTextSelection())) {
    runNativeEdit(action)
    return
  }
  const scope = resolveScope()
  const handler = scope?.[action]
  if (handler) {
    handler()
    return
  }
  // No panel claims it: let the native edit try. Outside a field this does
  // nothing, which is the right outcome for a stray shortcut.
  runNativeEdit(action)
}

/**
 * Route Undo / Redo.
 *
 * @returns true when the action was handled natively (focus is in a text
 *   field), false when the caller should run the scene-level undo instead.
 */
export function dispatchEditUndoRedo(action: 'undo' | 'redo'): boolean {
  if (!isEditableFocused()) return false
  runNativeEdit(action)
  return true
}
