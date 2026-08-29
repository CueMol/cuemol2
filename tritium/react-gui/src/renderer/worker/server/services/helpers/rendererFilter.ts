/**
 * @file worker/server/services/helpers/rendererFilter.ts
 * @description Renderer types that stay registered in the C++ layer (so
 * scenes that already use them still load and display) but must not be
 * offered to the user for creation or conversion.
 *
 * The C++ `searchCompatibleRendererNames()` lists every registered renderer
 * type that accepts the object; the GUI-side list builders (file-open
 * renderer type, add-renderer dialog, change-renderer-type menu) filter it
 * with {@link isSelectableRendererType} on top of their own extra gates.
 *
 * The lists are not one set. UXP offers `atomintr` / `disorder` when creating
 * a renderer (`fopen-renderopt-page.js` `setupRendTypeBox` skips only `*`,
 * `ms2test` and `symm`) but hides them in the change-renderer-type menu
 * (`workspace_panel.js`), because neither has a conversion path; that
 * convert-side gate lives in `getRendererChangeTypes` / `changeRendererType`,
 * not here. Opening a file is narrower still -- see
 * {@link isInitialRendererType}.
 */

/**
 * Legacy renderer types kept only for loading existing scenes:
 * - `gpu_mapmesh` (`GLSLMapMeshRenderer2`): the GPU contour has a fixed
 *   line width and performs worse than the CPU contour renderer, so new
 *   density-map renderers use `contour` / `isosurf` instead.
 */
export const LEGACY_RENDERER_TYPES: ReadonlySet<string> = new Set(['gpu_mapmesh']);

/**
 * Developer-only renderer types registered by the C++ modules but never
 * offered in the GUI (UXP `fopen-renderopt-page.js` skips the same two).
 */
export const RENDERER_TEST_TYPES: ReadonlySet<string> = new Set(['ms2test', 'symm']);

/**
 * True when `typeName` is a legacy renderer type that must not be offered
 * for creation or conversion (existing renderers of the type keep working).
 */
export function isLegacyRendererType(typeName: string): boolean {
    return LEGACY_RENDERER_TYPES.has(typeName);
}

/**
 * True when `typeName` may be offered to the user as a renderer to create.
 * Rejects the synthetic (`*`-prefixed) types, the developer-only test types
 * and the legacy types.
 */
export function isSelectableRendererType(typeName: string): boolean {
    const s = typeName.trim();
    if (s.length === 0) return false;
    if (s.charAt(0) === '*') return false;
    if (RENDERER_TEST_TYPES.has(s)) return false;
    return !isLegacyRendererType(s);
}

/**
 * Renderer types that would draw NOTHING on a freshly read object, because
 * what they draw does not exist yet:
 * - `disorder` follows a main-chain renderer named by its `target`, and an
 *   object being loaded has no renderers to follow (see `setupRenderer`,
 *   which picks one when the overlay is created later);
 * - `atomintr` draws measurements between atoms, and nobody has made any.
 *
 * Both are worth offering once the object is in the scene, so this is not the
 * same gate as {@link isSelectableRendererType}.
 */
export const EMPTY_AT_LOAD_RENDERER_TYPES: ReadonlySet<string> = new Set([
    'disorder',
    'atomintr',
]);

/**
 * True when `typeName` may be offered as the FIRST renderer of an object being
 * loaded. Narrower than {@link isSelectableRendererType}: picking one that
 * comes up empty makes the load look like it failed.
 */
export function isInitialRendererType(typeName: string): boolean {
    return (
        isSelectableRendererType(typeName) &&
        !EMPTY_AT_LOAD_RENDERER_TYPES.has(typeName.trim())
    );
}
