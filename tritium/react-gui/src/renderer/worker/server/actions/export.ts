/**
 * @file worker/server/actions/export.ts
 * @description The action log's rows as a qax document, and as console lines
 * for a person to read.
 *
 * Kept apart from `actionLog.ts` because it needs the op catalogue (for each
 * op's parameters), and the catalogue imports the services that record into
 * the log.
 */

import * as fs from 'fs'
import { findOp } from '@renderer/worker/server/catalog'
import { formatCommand } from '@renderer/worker/server/catalog/cmlFormat'
import type { AtomSpec, ParamMap } from '@renderer/worker/server/catalog/params'
import type { ActionEntryView, ActionStepView } from '@renderer/worker/shared/actionTypes'
import type { ActionEntry, ActionRow } from './actionLog'
import { describeEntry, describeRow } from './describe'
import { writeQax } from './qax/codec'
import type { QaxAction, QaxDoc, QaxItem } from './qax/model'
import { QAX_VERSION } from './qax/model'
import { isRefParam, opToQax } from './qax/values'

/** One entry as a qax item. An op the catalogue no longer has is kept as a note. */
function entryToQax(entry: ActionEntry): QaxItem {
  if (entry.kind === 'note') return { kind: 'note', text: entry.text }
  const op = findOp(entry.op)
  if (!op) return { kind: 'note', text: `unknown op ${entry.op}` }
  return opToQax(op.name, op.params, entry.args, entry.refs)
}

/** One row as a qax action. A row with no ops says so in a note. */
export function rowToQax(row: ActionRow): QaxAction {
  const items = row.entries.map(entryToQax)
  return {
    label: row.label,
    ...(row.source ? { source: row.source } : {}),
    ...(row.time ? { time: row.time } : {}),
    items: items.length > 0 ? items : [{ kind: 'note', text: 'no op recorded for this edit' }],
  }
}

/** Rows as a qax document. */
export function rowsToQax(rows: readonly ActionRow[]): QaxDoc {
  return { version: QAX_VERSION, actions: rows.map(rowToQax) }
}

/** One entry as the console line that would run it, or the note it is. */
export function entryLine(entry: ActionEntry): string {
  if (entry.kind === 'note') return `# ${entry.text}`
  const op = findOp(entry.op)
  if (!op) return `# unknown op ${entry.op}`
  return formatCommand(op.name, op.params, entry.args, entry.refs)
}

/**
 * Write rows to a qax file.
 *
 * @returns null, or why the file could not be written.
 */
export function writeRowsFile(rows: readonly ActionRow[], filePath: string): string | null {
  try {
    fs.writeFileSync(filePath, writeQax(rowsToQax(rows)))
    return null
  } catch {
    return `cannot write ${filePath}`
  }
}

/** One entry's arguments written out, in the op's parameter order. */
function entryArgs(entry: ActionEntry): ActionEntryView['args'] {
  if (entry.kind === 'note') return []
  const op = findOp(entry.op)
  if (!op) return []
  const out: ActionEntryView['args'] = []
  for (const [name, p] of Object.entries(op.params as ParamMap)) {
    const v = entry.args[name]
    if (v === null || v === undefined) continue
    let value: string
    if (isRefParam(p) && typeof v === 'number') value = entry.refs[name] ?? `#${v}`
    else if (p.kind === 'atoms' && Array.isArray(v)) value = (v as AtomSpec[]).map((a) => `${a.chain}/${a.resid}/${a.atomName}`).join(' ')
    else if (Array.isArray(v)) value = v.join(' ')
    else value = String(v)
    out.push({ name, value })
  }
  return out
}

/** One row as the renderer shows it. */
export function rowView(row: ActionRow): ActionStepView {
  return {
    id: row.id,
    text: describeRow(row),
    label: row.label,
    source: row.source,
    time: row.time,
    undone: row.undone,
    entries: row.entries.map((e) => ({
      kind: e.kind,
      op: e.kind === 'op' ? e.op : null,
      text: describeEntry(e),
      line: e.kind === 'op' ? entryLine(e) : e.text,
      args: entryArgs(e),
    })),
  }
}
