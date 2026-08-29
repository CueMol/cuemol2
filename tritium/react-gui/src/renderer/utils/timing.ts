/**
 * @file renderer/utils/timing.ts
 * @description The two debounce windows the renderer uses, named once.
 */

/**
 * Coalescing window for CueMol event bursts. One high-level operation (a
 * PDB load, a paste, an undo) fires many SEM_* events back to back; a
 * refetch per event would jitter the UI, so listeners wait this long and
 * refetch once.
 */
export const EVENT_BURST_DEBOUNCE_MS = 30

/**
 * Quiet period before a UI-state change (splitter sizes, panel toggles,
 * preferences) is written through to the main process store.
 */
export const PERSIST_DEBOUNCE_MS = 400
