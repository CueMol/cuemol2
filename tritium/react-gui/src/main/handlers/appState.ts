/**
 * @file main/handlers/appState.ts
 * @description The persisted window layout and UI preferences.
 *
 * Both are read once at startup and written back on change. The store is the
 * authority on shape; these only route.
 */

import { nativeTheme } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { handleInvoke } from '../ipc/handleInvoke';
import { loadLayout, saveLayout, loadUi, saveUi } from '../stateStore';

/** Register the layout / UI-preference channels. */
export function registerAppStateHandlers(): void {
  handleInvoke(IPC.LAYOUT_LOAD, async () => loadLayout() ?? null)

  handleInvoke(IPC.LAYOUT_SAVE, async (_event, layout) => {
    saveLayout(layout)
  })

  handleInvoke(IPC.UI_LOAD, () => loadUi())
  handleInvoke(IPC.UI_SAVE, (_e, state) => {
    saveUi(state)
    // Keep the native window chrome (macOS titlebar hairline, overlay
    // controls) aligned with the UI theme.
    if (state.theme) nativeTheme.themeSource = state.theme
  })
}
