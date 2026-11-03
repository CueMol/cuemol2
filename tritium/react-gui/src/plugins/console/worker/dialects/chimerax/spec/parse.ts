/**
 * @file plugins/console/worker/dialects/chimerax/spec/parse.ts
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
 * Parts ChimeraX has that the console does not translate yet -- sub-models
 * (`#1.2`), zones (`@<5`), attribute tests (`@@bfactor>50`), `[...]`
 * wildcards -- are read and refused here with a caret, so supporting one
 * later is a change to the emitter, not to the grammar.
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

/** `:residues@atoms` -- null for either means "every". */
export interface ResidueGroup {
  residues: ResiduePart[] | null
  atoms: string[] | null
}

/** `/chains` with its residue groups -- null chains means "every chain". */
export interface ChainGroup {
  chains: string[] | null
  residues: ResidueGroup[]
}

/** One parsed specification. */
export type SpecNode =
  | { kind: 'and' | 'or'; left: SpecNode; right: SpecNode }
  | { kind: 'not'; term: SpecNode }
  | { kind: 'selector'; name: string; pos: number }
  /** A hierarchy item: models (null = all) and the chain groups under them (empty = everything in them). */
  | { kind: 'hier'; models: ModelRange[] | null; chains: ChainGroup[] }

/** What `parseSpec` read: the tree, and how much of the text it took. */
export interface SpecParse {
  node: SpecNode
  /** Characters taken from the start of the text (trailing white space not included). */
  consumed: number
}

/** A model number: up to 5 digits not followed by a hex digit, so `#ff0000` stays a colour. */
const MODEL_NUM = /^(\d{1,5})(?![0-9A-Fa-f])/
/** A chain id, residue or atom name, as `part_range` allows (without `[...]`, refused separately). */
const PART = /^-?[A-Za-z0-9_'"*?]+/
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
    if (c === '(' || c === '~' || c === '/' || c === ':' || c === '@') return true
    if (c === '#') return this.peek(2) === '#!' || MODEL_NUM.test(this.text.slice(this.pos + 1)) || this.peek(2) === '#*'
    const word = SELECTOR.exec(this.rest())
    return word !== null && this.isSelector(word[0]) && !/^[^\s&|()]/.test(this.text.slice(this.pos + word[0].length))
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
      this.zoneCheck()
      return inner
    }
    if (c === '~') {
      this.pos++
      this.skipSpace()
      if (!this.termStarts()) this.fail('a specification is expected after "~"')
      return { kind: 'not', term: this.term() }
    }
    if (c === '#' || c === '/' || c === ':' || c === '@') return this.hier()
    const word = SELECTOR.exec(this.rest())
    if (word && this.isSelector(word[0])) {
      const pos = this.pos
      this.pos += word[0].length
      this.zoneCheck()
      return { kind: 'selector', name: word[0], pos }
    }
    return this.fail('a specification is expected here')
  }

  /** Refuse a zone (`@<5`) after a term. */
  zoneCheck(): void {
    if (/^[@:/#][<>]/.test(this.rest())) this.unsupported('a zone')
  }

  hier(): SpecNode {
    let models: ModelRange[] | null = null
    if (this.peek() === '#') {
      if (this.peek(2) === '##') this.unsupported('a model attribute test')
      if (this.peek(2) === '#!') this.unsupported('"#!"')
      this.pos++
      models = this.modelList()
      if (this.peek() === '.' && /^\.[\d*]/.test(this.rest())) this.unsupported('a sub-model')
    }
    const chains: ChainGroup[] = []
    // Residues or atoms with no chain before them belong to every chain.
    if (this.peek() === ':' || this.peek() === '@') chains.push({ chains: null, residues: this.residueGroups() })
    while (this.peek() === '/') {
      if (this.peek(2) === '//') this.unsupported('a chain attribute test')
      this.pos++
      chains.push({ chains: this.partList('chain').map((p) => p.start), residues: this.residueGroups() })
    }
    this.zoneCheck()
    return { kind: 'hier', models, chains }
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
      if (this.peek() === ':') {
        if (this.peek(2) === '::') this.unsupported('a residue attribute test')
        this.pos++
        out.push({ residues: this.partList('residue'), atoms: this.atomList() })
      } else if (this.peek() === '@' && !/^@[<>]/.test(this.rest())) {
        out.push({ residues: null, atoms: this.atomList() })
      } else {
        return out
      }
    }
  }

  atomList(): string[] | null {
    if (this.peek() !== '@') return null
    if (this.peek(2) === '@@') this.unsupported('an atom attribute test')
    if (/^@[<>]/.test(this.rest())) return null
    this.pos++
    return this.partList('atom').map((p) => {
      if (p.end !== null) this.fail('an atom name range is not allowed', p.pos)
      return p.start
    })
  }

  /** A comma-separated list of names or ranges (`A,B`, `10-20,30`). */
  partList(what: string): ResiduePart[] {
    const out: ResiduePart[] = []
    for (;;) {
      if (this.peek() === '[') this.unsupported('a "[...]" wildcard')
      const pos = this.pos
      const start = PART.exec(this.rest())
      if (!start) this.fail(`a ${what} is expected`)
      this.pos += start[0].length
      let end: string | null = null
      // A range: `10-20`, `-5--1`. A dash already taken by PART (`-5`) is a sign.
      if (this.peek() === '-' && /^-[-A-Za-z0-9_'"*?]/.test(this.rest())) {
        this.pos++
        const e = PART.exec(this.rest())
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
