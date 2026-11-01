/**
 * @file main/handlers/aboutInfo.ts
 * @description The runtime versions shown (and copied) by the About dialog.
 *
 * Answered by main because the sandboxed renderer has no `process.versions`
 * of Electron's own or `os` module.
 */

import os from 'os';
import { IPC } from '@shared/ipcChannels';
import type { AboutRuntimeInfo } from '@shared/types/aboutInfo';
import { handleInvoke } from '../ipc/handleInvoke';

export function getAboutRuntimeInfo(): AboutRuntimeInfo {
  return {
    electron: process.versions.electron ?? '',
    chromium: process.versions.chrome ?? '',
    node: process.versions.node,
    v8: process.versions.v8,
    os: `${os.type()} ${os.arch()} ${os.release()}`,
  }
}

/** Register the about-info channel. */
export function registerAboutInfoHandlers(): void {
  handleInvoke(IPC.APP_ABOUT_INFO, async () => getAboutRuntimeInfo())
}
