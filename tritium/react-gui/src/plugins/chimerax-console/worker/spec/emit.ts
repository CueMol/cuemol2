/**
 * @file plugins/chimerax-console/worker/spec/emit.ts
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
 *
 * A zone (`X @< 5`) reaches across models, as in ChimeraX: in model m it is
 * `(X_m) expand d` together with `(X_k) around d ["name_k"]` for every other
 * model k. Zones to whole chains or models (`/<`, `#<`) and model attribute
 * tests need the scene, which the caller gives as an `EmitContext`.
 */

import { SpecError } from './parse'
import type { AttrTest, ChainGroup, ModelRange, ResidueGroup, ResiduePart, SpecNode } from './parse'
import { CURRENT_SELECTION, SELECTED_OR_ALL, selectorExpr } from './selectors'

/** CueMol's expression for nothing. */
export const NONE = 'none'
/** CueMol's expression for everything. */
export const ALL = '*'

/** What a zone or a model attribute test needs to know about the scene. */
export interface EmitContext {
  /** Every molecule the specification is evaluated over: its model number and object name. */
  models: readonly { model: number; name: string }[]
  /** The chain ids of the atoms `expr` matches in model `model`. */
  chainsHit(model: number, expr: string): string[]
  /** Whether `expr` matches any atom in model `model`. */
  anyHit(model: number, expr: string): boolean
  /** The current selection of model `model` as an expression (`none` when it has none), for `sel`. */
  currentSelection(model: number): string
  /** The scene's named selections, which the emitter writes as references. */
  namedSelections: ReadonlySet<string>
}

/** A residue number, with an optional insertion code (`10`, `-5`, `10A`), as `_parse_as_res_id` reads it. */
const RES_ID = /^([-+]?\d+)([A-Za-z]?)$/
/** The ends of a chain, for `start` / `end`: CueMol has no open range, so far-off numbers stand in. */
const FIRST_RESIDUE = '-99999'
const LAST_RESIDUE = '99999'

function inModels(models: readonly ModelRange[] | null, n: number): boolean {
  if (models === null) return true
  return models.some((r) => (r.start === null || n >= r.start) && (r.end === null || n <= r.end))
}

/** A residue number written for CueMol: the digits as an integer (no leading zero), then the insertion code. */
function resId(raw: string): string | null {
  if (/^start$/i.test(raw)) return FIRST_RESIDUE
  if (/^end$/i.test(raw)) return LAST_RESIDUE
  const m = RES_ID.exec(raw)
  return m ? `${Number(m[1])}${m[2]}` : null
}

/** Whether a name has a ChimeraX wildcard in it. */
function hasWildcard(raw: string): boolean {
  return /[*?[]/.test(raw)
}

/**
 * A ChimeraX name pattern (`fnmatch`: `*`, `?`, `[...]`) as a CueMol
 * regular expression token, anchored. CueMol's regular expressions are
 * case-sensitive PCRE, so a case-insensitive match (ChimeraX's `=`) gets
 * `(?i)`; a `/` would end the token, so it is escaped.
 */
function patternRegex(raw: string, ignoreCase: boolean, pos: number): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '*') out += '.*'
    else if (c === '?') out += '.'
    else if (c === '[') {
      const close = raw.indexOf(']', i + 1)
      if (close < 0) throw new SpecError('"]" is missing', pos)
      let cls = raw.slice(i + 1, close)
      if (cls.startsWith('!')) cls = `^${cls.slice(1)}`
      out += `[${cls.replace(/[\\/]/g, '\\$&')}]`
      i = close
    } else if (c === '\\' && i + 1 < raw.length) {
      out += `\\${raw[++i]}`
    } else {
      out += c.replace(/[.+^${}()|/]/g, '\\$&')
    }
  }
  return `/${ignoreCase ? '(?i)' : ''}^${out}$/`
}

/** One name for CueMol's name lists: as it is, or as a pattern when it has a wildcard. */
function nameToken(raw: string, pos: number, ignoreCase = true): string {
  if (raw.includes('"')) throw new SpecError('a quoted name is not supported yet', pos)
  if (hasWildcard(raw) || !ignoreCase) return patternRegex(raw, ignoreCase, pos)
  return raw
}

/** `kw a,b,/re/` for a list of names. */
function namesExpr(kw: string, parts: readonly ResiduePart[], what: string): string {
  if (parts.some((p) => p.start === '*' && p.end === null)) return ALL
  for (const p of parts) if (p.end !== null) throw new SpecError(`a ${what} range is not supported`, p.pos)
  return `${kw} ${parts.map((p) => nameToken(p.start, p.pos)).join(',')}`
}

