/**
 * @file plugins/console/worker/parser/bindArgs.ts
 * @description Matching the arguments that were typed to the ones a command
 * declares.
 *
 * A port of `parsing.prepare_call` and `parsing.dump_arg`
 * (`modules/pymol/parsing.py`), including the error wording, so a mistake in
 * the console reads the way the same mistake reads in PyMOL.
 *
 * Two PyMOL behaviours are load-bearing and non-obvious:
 *
 * - LEGACY mode. `set ambient=0.3` and `select foo=chain A` look like named
 *   arguments but are not: `ambient` and `foo` are values. When a name is not
 *   one the command declares, LEGACY turns `name=value` back into two
 *   positional arguments. Only the commands PyMOL marks LEGACY do this.
 * - A lone `?` asks for the usage line instead of running anything.
 *
 * Values stay strings. A command converts its own, because what a string
 * should become is often only knowable from the target (a property's C++ type
 * decides whether "1" is a number, a flag, or a name).
 */

import type { ArgMode, ParsedArg } from './parseArgs'

/** One declared parameter. No default means the argument is required. */
export interface ParamSpec {
  name: string
  default?: string
}

/** Asking for usage rather than running: a lone `?`. */
export interface UsageRequest {
  kind: 'usage'
  usage: string
}

/** The bound arguments, keyed by parameter name. */
export interface BoundArgs {
  kind: 'args'
  args: Record<string, string>
}

/** Thrown when the typed arguments cannot be matched; message shown as-is. */
export class BindError extends Error {}

/** The `Usage: ...` line for a command, in PyMOL's layout. */
export function usageLine(name: string, params: readonly ParamSpec[]): string {
  const required = params.filter((p) => p.default === undefined).length
  let st = `Usage: ${name}`
  let closers = 0
  params.forEach((p, i) => {
    if (i >= required) {
      st += ' ['
      closers += 1
    }
    st += i === 0 ? ` ${p.name}` : `, ${p.name}`
  })
  return closers > 0 ? `${st} ${']'.repeat(closers)}` : st
}

/**
 * How positional and named arguments are matched to parameters.
 *
 * - `pymol`: PyMOL's own rule, for its dialect. A positional argument takes
 *   the parameter at its index in the whole list, named ones counted; a
 *   repeated argument overwrites; LEGACY mode applies.
 * - `python`: a Python call's rule, for the native dialect. Positional
 *   arguments fill the parameters in order and may not follow a named one;
 *   an argument given twice is an error.
 */
export type ArgRule = 'pymol' | 'python'

/** What `assignArgs` made of a list: the values given, by name, and what was wrong. */
export interface Assignment {
  bound: Record<string, string>
  /** Every parameter that was given, a blank one (`a,,b`) included. */
  given: Set<string>
  errors: string[]
}

/** LEGACY: a `name=value` whose name is not declared is two positional values. */
function expandLegacy(list: readonly ParsedArg[], names: readonly string[]): ParsedArg[] {
  return list.flatMap((a) =>
    a.name !== null && !names.includes(a.name)
      ? [{ name: null, value: a.name }, { name: null, value: a.value }]
      : [a],
  )
}

/**
 * Match typed arguments to parameters, never throwing.
 *
 * The one place the matching rule lives: execution (`bindArgs`) and
 * completion both go through it.
 */
export function assignArgs(
  name: string,
  params: readonly ParamSpec[],
  parsed: readonly ParsedArg[],
  mode: ArgMode,
  rule: ArgRule,
): Assignment {
  const names = params.map((p) => p.name)
  const list = mode === 'legacy' && rule === 'pymol' ? expandLegacy(parsed, names) : parsed
  const out: Assignment = { bound: {}, given: new Set(), errors: [] }
  let positional = 0
  let sawNamed = false
  list.forEach((a, index) => {
    let key = a.name
    if (key === null) {
      if (rule === 'python' && sawNamed) {
        out.errors.push(`${usageLine(name, params)}\nError: a positional argument follows a named one in ${name}`)
        return
      }
      const at = rule === 'python' ? positional++ : index
      if (at >= params.length) {
        out.errors.push(`${usageLine(name, params)}\nError: too many positional arguments for ${name}`)
        return
      }
      key = names[at]
    } else {
      sawNamed = true
      if (!names.includes(key)) {
        out.errors.push(`${usageLine(name, params)}\nError: invalid argument "${key}" for ${name}`)
        return
      }
    }
    if (rule === 'python' && out.given.has(key)) {
      out.errors.push(`${usageLine(name, params)}\nError: argument "${key}" is given twice in ${name}`)
      return
    }
    out.given.add(key)
    if (a.value !== null) out.bound[key] = a.value
  })
  return out
}

/**
 * The parameter a positional argument typed after `parsed` would take, or
 * null when none would: the list is full, or (`python`) a named argument has
 * already been given.
 */
export function nextPositional(
  params: readonly ParamSpec[],
  parsed: readonly ParsedArg[],
  rule: ArgRule,
): string | null {
  if (rule === 'pymol') return params[parsed.length]?.name ?? null
  if (parsed.some((a) => a.name !== null)) return null
  return params[parsed.length]?.name ?? null
}

/**
 * Bind typed arguments to a command's parameters.
 *
 * @returns the bound arguments, or a usage request when the user typed `?`.
 * @throws BindError when the arguments cannot be matched.
 */
export function bindArgs(
  name: string,
  params: readonly ParamSpec[],
  parsed: readonly ParsedArg[],
  mode: ArgMode = 'strict',
  rule: ArgRule = 'pymol',
): BoundArgs | UsageRequest {
  if (parsed.length === 1 && parsed[0].name === null && parsed[0].value === '?') {
    return { kind: 'usage', usage: usageLine(name, params) }
  }

  const { bound, errors } = assignArgs(name, params, parsed, mode, rule)
  if (errors.length > 0) throw new BindError(errors[0])

  for (const p of params) {
    if (p.name in bound) continue
    if (p.default === undefined) {
      throw new BindError(
        `Parsing-Error: missing required argument in function ${name} : ${p.name}`,
      )
    }
    bound[p.name] = p.default
  }

  return { kind: 'args', args: bound }
}
