/**
 * @file features/inspector/schema/simple.ts
 * @description The `simple` and `trace` renderer pages.
 *
 * Both are a single line-width row -- UXP's `simple-propdlg.xul` "Simple" tab
 * had one numslider above the shared renderer-common page, and the trace
 * renderer reuses it. The numslider's bounds are UXP's: 0 to 10 by 0.2, in px.
 *
 * Realtime: the width previews on the renderer while dragging and commits a
 * single undo step on release.
 */

import type { SchemaSectionDef } from './types'

/** Shared by both types; they differ only in the accordion's title. */
const lineWidthRow = {
  kind: 'num',
  key: 'width',
  label: 'Line width',
  min: 0,
  max: 10,
  step: 0.2,
  unit: 'px',
  realtime: true,
} as const

export const SIMPLE_SECTIONS: SchemaSectionDef[] = [
  { key: 'simple', title: 'Simple', defaultExpanded: true, rows: [lineWidthRow] },
]

export const TRACE_SECTIONS: SchemaSectionDef[] = [
  { key: 'trace', title: 'Trace', defaultExpanded: true, rows: [lineWidthRow] },
]
