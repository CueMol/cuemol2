/**
 * @file worker/server/catalog/toolSchema.ts
 * @description An op as a tool: its JSON Schema, and the model's arguments
 * read back into the types `run` declares.
 *
 * The schema is in the form `strict: true` requires -- every property listed
 * in `required`, no additional ones, an optional argument spelled as a
 * nullable type -- and uses only the keywords every provider's strict mode
 * accepts (see `plugins/agent/worker/tools/index.test.ts`).
 */

import type { AnyOp } from './op'
import type { AtomSpec, Param, ParamMap } from './params'

/** A JSON Schema object in the shape `strict: true` requires. */
export interface StrictObjectSchema {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
  additionalProperties: false
}

/** The JSON type of a scalar parameter kind. */
const JSON_TYPE = {
  boolean: 'boolean',
  integer: 'integer',
  real: 'number',
  string: 'string',
  enum: 'string',
} as const

/** The schema of one atom in an `atoms` list. */
const ATOM_ITEM_SCHEMA = {
  type: 'object',
  description: 'One atom, named the way the PDB file names it.',
  properties: {
    chain: { type: 'string', description: 'Chain name, for example A.' },
    resid: {
      type: 'string',
      description:
        'Residue index as a string, because it may carry an insertion code (for ' +
        'example "20" or "20A").',
    },
    atomName: { type: 'string', description: 'Atom name, for example CA.' },
  },
  required: ['chain', 'resid', 'atomName'],
  additionalProperties: false,
}

/** The JSON Schema of one parameter. */
function paramSchema(p: Param<unknown>): Record<string, unknown> {
  if (p.kind === 'atoms') {
    // The count is stated in the description and checked by the op, not
    // constrained here: a strict schema may only bound an array at 0 or 1
    // items, so minItems/maxItems is rejected outright by one provider.
    return { type: 'array', description: p.description, items: ATOM_ITEM_SCHEMA }
  }
  const type = JSON_TYPE[p.kind]
  if (p.kind === 'enum') {
    return p.optional
      ? { type: [type, 'null'], enum: [...(p.values ?? []), null], description: p.description }
      : { type, enum: [...(p.values ?? [])], description: p.description }
  }
  return { type: p.optional ? [type, 'null'] : type, description: p.description }
}

/** The strict JSON Schema of a parameter map. */
export function paramsSchema(params: ParamMap): StrictObjectSchema {
  const properties: Record<string, unknown> = {}
  for (const [name, p] of Object.entries(params)) properties[name] = paramSchema(p)
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

/** The strict JSON Schema of an op's arguments. */
export function toolSchema(op: AnyOp): StrictObjectSchema {
  return paramsSchema(op.params)
}

/** Read an `atoms` value, or say what is wrong with it. */
function readAtoms(value: unknown): AtomSpec[] | string {
  if (!Array.isArray(value)) return 'atoms must be a list.'
  const out: AtomSpec[] = []
  for (const raw of value) {
    const a = raw as Partial<AtomSpec>
    if (typeof a?.chain !== 'string' || typeof a?.resid !== 'string' || typeof a?.atomName !== 'string') {
      return 'Each atom needs chain, resid and atomName, all as strings.'
    }
    out.push({ chain: a.chain, resid: a.resid, atomName: a.atomName })
  }
  return out
}

/** One JSON argument read into its parameter's type, or the reason it cannot be. */
function readJsonArg(name: string, p: Param<unknown>, value: unknown): { value: unknown } | string {
  if (value === null || value === undefined) {
    return p.optional ? { value: null } : `Missing argument "${name}".`
  }
  switch (p.kind) {
    case 'boolean':
      return { value: value === true || value === 'true' }
    case 'integer':
    case 'real': {
      const n = Number(value)
      if (!Number.isFinite(n)) return `"${name}" must be a number.`
      return { value: n }
    }
    case 'enum': {
      const s = String(value)
      if (p.values && !p.values.includes(s)) {
        return `"${s}" is not allowed for "${name}". Allowed: ${p.values.join(', ')}.`
      }
      return { value: s }
    }
    case 'atoms': {
      const list = readAtoms(value)
      return typeof list === 'string' ? list : { value: list }
    }
    default:
      return { value: String(value) }
  }
}

/**
 * The arguments a model (or any JSON caller) sent, read into the types `run`
 * expects.
 *
 * A provider with strict mode on has already enforced the schema; one with it
 * off may send a number as a string or leave an argument out, which is read
 * leniently here rather than trusted.
 *
 * @returns the typed arguments, or the reason they could not be read.
 */
export function readToolArgs(op: AnyOp, input: Record<string, unknown>): Record<string, unknown> | string {
  const out: Record<string, unknown> = {}
  for (const [name, p] of Object.entries(op.params as ParamMap)) {
    const read = readJsonArg(name, p, input[name])
    if (typeof read === 'string') return read
    out[name] = read.value
  }
  return out
}
