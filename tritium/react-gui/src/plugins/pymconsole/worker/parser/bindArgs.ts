/**
 * @file plugins/pymconsole/worker/parser/bindArgs.ts
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
): BoundArgs | UsageRequest {
  if (parsed.length === 1 && parsed[0].name === null && parsed[0].value === '?') {
    return { kind: 'usage', usage: usageLine(name, params) }
  }

  const names = params.map((p) => p.name)
  let list = parsed

  if (mode === 'legacy') {
    const expanded: ParsedArg[] = []
    for (const a of list) {
      if (a.name !== null && !names.includes(a.name)) {
        expanded.push({ name: null, value: a.name })
        expanded.push({ name: null, value: a.value })
      } else {
        expanded.push(a)
      }
    }
    list = expanded
  }

  const bound: Record<string, string> = {}
  list.forEach((a, index) => {
    let key = a.name
    if (key === null) {
      if (index >= params.length) {
        throw new BindError(
          `${usageLine(name, params)}\nError: too many positional arguments for ${name}`,
        )
      }
      key = names[index]
    } else if (!names.includes(key)) {
      throw new BindError(
        `${usageLine(name, params)}\nError: invalid argument "${key}" for ${name}`,
      )
    }
    if (a.value !== null) bound[key] = a.value
  })

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
