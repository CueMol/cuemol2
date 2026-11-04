/**
 * @file plugins/pymol-console/worker/commands/repCommands.ts
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

import { getNewRendererOptions } from '@renderer/worker/server/services/rend/getNewRendererOptions'
import { getGenericProps } from '@renderer/worker/server/services/props/read'
import { simplifySel } from '@renderer/worker/server/services/helpers/simplifySel'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import type { SceneObjectEntry } from '@renderer/worker/server/services/scene/listSceneObjects'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { OWNED, isAllSelection, moleculeSelections, molecules, renderersOf, runOp, setMolSelection, setVisible } from './helpers'
import type { MoleculeSelection } from './helpers'
import { removeConsoleLabels, setConsoleLabelsVisible } from './labelCommands'
import { interpretShortcut } from '@plugins/console/worker/dialect-api'
import { toCueMolColor } from './pymolColors'
import { applyRememberedSettings } from './repSettings'


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
  // PyMOL's cartoon (helix / sheet shapes) is what CueMol calls a ribbon.
  cartoon: 'ribbon',
  // PyMOL's ribbon is the CA trace, straight segments from atom to atom.
  ribbon: 'tracestick',
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

/**
 * Renderer styles for representations whose CueMol default looks unlike
 * PyMOL's. A PyMOL stick has no ball, only joints capped at the stick
 * radius, which is CueMol's Stick style rather than its ball-and-stick
 * default. The colouring style is the one the default list carries.
 */
const REP_STYLES: Readonly<Record<string, string>> = {
  sticks: 'StickBallStick,DefaultCPKColoring',
}

/** A console renderer that draws one class of residues of another representation. */
interface Companion {
  /** Its representation name (`pym:<rep>`). */
  rep: string
  /** The residues it draws; the main renderer draws the rest. */
  scope: string
}

/**
 * Console renderers that draw part of another representation. PyMOL's
 * cartoon covers nucleic acids too, which CueMol draws with `nucl`: the load
 * preset makes it as `pym:nucl`, and whatever a command does to cartoon it
 * does to that renderer as well (it is never created by a command).
 *
 * Each keeps to its scope, and the main renderer to the rest: `show cartoon`
 * would otherwise widen `nucl` to the protein and the ribbon to the nucleic
 * acid, each drawing what the other already does.
 */
const COMPANIONS: Readonly<Record<string, readonly Companion[]>> = {
  cartoon: [{ rep: 'nucl', scope: 'nucleic' }],
}

/**
 * The console name of each load-preset member, by renderer type, where the
 * two differ (`pym:nucl` keeps its name, see COMPANIONS).
 */
