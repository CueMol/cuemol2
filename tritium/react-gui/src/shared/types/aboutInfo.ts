/**
 * @file shared/types/aboutInfo.ts
 * @description Runtime versions the About dialog lists, resolved by main.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 */

export interface AboutRuntimeInfo {
  electron: string
  chromium: string
  node: string
  v8: string
  /** `<os.type()> <os.arch()> <os.release()>`, e.g. `Darwin arm64 25.5.0`. */
  os: string
}
