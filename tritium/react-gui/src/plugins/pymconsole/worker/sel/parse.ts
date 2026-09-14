/**
 * @file plugins/pymconsole/worker/sel/parse.ts
 * @description Reading a PyMOL selection expression into a tree.
 *
 * A recursive-descent parser at PyMOL's own operator priorities
 * (`layer3/Selector.cpp`, the low byte of each `SELE_*` code):
 *
 *   selectors 0x80  >  not 0x70  >  and / `-` 0x60  >  or / `+` / in 0x40
 *   >  around / expand 0x30  >  byres 0x20
 *
 * CueMol's grammar (`molstr/parser_sel.yxx`) declares the same order, so a
 * tree built here can be printed back out without reordering anything. What
 * the tree is for is the printing: emitting every operand in its own
 * parentheses means the result cannot be re-associated by the other parser,
 * whatever either side's defaults are.
 *
 * A rewrite done with regexes could not do that, and would also have to
 * decide what `-` means without knowing whether it stands alone -- which is
 * how `resi 1-10` quietly becomes a subtraction.
 */

import { tokenize } from './tokenize'
import type { Token } from './tokenize'

/** A parsed selection. */
export type SelNode =
  | { kind: 'and'; left: SelNode; right: SelNode }
  | { kind: 'or'; left: SelNode; right: SelNode }
  /** PyMOL's `-`: everything in `left` that is not in `right`. */
  | { kind: 'sub'; left: SelNode; right: SelNode }
  | { kind: 'not'; operand: SelNode }
  | { kind: 'byres'; operand: SelNode }
  /** `around` / `expand`, which take a distance. */
  | { kind: 'prox'; op: 'around' | 'expand'; operand: SelNode; distance: string }
  /** A keyword taking one value list: `chain A,B`, `resi 1-10`. */
  | { kind: 'prop'; keyword: string; value: string; pos: number }
  /** A comparison: `b < 30`. */
  | { kind: 'compare'; keyword: string; op: string; value: string; pos: number }
  /** A keyword taking nothing: `polymer`, `all`. */
  | { kind: 'macro'; keyword: string; pos: number }
  /** A bare word: an object or a named selection. */
  | { kind: 'name'; name: string; pos: number }

/** Raised with a message that points at the offending word. */
export class SelParseError extends Error {
  constructor(
    message: string,
    readonly pos: number,
  ) {
    super(message)
  }
}

/** Keywords that take one value list. */
export const PROP_KEYWORDS: Readonly<Record<string, string>> = {
  name: 'name',
  'n.': 'name',
  elem: 'elem',
  'e.': 'elem',
  element: 'elem',
  symbol: 'elem',
  resn: 'resn',
  'r.': 'resn',
  resname: 'resn',
  resi: 'resi',
  'i.': 'resi',
  resid: 'resi',
  resv: 'resi',
  chain: 'chain',
  'c.': 'chain',
  alt: 'alt',
  altloc: 'alt',
  id: 'id',
  rank: 'rank',
  ss: 'ss',
}

/** Keywords that take a comparison operator and a number. */
export const COMPARE_KEYWORDS: Readonly<Record<string, string>> = {
  b: 'b',
  q: 'q',
  partial_charge: 'partial_charge',
  formal_charge: 'formal_charge',
}

/** Keywords that stand alone. */
export const MACRO_KEYWORDS = new Set([
  'all',
  '*',
  'none',
  'polymer',
  'polymer.protein',
  'polymer.nucleic',
  'protein',
  'nucleic',
  'water',
  'solvent',
  'hetatm',
  'organic',
  'inorganic',
  'hydro',
  'hydrogens',
  'backbone',
  'sidechain',
  'guide',
  'metals',
  'donors',
  'acceptors',
  'visible',
  'enabled',
  'bonded',
  'masked',
  'protected',
  'center',
  'origin',
])

const COMPARE_OPS = new Set(['<', '>', '=', '==', '<=', '>=', '!='])

function isAnd(t: string): boolean {
  return t === 'and' || t === '&'
}

function isOr(t: string): boolean {
  return t === 'or' || t === '|' || t === '+'
}

function isNot(t: string): boolean {
  return t === 'not' || t === '!'
}

