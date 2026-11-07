/**
 * @file plugins/chimerax-console/worker/spec/selectors.ts
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
  'ions', 'main', 'min-backbone', 'ribose', 'pbonds', 'pbondatoms', 'hbonds', 'hbondatoms',
  'sel-residues', 'template-mismatch',
])

/**
 * The current selection (`sel`): each molecule's own selection, which the
 * emitter reads from the scene (`EmitContext.currentSelection`).
 */
export const CURRENT_SELECTION = 'sel'

/**
 * The selected atoms, or every atom when nothing is selected in the scene
 * (`selAtoms`, ChimeraX `shortcuts.py`).
 */
export const SELECTED_OR_ALL = 'selAtoms'

/**
 * The scene's named selections, which are selectors too while a line is
 * read (`withSceneSelectors`): a name `name` defined is used as `site`.
 */
let sceneNames: ReadonlySet<string> = new Set()

/**
 * Run `f` with the scene's named selections read as selectors. The
 * grammar is read synchronously, so the set is in force only during `f`.
 */
export function withSceneSelectors<T>(names: ReadonlySet<string>, f: () => T): T {
  const before = sceneNames
  sceneNames = names
  try {
    return f()
  } finally {
    sceneNames = before
  }
}

/** Whether `name` is a selector (an element symbol, `sel`, a named selection of the scene included). */
export function isSelector(name: string): boolean {
  return name in TRANSLATED || KNOWN_ONLY.has(name) || name in ELEMENT_COLORS || name === CURRENT_SELECTION || name === SELECTED_OR_ALL || sceneNames.has(name)
}

/** Every selector name, for Tab. */
export function selectorNames(): string[] {
  return [...Object.keys(TRANSLATED), CURRENT_SELECTION, SELECTED_OR_ALL, ...sceneNames, ...Object.keys(ELEMENT_COLORS)]
}

/** The CueMol expression of a selector, or null when it is not supported yet. */
export function selectorExpr(name: string): string | null {
  if (name in TRANSLATED) return TRANSLATED[name]
  if (name in ELEMENT_COLORS) return `elem ${name}`
  return null
}
