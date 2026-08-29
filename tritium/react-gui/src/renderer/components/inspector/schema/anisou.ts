/**
 * @file components/inspector/schema/anisou.ts
 * @description The `anisou` renderer page.
 *
 * The anisotropic-displacement renderer draws ball-and-stick atoms with an
 * ORTEP disc through each, so its page is the ball-and-stick rows followed by
 * the disc controls. The disc rows follow their toggle: the C++ renderer draws
 * the discs only while it is on.
 *
 * Nothing on this page previews while dragging, its inherited rows included:
 * an ellipsoid per atom is too expensive to rebuild per drag frame. The values
 * commit on release, as ball-and-stick's own page does not need to.
 */

import type { SchemaSectionDef } from './types'
import { isOff } from './predicates'
import { ballstickRows } from './ballstick'

const discOff = isOff('drawdisc')

/** Both disc dimensions share their bounds and their gate. */
const discRow = (key: string, label: string) =>
  ({
    kind: 'num',
    key,
    label,
    min: 0,
    max: 3,
    step: 0.05,
    fineSnap: 0.01,
    coarseSnap: 0.5,
    decimals: 2,
    disabledWhen: discOff,
  }) as const

export const ANISOU_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'anisou-ballstick',
    title: 'Atoms and bonds',
    defaultExpanded: true,
    rows: ballstickRows({ realtime: false }),
  },
  {
    key: 'anisou-disc',
    title: 'Anisotropic displacement',
    defaultExpanded: true,
    rows: [
      { kind: 'bool', key: 'drawdisc', label: 'Draw disc' },
      discRow('discscale', 'Disc scale'),
      discRow('discthick', 'Disc thickness'),
    ],
  },
]
