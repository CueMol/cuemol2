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
 * channels and they land here. How the keystroke arrives differs per OS (the
 * native menu on macOS, the renderer keybinding dispatcher on Windows /
 * Linux -- see `shell/keybindings`); both enter through `dispatchMenuChannel`,
 * so this router never needs to know.
 *
 * Resolution order for a clipboard action:
 *   1. text context -> the native edit, run by main against the focused
 *      element (`IPC.TEXT_CTX_ACTION`) -- unless the field sits inside a scope
 *      that declares `claimsEditable` for this action and holds no selected
 *      text, which routes to that scope instead (see below);
 *   2. the `[data-clipboard-scope]` ancestor of the focused element;
 *   3. the last such scope the user interacted with;
 *   4. nothing to route to -> fall back to the native edit, which is a no-op
 *      outside a field.
 *
 * The exception in step 1 exists for a panel whose rows ARE text fields. The
 * paint deck's row is a selection input plus a colour input, edge to edge, so
 * a click always parks focus in one of them -- and the plain rule made Cmd+C
 * and Cmd+V there mean "this field", never "the selected rows". Requiring a
 * bare caret keeps the field's own copy/paste working whenever the user has
 * actually selected text in it.
 *
 * Step 3 is not a nicety. On Windows / Linux the Edit menu is a React
 * component, so clicking Copy moves DOM focus into the menu and step 2 would
 * find nothing. Tracking the last scope keeps the menu and the keyboard
 * doing the same thing.
 *
 * Register a panel with `useClipboardScope` and tag its container with the
 * matching `data-clipboard-scope` attribute.
 *
 * While a modal dialog is open the routing collapses to step 1: a modal owns
 * the keystroke, so Cmd+X/C/V must edit the text field the user is in and
 * must never reach a panel behind the dialog (the last-scope memory of step 3
 * would otherwise let a stray Cmd+V paste into the scene tree). Undo / Redo
 * collapse the same way -- inside a modal they are the field's undo, never
 * the scene's. `ModalOpenCounterProvider` drives this via
 * `setClipboardModalOpen`.
 */

import { IPC } from '@shared/ipcChannels'
import type { TextEditAction } from '@shared/types/textCtxMenu'

/** What a registered panel can do with the clipboard. */
export interface ClipboardScopeHandlers {
  cut: () => void
  copy: () => void
  paste: () => void
  /**
   * Whether this scope should answer `action` even though the focused element
   * is an editable inside it.
   *
   * The default is no -- step 1 of the routing gives a text field its native
   * edit, which is right almost everywhere. It is wrong for a panel whose rows
   * ARE text fields: the paint deck's row is a selection input plus a colour
   * input edge to edge, so after any click focus is in one of them and Cmd+C /
   * Cmd+V could never mean "the selected rows".
   *
   * Only consulted when the editable holds no text selection. Selected text is
   * an unambiguous request to act on that text, so it always keeps the native
   * edit and a scope never sees it.
   */
  claimsEditable?: (action: ClipboardAction) => boolean
}

export type ClipboardAction = 'cut' | 'copy' | 'paste'

const scopes = new Map<string, ClipboardScopeHandlers>()

/** Id of the scope the user last interacted with; see the file header. */
let lastScopeId: string | null = null

/** Whether a modal dialog is open; see the file header. */
let modalOpen = false

/**
 * Tell the router whether a modal dialog is up. Called from
 * `ModalOpenCounterProvider` on the 0 <-> 1 edges.
 *
 * @param open - true while at least one modal is open.
 */
export function setClipboardModalOpen(open: boolean): void {
  modalOpen = open
}

/**
 * Whether a modal dialog is up, for the one other reader of that fact: the
 * Windows / Linux keybinding dispatcher, which mirrors main's menu block by
 * letting only the text-edit shortcuts through while a modal is open.
 */
export function isEditModalOpen(): boolean {
  return modalOpen
}

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

/** Test seam: forget every registration, the last-scope memory and the modal flag. */
export function _resetClipboardScopesForTest(): void {
  scopes.clear()
  lastScopeId = null
  modalOpen = false
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

/**
 * Whether the focused editable holds selected text (as opposed to a bare
 * caret).
 *
 * `<input>` and `<textarea>` are asked for their own selection range:
 * Chromium's `window.getSelection()` does not report a selection inside a
 * text control, so the document-level check above would call every input a
 * caret. contentEditable has no range of its own and does show up there.
 */
function editableHasSelection(el: HTMLElement | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    const f = el as HTMLInputElement | HTMLTextAreaElement
    try {
      return f.selectionStart !== null && f.selectionStart !== f.selectionEnd
    } catch {
      // selectionStart throws on input types that do not support it
      // (color, checkbox...); those carry no text to act on.
      return false
    }
  }
  return hasTextSelection()
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
  // A modal owns the keystroke: never let a panel behind the dialog answer.
  // Checked before the editable branch so a scope's `claimsEditable` cannot
  // reach past an open dialog either.
  if (modalOpen) {
    runNativeEdit(action)
    return
  }
  if (isEditableFocused()) {
    const active = document.activeElement as HTMLElement | null
    // A panel whose rows are themselves text fields can claim the keystroke,
    // but only for a bare caret -- selected text always means the text.
    const owner = scopes.get(scopeIdOf(active) ?? '')
    if (
      owner?.claimsEditable?.(action) &&
      !editableHasSelection(active)
    ) {
      owner[action]()
      return
    }
    runNativeEdit(action)
    return
  }
  if (action === 'copy' && hasTextSelection()) {
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
 *   field, or a modal is open), false when the caller should run the
 *   scene-level undo instead.
 */
export function dispatchEditUndoRedo(action: 'undo' | 'redo'): boolean {
  // Inside a modal, Cmd+Z is the field's undo -- rewinding the scene behind a
  // dialog the user is still filling in would be a surprise they cannot see.
  if (!isEditableFocused() && !modalOpen) return false
  runNativeEdit(action)
  return true
}
