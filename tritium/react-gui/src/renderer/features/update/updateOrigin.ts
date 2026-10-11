/**
 * @file features/update/updateOrigin.ts
 * @description Which surface the user is driving the update from.
 *
 * Two independent ways through the same flow (main/updater):
 *   - 'notification': the startup check or the menu's Check for Updates;
 *     results, progress and the confirm dialog come as notifications.
 *   - 'settings': the Settings > Updates row; it shows every step itself,
 *     and no notification is raised for any of them.
 * The last surface the user acted on wins. UpdateBridge reads this before
 * raising a notification or the confirm dialog.
 */

/** See the file header. */
export type UpdateOrigin = 'notification' | 'settings'

let origin: UpdateOrigin = 'notification'

/** Record where the user just acted. */
export function setUpdateOrigin(next: UpdateOrigin): void {
  origin = next
}

/** Where the flow in progress is shown. */
export function getUpdateOrigin(): UpdateOrigin {
  return origin
}
