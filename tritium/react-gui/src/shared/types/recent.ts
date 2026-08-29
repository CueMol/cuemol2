/**
 * @file shared/types/recent.ts
 * @description Recent-files (MRU) entries.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 */

/**
 * Whether a MRU entry should be re-opened as a coordinate / object file
 * (mol/pdb/cif/...) or as a scene file (.qsc). The distinction drives
 * which CmdId is dispatched on click. UXP `mru-files.js` stores the
 * concrete reader_name (`pdb`, `mol2`, `qsc_xml`, ...); the tritium load
 * paths auto-detect the reader from the file extension, so a coarse
 * obj/scene flag is sufficient here.
 */
export type RecentFileType = 'obj' | 'scene'

export interface RecentFileEntry {
  path: string
  ftype: RecentFileType
  /**
   * Obj reader nickname this file was opened with (e.g. 'pdb', 'mmcif').
   * Persisted so reopening from the MRU reuses the same reader instead of
   * re-sniffing (UXP `mru-files` `ftype` parity). Undefined for scene files
   * and for legacy entries saved before this field existed.
   */
  readerName?: string
}
