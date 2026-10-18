/**
 * @file worker/server/catalog/argValues.ts
 * @description How an argument value is read and checked, whoever sent it.
 *
 * The console reads arguments from text, MCP and the agent from JSON. Both
 * parse into a value here and then check it against its parameter with the
 * same `checkArg`, so a value one front end refuses the other refuses too
 * (a 1.5 for an integer, "maybe" for a boolean). The text parsers are also
 * what an op uses for a value it takes as text (a property, a reader option).
 */

import type { Param } from './params'

/** `true` / `on` / `yes` / `1` and their opposites, any case; anything else is null. */
export function parseBoolText(text: string): boolean | null {
  const v = text.trim().toLowerCase()
  if (v === 'true' || v === 'on' || v === 'yes' || v === '1') return true
  if (v === 'false' || v === 'off' || v === 'no' || v === '0') return false
  return null
}

/** A finite number, or null -- for a blank too, which `Number` would read as 0. */
export function parseNumberText(text: string): number | null {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Whether a parsed value fits its parameter.
 *
 * @returns null when it does, else the reason, naming the argument.
 */
export function checkArg(name: string, p: Param<unknown>, value: unknown): string | null {
  switch (p.kind) {
    case 'boolean':
      return typeof value === 'boolean' ? null : `${name} must be true or false.`
    case 'integer':
      return Number.isInteger(value) ? null : `${name} must be a whole number.`
    case 'real':
      return typeof value === 'number' && Number.isFinite(value) ? null : `${name} must be a number.`
    case 'enum':
      return p.values?.includes(String(value)) ? null : `${name} must be one of ${(p.values ?? []).join(', ')}.`
    case 'vec3':
      return Array.isArray(value) && value.length === 3 && value.every((x) => typeof x === 'number' && Number.isFinite(x))
        ? null
        : `${name} must be three numbers, x y z.`
    default:
      return null
  }
}
