/**
 * @file plugins/pymconsole/worker/sel/emit.ts
 * @description Printing a parsed selection as a CueMol expression.
 *
 * Every operand is wrapped in its own parentheses. That is not tidiness: it
 * means the result carries its structure explicitly, so CueMol's parser
 * cannot re-associate it however its defaults happen to differ from PyMOL's.
 *
 * PyMOL's class macros are expanded inline here rather than registered as
 * named selections through `StyleManager.setStrData`. Registering them would
 * put worker start-up state into the scene -- definitions that outlive the
 * console, are saved into `.qsc` files, and can be shadowed by a user's own
 * name. An expression that spells itself out has none of that.
 */

import type { SelNode } from './parse'
import { SelParseError } from './parse'

/**
 * PyMOL class macros as CueMol expressions.
 *
 * The single-word ones resolve to selection aliases CueMol already defines
 * in `data/default_style.xml` (`protein`, `nucleic`, `water`, `ligand`,
 * `hydrogen`, `helix`, `sheet`, `coil`); the rest are spelled out.
 */
const MACROS: Readonly<Record<string, string>> = {
  all: '*',
  '*': '*',
  none: 'none',
  protein: 'protein',
  'polymer.protein': 'protein',
  nucleic: 'nucleic',
  'polymer.nucleic': 'nucleic',
  polymer: '(protein) or (nucleic)',
  water: 'water',
  solvent: 'water',
  hydro: 'hydrogen',
  hydrogens: 'hydrogen',
  // PyMOL's hetatm is the PDB record type, which CueMol does not keep. Its
  // `ligand` alias -- not protein, not nucleic, not water -- is the same set
  // for ordinary structures and differs for modified residues.
  hetatm: 'ligand',
  organic: 'ligand',
  // Backbone atom names, protein and nucleic. PyMOL derives these from its
  // own chemistry tables; naming them is the honest approximation.
  backbone:
    '((protein) and (name N,CA,C,O,OXT)) or ((nucleic) and (name P,OP1,OP2,O5*,C5*,C4*,C3*,O3*))',
  sidechain:
    '((protein) and not (name N,CA,C,O,OXT)) and not ((nucleic) and (name P,OP1,OP2,O5*,C5*,C4*,C3*,O3*))',
  guide: '(protein) and (name CA)',
}

/** Macros PyMOL has that this console cannot express. */
export const UNSUPPORTED_MACROS: Readonly<Record<string, string>> = {
  inorganic: 'inorganic: CueMol has no such class',
  metals: 'metals: CueMol has no such class',
  donors: 'donors: CueMol has no hydrogen-bond classes',
  acceptors: 'acceptors: CueMol has no hydrogen-bond classes',
  visible: 'visible: CueMol has no per-atom visibility selection',
  enabled: 'enabled: CueMol has no per-atom enabled flag',
  bonded: 'bonded: CueMol has no "bonded" class',
  masked: 'masked: CueMol has no atom flags',
  protected: 'protected: CueMol has no atom flags',
  center: 'center: CueMol has no pseudo-atom classes',
  origin: 'origin: CueMol has no pseudo-atom classes',
}

/** PyMOL's secondary-structure letters as CueMol's aliases. */
const SS_CLASSES: Readonly<Record<string, string>> = {
  h: 'helix',
  s: 'sheet',
  l: 'coil',
  '': 'coil',
}

/**
 * A value list as CueMol writes it.
 *
 * PyMOL separates alternatives with `+` (and treats `,` the same way);
 * CueMol uses `,` only. This runs on the contents of one word, so a `+`
 * here is always a separator -- the case where it is a union operator never
 * reaches this function, having been a word of its own.
 */
function valueList(value: string): string {
  return value
    .split(/[+,]/)
    .map((v) => v.trim())
    .filter((v) => v !== '')
    .join(',')
}

/**
 * A residue value list, with PyMOL's `-` ranges rewritten to CueMol's `:`.
 *
 * The dash is only a range between two residue numbers. A leading dash is a
 * negative residue number, which crystallographic numbering really does use,
 * so `resi -5--1` means -5 through -1.
 */
function residList(value: string, pos: number): string {
  return value
    .split(/[+,]/)
    .map((part) => {
      const v = part.trim()
      if (v === '') return ''
      const range = /^(-?\w+)-(-?\w+)$/.exec(v)
      if (range) return `${range[1]}:${range[2]}`
      if (/^-?\w+$/.test(v)) return v
      throw new SelParseError(`"${v}" is not a residue number or range`, pos)
    })
    .filter((v) => v !== '')
    .join(',')
}

/** A comparison, in the three operators CueMol's grammar has. */
function comparison(node: Extract<SelNode, { kind: 'compare' }>): string {
  const prop = node.keyword === 'b' ? 'bfac' : node.keyword === 'q' ? 'occ' : null
  if (prop === null) {
    throw new SelParseError(`${node.keyword}: CueMol cannot select on it`, node.pos)
  }
  // CueMol has `<`, `>` and `=` only. PyMOL's `<=` / `>=` have no equivalent
  // and are not worth approximating with the strict form.
  const op = node.op === '==' ? '=' : node.op
  if (op !== '<' && op !== '>' && op !== '=') {
    throw new SelParseError(`${node.op}: CueMol has only <, > and =`, node.pos)
  }
  return `${prop} ${op} ${node.value}`
}

/** One property term. */
function property(node: Extract<SelNode, { kind: 'prop' }>): string {
  switch (node.keyword) {
    case 'resi':
      return `resi ${residList(node.value, node.pos)}`
    case 'id':
      // PyMOL's `id` is the file's atom serial; CueMol calls it `aid`.
      return `aid ${valueList(node.value)}`
    case 'rank':
      throw new SelParseError('rank: CueMol has no atom rank', node.pos)
    case 'ss': {
      const parts = node.value.split(/[+,]/).map((v) => v.trim().toLowerCase())
      const classes = parts.map((p) => {
        const cls = SS_CLASSES[p]
        if (cls === undefined) {
          throw new SelParseError(`ss ${p}: expected H, S or L`, node.pos)
        }
        return `(${cls})`
      })
      return classes.length === 1 ? classes[0] : classes.join(' or ')
    }
    default:
      return `${node.keyword} ${valueList(node.value)}`
  }
}

/** The CueMol expression for a parsed selection. */
export function emitSelection(node: SelNode): string {
  switch (node.kind) {
    case 'and':
      return `(${emitSelection(node.left)}) and (${emitSelection(node.right)})`
    case 'or':
      return `(${emitSelection(node.left)}) or (${emitSelection(node.right)})`
    case 'sub':
      // PyMOL's `-`: CueMol has no subtraction, so it is spelled out.
      return `(${emitSelection(node.left)}) and not (${emitSelection(node.right)})`
    case 'not':
      return `not (${emitSelection(node.operand)})`
    case 'byres':
      return `byres (${emitSelection(node.operand)})`
    case 'prox':
      return `(${emitSelection(node.operand)}) ${node.op} ${node.distance}`
    case 'prop':
      return property(node)
    case 'compare':
      return comparison(node)
    case 'macro': {
      const reason = UNSUPPORTED_MACROS[node.keyword]
      if (reason !== undefined) throw new SelParseError(reason, node.pos)
      const expr = MACROS[node.keyword]
      if (expr === undefined) {
        throw new SelParseError(`${node.keyword}: not supported`, node.pos)
      }
      return expr
    }
    case 'name':
      return node.name
  }
}
