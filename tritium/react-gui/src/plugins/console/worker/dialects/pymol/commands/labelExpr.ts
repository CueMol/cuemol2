/**
 * @file plugins/console/worker/dialects/pymol/commands/labelExpr.ts
 * @description PyMOL `label` expressions as CueMol label formats.
 *
 * PyMOL evaluates the expression as Python for every atom. CueMol has a
 * label format of its own, applied by the label renderer in C++
 * (`molstr/LabelFormat`, `{resn}{resi}`, `{bfac:.2f}`), so this only
 * rewrites the expression into that format; no value is computed here.
 *
 * What is understood is the shape PyMOL's own examples use: atom attributes,
 * quoted strings, `+` between them, `str(x)`, and a `%` format -- `"%s-%s" %
 * (resn, resi)`, `"%.2f" % b`. Anything else is refused with the reason.
 * A quoted string with a CueMol field in it (`"{resn}{resi}"`) is taken as a
 * CueMol format and passed on as it is.
 */

/** PyMOL's attribute names, as CueMol's label format spells them. */
const FIELDS: Readonly<Record<string, string>> = {
  name: 'name',
  resn: 'resn',
  resi: 'resi',
  // PyMOL's resv is resi as a number; CueMol keeps the number with the
  // insertion code, which formats the same when there is none.
  resv: 'resi',
  chain: 'chain',
  elem: 'elem',
  b: 'bfac',
  q: 'occ',
  alt: 'alt',
  ID: 'aid',
  model: 'molname',
  // CueMol's own names, for someone who knows them.
  bfac: 'bfac',
  occ: 'occ',
  aid: 'aid',
  molname: 'molname',
}

/** Fields whose value is a number, for which `%d` / `%f` keep their spec. */
const NUMERIC = new Set(['bfac', 'occ', 'aid'])

/** A translation, or why it could not be done. */
export type LabelFormatResult = { ok: true; format: string } | { ok: false; error: string }

function fail(error: string): LabelFormatResult {
  return { ok: false, error: `Error: label: ${error}` }
}

/** Literal text, with the braces a CueMol format would read doubled. */
function escapeLiteral(text: string): string {
  return text.replace(/\{/g, '{{').replace(/\}/g, '}}')
}

/** A token of the expression. */
type Token =
  | { kind: 'str'; value: string }
  | { kind: 'id'; value: string }
  | { kind: 'op'; value: '+' | '%' | '(' | ')' | ',' }

function tokenize(expr: string): Token[] | string {
  const out: Token[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (/\s/.test(c)) {
      i++
    } else if (c === '"' || c === "'") {
      const end = expr.indexOf(c, i + 1)
      if (end < 0) return `the string starting at ${i + 1} is not closed`
      out.push({ kind: 'str', value: expr.slice(i + 1, end) })
      i = end + 1
    } else if ('+%(),'.includes(c)) {
      out.push({ kind: 'op', value: c as '+' | '%' | '(' | ')' | ',' })
      i++
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(expr.slice(i))
      if (!m) return `unexpected "${c}" at ${i + 1}`
      out.push({ kind: 'id', value: m[0] })
      i += m[0].length
    } else {
      return `"${c}" at ${i + 1} is not understood (only attributes, strings, + and % are)`
    }
  }
  return out
}

/** The CueMol field an attribute name stands for, or an error. */
function fieldOf(id: string): string | { error: string } {
  const f = FIELDS[id]
  if (f !== undefined) return f
  return {
    error:
      `"${id}" is not available here ` +
      '(name, resn, resi, resv, chain, elem, b, q, alt, ID, model)',
  }
}

/**
 * One printf conversion as a CueMol field with a std::format spec.
 *
 * printf right-aligns by default and std::format left-aligns strings, so a
 * width becomes an explicit `>`; `-` becomes `<`.
 */
function convertSpec(conv: string, field: string): string | { error: string } {
  const m = /^%(-)?(0)?(\d+)?(?:\.(\d+))?([sdifeg])$/.exec(conv)
  if (!m) return { error: `"${conv}" is not a format this understands (%s, %d, %f, with width / precision)` }
  const [, left, zero, width, prec, type] = m
  const numeric = NUMERIC.has(field)
  // A number format on a text field: PyMOL would convert, CueMol cannot.
  if (!numeric && type !== 's' && (prec !== undefined || zero)) {
    return { error: `"${conv}" needs a number, and ${field} is text` }
  }
  const integer = type === 'd' || type === 'i'

  let spec = ''
  if (width) {
    // Zero padding is a number's; otherwise the alignment printf implies.
    spec += zero && numeric && !left ? `0${width}` : `${left ? '<' : '>'}${width}`
  }
  if (numeric) {
    // %d of a real rounds to an integer; its precision means nothing.
    if (integer) spec += field === 'aid' ? 'd' : '.0f'
    else if (type !== 's') spec += `${prec !== undefined ? `.${prec}` : ''}${type}`
  }
  return spec === '' ? `{${field}}` : `{${field}:${spec}}`
}