/** One residue part: `resi` for numbers (ranges too), `resn` for names. */
function residueExpr(p: ResiduePart): string {
  if (p.start === '*' && p.end === null) return ALL
  const a = resId(p.start)
  const b = p.end === null ? null : resId(p.end)
  if (a !== null && (p.end === null || b !== null)) return `resi ${b === null ? a : `${a}:${b}`}`
  if (p.end !== null) throw new SpecError(`"${p.start}-${p.end}" is not a residue number range`, p.pos)
  return `resn ${nameToken(p.start, p.pos)}`
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

function not(t: string): string {
  return t === ALL ? NONE : t === NONE ? ALL : `not (${t})`
}

// --- Attribute tests (`@@bfactor>50`, `::name=ALA`) ---

/** A numeric comparison with CueMol's three operators (`=`, `<`, `>`). */
function compare(kw: string, t: AttrTest): string {
  const v = Number(t.value)
  if (t.value === null || !Number.isFinite(v)) throw new SpecError(`${t.name} takes a number`, t.pos)
  switch (t.op) {
    case '>':
    case '<':
      return `${kw} ${t.op} ${v}`
    case '=':
    case '==':
      return `${kw} = ${v}`
    case '>=':
      return `not (${kw} < ${v})`
    case '<=':
      return `not (${kw} > ${v})`
    default:
      return `not (${kw} = ${v})`
  }
}

/** A name comparison: `=` matches as `fnmatch` ignoring case, `==` exactly, `!=` / `!==` their negations. */
function nameCompare(kw: string, t: AttrTest): string {
  if (t.value === null) throw new SpecError(`${t.name} takes a value`, t.pos)
  const exact = t.op === '==' || t.op === '!=='
  const term = `${kw} ${nameToken(t.value, t.pos, !exact)}`
  if (t.op === '=' || t.op === '==') return term
  if (t.op === '!=' || t.op === '!==' || t.op === '<>') return `not (${term})`
  throw new SpecError(`${t.name} cannot be compared with "${t.op}"`, t.pos)
}

/** `::number` as a residue range: CueMol has no comparison on residue numbers. */
function numberCompare(t: AttrTest): string {
  const v = Number(t.value)
  if (t.value === null || !Number.isInteger(v)) throw new SpecError('number takes a whole number', t.pos)
  switch (t.op) {
    case '>=':
      return `resi ${v}:${LAST_RESIDUE}`
    case '>':
      return `resi ${v + 1}:${LAST_RESIDUE}`
    case '<=':
      return `resi ${FIRST_RESIDUE}:${v}`
    case '<':
      return `resi ${FIRST_RESIDUE}:${v - 1}`
    case '=':
    case '==':
      return `resi ${v}`
    default:
      return `not (resi ${v})`
  }
}

/** An enumerated value (`polymer_type=1`) from a table, with `=` or `!=`. */
function enumCompare(t: AttrTest, table: Readonly<Record<string, string>>): string {
  const expr = t.value === null ? undefined : table[t.value]
  if (expr === undefined) throw new SpecError(`${t.name} is one of ${Object.keys(table).join(', ')}`, t.pos)
  if (t.op === '=' || t.op === '==') return expr
  if (t.op === '!=' || t.op === '!==' || t.op === '<>') return not(expr)
  throw new SpecError(`${t.name} cannot be compared with "${t.op}"`, t.pos)
}

/** `Residue.polymer_type`: PT_NONE, PT_AMINO, PT_NUCLEIC. */
const POLYMER_TYPES: Readonly<Record<string, string>> = { 0: 'not (protein or nucleic)', 1: 'protein', 2: 'nucleic' }
/** `Residue.ss_type`: SS_COIL, SS_HELIX, SS_STRAND. */
const SS_TYPES: Readonly<Record<string, string>> = { 0: 'coil', 1: 'helix', 2: 'sheet' }
/** True / false attributes: what they are true of. */
const FLAGS: Readonly<Record<string, string>> = { is_helix: 'helix', is_strand: 'sheet' }

/** One attribute test at the atom, residue or chain level. */
function attrExpr(t: AttrTest, level: 'atom' | 'residue' | 'chain'): string {
  if (t.op === null) {
    const flag = level === 'residue' ? FLAGS[t.name] : undefined
    if (flag === undefined) throw new SpecError(`the attribute "${t.name}" is not supported yet`, t.pos)
    return t.negated ? not(flag) : flag
  }
  if (level === 'atom') {
    if (t.name === 'bfactor') return compare('bfac', t)
    if (t.name === 'occupancy') return compare('occ', t)
    if (t.name === 'name') return nameCompare('name', t)
    if (t.name === 'element') return nameCompare('elem', t)
  } else if (level === 'residue') {
    if (t.name === 'name') return nameCompare('resn', t)
    if (t.name === 'number') return numberCompare(t)
    if (t.name === 'chain_id') return nameCompare('chain', t)
    if (t.name === 'polymer_type') return enumCompare(t, POLYMER_TYPES)
    if (t.name === 'ss_type') return enumCompare(t, SS_TYPES)
  } else if (t.name === 'chain_id') {
    return nameCompare('chain', t)
  }
  throw new SpecError(`the attribute "${t.name}" is not supported yet`, t.pos)
}

/** Every test of a list holds (ChimeraX's `,` in an attribute list). */
function testsExpr(tests: readonly AttrTest[] | null, level: 'atom' | 'residue' | 'chain'): string {
  return tests === null ? ALL : and(tests.map((t) => attrExpr(t, level)))
}

/** Whether a model passes its `##` tests; only `name` is read (the object's name). */
function modelPasses(tests: readonly AttrTest[], model: number, ec: EmitContext | undefined): boolean {
  return tests.every((t) => {
    if (t.name !== 'name' || t.value === null) throw new SpecError(`the model attribute "${t.name}" is not supported yet`, t.pos)
    const name = ec?.models.find((m) => m.model === model)?.name
    if (name === undefined) throw new SpecError('a model attribute test needs the scene', t.pos)
    const exact = t.op === '==' || t.op === '!=='
    const re = new RegExp(patternRegex(t.value, !exact, t.pos).slice(1, -1).replace('(?i)', ''), exact ? '' : 'i')
    const hit = re.test(name)
    if (t.op === '=' || t.op === '==') return hit
    if (t.op === '!=' || t.op === '!==' || t.op === '<>') return !hit
    throw new SpecError(`name cannot be compared with "${t.op}"`, t.pos)
  })
}

function residueGroupExpr(g: ResidueGroup): string {
  return and([
    g.residues === null ? ALL : or(g.residues.map(residueExpr)),
    testsExpr(g.residueTests, 'residue'),
    g.atoms === null ? ALL : namesExpr('name', g.atoms, 'atom name'),
    testsExpr(g.atomTests, 'atom'),
  ])
}

function chainGroupExpr(g: ChainGroup): string {
  return and([
    g.chains === null ? ALL : namesExpr('chain', g.chains, 'chain'),
    testsExpr(g.chainTests, 'chain'),
    g.residues.length === 0 ? ALL : or(g.residues.map(residueGroupExpr)),
  ])
}

// --- Zones ---

/** A molecule name written as CueMol's `around` target. */
function quoteName(name: string): string {
  return `"${name.replace(/"/g, '\\"')}"`
}

/** The atoms of model `model` within `dist` of `term`, in any model (the reference atoms included). */
function within(node: Extract<SpecNode, { kind: 'zone' }>, model: number, ec: EmitContext | undefined): string {
  if (!ec) throw new SpecError('a zone needs the scene', node.pos)
  const parts: string[] = []
  for (const m of ec.models) {
    const x = emitFor(node.term, m.model, ec)
    if (x === NONE) continue
    parts.push(m.model === model ? `(${x}) expand ${node.dist}` : `(${x}) around ${node.dist} [${quoteName(m.name)}]`)
  }
  return or(parts)
}

function zoneExpr(node: Extract<SpecNode, { kind: 'zone' }>, model: number, ec: EmitContext | undefined): string {
  const near = within(node, model, ec)
  // ChimeraX's `<` keeps what is within, with the reference atoms; `>` what is not.
  const keep = (t: string): string => (node.op === '<' ? t : not(t))
  switch (node.level) {
    case '@':
      return keep(near)
    case ':':
      return keep(near === NONE || near === ALL ? near : `byres (${near})`)
    case '/': {
      const chains = near === NONE ? [] : (ec as EmitContext).chainsHit(model, near)
      return keep(chains.length === 0 ? NONE : `chain ${chains.map((c) => nameToken(c, node.pos)).join(',')}`)
    }
    case '#':
      return keep(near !== NONE && (ec as EmitContext).anyHit(model, near) ? ALL : NONE)
  }
}

/**
 * The CueMol expression `node` means inside the object numbered `model`.
 *
 * @param ec - the scene, for zones and model attribute tests
 * @throws SpecError for a part not supported yet (a selector CueMol lacks,
 *   an attribute it has no counterpart for)
 */
export function emitFor(node: SpecNode, model: number, ec?: EmitContext): string {
  switch (node.kind) {
    case 'and':
      return and([emitFor(node.left, model, ec), emitFor(node.right, model, ec)])
    case 'or':
      return or([emitFor(node.left, model, ec), emitFor(node.right, model, ec)])
    case 'not':
      return not(emitFor(node.term, model, ec))
    case 'selector': {
      if (node.name === CURRENT_SELECTION) {
        if (!ec) throw new SpecError('"sel" needs the scene', node.pos)
        return ec.currentSelection(model)
      }
      if (node.name === SELECTED_OR_ALL) {
        if (!ec) throw new SpecError(`"${SELECTED_OR_ALL}" needs the scene`, node.pos)
        const anySelected = ec.models.some((m) => ec.currentSelection(m.model) !== NONE)
        return anySelected ? ec.currentSelection(model) : ALL
      }
      const expr = selectorExpr(node.name)
      if (expr !== null) return expr
      // A named selection of the scene: CueMol reads the name as a reference.
      if (ec?.namedSelections.has(node.name)) return node.name
      throw new SpecError(`the selector "${node.name}" is not supported yet`, node.pos)
    }
    case 'zone':
      return zoneExpr(node, model, ec)
    case 'hier':
      if (!inModels(node.models, model)) return NONE
      if (node.modelTests !== null && !modelPasses(node.modelTests, model, ec)) return NONE
      return node.chains.length === 0 ? ALL : or(node.chains.map(chainGroupExpr))
  }
}
