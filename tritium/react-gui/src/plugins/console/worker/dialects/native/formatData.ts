/**
 * @file plugins/console/worker/dialects/native/formatData.ts
 * @description An op's result as a few readable lines, for an op that does
 * not format its own.
 *
 * The data an op returns is shaped for a model, which reads JSON. Pretty
 * printed, it runs to hundreds of lines and scrolls the command off the top
 * of the transcript. This lays it out the way a person scans it: one
 * `key: value` line per field, a list of names wrapped onto as few lines as
 * fit, a list of records one line each, and a cap on the whole.
 */

import { wrapList } from '@renderer/worker/server/catalog/consoleFormat'

/** Longest one record is allowed to print before it is cut. */
const RECORD_CHARS = 100
/** Most lines one result prints. */
const MAX_LINES = 40

function isScalar(v: unknown): boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v)
}

function scalarText(v: unknown): string {
  return v === null ? '-' : String(v)
}

/** One record on one line: `a=1 b=x c=[3 items]`. */
function recordLine(rec: Record<string, unknown>): string {
  const parts = Object.entries(rec).map(([k, v]) => {
    if (isScalar(v)) return `${k}=${scalarText(v)}`
    if (Array.isArray(v)) return v.every(isScalar) ? `${k}=[${v.map(scalarText).join(',')}]` : `${k}=[${v.length} items]`
    return `${k}={...}`
  })
  const text = parts.join(' ')
  return text.length > RECORD_CHARS ? `${text.slice(0, RECORD_CHARS)}...` : text
}

function valueLines(key: string, v: unknown, indent: string): string[] {
  if (isScalar(v)) return [`${indent}${key}: ${scalarText(v)}`]
  if (Array.isArray(v)) {
    if (v.length === 0) return [`${indent}${key}: (none)`]
    if (v.every(isScalar)) return [`${indent}${key}:`, ...wrapList(v.map(scalarText), `${indent}  `)]
    return [
      `${indent}${key}: (${v.length})`,
      ...v.map((item) =>
        `${indent}  ${isScalar(item) ? scalarText(item) : recordLine(item as Record<string, unknown>)}`),
    ]
  }
  return [`${indent}${key}:`, ...objectLines(v as Record<string, unknown>, `${indent}  `)]
}

function objectLines(obj: Record<string, unknown>, indent: string): string[] {
  return Object.entries(obj).flatMap(([k, v]) => valueLines(k, v, indent))
}

/** The lines a console prints for a result no op formatted. */
export function formatData(data: unknown): string[] {
  let lines: string[]
  if (isScalar(data)) lines = [scalarText(data)]
  else if (Array.isArray(data)) lines = valueLines('result', data, '')
  else lines = objectLines(data as Record<string, unknown>, '')
  if (lines.length <= MAX_LINES) return lines
  return [...lines.slice(0, MAX_LINES), `... ${lines.length - MAX_LINES} more lines`]
}