/** `"fmt" % args` as a CueMol format. */
function percentFormat(fmt: string, args: string[]): LabelFormatResult {
  let out = ''
  let argi = 0
  const re = /%%|%-?0?\d*(?:\.\d+)?[a-zA-Z]/g
  let last = 0
  for (let m = re.exec(fmt); m; m = re.exec(fmt)) {
    out += escapeLiteral(fmt.slice(last, m.index))
    last = m.index + m[0].length
    if (m[0] === '%%') {
      out += '%'
      continue
    }
    if (argi >= args.length) return fail(`more % conversions than values in "${fmt}"`)
    const field = fieldOf(args[argi++])
    if (typeof field !== 'string') return fail(field.error)
    const conv = convertSpec(m[0], field)
    if (typeof conv !== 'string') return fail(conv.error)
    out += conv
  }
  out += escapeLiteral(fmt.slice(last))
  if (argi !== args.length) return fail(`more values than % conversions in "${fmt}"`)
  return { ok: true, format: out }
}

/**
 * The CueMol label format for a PyMOL `label` expression.
 *
 * @returns `{ ok, format }`; an empty format means "remove the labels", as
 *   PyMOL's empty expression does.
 */
export function pymolLabelFormat(expression: string): LabelFormatResult {
  const trimmed = expression.trim()
  if (trimmed === '') return { ok: true, format: '' }
  const tokens = tokenize(trimmed)
  if (typeof tokens === 'string') return fail(tokens)

  // "fmt" % x   or   "fmt" % (x, y, ...)
  if (tokens.length >= 3 && tokens[0].kind === 'str' && tokens[1].kind === 'op' && tokens[1].value === '%') {
    const rest = tokens.slice(2)
    const ids: string[] = []
    if (rest.length === 1 && rest[0].kind === 'id') {
      ids.push(rest[0].value)
    } else if (rest[0].kind === 'op' && rest[0].value === '(' && rest[rest.length - 1].kind === 'op' && rest[rest.length - 1].value === ')') {
      const inner = rest.slice(1, -1)
      for (let i = 0; i < inner.length; i++) {
        const t = inner[i]
        if (i % 2 === 0) {
          if (t.kind !== 'id') return fail('the values after % have to be atom attributes')
          ids.push(t.value)
        } else if (!(t.kind === 'op' && t.value === ',')) {
          return fail('the values after % have to be separated by commas')
        }
      }
    } else {
      return fail('write the values after % as one attribute or (a, b, ...)')
    }
    return percentFormat(tokens[0].value, ids)
  }

  // A single string: literal text, or a CueMol format when it has fields.
  if (tokens.length === 1 && tokens[0].kind === 'str') {
    const s = tokens[0].value
    // Only a string with a field in it is a CueMol format; any other brace
    // is text.
    return { ok: true, format: /\{[A-Za-z][A-Za-z0-9_.]*(:[^{}]*)?\}/.test(s) ? s : escapeLiteral(s) }
  }

  // term + term + ...   where term is an attribute, a string, or str(attr)
  let out = ''
  let i = 0
  for (;;) {
    const t = tokens[i]
    if (!t) return fail('the expression ends with +')
    if (t.kind === 'str') {
      out += escapeLiteral(t.value)
      i += 1
    } else if (t.kind === 'id' && t.value === 'str' && tokens[i + 1]?.value === '(') {
      const arg = tokens[i + 2]
      if (arg?.kind !== 'id' || tokens[i + 3]?.value !== ')') return fail('str() takes one attribute')
      const field = fieldOf(arg.value)
      if (typeof field !== 'string') return fail(field.error)
      out += `{${field}}`
      i += 4
    } else if (t.kind === 'id') {
      const field = fieldOf(t.value)
      if (typeof field !== 'string') return fail(field.error)
      out += `{${field}}`
      i += 1
    } else {
      return fail(`"${t.value}" is not expected here`)
    }
    if (i >= tokens.length) break
    const op = tokens[i]
    if (!(op.kind === 'op' && op.value === '+')) return fail(`"${op.value}" is not expected here; join parts with +`)
    i += 1
  }
  return { ok: true, format: out }
}
