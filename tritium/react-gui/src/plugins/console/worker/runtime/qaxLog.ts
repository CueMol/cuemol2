/**
 * @file plugins/console/worker/runtime/qaxLog.ts
 * @description The native console's log: what each console submission did,
 * written as a qax file (`open_log`).
 *
 * The log takes its content from the action log, not from what was typed:
 * each submission that changed the scene becomes one `<action>` holding the
 * native ops it ran, so the file runs back with `run log.qax` one undo step
 * per submission. A submission that changed nothing (it only read) leaves no
 * action, as it leaves no undo step. The PyMOL dialect has its own `.pml`
 * log of what was typed (`commandLog.ts`); what a PyMOL line did reaches this
 * log as native ops too.
 *
 * The whole file is written again on every action, so it is a well-formed
 * document whenever it is read. One log at a time.
 */

import * as fs from 'fs'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { actionRows, onActionsChanged } from '@renderer/worker/server/actions/actionLog'
import type { ActionRow, ActionSource } from '@renderer/worker/server/actions/actionLog'
import { rowToQax } from '@renderer/worker/server/actions/export'
import { parseQax, writeQax } from '@renderer/worker/server/actions/qax/codec'
import type { QaxAction } from '@renderer/worker/server/actions/qax/model'
import { QAX_VERSION } from '@renderer/worker/server/actions/qax/model'

/** The rows a console log records: the console's own submissions. */
const CONSOLE_SOURCES: ReadonlySet<ActionSource> = new Set(['cmd', 'pym', 'qax'])

interface OpenLog {
  path: string
  actions: QaxAction[]
  /** The last row logged per scene, so a later notice does not log it again. */
  last: Map<number, ActionRow>
  unsubscribe: () => void
}

let current: OpenLog | null = null

/** The file being logged to, or null. */
export function currentQaxLog(): string | null {
  return current?.path ?? null
}

function flush(log: OpenLog): boolean {
  try {
    fs.writeFileSync(log.path, writeQax({ version: QAX_VERSION, actions: log.actions }))
    return true
  } catch {
    return false
  }
}

/**
 * Start logging to `filePath`: `w` starts a new file, `a` adds to the
 * actions already in it.
 *
 * @returns null, or why the log cannot be opened.
 */
export function openQaxLog(ctx: WorkerContext, filePath: string, mode: 'w' | 'a'): string | null {
  closeQaxLog()
  let actions: QaxAction[] = []
  if (mode === 'a' && fs.existsSync(filePath)) {
    let text: string
    try {
      text = fs.readFileSync(filePath, 'utf8')
    } catch {
      return `cannot read ${filePath}`
    }
    const doc = parseQax(text)
    if ('error' in doc) return `${filePath}: ${doc.error}`
    actions = doc.actions
  }
  const log: OpenLog = { path: filePath, actions, last: new Map(), unsubscribe: () => undefined }
  if (!flush(log)) return `cannot write ${filePath}`
  log.unsubscribe = onActionsChanged((sceneId) => {
    if (current !== log) return
    const scene = ctx.sceMgr.getScene(sceneId)
    const rows = actionRows(scene ?? null, sceneId)
    const row = rows[rows.length - 1]
    if (!row || row.undone || log.last.get(sceneId) === row) return
    log.last.set(sceneId, row)
    if (!row.source || !CONSOLE_SOURCES.has(row.source)) return
    log.actions.push(rowToQax(row))
    if (!flush(log)) closeQaxLog()
  })
  current = log
  return null
}

/** Add a note to the log (the `log` command). */
export function noteQaxLog(text: string): void {
  if (!current) return
  current.actions.push({ items: [{ kind: 'note', text }] })
  if (!flush(current)) closeQaxLog()
}

/** Stop logging. Nothing happens when no log is open. */
export function closeQaxLog(): void {
  current?.unsubscribe()
  current = null
}
