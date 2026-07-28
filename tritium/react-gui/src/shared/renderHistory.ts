/**
 * @file shared/renderHistory.ts
 * @description Naming and size of the render-history image store.
 *
 * Shared because three sides need to agree on it: the main window archives a
 * finished render's PNG, the main process owns the files, and the render
 * window asks for one back by result id.
 */

/**
 * How many finished renders stay navigable with Back / Forward.
 *
 * The images live on disk (a temp directory owned by the main process), not in
 * the render window's memory, so this is bounded by disk rather than by what a
 * renderer can hold -- hence a depth that covers a real iterate session. The
 * metadata list in the main window is capped to the same number, so a listed
 * entry always has a file behind it.
 */
export const RENDER_HISTORY_LIMIT = 50

/** File name of one archived render, keyed by its result id. */
export function renderHistoryFileName(resultId: string): string {
  // Result ids are generated ids (`render-result-<ms>`), but they reach the
  // main process over IPC, so keep the name to characters that cannot walk out
  // of the history directory.
  return `${resultId.replace(/[^A-Za-z0-9._-]/g, '_')}.png`
}
