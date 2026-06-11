/**
 * @file worker/server/services/helpers/atomintr.ts
 * @description Shared constants for the `atomintr` renderer (atom interaction
 * labels: distance / angle / torsion measures and interaction analysis).
 * Centralised so the measure tool and the interaction-analysis tool agree on
 * the renderer type, default styles, and default label-set name (UXP parity).
 */

/** Renderer type name for distance / angle / torsion / interaction labels. */
export const ATOMINTR_TYPE = 'atomintr';

/** Default styles applied to a freshly created atomintr renderer (UXP parity). */
export const ATOMINTR_STYLES = 'DefaultLabel,DefaultAtomIntr';

/** Default label-set name used when no explicit target is chosen. */
export const ATOMINTR_DEFAULT_TARGET_NAME = 'measure';
