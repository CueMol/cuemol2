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
import { getSceneTree } from '@renderer/worker/server/services/sceneTree/sceneTree'
import { setNodeVisible } from '@renderer/worker/server/services/sceneTree/sceneTree'
import { applyMolSelString } from '@renderer/worker/server/services/select/applyMolSelString'
import { setRendererColoring } from '@renderer/worker/server/services/coloring/applyColoring'
import { getRendererPaintInfo } from '@renderer/worker/server/services/coloring/panelList'
import { paintRendererSelection } from '@renderer/worker/server/services/coloring/paintCrud'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import type { SceneObjectEntry } from '@renderer/worker/server/services/scene/listSceneObjects'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { translateSelection } from '../sel/translate'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { molecules } from './helpers'
import { toCueMolColor } from './pymolColors'

/** Prefix marking a renderer this console owns. */
const OWNED = 'pym:'

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
  labels: '*namelabel',
}

const UNSUPPORTED_REPS: Readonly<Record<string, string>> = {
  mesh: 'mesh: a density representation; use isomesh on a map object',
  dots: 'dots: a density representation; use isodot on a map object',
  volume: 'volume: not available from this console',
  slice: 'slice: CueMol has no slice representation',
  cell: 'cell: use the unit cell renderer from the GUI',
  ellipsoids: 'ellipsoids: use the anisou renderer from the GUI',
}

/** The renderers of one object, from the scene tree. */
function renderersOf(ctx: WorkerContext, sceneId: number, objId: number): SceneTreeNode[] {
  const tree = getSceneTree(ctx, { sceneId })
  if (!tree.ok || !tree.tree) return []
  const obj = tree.tree.children.find((c) => c.id === objId && c.type === 'object')
  if (!obj) return []
  const out: SceneTreeNode[] = []
  const walk = (nodes: SceneTreeNode[]): void => {
    for (const n of nodes) {
      if (n.type === 'renderer') out.push(n)
      if (n.children.length > 0) walk(n.children)
    }
  }
  walk(obj.children)
  return out
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

/** Resolve a PyMOL representation name, or say why it cannot be. */
function representation(name: string): { ok: true; rep: string; type: string } | { ok: false; error: string } {
  const key = name.trim().toLowerCase()
  if (key === '') return { ok: false, error: 'Error: no representation given' }
  const reason = UNSUPPORTED_REPS[key]
  if (reason !== undefined) return { ok: false, error: `Error: ${reason}` }
  const type = REPRESENTATIONS[key]
  if (type === undefined) {
    const known = Object.keys(REPRESENTATIONS).sort().join(', ')
    return { ok: false, error: `Error: unknown representation "${name}" (one of ${known})` }
  }
  return { ok: true, rep: key, type }
}

/** `show` / `hide` / `as`, which differ only in how the selection is combined. */
function repCommand(name: 'show' | 'hide' | 'as'): PymCommand {
  return {
    name,
    params: [
      { name: 'representation', default: '' },
      { name: 'selection', default: 'all' },
      ...(name === 'as' ? [] : [{ name: 'state', default: '0' }]),
    ],
    mode: 'strict',
    mutates: true,
    summary:
      name === 'show'
        ? 'Add a representation over a selection.'
        : name === 'hide'
          ? 'Take a representation off a selection, or hide it entirely.'
          : 'Show one representation and hide the rest.',
    completions: [
      { source: 'representations', description: 'representation', suffix: ', ' },
      { source: 'selections', description: 'selection', suffix: '' },
    ],
    run(ctx, args, cc): CmdOutcome {
      const rep = representation(args.representation)
      if (!rep.ok) return rep

      const wholeObject = args.selection.trim() === '' || args.selection.trim() === 'all'
      // `hide rep` with nothing to hide from means hide the renderer.
      const hideAll = name === 'hide' && wholeObject

      let selStr = '*'
      if (!wholeObject) {
        const translated = translateSelection(args.selection)
        if (!translated.ok) return translated
        selStr = translated.expr
      }

      const targets = molecules(ctx, cc.sceneId)
      if (targets.length === 0) return { ok: false, error: 'Error: no molecule in the scene' }

      for (const obj of targets) {
        const existing = ownedRenderer(ctx, cc.sceneId, obj.uid, rep.rep)

        if (hideAll) {
          if (existing) {
            setNodeVisible(ctx, {
              sceneId: cc.sceneId,
              nodeId: existing.id,
              nodeType: 'renderer',
              visible: false,
            })
          }
          continue
        }

        if (name === 'as') {
          // Everything else this console put on the object steps aside.
          for (const other of renderersOf(ctx, cc.sceneId, obj.uid)) {
            if (other.name.startsWith(OWNED) && other.name !== `${OWNED}${rep.rep}`) {
              setNodeVisible(ctx, {
                sceneId: cc.sceneId,
                nodeId: other.id,
                nodeType: 'renderer',
                visible: false,
              })
            }
          }
        }

        if (!existing) {
          if (name === 'hide') continue
          const created = createOwned(ctx, cc, obj, rep.rep, rep.type, selStr)
          if (!created.ok) return created
          continue
        }

        // It is there: combine with what it already draws, which is what
        // makes show additive and hide subtractive the way PyMOL's flags are.
        const current = readProp(ctx, cc.sceneId, existing.id, 'sel') ?? '*'
        const next =
          name === 'as'
            ? selStr
            : name === 'show'
              ? `(${current}) or (${selStr})`
              : `(${current}) and not (${selStr})`
        if (!writeSelection(ctx, cc.sceneId, existing.id, next)) {
          return { ok: false, error: `Error: could not change ${rep.rep} on "${obj.name}"` }
        }
        setNodeVisible(ctx, {
          sceneId: cc.sceneId,
          nodeId: existing.id,
          nodeType: 'renderer',
          visible: true,
        })
      }
      return { ok: true }
    },
  }
}

const color: PymCommand = {
  name: 'color',
  params: [{ name: 'color' }, { name: 'selection', default: 'all' }],
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

    const wholeObject = args.selection.trim() === '' || args.selection.trim() === 'all'
    let selStr = '*'
    if (!wholeObject) {
      const translated = translateSelection(args.selection)
      if (!translated.ok) return translated
      selStr = translated.expr
    }

    const targets = molecules(ctx, cc.sceneId)
    if (targets.length === 0) return { ok: false, error: 'Error: no molecule in the scene' }

    let painted = 0
    for (const obj of targets) {
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

/** The representation names this console accepts, for completion. */
export function representationNames(): string[] {
  return Object.keys(REPRESENTATIONS).sort()
}

export const REP_COMMANDS: PymCommand[] = [
  repCommand('show'),
  repCommand('hide'),
  repCommand('as'),
  color,
]
