/**
 * @file features/inspector/schema/tracestick.ts
 * @description The `tracestick` renderer page.
 *
 * TraceStickRenderer draws the main-chain pivot atoms (CA, P, ...) as spheres
 * joined by cylinders -- the ball-and-stick version of `trace`. It has no UXP
 * dialog; the rows are the sphere/stick rows of `ballstick` without the ring
 * display, previewed while dragging (spheres and cylinders redraw cheaply).
 */

import type { SchemaSectionDef } from './types'
import { sphereStickRows } from './ballstick'

export const TRACESTICK_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'tracestick',
    title: 'Trace stick',
    defaultExpanded: true,
    rows: sphereStickRows({ realtime: true }),
  },
]
