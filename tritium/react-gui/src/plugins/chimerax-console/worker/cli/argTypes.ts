/**
 * @file plugins/chimerax-console/worker/cli/argTypes.ts
 * @description ChimeraX's argument types (cli.py Annotations), as the console reads them.
 *
 * Each type reads its value from the front of the text and says what is
 * left, taking as much as it can, as a cli.py Annotation does. A type that
 * cannot read anything there returns null, which lets an optional argument
 * pass (`color red`: the specification is absent, `red` is the colour).
 *
 * The value handed on is a string, normalised: an enum's full value, a
 * boolean as `true` / `false`, a colour as `#rrggbb`, a specification as its
 * text (commands translate it), a file name with its quotes removed and
 * nothing unescaped.
 */

import { colorArgValue, colorNames, readColor } from '../colors'
import { parseSpec, SpecError } from '../spec/parse'
import { isSelector, selectorNames } from '../spec/selectors'
import { nextToken, unescape } from './tokens'

/** A value read, and the text after it (leading white space removed). */
export interface ArgRead {
  value: string
  rest: string
}

/** A value that starts but is malformed; the message is shown with a caret at `pos` of the text given. */
export class ArgError extends Error {
  constructor(
    message: string,
    readonly pos: number,
  ) {
    super(message)
  }
}

/** One argument type. */
export interface ArgType {
  /** How the usage line names it (`a color`, `an atom specification`). */
  name: string
  /**
   * Read a value from the front of `text` (no leading white space).
   *
   * @returns null when no value of this type starts there
   * @throws ArgError for a value that starts but is malformed
   */
  parse(text: string): ArgRead | null
  /** The values Tab offers, when the type has a fixed set. */
  values?: () => readonly string[]
  /** The value is a file path (Tab lists files). */
  isPath?: boolean
  /**
   * An optional argument of this type may be absent without ending the
   * optional ones (cli.py `Or(ObjectsArg, EmptyArg)`): `color red` has no
   * specification, and `red` goes on to the colour.
   */
  mayBeEmpty?: boolean
}

const trimStart = (s: string) => s.replace(/^\s+/, '')

/** A word read as-is, with escapes converted. */
export const StringArg: ArgType = {
  name: 'a text string',
  parse(text) {
    const t = nextToken(text)
    return t ? { value: t.quoted ? unescape(t.value) : t.value, rest: t.rest } : null
  },
}

/** A file name: quotes removed, `~` left for the path resolver, no escapes converted (cli.py:1208). */
export const FileNameArg: ArgType = {
  name: 'a file name',
  isPath: true,
  parse(text) {
    const t = nextToken(text)
    return t ? { value: t.value, rest: t.rest } : null
  },
}

/** Everything left on the line. */
export const RestOfLine: ArgType = {
  name: 'the rest of line',
  parse(text) {
    return { value: text.trim(), rest: '' }
  },
}

/** `true` / `false` or a prefix of them, `1` / `0`, `on` / `off` (cli.py BoolArg). */
export const BoolArg: ArgType = {
  name: 'true or false',
  values: () => ['true', 'false'],
  parse(text) {
    const t = nextToken(text)
    if (!t) return null
    const w = t.value.toLowerCase()
    if (w === '1' || w === 'on' || (w !== '' && 'true'.startsWith(w))) return { value: 'true', rest: t.rest }
    if (w === '0' || w === 'off' || (w !== '' && 'false'.startsWith(w))) return { value: 'false', rest: t.rest }
    return null
  },
}

/** A number. */
function numberArg(name: string, re: RegExp): ArgType {
  return {
    name,
    parse(text) {
      const t = nextToken(text)
      return t && re.test(t.value) ? { value: String(Number(t.value)), rest: t.rest } : null
    },
  }
}

export const IntArg = numberArg('an integer', /^[-+]?\d+$/)
export const FloatArg = numberArg('a number', /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/)

/**
 * One of `values`: an exact match (case ignored) first, else the one value
 * the word is a prefix of (cli.py EnumOf); a prefix of several is an error.
 */
export function EnumOf(values: readonly string[]): ArgType {
  return {
    name: `one of ${values.join(', ')}`,
    values: () => values,
    parse(text) {
      const t = nextToken(text)
      if (!t) return null
      const w = unescape(t.value).toLowerCase()
      const exact = values.find((v) => v.toLowerCase() === w)
      if (exact) return { value: exact, rest: t.rest }
      const hits = w === '' ? [] : values.filter((v) => v.toLowerCase().startsWith(w))
      if (hits.length === 1) return { value: hits[0], rest: t.rest }
      if (hits.length > 1) throw new ArgError(`"${t.value}" is ambiguous: ${hits.join(', ')}`, 0)
      return null
    },
  }
}

/** The first of `types` that reads a value. */
export function Or(...types: ArgType[]): ArgType {
  return {
    name: types.map((t) => t.name).join(' or '),
    values: () => types.flatMap((t) => t.values?.() ?? []),
    isPath: types.some((t) => t.isPath),
    parse(text) {
      for (const t of types) {
        const r = t.parse(text)
        if (r) return r
      }
      return null
    },
  }
}

/** A keyword that takes no value (`NoArg`). */
export const NoArg: ArgType = {
  name: '',
  parse(text) {
    return { value: 'true', rest: text }
  },
}

/** A colour (`ColorArg`), as `#rrggbb` (`#rrggbb@alpha` when it states one; `splitColorArg`). */
export const ColorArg: ArgType = {
  name: 'a color',
  values: colorNames,
  parse(text) {
    const c = readColor(text)
    // An alpha the colour states travels with it, so the command can warn that it is dropped.
    return c ? { value: colorArgValue(c), rest: trimStart(c.rest) } : null
  },
}

/**
 * An atom specification (`ObjectsArg`): as much of the text as is one. Its
 * text is the value; commands translate it per object (`spec/emit.ts`).
 */
export const SpecArg: ArgType = {
  name: 'an atom specification',
  values: selectorNames,
  mayBeEmpty: true,
  parse(text) {
    let read: ReturnType<typeof parseSpec>
    try {
      read = parseSpec(text, isSelector)
    } catch (e) {
      if (e instanceof SpecError) throw new ArgError(e.message, e.pos)
      throw e
    }
    if (!read) return null
    return { value: text.slice(0, read.consumed), rest: trimStart(text.slice(read.consumed)) }
  },
}

/** Comma-separated values of one type, given as one argument (`a,b,c`, spaces allowed after commas). */
export function ListOf(type: ArgType): ArgType {
  return {
    name: `a list of ${type.name}`,
    values: type.values,
    parse(text) {
      const values: string[] = []
      let rest = text
      for (;;) {
        const r = type.parse(rest)
        if (!r) return null
        values.push(r.value)
        if (!r.rest.startsWith(',')) return { value: values.join(','), rest: r.rest }
        rest = trimStart(r.rest.slice(1))
      }
    },
  }
}
