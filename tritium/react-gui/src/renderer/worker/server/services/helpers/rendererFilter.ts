/**
 * @file worker/server/services/helpers/rendererFilter.ts
 * @description Renderer types that stay registered in the C++ layer (so
 * scenes that already use them still load and display) but must not be
 * offered to the user for creation or conversion.
 *
 * The C++ `searchCompatibleRendererNames()` lists every registered renderer
 * type that accepts the object; the GUI-side list builders (file-open
 * renderer type, add-renderer dialog, change-renderer-type menu) filter it
 * with {@link isLegacyRendererType} on top of their own synthetic (`*`)
 * gates.
 */

/**
 * Legacy renderer types kept only for loading existing scenes:
 * - `gpu_mapmesh` (`GLSLMapMeshRenderer2`): the GPU contour has a fixed
 *   line width and performs worse than the CPU contour renderer, so new
 *   density-map renderers use `contour` / `isosurf` instead.
 */
export const LEGACY_RENDERER_TYPES: ReadonlySet<string> = new Set(['gpu_mapmesh']);

/**
 * True when `typeName` is a legacy renderer type that must not be offered
 * for creation or conversion (existing renderers of the type keep working).
 */
export function isLegacyRendererType(typeName: string): boolean {
    return LEGACY_RENDERER_TYPES.has(typeName);
}
