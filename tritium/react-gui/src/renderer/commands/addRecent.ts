/**
 * Push a freshly-loaded or freshly-saved file path to the main-process
 * MRU list. Failures are non-fatal (a busy disk should not block the
 * actual load/save that just succeeded).
 */

import { IPC } from '../../shared/ipcChannels'
import type { RecentFileType } from '../../shared/ipcTypes'

export function addRecent(
    path: string,
    ftype: RecentFileType,
    readerName?: string,
): void {
    if (!path) return
    window.electronAPI
        ?.invoke(IPC.RECENT_ADD, { path, ftype, readerName })
        .catch((e: unknown) => console.warn('recent add failed:', e))
}
