/**
 * @file worker/server/actions/export.ts
 * @description The action log's rows as a qax document, and as console lines
 * for a person to read.
 *
 * Kept apart from `actionLog.ts` because it needs the op catalogue (for each
 * op's parameters), and the catalogue imports the services that record into
 * the log.
 */

import { findOp } from '@renderer/worker/server/catalog'
import { formatCommand } from '@renderer/worker/server/catalog/cmlFormat'
import type { ActionEntry, ActionRow } from './actionLog'
import type { QaxAction, QaxDoc, QaxItem } from './qax/model'
import { QAX_VERSION } from './qax/model'
import { opToQax } from './qax/values'

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
