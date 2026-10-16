/**
 * @file worker/shared/superposeTypes.ts
 * @description Superposition algorithm ids and US-align pivot atoms, shared by
 * the worker service (`superposeMol`), the catalog op, the PyMOL dialect and
 * the Superpose dialog.
 */

/**
 * Superposition algorithm: US-align (TM-align; proteins and nucleic acids,
 * the default), secondary-structure matching (proteins), or a least-squares
 * fit of atoms paired in order.
 */
export type SuperposeAlgo = 'USalign' | 'SSM' | 'LSQ';

/** The default algorithm of every superposition entry point. */
export const DEFAULT_SUPERPOSE_ALGO: SuperposeAlgo = 'USalign';

/**
 * US-align pivot atom choices: 'auto' takes CA for amino acids and C3' for
 * nucleotides; the others use that atom for every residue.
 */
export const USALIGN_PIVOTS = ['auto', 'CA', "C3'", "C4'", 'P'] as const;
