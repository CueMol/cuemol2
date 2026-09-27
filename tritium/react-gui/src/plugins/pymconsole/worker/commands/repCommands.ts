/**
 * @file plugins/pymconsole/worker/commands/repCommands.ts
 * @description `show`, `hide`, `as` and `color`.
 *
 * The deepest disagreement between the two programs. In PyMOL a
 * representation is a per-atom flag: `show sticks, chain A` turns the stick
 * flag on for those atoms, adding to whatever was already shown, and `hide
 * sticks, resi 5` turns it off again for part of it. In CueMol a
 * representation is a renderer object, and a renderer has one selection.
 *
 * The bridge is a convention: **one renderer per object per representation**,
 * named `pym:<rep>`, whose selection is edited rather than replaced.
 *
 *   show rep, sel  ->  sel becomes (old) or (new)
 *   hide rep, sel  ->  sel becomes (old) and not (new)
 *   hide rep       ->  the renderer is hidden
 *   as rep, sel    ->  sel becomes (new), and the object's other pym
 *                      renderers are hidden
 *
 * The name prefix matters: it keeps the console out of renderers the user
 * made through the GUI. Those are theirs, and a command that silently
 * rewrote their selection would be worse than one that does nothing.
 */

import { createRendererOnObject } from '@renderer/worker/server/services/rend/createRendererOnObject'
import { getNewRendererOptions } from '@renderer/worker/server/services/rend/getNewRendererOptions'
import { getGenericProps } from '@renderer/worker/server/services/props/read'
import { setGenericProp } from '@renderer/worker/server/services/props/write'
import { setNodeVisible } from '@renderer/worker/server/services/sceneTree/sceneTree'
import { applyMolSelString } from '@renderer/worker/server/services/select/applyMolSelString'
import { setRendererColoring } from '@renderer/worker/server/services/coloring/applyColoring'
import { getRendererPaintInfo } from '@renderer/worker/server/services/coloring/panelList'
import { paintRendererSelection } from '@renderer/worker/server/services/coloring/paintCrud'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import type { SceneObjectEntry } from '@renderer/worker/server/services/scene/listSceneObjects'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { OWNED, isAllSelection, moleculeSelections, renderersOf } from './helpers'
import type { MoleculeSelection } from './helpers'
import { removeConsoleLabels, setConsoleLabelsVisible } from './labelCommands'
import { interpretShortcut } from '../parser/shortcut'
import { toCueMolColor } from './pymolColors'


/**
 * PyMOL representation names as CueMol renderer types.
 *
 * Only the ones that mean the same thing. PyMOL's `mesh`, `dots` and
 * `volume` are density representations in CueMol and belong to a map
 * object, not a molecule, so they are refused by name rather than mapped to
 * something close.
 */
const REPRESENTATIONS: Readonly<Record<string, string>> = {
  lines: 'simple',
  sticks: 'ballstick',
  spheres: 'cpk',
  cartoon: 'cartoon',
  ribbon: 'ribbon',
  surface: 'dsurface',
  nonbonded: 'simple',
  nb_spheres: 'cpk',
}

const UNSUPPORTED_REPS: Readonly<Record<string, string>> = {
  mesh: 'mesh: a density representation; use isomesh on a map object',
  // CueMol has no dot renderer for a map, and `volume` (gpu_mapvol) is not
  // wired up; naming a command that does not exist would be worse than
  // saying so.
  dots: 'dots: CueMol has no dot representation for a density map',
  volume: 'volume: not available from this console',
  slice: 'slice: CueMol has no slice representation',
  cell: 'cell: use the unit cell renderer from the GUI',
  ellipsoids: 'ellipsoids: use the anisou renderer from the GUI',
}

/** Read one renderer property as a string. */
function readProp(
  ctx: WorkerContext,
  sceneId: number,
  rendId: number,
  propName: string,
): string | null {
  const props = getGenericProps(ctx, { sceneId, nodeId: rendId, nodeType: 'renderer' })
  if (!props.ok) return null
  const entry = props.entries.find((e) => e.key === propName)
  return entry === undefined ? null : String(entry.value)
}

/**
 * A molecule's own selection, as an expression ('' when it has none), so a
 * command that has to set it can put it back.
 */
function readMolSelection(ctx: WorkerContext, sceneId: number, molId: number): string {
  const props = getGenericProps(ctx, { sceneId, nodeId: molId, nodeType: 'object' })
  if (!props.ok) return ''
  const entry = props.entries.find((e) => e.key === 'sel')
  const value = entry?.value
  return value === null || value === undefined ? '' : String(value)
}

