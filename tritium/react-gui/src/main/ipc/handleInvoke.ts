/**
 * @file main/ipc/handleInvoke.ts
 * @description The typed `ipcMain.handle` wrapper.
 *
 * It lives on its own because everything that registers a channel needs it,
 * including modules `ipcHandlers` does not know about. Keeping it there made
 * `renderWindowIpc` and `cuemolClipboard` import the registrar just to reach
 * nine lines of type plumbing.
 */

import { ipcMain } from 'electron';
import type {
  InvokeChannel,
  InvokeReq,
  InvokeRes,
} from '@shared/ipcContract';

/**
 * Register a handler for an invoke channel, with the request and response
 * types taken from `InvokeChannels`.
 *
 * Adding a channel is therefore two steps -- a row in the map, a call here --
 * and the compiler walks the renderer side for you.
 */
export function handleInvoke<C extends InvokeChannel>(
  channel: C,
  handler: (
    event: Electron.IpcMainInvokeEvent,
    req: InvokeReq<C>,
  ) => InvokeRes<C> | Promise<InvokeRes<C>>,
): void {
  ipcMain.handle(channel, handler as Parameters<typeof ipcMain.handle>[1]);
}