/** `around` and its abbreviation, and the same for `expand`. */
function proxOp(t: string): 'around' | 'expand' | null {
  if (t === 'around' || t === 'a.') return 'around'
  if (t === 'expand' || t === 'x.') return 'expand'
  return null
}

function isByres(t: string): boolean {
  return t === 'byres' || t === 'br.'
}

/**
 * Two-set and neighbour operators PyMOL has and CueMol does not.
 *
 * Named here so they are rejected by name rather than read as an object
 * called `within`, which would look like it worked and select nothing.
 */
const UNSUPPORTED_OPS: Readonly<Record<string, string>> = {
  within: 'within: CueMol has no directional two-set operator (try "around")',
  beyond: 'beyond: CueMol has no directional two-set operator',
  near_to: 'near_to: CueMol has no directional two-set operator (try "around")',
  in: 'in: CueMol has no "in" operator',
  like: 'like: CueMol has no "like" operator',
  neighbor: 'neighbor: parsed by CueMol but never implemented, so it would select nothing',
  'nbr.': 'neighbor: parsed by CueMol but never implemented, so it would select nothing',
  extend: 'extend: parsed by CueMol but never implemented, so it would select nothing',
  first: 'first: CueMol has no "first" operator',
  last: 'last: CueMol has no "last" operator',
  bound_to: 'bound_to: CueMol has no "bound_to" operator',
  byobject: 'byobject: CueMol has no "byobject" operator',
  bysegi: 'bysegi: CueMol has no segment identifiers',
  bychain: 'bychain: CueMol has no "bychain" operator',
  bycalpha: 'bycalpha: CueMol has no "bycalpha" operator',
  bymolecule: 'bymolecule: CueMol has no "bymolecule" operator',
  gap: 'gap: CueMol has no "gap" operator',
}

/** Properties PyMOL has that CueMol's selection language does not. */
const UNSUPPORTED_PROPS: Readonly<Record<string, string>> = {
  segi: 'segi: CueMol has no segment identifiers',
  's.': 'segi: CueMol has no segment identifiers',
  index: 'index: use "id" (CueMol "aid") instead',
  model: 'model: name the object directly instead',
  'm.': 'model: name the object directly instead',
  x: 'x: CueMol cannot select on coordinates',
  y: 'y: CueMol cannot select on coordinates',
  z: 'z: CueMol cannot select on coordinates',
  flag: 'flag: CueMol has no atom flags',
  f: 'flag: CueMol has no atom flags',
  rep: 'rep: CueMol has no per-atom representation flags',
  color: 'color: CueMol cannot select on colour',
  pepseq: 'pepseq: CueMol has no sequence selection',
  ps: 'pepseq: CueMol has no sequence selection',
  text_type: 'text_type: CueMol has no text type',
  numeric_type: 'numeric_type: CueMol has no numeric type',
  stereo: 'stereo: CueMol has no stereo selection',
}

