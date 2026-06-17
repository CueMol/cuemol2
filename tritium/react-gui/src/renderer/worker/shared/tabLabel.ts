/**
 * @file worker/shared/tabLabel.ts
 * @description Single source for the molview tab-title format, mirroring UXP
 * `TabMolView.makeTabLabel` (`<scene name>:<view name>`). Shared so the tab
 * creation paths (renderer) and the rename-refresh service (worker) build the
 * label identically -- the whole point being that titles never diverge.
 */

/**
 * Compose a molview tab title from its scene and view names.
 *
 * @param sceneName - The owning scene's name.
 * @param viewName - The view's name.
 * @returns `<scene name>:<view name>`.
 */
export function makeTabLabel(sceneName: string, viewName: string): string {
  return `${sceneName}:${viewName}`
}
