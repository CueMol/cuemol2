/**
 * @file dialogs/molSurfBackend.ts
 * @description Shared SES-generation backend choice for the two molecular-
 * surface dialogs (`MakeMolSurfDialog` creates a surface, `RegenMolSurfDialog`
 * rebuilds one). Both present it as a `SegmentField`, so the option list and
 * the default live here once.
 *
 * The value maps 1:1 onto the C++ `MolSurfObj.sesbackend` enum property, which
 * the worker sets before calling `createSESFromMol` / `regenerateSES1`. This is
 * transitional: MeshMS is replacing the vendored BALL implementation, and
 * exposing the switch lets the two be compared on the same structure (each
 * generation logs its backend and elapsed time). The control goes away with
 * BALL.
 */

/** Values accepted by the C++ `sesbackend` enum property. */
export type MolSurfBackend = 'auto' | 'meshms' | 'ball'

/**
 * Default: defer to the build / deployment default rather than pinning a
 * backend from the UI. Resolves to MeshMS where it is compiled in.
 */
export const DEFAULT_BACKEND: MolSurfBackend = 'auto'

/** Ordered segments for the backend `SegmentField`. */
export const BACKEND_OPTIONS: { label: string; value: MolSurfBackend }[] = [
    { label: 'Auto', value: 'auto' },
    { label: 'MeshMS', value: 'meshms' },
    { label: 'BALL', value: 'ball' },
]

/** Narrow an arbitrary stored value to a valid backend id. */
export function asBackend(v: unknown): MolSurfBackend {
    return v === 'meshms' || v === 'ball' || v === 'auto' ? v : DEFAULT_BACKEND
}