/** Write a renderer's selection expression. */
function writeSelection(
  ctx: WorkerContext,
  sceneId: number,
  rendId: number,
  selStr: string,
): boolean {
  // `setRendererSelection` only takes six canned kinds, so an arbitrary
  // expression goes through the generic property bridge.
  return setGenericProp(ctx, {
    sceneId,
    nodeId: rendId,
    nodeType: 'renderer',
    propName: 'sel',
    op: 'set',
    valueType: 'object<MolSelection>',
    value: selStr,
    mode: 'commit',
  }).ok
}

/** The console's renderer of this type on this object, if it made one. */
function ownedRenderer(
  ctx: WorkerContext,
  sceneId: number,
  objId: number,
  rep: string,
): SceneTreeNode | null {
  return renderersOf(ctx, sceneId, objId).find((r) => r.name === `${OWNED}${rep}`) ?? null
}

/** Make the console's renderer for this representation. */
function createOwned(
  ctx: WorkerContext,
  cc: CmdContext,
  obj: SceneObjectEntry,
  rep: string,
  rendererType: string,
  selStr: string,
): { ok: true; rendId: number } | { ok: false; error: string } {
  const options = getNewRendererOptions(ctx, {
    sceneId: cc.sceneId,
    sourceNodeId: obj.uid,
    sourceNodeType: 'object',
  })
  if (!options.ok || !options.rendererTypes.includes(rendererType)) {
    return { ok: false, error: `Error: "${obj.name}" cannot show ${rep}` }
  }
  const created = createRendererOnObject(ctx, {
    sceneId: cc.sceneId,
    objId: obj.uid,
    rendOpts: {
      objectName: obj.name,
      rendererType,
      rendererName: `${OWNED}${rep}`,
      selectionEnabled: true,
      selection: selStr,
      centerView: false,
      mapCenterPolicy: 'auto',
    },
  })
  if (!created.ok || created.newRendId === undefined) {
    return { ok: false, error: `Error: could not create ${rep} on "${obj.name}"` }
  }
  return { ok: true, rendId: created.newRendId }
}

/**
 * Every representation name PyMOL accepts (constants.py `repmasks`), for its
 * unique-prefix shortcuts: `stick`, `cart` and `surf` are all valid PyMOL.
 */
const PYMOL_REPS: readonly string[] = [
  'everything', 'sticks', 'spheres', 'surface', 'labels', 'nb_spheres', 'cartoon',
  'ribbon', 'lines', 'mesh', 'dots', 'dashes', 'nonbonded', 'cell', 'cgo', 'callback',
  'extent', 'slice', 'angles', 'dihedrals', 'ellipsoids', 'volume', 'wire', 'licorice',
]

/**
 * PyMOL's compound names, as the console representations they stand for.
 * `wire` is lines + nonbonded, which CueMol draws with one renderer.
 */
const COMPOUND_REPS: Readonly<Record<string, readonly string[]>> = {
  wire: ['lines'],
  licorice: ['sticks'],
}

/** What a representation argument asks for. */
interface RepRequest {
  /** Console representations (REPRESENTATIONS keys), in the order given. */
  reps: string[]
  /** Whether labels are among them. */
  labels: boolean
}

/**
 * Read a representation argument: one or more names separated by spaces,
 * each a PyMOL name or an unambiguous prefix of one (`_rep_to_repmask`).
 * `everything` means every representation the console draws, quietly
 * leaving out the ones CueMol has no molecule renderer for; naming one of
 * those explicitly says why.
 */
