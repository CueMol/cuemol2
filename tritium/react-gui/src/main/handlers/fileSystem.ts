/**
 * @file main/handlers/fileSystem.ts
 * @description File existence, backup-rename, and the shell handoffs
 * (open a path in the OS, reveal it in the file manager).
 *
 * Every one of these answers rather than throws: a renderer asking whether a
 * file exists wants false, not a rejected promise, and a backup that cannot be
 * made is reported as `{ ok: false }` so the caller can decide.
 */

import { shell } from 'electron';
import fs from 'fs';
import { IPC } from '@shared/ipcChannels';
import { handleInvoke } from '../ipc/handleInvoke';
import { takeShellOpen } from '../shellOpenQueue';


function handleFileExists(target: string): { exists: boolean } {
  try {
    return { exists: fs.existsSync(target) }
  } catch {
    return { exists: false }
  }
}

function handleBackupRename(target: string): { ok: boolean; backed: boolean; error?: string } {
  try {
    if (!fs.existsSync(target)) return { ok: true, backed: false }
    const backup = `${target}.bak`
    if (fs.existsSync(backup)) {
      try { fs.unlinkSync(backup) } catch { /* ignore */ }
    }
    fs.renameSync(target, backup)
    return { ok: true, backed: true }
  } catch (e) {
    return { ok: false, backed: false, error: (e as Error).message }
  }
}

/** Register the file-system and shell channels. */
export function registerFileSystemHandlers(): void {
  handleInvoke(IPC.FILE_EXISTS, (_event, payload) => handleFileExists(payload.path))

  // Hand over the files the OS asked us to open. Read-and-clear is atomic on
  // main's single thread, so a request arriving while this invoke is in flight
  // is kept for the next batch (main pings SHELL_FILES_PENDING again).
  handleInvoke(IPC.SHELL_FILES_TAKE, () => takeShellOpen())

  // Open a produced file (e.g. a rendered movie) in the OS default app.
  handleInvoke(IPC.SHELL_OPEN_PATH, async (_event, { path: p }) => {
    const error = await shell.openPath(p)
    return { ok: error === '', ...(error ? { error } : {}) }
  })

  // Reveal a produced file in Finder / Explorer.
  handleInvoke(IPC.SHELL_REVEAL_PATH, (_event, { path: p }) => {
    shell.showItemInFolder(p)
    return { ok: true }
  })

  handleInvoke(IPC.FILE_BACKUP_RENAME, (_event, payload) => handleBackupRename(payload.path))
}
