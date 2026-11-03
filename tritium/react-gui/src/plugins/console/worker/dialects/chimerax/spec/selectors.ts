/**
 * @file plugins/console/worker/dialects/chimerax/spec/selectors.ts
 * @description ChimeraX's builtin selector names, as CueMol expressions.
 *
 * The selectors are ChimeraX's (`atomic/src/selectors.py`,
 * `std_commands/src/selectors.py`). Where CueMol has the same class as a
 * global alias (`data/default_style.xml`: `protein`, `nucleic`, `ligand`,
 * `water`, `helix`, `sheet`, `coil`) the alias is used; backbone and side
 * chain are spelled out by atom name. A selector CueMol has no equivalent
 * for is still recognised as one -- so `color ions red` does not read
 * `ions` as a colour -- and refused when it is translated.
 */

import { ELEMENT_COLORS } from '../colorTables'

/** Atom names of a protein and a nucleic acid backbone. */
const BACKBONE =
  '((protein) and (name N,CA,C,O,OXT)) or ((nucleic) and (name P,OP1,OP2,O5*,C5*,C4*,C3*,O3*))'

/** The selectors CueMol has an expression for. */
const TRANSLATED: Readonly<Record<string, string>> = {
  all: '*',
  protein: 'protein',
  nucleic: 'nucleic',
  'nucleic-acid': 'nucleic',
  ligand: 'ligand',
  solvent: 'water',
  backbone: BACKBONE,
  mainchain: BACKBONE,
  sidechain: `(protein) and not (name N,CA,C,O,OXT)`,
  sideonly: `(protein) and not (name N,CA,C,O,OXT)`,
  helix: 'helix',
  strand: 'sheet',
  coil: 'coil',
}

/** Selectors ChimeraX has that the console cannot translate yet. */
const KNOWN_ONLY = new Set([
  'sel', 'ions', 'main', 'min-backbone', 'ribose', 'pbonds', 'pbondatoms', 'hbonds', 'hbondatoms',
  'sel-residues', 'template-mismatch',
])

/** Whether `name` is a selector (an element symbol included). */
export function isSelector(name: string): boolean {
  return name in TRANSLATED || KNOWN_ONLY.has(name) || name in ELEMENT_COLORS
}

/** Every selector name, for Tab. */
export function selectorNames(): string[] {
  return [...Object.keys(TRANSLATED), ...Object.keys(ELEMENT_COLORS)]
}

/** The CueMol expression of a selector, or null when it is not supported yet. */
export function selectorExpr(name: string): string | null {
  if (name in TRANSLATED) return TRANSLATED[name]
  if (name in ELEMENT_COLORS) return `elem ${name}`
  return null
}