function readReps(raw: string): { ok: true; req: RepRequest } | { ok: false; error: string } {
  const req: RepRequest = { reps: [], labels: false }
  const add = (rep: string): void => { if (!req.reps.includes(rep)) req.reps.push(rep) }
  const words = raw.trim().toLowerCase().split(/\s+/).filter((w) => w !== '')
  if (words.length === 0) return { ok: false, error: 'Error: no representation given' }
  for (const word of words) {
    const found = interpretShortcut(word, PYMOL_REPS)
    if (found.kind === 'none') {
      const known = Object.keys(REPRESENTATIONS).sort().join(', ')
      return { ok: false, error: `Error: unknown representation "${word}" (one of ${known}, labels, everything)` }
    }
    if (found.kind === 'ambiguous') {
      return { ok: false, error: `Error: ambiguous representation "${word}": ${found.candidates.join(', ')}` }
    }
    const rep = found.name
    if (rep === 'everything') {
      Object.keys(REPRESENTATIONS).forEach(add)
      req.labels = true
    } else if (rep === 'labels') {
      req.labels = true
    } else if (COMPOUND_REPS[rep]) {
      COMPOUND_REPS[rep].forEach(add)
    } else if (REPRESENTATIONS[rep] !== undefined) {
      add(rep)
    } else {
      const reason = UNSUPPORTED_REPS[rep] ?? `${rep}: not available from this console`
      return { ok: false, error: `Error: ${reason}` }
    }
  }
  return { ok: true, req }
}

/** Hide a console renderer and empty its selection, so a later show starts afresh. */
function hideOwned(ctx: WorkerContext, sceneId: number, rendId: number): void {
  // Emptied as well as hidden: `show rep, sel` unions with what the renderer
  // already draws, and without this the atoms hidden here would come back.
  writeSelection(ctx, sceneId, rendId, 'none')
  setNodeVisible(ctx, { sceneId, nodeId: rendId, nodeType: 'renderer', visible: false })
}

/** Apply one representation of a show / hide / as to one molecule. */
function applyRep(
  ctx: WorkerContext,
  cc: CmdContext,
  name: 'show' | 'hide' | 'as',
  item: MoleculeSelection,
  rep: string,
  whole: boolean,
): CmdOutcome {
  const { obj, selStr } = item
  const existing = ownedRenderer(ctx, cc.sceneId, obj.uid, rep)
  if (name === 'hide' && whole) {
    if (existing) hideOwned(ctx, cc.sceneId, existing.id)
    return { ok: true }
  }
  if (!existing) {
    if (name === 'hide') return { ok: true }
    return createOwned(ctx, cc, obj, rep, REPRESENTATIONS[rep], selStr)
  }
  // It is there: combine with what it already draws, which is what makes
  // show additive and hide subtractive the way PyMOL's flags are.
  const current = readProp(ctx, cc.sceneId, existing.id, 'sel') ?? '*'
  const next =
    name === 'as'
      ? selStr
      : name === 'show'
        ? `(${current}) or (${selStr})`
        : `(${current}) and not (${selStr})`
  if (!writeSelection(ctx, cc.sceneId, existing.id, next)) {
    return { ok: false, error: `Error: could not change ${rep} on "${obj.name}"` }
  }
  setNodeVisible(ctx, { sceneId: cc.sceneId, nodeId: existing.id, nodeType: 'renderer', visible: true })
  return { ok: true }
}

/**
 * `show` / `hide` / `as` (and `show_as`), which differ only in how the
 * selection is combined.
 *
 * As in PyMOL (`_showhide`), a first argument that is empty, `all`, or looks
 * like a selection (has `(` or `/`) is the selection, and the representation
 * is then `wire` for show / as and `everything` for hide: `hide` alone hides
 * everything, `show` alone shows lines.
 */
function repCommand(name: 'show' | 'hide' | 'as', alias?: string): PymCommand {
  return {
    name: alias ?? name,
    params: [
      { name: 'representation', default: '' },
      { name: 'selection', default: '' },
      ...(name === 'as' ? [] : [{ name: 'state', default: '0' }]),
    ],
    mode: 'strict',
    mutates: true,
    summary:
      name === 'show'
        ? 'Add representations over a selection (show alone: lines).'
        : name === 'hide'
          ? 'Take representations off a selection (hide alone: everything).'
          : 'Show one representation and hide the rest.',
    completions: [
      { source: 'representations', description: 'representation', suffix: ', ' },
      { source: 'selections', description: 'selection', suffix: '' },
    ],
    run(ctx, args, cc): CmdOutcome {
      let repArg = args.representation.trim()
      let selArg = args.selection.trim()
      if (selArg === '' && (repArg === '' || repArg === 'all' || repArg.includes('(') || repArg.includes('/'))) {
        selArg = repArg
        repArg = name === 'hide' ? 'everything' : 'wire'
      }
      const parsed = readReps(repArg)
      if (!parsed.ok) return parsed
      const { req } = parsed

      const whole = isAllSelection(selArg)
      const sels = moleculeSelections(ctx, cc.sceneId, selArg)
      if (!sels.ok) return sels

      for (const item of sels.items) {
        if (name === 'as') {
          // Everything else this console put on the object steps aside.
          for (const other of renderersOf(ctx, cc.sceneId, item.obj.uid)) {
            const otherRep = other.name.slice(OWNED.length)
            if (other.name.startsWith(OWNED) && !req.reps.includes(otherRep) && otherRep !== 'labels') {
              hideOwned(ctx, cc.sceneId, other.id)
            }
          }
        }
        for (const rep of req.reps) {
          const res = applyRep(ctx, cc, name, item, rep, whole)
          if (!res.ok) return res
        }
      }

      if (req.labels) {
        // Labels have their text; only showing, hiding, or taking them off
        // part of the molecule means anything here.
        if (name === 'hide' && !whole) {
          if (!removeConsoleLabels(ctx, cc.sceneId, sels.items)) {
            return { ok: false, error: `Error: "${selArg}" did not compile` }
          }
        } else {
          setConsoleLabelsVisible(ctx, cc.sceneId, sels.items, name !== 'hide')
          if (name !== 'hide' && !whole) cc.warn('labels: shown whole; add labels with label <selection>, <expression>')
        }
      }
      return { ok: true }
    },
  }
}

