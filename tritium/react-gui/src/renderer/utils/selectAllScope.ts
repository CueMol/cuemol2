/**
 * @file utils/selectAllScope.ts
 * @description Scoped "Select All" for the renderer.
 *
 * Electron's native `selectAll` role calls `webContents.selectAll()`, which
 * selects the entire document -- every GUI text node -- whenever focus is not
 * inside an editable field. That is useless for an app full of labels and
 * panels. Instead, all Select All triggers (Edit menu, Cmd+A accelerator, and
 * the text context menu) route here.
 *
 * `selectAllInScope` targets, in priority order:
 *   1. the focused `<input>` / `<textarea>` (selects that field's text),
 *   2. a focused `contentEditable` element,
 *   3. the active "selectable region" -- the nearest `[data-select-scope]`
 *      ancestor of the last pointer-down target (e.g. the log panel `<pre>`),
 *   4. nothing -- so a stray Select All never selects the whole GUI.
 *
 * Mark a scrollable text viewer as selectable by adding `data-select-scope`
 * to its scrolling/content element.
 */

let activeScope: HTMLElement | null = null

/** Record the nearest `[data-select-scope]` ancestor of the pointer target. */
function onPointerDown(e: Event): void {
  const target = e.target as HTMLElement | null
  activeScope = target?.closest<HTMLElement>('[data-select-scope]') ?? null
}

/**
 * Start tracking the active selectable region. Call once at app startup.
 * @returns a cleanup function that removes the listener and clears state.
 */
export function installSelectAllScope(): () => void {
  document.addEventListener('pointerdown', onPointerDown, true)
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true)
    activeScope = null
  }
}

/** Select the full text content of an element via the Selection API. */
function selectElementContents(el: HTMLElement): void {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  range.selectNodeContents(el)
  sel.removeAllRanges()
  sel.addRange(range)
}

/**
 * Perform a scoped Select All (see file header for the priority order).
 * No-op when nothing editable is focused and no selectable region is active.
 */
export function selectAllInScope(): void {
  const ae = document.activeElement as HTMLElement | null
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
    // Some input types (e.g. number) throw on select(); ignore those.
    try {
      ;(ae as HTMLInputElement).select()
    } catch {
      /* not selectable -- leave as is */
    }
    return
  }
  if (ae && ae.isContentEditable) {
    selectElementContents(ae)
    return
  }
  if (activeScope && document.body.contains(activeScope)) {
    selectElementContents(activeScope)
  }
}

/** Test-only: reset the tracked region between tests. */
export function _resetSelectAllScopeForTest(): void {
  activeScope = null
}
