/**
 * @file main/handlers/menuState.ts
 * @description The renderer's mirror of the application menu: which items are
 * enabled or checked, and whether a modal is blocking the whole menu.
 */

import { IPC } from '@shared/ipcChannels';
import { handleInvoke } from '../ipc/handleInvoke';
import { setMenuBlocked, updateMenuState } from '../menu';

/** Register the menu-state channels. */
export function registerMenuStateHandlers(): void {
  handleInvoke(IPC.MENU_UPDATE_STATE, (_e, state) => updateMenuState(state))
  handleInvoke(IPC.MENU_SET_MODAL_BLOCKED, (_e, blocked) =>
    setMenuBlocked('blueprint', blocked),
  )
}
