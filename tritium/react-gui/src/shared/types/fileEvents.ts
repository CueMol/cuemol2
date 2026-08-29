/**
 * @file shared/types/fileEvents.ts
 * @description File open / error / shell-open payloads pushed from main.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 */

export interface FileOpenedData {
  name: string
  path: string
  /**
   * Whether the worker should pick the object reader purely from file
   * content. Inferred in the main process by inspecting the file
   * dialog's filter list against the selected path:
   *   - exactly one specific filter matches the extension -> false
   *     (the user picked that filter; extension is authoritative)
   *   - multiple specific filters match, only catch-all filters
   *     match, or no match at all -> true (let the C++ side sniff).
   * Always false for scene files (.qsc).
   */
  contentFirst: boolean
  /**
   * Explicit obj reader nickname to use, bypassing content/extension sniff.
   * Set when reopening from the MRU (the reader the file was first opened
   * with). Undefined for a fresh File > Open (reader resolved by sniff).
   */
  readerName?: string
}

export interface FileErrorData {
  path: string
  error: string
}

/**
 * A batch of files the OS asked the app to open: command-line arguments, a
 * macOS 'open-file' Apple Event (Finder double-click, Open With, Dock drop,
 * Dock recent document), or a second launch handed over by 'second-instance'.
 */
export interface ShellOpenRequest {
  /** Absolute, de-duplicated paths of files that exist, in the OS's order. */
  paths: string[]
  /** Absolute paths that were named but are not existing files. */
  missing: string[]
}
