/**
 * @file features/selection/selection/selectionPaneStore.ts
 * @description Module-level snapshot that lets the Selection pane's UI state
 * survive unmount/remount when the user switches side-panel activity groups.
 *
 * SidePanel mounts one activity group at a time, so `SelectionPane` is
 * unmounted when the user visits another group and its `useState` would reset
 * on return. To keep cross-pane workflows usable, the pane writes a snapshot
 * here on every change and re-seeds from it on mount.
 *
 * The snapshot is keyed by `sceneId`: on mount the pane only re-seeds when the
 * saved `sceneId` matches the active one, so a scene switch starts fresh (per
 * spec, a scene change is allowed to reset). A target-molecule change resets
 * the operand draft (autocomplete values differ) -- handled by the pane.
 *
 * Single-consumer (one pane instance), so no subscription is needed; the pane
 * seeds from `loadSnapshot()` and writes with `saveSnapshot()`. Tests reset
 * with `clearSnapshot()`.
 *
 * @module selectionPaneStore
 */

import type { BuilderState } from '@renderer/h3-kit/selection';

export interface SelectionPaneSnapshot {
    /** Scene the snapshot belongs to; re-seed only when it matches. */
    sceneId: number | undefined;
    /** Chosen target molecule. */
    selectedMolId: number | undefined;
    /** Operand draft (source / keyword / fields / picked / distance). */
    draft: BuilderState;
    /** Pending (possibly unapplied) text in the Selection field. */
    textDraft: string;
    /** Last `mol.sel` value synced into `textDraft` (to avoid clobbering edits). */
    syncedSel: string;
}

let snapshot: SelectionPaneSnapshot | null = null;

/** Read the persisted snapshot, or null if none saved. */
export function loadSnapshot(): SelectionPaneSnapshot | null {
    return snapshot;
}

/** Persist the current pane state. */
export function saveSnapshot(next: SelectionPaneSnapshot): void {
    snapshot = next;
}

/** Drop the persisted snapshot (used by tests for isolation). */
export function clearSnapshot(): void {
    snapshot = null;
}
