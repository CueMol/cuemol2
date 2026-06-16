/**
 * @file commands/commandTypes.ts
 * @description Shared type aliases for the command-registration hooks.
 *
 * Several command hooks and view-state hooks depend on the active molview's
 * scene/view ids. They all accept the same `getActiveSceneInfo` accessor in
 * their options surface; this alias is the single source of truth for that
 * function type so the inline re-declaration is not duplicated per file.
 */

/**
 * Accessor returning the active molview's scene/view ids, or a nullish value
 * when no molview is active. Consumers treat `null` and `undefined`
 * identically (optional chaining / truthy guard).
 */
export type ActiveSceneCommandDeps = () =>
  | { scene_uid: number; view_id: number }
  | null
  | undefined
