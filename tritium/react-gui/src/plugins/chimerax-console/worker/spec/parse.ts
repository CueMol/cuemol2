/**
 * @file plugins/chimerax-console/worker/spec/parse.ts
 * @description Reading a ChimeraX atom specification (`#1/A:10-20@CA & protein`).
 *
 * A recursive-descent reading of `core/src/commands/_atomspec.peg`:
 *
 *   spec   = term (('&' | '|') spec)?          -- right associative, no precedence
 *   term   = '(' spec ')' | '~' term | selector | hier+
 *   hier   = ['#' models] ['/' chains [':' residues ['@' atoms]]...]...
 *
 * Words separated by white space are a union (`#1 #2`), as in ChimeraX.
 *
 * The reader takes as much of the text as is a specification and says where
 * it stopped, because the specification is one argument among others
 * (`color #1 red`): `#ff0000` is a colour, not model 255, and a word that is
 * not a selector (`red`) ends the specification.
 *
 * Zones (`:ALA :< 5`), attribute tests (`@@bfactor>50`, `::name=ALA`) and
 * the `*` `?` `[...]` wildcards are read here and translated by the emitter,
 * which also refuses (with a caret) the attributes CueMol has no counterpart
 * for. Sub-models (`#1.2`) are refused here: CueMol objects are not nested.
 */

/** A specification that cannot be read, or uses a part not supported yet. */
export class SpecError extends Error {
  constructor(
    message: string,
    /** Offset in the text where the problem is. */
    readonly pos: number,
  ) {
    super(message)
  }
}

/** A model number or range: `#1`, `#3-5`, `#*`. Null ends mean open (`*`). */
export interface ModelRange {
  start: number | null
  end: number | null
}

/** One residue part, raw: a number (`10`, `10A`, `-5`), a name (`ALA`), or a range of them (`10-20`). */
export interface ResiduePart {
  start: string
  end: string | null
  /** Offset in the text, for errors. */
  pos: number
}

/**
 * One attribute test (`bfactor>50`, `name=ALA`, `is_helix`, `^is_helix`).
 * `op` and `value` are null for a bare (true) or `^` (false) test.
 */
export interface AttrTest {
  name: string
  op: string | null
  value: string | null
  /** True for `^name`. */
  negated: boolean
  pos: number
}

/** `:residues::tests@atoms@@tests` -- null residues / atoms means "every", null tests means none. */
export interface ResidueGroup {
  residues: ResiduePart[] | null
  residueTests: AttrTest[] | null
  atoms: ResiduePart[] | null
  atomTests: AttrTest[] | null
}

/** `/chains//tests` with its residue groups -- null chains means "every chain". */
export interface ChainGroup {
  chains: ResiduePart[] | null
  chainTests: AttrTest[] | null
  residues: ResidueGroup[]
}

/** Which level a zone widens to: atoms, residues, chains or models. */
export type ZoneLevel = '@' | ':' | '/' | '#'

/** One parsed specification. */
export type SpecNode =
  | { kind: 'and' | 'or'; left: SpecNode; right: SpecNode }
  | { kind: 'not'; term: SpecNode }
  | { kind: 'selector'; name: string; pos: number }
  /** A hierarchy item: models (null = all) and the chain groups under them (empty = everything in them). */
  | { kind: 'hier'; models: ModelRange[] | null; modelTests: AttrTest[] | null; chains: ChainGroup[] }
  /** `term @< 5`: what lies within (`<`) or beyond (`>`) `dist` of `term`, widened to `level`. */
  | { kind: 'zone'; term: SpecNode; level: ZoneLevel; op: '<' | '>'; dist: number; pos: number }

/** What `parseSpec` read: the tree, and how much of the text it took. */
export interface SpecParse {
  node: SpecNode
  /** Characters taken from the start of the text (trailing white space not included). */
  consumed: number
}