const color: PymCommand = {
  name: 'color',
  params: [
    { name: 'color' },
    { name: 'selection', default: 'all' },
    { name: 'quiet', default: '1' },
    { name: 'flags', default: '0' },
  ],
  mode: 'legacy',
  mutates: true,
  summary: 'Colour part of what the console draws.',
  completions: [
    { source: 'colors', description: 'color', suffix: ', ' },
    { source: 'selections', description: 'selection', suffix: '' },
  ],
  run(ctx, args, cc) {
    const colour = toCueMolColor(args.color)
    if (colour === null) return { ok: false, error: `Error: unknown color: "${args.color}"` }

    const sels = moleculeSelections(ctx, cc.sceneId, args.selection)
    if (!sels.ok) return sels

    let painted = 0
    for (const { obj, selStr } of sels.items) {
      // The paint service reads its region from the molecule's selection;
      // what the user had selected is put back afterwards.
      const before = readMolSelection(ctx, cc.sceneId, obj.uid)
      // The paint service reads the region from the MOLECULE's selection
      // rather than taking it as an argument, so it is set first. The user
      // sees the selection change, as they would having made it by hand.
      const applied = applyMolSelString(ctx, {
        sceneId: cc.sceneId,
        molId: obj.uid,
        selStr,
      })
      if (!applied.ok) continue

      for (const rend of renderersOf(ctx, cc.sceneId, obj.uid)) {
        if (!rend.name.startsWith(OWNED)) continue
        // Painting needs a PaintColoring to insert into. Switching costs the
        // renderer's previous colouring, so it is only done when needed.
        if (!getRendererPaintInfo(ctx, { sceneId: cc.sceneId, rendId: rend.id }).canPaint) {
          setRendererColoring(ctx, {
            sceneId: cc.sceneId,
            rendId: rend.id,
            coloringId: 'paint-type-paint',
            targetKind: 'renderer',
          })
        }
        if (paintRendererSelection(ctx, {
          sceneId: cc.sceneId,
          rendId: rend.id,
          colorValue: colour,
        }).ok) {
          painted += 1
        }
      }
      applyMolSelString(ctx, { sceneId: cc.sceneId, molId: obj.uid, selStr: before })
    }
    if (painted === 0) {
      return {
        ok: false,
        error: 'Error: nothing to colour -- show a representation first',
      }
    }
    return { ok: true }
  },
}

/**
 * The console representation a CueMol renderer type draws, for naming the
 * renderer `load` / `fetch` make so the console treats it as its own.
 */
export function repOfRendererType(type: string): string | null {
  // lines before nonbonded: both are 'simple', and lines is what PyMOL shows.
  for (const rep of ['lines', 'sticks', 'spheres', 'cartoon', 'ribbon', 'surface']) {
    if (REPRESENTATIONS[rep] === type) return rep
  }
  return null
}

/** The representation names this console accepts, for completion. */
export function representationNames(): string[] {
  return Object.keys(REPRESENTATIONS).sort()
}

export const REP_COMMANDS: PymCommand[] = [
  repCommand('show'),
  repCommand('hide'),
  repCommand('as'),
  // The name PyMOL's own scripts use; `as` is the keyword alias of it.
  repCommand('as', 'show_as'),
  color,
]