const PRESET_MEMBER_REPS: Readonly<Record<string, string>> = {
  ribbon: 'cartoon',
  ballstick: 'sticks',
  cpk: 'spheres',
  simple: 'lines',
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

/** Write a renderer's selection expression (`set_renderer_selection`). */
async function writeSelection(ctx: WorkerContext, cc: CmdContext, rendId: number, selStr: string): Promise<boolean> {
  return (await runOp(ctx, cc, 'set_renderer_selection', { rendId, selection: selStr })).ok
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

/** Make the console's renderer for this representation (`create_renderer`, then its styles). */
async function createOwned(
  ctx: WorkerContext,
  cc: CmdContext,
  obj: SceneObjectEntry,
  rep: string,
  rendererType: string,
  selStr: string,
): Promise<CmdOutcome> {
  // Read first, so a type the object cannot draw is refused in PyMOL's words.
  const options = getNewRendererOptions(ctx, {
    sceneId: cc.sceneId,
    sourceNodeId: obj.uid,
    sourceNodeType: 'object',
  })
  if (!options.ok || !options.rendererTypes.includes(rendererType)) {
    return { ok: false, error: `Error: "${obj.name}" cannot show ${rep}` }
  }
  const created = await runOp(ctx, cc, 'create_renderer', {
    objId: obj.uid,
    rendererType,
    name: `${OWNED}${rep}`,
    selection: selStr,
    centerView: false,
  })
  const rendId = created.ok ? (created.data as { rendererId?: number } | undefined)?.rendererId : undefined
  if (rendId === undefined) {
    return { ok: false, error: `Error: could not create ${rep} on "${obj.name}"` }
  }
  const style = REP_STYLES[rep]
  if (style) {
    const styled = await runOp(ctx, cc, 'set_renderer_styles', { rendId, styles: style })
    if (!styled.ok) return styled
  }
  await applyRememberedSettings(ctx, cc, rep, rendId)
  return { ok: true }
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
async function hideOwned(ctx: WorkerContext, cc: CmdContext, rendId: number): Promise<void> {
  // Emptied as well as hidden: `show rep, sel` unions with what the renderer
  // already draws, and without this the atoms hidden here would come back.
  await writeSelection(ctx, cc, rendId, 'none')
  await setVisible(ctx, cc, rendId, 'renderer', false)
}

/** Apply one representation of a show / hide / as to one molecule. */
async function applyRep(
  ctx: WorkerContext,
  cc: CmdContext,
  name: 'show' | 'hide' | 'as',
  item: MoleculeSelection,
  rep: string,
  whole: boolean,
): Promise<CmdOutcome> {
  const { obj, selStr } = item
  const scopes: string[] = []
  for (const companion of COMPANIONS[rep] ?? []) {
    const other = ownedRenderer(ctx, cc.sceneId, obj.uid, companion.rep)
    if (!other) continue
    scopes.push(companion.scope)
    const res = await updateOwned(ctx, cc, name, item, other, rep, whole, companion.scope)
    if (!res.ok) return res
  }
  const scope = scopes.length > 0 ? `not (${scopes.join(' or ')})` : undefined
  const existing = ownedRenderer(ctx, cc.sceneId, obj.uid, rep)
  if (!existing) {
    if (name === 'hide') return { ok: true }
    return createOwned(ctx, cc, obj, rep, REPRESENTATIONS[rep], scoped(selStr, scope))
  }
  return updateOwned(ctx, cc, name, item, existing, rep, whole, scope)
}

/** `selStr` kept to `scope`, when there is one. */
function scoped(selStr: string, scope: string | undefined): string {
  return scope === undefined ? selStr : `(${selStr}) and (${scope})`
}

/** Apply a show / hide / as to a console renderer that already exists. */
async function updateOwned(
  ctx: WorkerContext,
  cc: CmdContext,
  name: 'show' | 'hide' | 'as',
  item: MoleculeSelection,
  existing: SceneTreeNode,
  rep: string,
  whole: boolean,
  scope?: string,
): Promise<CmdOutcome> {
  const { obj } = item
  // A hide only narrows what is drawn, so it never leaves the scope.
  const selStr = name === 'hide' ? item.selStr : scoped(item.selStr, scope)
  if (name === 'hide' && whole) {
    await hideOwned(ctx, cc, existing.id)
    return { ok: true }
  }
  // It is there: combine with what it already draws, which is what makes
  // show additive and hide subtractive the way PyMOL's flags are.
  // An empty selection is one never set (the renderer a load makes), which
  // draws everything.
  const current = readProp(ctx, cc.sceneId, existing.id, 'sel')?.trim() || '*'
  // show / hide wrap what is drawn; simplified, so that repeating them does
  // not nest the expression deeper each time
  const next =
    name === 'as'
      ? selStr
      : simplifySel(
          ctx,
          name === 'show' ? `(${current}) or (${selStr})` : `(${current}) and not (${selStr})`,
          cc.sceneId,
        )
  if (!(await writeSelection(ctx, cc, existing.id, next))) {
    return { ok: false, error: `Error: could not change ${rep} on "${obj.name}"` }
  }
  await setVisible(ctx, cc, existing.id, 'renderer', true)
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
    async run(ctx, args, cc): Promise<CmdOutcome> {
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
          const kept = req.reps.flatMap((r) => [r, ...(COMPANIONS[r] ?? []).map((c) => c.rep)])
          for (const other of renderersOf(ctx, cc.sceneId, item.obj.uid)) {
            const otherRep = other.name.slice(OWNED.length)
            if (other.name.startsWith(OWNED) && !kept.includes(otherRep) && otherRep !== 'labels') {
              await hideOwned(ctx, cc, other.id)
            }
          }
        }
        for (const rep of req.reps) {
          const res = await applyRep(ctx, cc, name, item, rep, whole)
          if (!res.ok) return res
        }
      }

      if (req.labels) {
        // Labels have their text; only showing, hiding, or taking them off
        // part of the molecule means anything here.
        if (name === 'hide' && !whole) {
          if (!(await removeConsoleLabels(ctx, cc, sels.items))) {
            return { ok: false, error: `Error: "${selArg}" did not compile` }
          }
        } else {
          await setConsoleLabelsVisible(ctx, cc, sels.items, name !== 'hide')
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
  async run(ctx, args, cc) {
    const colour = toCueMolColor(args.color)
    if (colour === null) return { ok: false, error: `Error: unknown color: "${args.color}"` }

    const sels = moleculeSelections(ctx, cc.sceneId, args.selection)
    if (!sels.ok) return sels

    let painted = 0
    for (const { obj, selStr } of sels.items) {
      // add_paint reads its region from the molecule's selection, which it
      // sets; what the user had selected is put back afterwards.
      const before = readMolSelection(ctx, cc.sceneId, obj.uid)
      let attempted = false
      for (const rend of renderersOf(ctx, cc.sceneId, obj.uid)) {
        if (!rend.name.startsWith(OWNED)) continue
        attempted = true
        // add_paint switches the renderer to paint colouring only when it is
        // not one already, so earlier colours stay.
        const res = await runOp(ctx, cc, 'add_paint', {
          nodeId: rend.id,
          nodeType: 'renderer',
          selection: selStr,
          color: colour,
        })
        if (res.ok) painted += 1
      }
      if (attempted) await setMolSelection(ctx, cc, obj.uid, before)
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

/**
 * Give the members of the load preset just made on `objectName` (named
 * `pym:<type>`, see fileCommands.ts) the console's representation names, so
 * `hide sticks` or `set stick_radius` reach them. The newest object of that
 * name is the one just loaded.
 */
export async function adoptPresetRenderers(ctx: WorkerContext, cc: CmdContext, objectName: string): Promise<void> {
  const mol = molecules(ctx, cc.sceneId, objectName).at(-1)
  if (!mol) return
  for (const rend of renderersOf(ctx, cc.sceneId, mol.uid)) {
    const rep = PRESET_MEMBER_REPS[rend.name.slice(OWNED.length)]
    if (!rend.name.startsWith(OWNED) || rep === undefined) continue
    await runOp(ctx, cc, 'rename_node', { nodeId: rend.id, nodeType: 'renderer', name: `${OWNED}${rep}` })
  }
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
