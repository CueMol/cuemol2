/**
 * @file data/openFileTarget.ts
 * @description The "where does an opened file go" choice, and its Settings
 * labels.
 *
 * Two preferences use this value, one per entry point that can carry an
 * expectation of its own: files dropped onto the window, and files handed over
 * by the OS shell (Finder / Explorer, a command-line argument, a second
 * launch). The in-app File > Open and Open Recent paths always use the active
 * scene and have no preference -- the user picked the menu item while looking
 * at the scene, so there is nothing to be surprised by.
 *
 * Applies to object files only. A scene file (.qsc) ignores it and keeps its
 * own rule (load in place only into an untouched scene, else a tab of its
 * own), because loading a .qsc into a scene replaces that scene's contents.
 */

import type { OpenFileTarget } from '@shared/types/fileEvents'

export type { OpenFileTarget }

/** What both preferences start at: the behaviour tritium has always had. */
export const DEFAULT_OPEN_FILE_TARGET: OpenFileTarget = 'active'

/** Human-facing labels for the two options. */
export const OPEN_FILE_TARGET_LABELS: Record<OpenFileTarget, string> = {
  active: 'Current scene',
  new: 'New scene',
}

/** Select options, in preference order (the default first). */
export const OPEN_FILE_TARGET_OPTIONS: string[] = [
  OPEN_FILE_TARGET_LABELS.active,
  OPEN_FILE_TARGET_LABELS.new,
]

/** Reverse-map a select label back to a target (default: active). */
export function openFileTargetFromLabel(label: string): OpenFileTarget {
  return label === OPEN_FILE_TARGET_LABELS.new ? 'new' : 'active'
}

/** Normalize an unknown persisted value to a valid target (default: active). */
export function normalizeOpenFileTarget(value: unknown): OpenFileTarget {
  return value === 'new' ? 'new' : 'active'
}
