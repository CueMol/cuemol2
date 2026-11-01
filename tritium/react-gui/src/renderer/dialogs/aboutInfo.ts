/**
 * @file dialogs/aboutInfo.ts
 * @description The label/value rows of the About dialog and the plain text
 * its Copy button puts on the clipboard (pasted into bug reports).
 */

import type { AboutRuntimeInfo } from '@shared/types/aboutInfo'

export type AboutRow = [label: string, value: string]

export function aboutRows(
  app: { version: string; build: string },
  runtime: AboutRuntimeInfo | null,
  buildDate: string,
): AboutRow[] {
  return [
    ['Version', app.version],
    ['Commit', app.build],
    ['Date', buildDate],
    ['Electron', runtime?.electron ?? ''],
    ['Chromium', runtime?.chromium ?? ''],
    ['Node.js', runtime?.node ?? ''],
    ['V8', runtime?.v8 ?? ''],
    ['OS', runtime?.os ?? ''],
  ]
}

/** `<product>` then one `Label: value` line per row. */
export function aboutText(product: string, rows: AboutRow[]): string {
  return [product, ...rows.map(([label, value]) => `${label}: ${value}`)].join('\n')
}