class Parser {
  private at = 0

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.at]
  }

  private word(): string | null {
    const t = this.peek()
    return t && t.kind === 'word' ? t.text.toLowerCase() : null
  }

  private take(): Token {
    const t = this.tokens[this.at]
    this.at += 1
    return t
  }

  private end(): number {
    const last = this.tokens[this.tokens.length - 1]
    return last ? last.pos + last.text.length : 0
  }

  /** The whole expression. */
  parse(): SelNode {
    const node = this.parseByres()
    const rest = this.peek()
    if (rest) {
      // An operator with no CueMol counterpart stops here rather than in
      // parsePrimary, because it sits where an operator goes. Naming it beats
      // "unexpected", which would leave the user guessing whether they had
      // mistyped it.
      const reason = rest.kind === 'word' ? UNSUPPORTED_OPS[rest.text.toLowerCase()] : undefined
      throw new SelParseError(reason ?? `unexpected "${rest.text}"`, rest.pos)
    }
    return node
  }

  private parseByres(): SelNode {
    const w = this.word()
    if (w !== null && isByres(w)) {
      this.take()
      return { kind: 'byres', operand: this.parseByres() }
    }
    return this.parseProx()
  }

  private parseProx(): SelNode {
    let node = this.parseOr()
    for (;;) {
      const w = this.word()
      if (w === null) break
      const op = proxOp(w)
      if (op === null) break
      const opToken = this.take()
      const distance = this.peek()
      if (!distance || distance.kind !== 'word' || !/^-?\d+(\.\d+)?$/.test(distance.text)) {
        throw new SelParseError(`${op} needs a distance`, opToken.pos)
      }
      this.take()
      node = { kind: 'prox', op, operand: node, distance: distance.text }
    }
    return node
  }

  private parseOr(): SelNode {
    let node = this.parseAnd()
    for (;;) {
      const w = this.word()
      if (w === null || !isOr(w)) break
      this.take()
      node = { kind: 'or', left: node, right: this.parseAnd() }
    }
    return node
  }

  private parseAnd(): SelNode {
    let node = this.parseNot()
    for (;;) {
      const w = this.word()
      if (w === null) break
      if (isAnd(w)) {
        this.take()
        node = { kind: 'and', left: node, right: this.parseNot() }
        continue
      }
      // A lone `-` subtracts, at the same priority as `and`. Inside a word it
      // is a range or a sign, and never reaches here.
      if (w === '-') {
        this.take()
        node = { kind: 'sub', left: node, right: this.parseNot() }
        continue
      }
      break
    }
    return node
  }

  private parseNot(): SelNode {
    const w = this.word()
    if (w !== null && isNot(w)) {
      this.take()
      return { kind: 'not', operand: this.parseNot() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): SelNode {
    const t = this.peek()
    if (!t) throw new SelParseError('the expression ends early', this.end())

    if (t.kind === 'lparen') {
      this.take()
      const inner = this.parseByres()
      const close = this.peek()
      if (!close || close.kind !== 'rparen') {
        throw new SelParseError('missing ")"', t.pos)
      }
      this.take()
      return inner
    }
    if (t.kind === 'rparen') throw new SelParseError('unexpected ")"', t.pos)

    const raw = t.text
    const key = raw.toLowerCase()

    const opReason = UNSUPPORTED_OPS[key]
    if (opReason !== undefined) throw new SelParseError(opReason, t.pos)
    const propReason = UNSUPPORTED_PROPS[key]
    if (propReason !== undefined) throw new SelParseError(propReason, t.pos)

    if (MACRO_KEYWORDS.has(key)) {
      this.take()
      return { kind: 'macro', keyword: key, pos: t.pos }
    }

    const compare = COMPARE_KEYWORDS[key]
    if (compare !== undefined) {
      this.take()
      const opTok = this.peek()
      if (!opTok || opTok.kind !== 'word' || !COMPARE_OPS.has(opTok.text)) {
        throw new SelParseError(`${key} needs a comparison, e.g. "${key} < 30"`, t.pos)
      }
      this.take()
      const valTok = this.peek()
      if (!valTok || valTok.kind !== 'word') {
        throw new SelParseError(`${key} needs a value`, opTok.pos)
      }
      this.take()
      return {
        kind: 'compare',
        keyword: compare,
        op: opTok.text,
        value: valTok.text,
        pos: t.pos,
      }
    }

    const prop = PROP_KEYWORDS[key]
    if (prop !== undefined) {
      this.take()
      const valTok = this.peek()
      if (!valTok || valTok.kind !== 'word') {
        throw new SelParseError(`${key} needs a value`, t.pos)
      }
      this.take()
      return { kind: 'prop', keyword: prop, value: valTok.text, pos: valTok.pos }
    }

    if (raw.includes('/')) {
      throw new SelParseError(
        'slash notation is not supported; write "chain A and resi 10 and name CA"',
        t.pos,
      )
    }

    this.take()
    // PyMOL's `%name` forces the name reading; CueMol takes the bare name.
    return { kind: 'name', name: raw.startsWith('%') ? raw.slice(1) : raw, pos: t.pos }
  }
}

/** Parse a PyMOL selection expression. Throws `SelParseError`. */
export function parseSelection(expr: string): SelNode {
  const tokens = tokenize(expr)
  if (tokens.length === 0) throw new SelParseError('the selection is empty', 0)
  return new Parser(tokens).parse()
}
