/**
 * @file plugins/console/worker/dialects/chimerax/spec/emit.ts
 * @description A ChimeraX atom specification as one CueMol expression per object.
 *
 * ChimeraX evaluates a specification over every model at once, and a model
 * number is one of its parts (`#1/A | #2/B`). CueMol evaluates a selection
 * against one molecule. So the tree is emitted once per object, with that
 * object's model number: a part naming another model becomes `none` there,
 * and an object whose expression is `none` is not acted on. `#1/A | #2/B`
 * is therefore `chain A` in #1 and `chain B` in #2, never `chain A or chain
 * B` in both.
 *
 * Every term is wrapped in brackets, so ChimeraX's reading (no precedence,
 * right associative) survives CueMol's.
 */

import { SpecError } from './parse'
import type { ChainGroup, ModelRange, ResidueGroup, ResiduePart, SpecNode } from './parse'
import { selectorExpr } from './selectors'

/** CueMol's expression for nothing. */
export const NONE = 'none'
/** CueMol's expression for everything. */
export const ALL = '*'

/** A residue number, with an optional insertion code (`10`, `-5`, `10A`), as `_parse_as_res_id` reads it. */
const RES_ID = /^([-+]?\d+)([A-Za-z]?)$/

function inModels(models: readonly ModelRange[] | null, n: number): boolean {
  if (models === null) return true
  return models.some((r) => (r.start === null || n >= r.start) && (r.end === null || n <= r.end))
}

/** A residue number written for CueMol: the digits as an integer (no leading zero), then the insertion code. */
function resId(raw: string): string | null {
  const m = RES_ID.exec(raw)
  return m ? `${Number(m[1])}${m[2]}` : null
}

/** A name CueMol's selection scanner accepts: no `?`, no `*` in front. */
function cuemolName(raw: string, pos: number): string {
  if (raw.includes('?')) throw new SpecError('a "?" wildcard is not supported yet', pos)
  if (raw.includes('"')) throw new SpecError('a quoted name is not supported yet', pos)
  return raw
}

/** One residue part: `resi` for numbers (ranges too), `resn` for names. */
function residueExpr(p: ResiduePart): string {
  if (p.start === '*' && p.end === null) return ALL
  if (/^(start|end)$/i.test(p.start) || (p.end !== null && /^(start|end)$/i.test(p.end))) {
    throw new SpecError('a range to "start" or "end" is not supported yet', p.pos)
  }
  const a = resId(p.start)
  const b = p.end === null ? null : resId(p.end)
  if (a !== null && (p.end === null || b !== null)) return `resi ${b === null ? a : `${a}:${b}`}`
  if (p.end !== null) throw new SpecError(`"${p.start}-${p.end}" is not a residue number range`, p.pos)
  return `resn ${cuemolName(p.start, p.pos)}`
}

function or(terms: readonly string[]): string {
  const real = terms.filter((t) => t !== NONE)
  if (real.length === 0) return NONE
  if (real.includes(ALL)) return ALL
  return real.length === 1 ? real[0] : real.map((t) => `(${t})`).join(' or ')
}

function and(terms: readonly string[]): string {
  const real = terms.filter((t) => t !== ALL)
  if (real.includes(NONE)) return NONE
  if (real.length === 0) return ALL
  return real.length === 1 ? real[0] : real.map((t) => `(${t})`).join(' and ')
}

function residueGroupExpr(g: ResidueGroup): string {
  const residues = g.residues === null ? ALL : or(g.residues.map(residueExpr))
  const atoms = g.atoms === null ? ALL : `name ${g.atoms.map((a) => cuemolName(a, 0)).join(',')}`
  return and([residues, atoms])
}

function chainGroupExpr(g: ChainGroup): string {
  const chains = g.chains === null ? ALL : `chain ${g.chains.map((c) => cuemolName(c, 0)).join(',')}`
  const residues = g.residues.length === 0 ? ALL : or(g.residues.map(residueGroupExpr))
  return and([chains, residues])
}

/**
 * The CueMol expression `node` means inside the object numbered `model`.
 *
 * @throws SpecError for a part not supported yet (a selector CueMol lacks,
 *   a `?` wildcard, a range to `start`)
 */
export function emitFor(node: SpecNode, model: number): string {
  switch (node.kind) {
    case 'and':
      return and([emitFor(node.left, model), emitFor(node.right, model)])
    case 'or':
      return or([emitFor(node.left, model), emitFor(node.right, model)])
    case 'not': {
      const t = emitFor(node.term, model)
      return t === ALL ? NONE : t === NONE ? ALL : `not (${t})`
    }
    case 'selector': {
      const expr = selectorExpr(node.name)
      if (expr === null) throw new SpecError(`the selector "${node.name}" is not supported yet`, node.pos)
      return expr
    }
    case 'hier':
      if (!inModels(node.models, model)) return NONE
      return node.chains.length === 0 ? ALL : or(node.chains.map(chainGroupExpr))
  }
}
