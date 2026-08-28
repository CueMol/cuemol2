/**
 * @file shared/types/fileDialog.ts
 * @description Native file-dialog request shape.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 */

export interface ElectronFileFilter {
  name: string
  extensions: string[]
}

export interface FileDialogOptions {
  dialogType: 'open-obj' | 'open-scene'
  filters: ElectronFileFilter[]
}
