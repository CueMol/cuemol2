/**
 * @file worker/server/actions/describe.ts
 * @description What a recorded undo step did, as one short line for the
 * undo history (the toolbar's dropdown, the Action history pane).
 *
 * An op says it itself (`Op.describe`); an op without one is shown by its
 * name and its main arguments. A step that ran several ops is shown by the
 * first and a count, and a step with no op (an edit no op expresses) by the
 * undo stack's own description, which is also what C++ keeps -- the line
 * here is for display only and never replaces that description.
 */

import { findOp } from '@renderer/worker/server/catalog'
import type { AnyOp } from '@renderer/worker/server/catalog/op'
import type { ParamMap } from '@renderer/worker/server/catalog/params'
import type { ActionEntry, ActionRow, OpEntry } from './actionLog'

/** Longest line shown; the rest is cut with `...`. */
const MAX_LINE = 80

/** The semantic kinds whose value is a node uid. */
const REF_SEMANTICS = new Set(['object', 'molecule', 'renderer', 'node'])

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_LINE ? `${flat.slice(0, MAX_LINE - 3)}...` : flat
}

/** `set_renderer_type` -> `Set renderer type`. */
function opWords(name: string): string {
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** How a node argument is named: the path it had, else its uid. */
function namer(entry: OpEntry): (param: string) => string {
  return (param) => entry.refs[param] ?? (typeof entry.args[param] === 'number' ? `#${String(entry.args[param])}` : '?')
}

/** The op's name and the arguments given, nodes by name. */
function fallback(op: AnyOp, entry: OpEntry): string {
  const name = namer(entry)
  const parts: string[] = []
  for (const [param, p] of Object.entries(op.params as ParamMap)) {
    const v = entry.args[param]
    if (v === null || v === undefined || p.kind === 'atoms') continue
    if (REF_SEMANTICS.has(p.semantic ?? '') && typeof v === 'number') parts.push(name(param))
    else if (p.kind === 'enum' && param.endsWith('Type')) continue
    else parts.push(Array.isArray(v) ? v.join(' ') : String(v))
  }
  return parts.length > 0 ? `${opWords(op.name)}: ${parts.join(', ')}` : opWords(op.name)
}

/** One recorded entry as a line. */
export function describeEntry(entry: ActionEntry): string {
  if (entry.kind === 'note') return clip(entry.text)
  const op = findOp(entry.op)
  if (!op) return clip(opWords(entry.op))
  try {
    if (op.describe) return clip(op.describe(entry.args as never, namer(entry)))
  } catch {
    // A describe that cannot read these arguments falls back to the generic line.
  }
  return clip(fallback(op, entry))
}

/** One undo step as a line: its first op (and how many more), else its label. */
export function describeRow(row: ActionRow): string {
  const ops = row.entries.filter((e) => e.kind === 'op')
  if (ops.length === 0) return row.label
  const first = describeEntry(ops[0])
  return ops.length === 1 ? first : `${first} (+${ops.length - 1} more)`
}