/** A model number: up to 5 digits not followed by a hex digit, so `#ff0000` stays a colour. */
const MODEL_NUM = /^(\d{1,5})(?![0-9A-Fa-f])/
/** A chain id, residue or atom name, as `part_range` allows (`*` `?` `[...]` are wildcards). */
const PART = /^-?[A-Za-z0-9_'"*?[\]\\]+/
/** The end of a range: no wildcard brackets, as `part_range_list` has it. */
const PART_END = /^[-A-Za-z0-9_'"\\]+/
/** A zone: `@<`, `:>`, ... and a distance. */
const ZONE = /^([@:/#])([<>])\s*([0-9]*\.?[0-9]+)/
/** An attribute test operator, longest first. */
const ATTR_OP = /^(>=|<=|!==|!=|==|<>|>|<|=)/
/** A selector name. */
const SELECTOR = /^[A-Za-z_][-+A-Za-z0-9_]*/

class Reader {
  pos = 0

  constructor(
    readonly text: string,
    readonly isSelector: (name: string) => boolean,
  ) {}

  rest(): string {
    return this.text.slice(this.pos)
  }

  skipSpace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++
  }

  peek(n = 1): string {
    return this.text.slice(this.pos, this.pos + n)
  }

  fail(message: string, at = this.pos): never {
    throw new SpecError(message, at)
  }

  unsupported(what: string, at = this.pos): never {
    this.fail(`${what} is not supported yet`, at)
  }

  /** Whether a term starts here (without taking it). */
  termStarts(): boolean {
    const c = this.peek()
    if (this.atZone()) return false
    if (c === '(' || c === '~' || c === '/' || c === ':' || c === '@') return true
    if (c === '#') {
      return this.peek(2) === '#!' || this.peek(2) === '##' || MODEL_NUM.test(this.text.slice(this.pos + 1)) || this.peek(2) === '#*'
    }
    const word = SELECTOR.exec(this.rest())
    if (word === null || !this.isSelector(word[0])) return false
    // A selector is a whole word: `ligand` but not `ligandX`; a zone may follow at once (`ligand:<5`).
    const after = this.text.slice(this.pos + word[0].length)
    return !/^[^\s&|()]/.test(after) || /^[@:/#][<>]/.test(after)
  }

  spec(): SpecNode {
    const left = this.union()
    const save = this.pos
    this.skipSpace()
    const op = this.peek()
    if (op === '&' || op === '|') {
      this.pos++
      this.skipSpace()
      if (!this.termStarts()) this.fail(`a specification is expected after "${op}"`)
      return { kind: op === '&' ? 'and' : 'or', left, right: this.spec() }
    }
    this.pos = save
    return left
  }

  /** Terms separated by white space: their union. */
  union(): SpecNode {
    let node = this.term()
    for (;;) {
      const save = this.pos
      this.skipSpace()
      if (this.pos === save || !this.termStarts()) {
        this.pos = save
        return node
      }
      node = { kind: 'or', left: node, right: this.term() }
    }
  }

  term(): SpecNode {
    const c = this.peek()
    if (c === '(') {
      this.pos++
      this.skipSpace()
      const inner = this.spec()
      this.skipSpace()
      if (this.peek() !== ')') this.fail('")" is missing')
      this.pos++
      return this.zoneAfter(inner)
    }
    if (c === '~') {
      this.pos++
      this.skipSpace()
      if (!this.termStarts()) this.fail('a specification is expected after "~"')
      return { kind: 'not', term: this.term() }
    }
    if (c === '#' || c === '/' || c === ':' || c === '@') return this.zoneAfter(this.hier())
    const word = SELECTOR.exec(this.rest())
    if (word && this.isSelector(word[0])) {
      const pos = this.pos
      this.pos += word[0].length
      return this.zoneAfter({ kind: 'selector', name: word[0], pos })
    }
    return this.fail('a specification is expected here')
  }

  /** A zone (`@< 5`) after a term, which then applies to it; white space before it is allowed. */
  zoneAfter(term: SpecNode): SpecNode {
    const save = this.pos
    this.skipSpace()
    const m = ZONE.exec(this.rest())
    if (!m) {
      this.pos = save
      return term
    }
    const pos = this.pos
    this.pos += m[0].length
    return this.zoneAfter({ kind: 'zone', term, level: m[1] as ZoneLevel, op: m[2] as '<' | '>', dist: Number(m[3]), pos })
  }

  /** Whether a zone operator starts here, so `@<` is not read as atoms nor `/<` as chains. */
  atZone(): boolean {
    return /^[@:/#][<>]/.test(this.rest())
  }

  /** `name>=value,name2,...` after `@@` / `::` / `//` / `##` (which the caller has taken). */
  attrTests(): AttrTest[] {
    const out: AttrTest[] = []
    for (;;) {
      const pos = this.pos
      const negated = this.peek() === '^'
      if (negated) this.pos++
      const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.rest())
      if (!name) this.fail('an attribute name is expected')
      this.pos += name[0].length
      let op: string | null = null
      let value: string | null = null
      const o = negated ? null : ATTR_OP.exec(this.rest())
      if (o) {
        op = o[1]
        this.pos += op.length
        const v = /^"([^"]*)"|^'([^']*)'|^([^,#/:@\s]+)/.exec(this.rest())
        if (!v) this.fail('an attribute value is expected')
        this.pos += v[0].length
        value = v[1] ?? v[2] ?? v[3]
      }
      out.push({ name: name[0], op, value, negated, pos })
      if (this.peek() !== ',') return out
      this.pos++
    }
  }

  hier(): SpecNode {
    let models: ModelRange[] | null = null
    let modelTests: AttrTest[] | null = null
    if (this.peek() === '#' && !this.atZone()) {
      if (this.peek(2) === '#!') this.unsupported('"#!"')
      if (this.peek(2) !== '##') {
        this.pos++
        models = this.modelList()
        if (this.peek() === '.' && /^\.[\d*]/.test(this.rest())) this.unsupported('a sub-model')
      }
      if (this.peek(2) === '##') {
        this.pos += 2
        modelTests = this.attrTests()
      }
    }
    const chains: ChainGroup[] = []
    // Residues or atoms with no chain before them belong to every chain.
    if ((this.peek() === ':' || this.peek() === '@') && !this.atZone()) {
      chains.push({ chains: null, chainTests: null, residues: this.residueGroups() })
    }
    while (this.peek() === '/' && !this.atZone()) {
      let parts: ResiduePart[] | null = null
      if (this.peek(2) !== '//') {
        this.pos++
        parts = this.partList('chain')
      }
      let chainTests: AttrTest[] | null = null
      if (this.peek(2) === '//') {
        this.pos += 2
        chainTests = this.attrTests()
      }
      chains.push({ chains: parts, chainTests, residues: this.residueGroups() })
    }
    return { kind: 'hier', models, modelTests, chains }
  }

  modelList(): ModelRange[] {
    const out: ModelRange[] = []
    for (;;) {
      out.push(this.modelRange())
      if (this.peek() !== ',') return out
      this.pos++
    }
  }

  modelRange(): ModelRange {
    const one = (): number | null => {
      if (this.peek() === '*') {
        this.pos++
        return null
      }
      const m = MODEL_NUM.exec(this.rest())
      if (!m) this.fail('a model number is expected')
      this.pos += m[1].length
      return Number(m[1])
    }
    const start = one()
    if (this.peek() === '-') {
      this.pos++
      return { start, end: one() }
    }
    return { start, end: start }
  }

  residueGroups(): ResidueGroup[] {
    const out: ResidueGroup[] = []
    for (;;) {
      if (this.peek() === ':' && !this.atZone()) {
        let residues: ResiduePart[] | null = null
        if (this.peek(2) !== '::') {
          this.pos++
          residues = this.partList('residue')
        }
        let residueTests: AttrTest[] | null = null
        if (this.peek(2) === '::') {
          this.pos += 2
          residueTests = this.attrTests()
        }
        out.push({ residues, residueTests, ...this.atomPart() })
      } else if (this.peek() === '@' && !this.atZone()) {
        out.push({ residues: null, residueTests: null, ...this.atomPart() })
      } else {
        return out
      }
    }
  }

  /** `@atoms@@tests`, either part optional. */
  atomPart(): { atoms: ResiduePart[] | null; atomTests: AttrTest[] | null } {
    if (this.peek() !== '@' || this.atZone()) return { atoms: null, atomTests: null }
    let atoms: ResiduePart[] | null = null
    if (this.peek(2) !== '@@') {
      this.pos++
      atoms = this.partList('atom')
      for (const p of atoms) if (p.end !== null) this.fail('an atom name range is not allowed', p.pos)
    }
    let atomTests: AttrTest[] | null = null
    if (this.peek(2) === '@@') {
      this.pos += 2
      atomTests = this.attrTests()
    }
    return { atoms, atomTests }
  }

  /** A comma-separated list of names or ranges (`A,B`, `10-20,30`). */
  partList(what: string): ResiduePart[] {
    const out: ResiduePart[] = []
    for (;;) {
      const pos = this.pos
      const start = PART.exec(this.rest())
      if (!start) this.fail(`a ${what} is expected`)
      this.pos += start[0].length
      let end: string | null = null
      // A range: `10-20`, `-5--1`. A dash already taken by PART (`-5`) is a sign.
      if (this.peek() === '-' && /^-[-A-Za-z0-9_'"\\]/.test(this.rest())) {
        this.pos++
        const e = PART_END.exec(this.rest())
        if (!e) this.fail(`the end of a ${what} range is expected`)
        this.pos += e[0].length
        end = e[0]
      }
      out.push({ start: start[0], end, pos })
      if (this.peek() !== ',') return out
      this.pos++
    }
  }
}

/**
 * Read the specification at the start of `text`.
 *
 * @param isSelector - whether a word is a selector name (`protein`, `C`)
 * @returns the tree and how much it took, or null when no specification
 *   starts there (the argument is then something else, or absent)
 * @throws SpecError for a specification that starts but is malformed, or
 *   uses a part not supported yet
 */
export function parseSpec(text: string, isSelector: (name: string) => boolean): SpecParse | null {
  const r = new Reader(text, isSelector)
  r.skipSpace()
  if (!r.termStarts()) return null
  const node = r.spec()
  return { node, consumed: r.pos }
}
