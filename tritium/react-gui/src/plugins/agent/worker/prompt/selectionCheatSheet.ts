/**
 * @file plugins/agent/worker/prompt/selectionCheatSheet.ts
 * @description CueMol's selection language, written out for the model.
 *
 * A static transcription, not a generated one. The vocabulary's own source of
 * truth (`h3-kit/selection/selectionGrammar.ts`) is a renderer module that a
 * worker service may not import, and the built-in named selections come from
 * `data/default_style.xml`, which is read by C++ at startup rather than by
 * anything here.
 *
 * That makes drift possible, so a test checks this text against the grammar
 * (`tools/index.test.ts`): every keyword the builder can emit, and every
 * built-in name, has to appear here.
 */

export const SELECTION_CHEAT_SHEET = `
CueMol selection expressions

Property keywords:
  chain A          one or more chain names (quote to keep case: chain 'a')
  resid 10         residue numbers; ranges as 10:20; insertion codes as 20A
  resn ALA,GLY     residue names
  name CA,CB       atom names
  elem C,N,O       element symbols
  alt A            alternate conformation id
  bfac > 30        B-factor comparison (<, <=, >, >=)
  occ < 1.0        occupancy comparison
  rprop type=prot  residue property (type, secondary)
  aid 1234         internal atom id
  all / none       everything / nothing

Operators:
  and  or  not     also spelled &  |  !
  (...)            grouping

Prefix operators (applied to what follows):
  byres <sel>      expand to whole residues
  bymainch <sel>   restrict to main-chain atoms
  bysidech <sel>   restrict to side-chain atoms

Postfix operators (applied to what precedes), distances in angstroms:
  <sel> around 5.0   atoms within 5.0 A of the selection, excluding it
  <sel> expand 5.0   the selection plus atoms within 5.0 A of it

Hierarchical form:
  chain.resid.aname   e.g. A.45.CA

Built-in named selections (usable as a bare word):
  protein   = rprop type=prot
  nucleic   = rprop type=nucl
  water     = rprop type=water
  sugar     = rprop type=pyranose
  ligand    = !rprop type=prot and !rprop type=nucl and !rprop type=water
  helix     = rprop secondary=helix
  sheet     = rprop secondary=sheet
  coil      = !rprop secondary=helix and !rprop secondary=sheet
  hydrogen  = elem H

Examples:
  chain A and protein
  byres (ligand around 5.0)
  protein and not hydrogen
  resid 10:20 and name CA
`.trim()

/** Keywords the cheat sheet must mention. Kept next to the text it describes. */
export const CHEAT_SHEET_KEYWORDS = [
  'chain', 'resid', 'resn', 'name', 'elem', 'alt', 'bfac', 'occ', 'rprop', 'aid',
  'all', 'none',
] as const

/** Built-in named selections the cheat sheet must mention. */
export const CHEAT_SHEET_NAMED_SELECTIONS = [
  'protein', 'nucleic', 'water', 'sugar', 'ligand', 'helix', 'sheet', 'coil', 'hydrogen',
] as const
