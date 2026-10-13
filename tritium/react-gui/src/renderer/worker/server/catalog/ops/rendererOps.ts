/**
 * @file worker/server/catalog/ops/rendererOps.ts
 * @description Ops that create and configure renderers.
 */

import {
  getNewRendererOptions,
  unusedRendererName,
} from '@renderer/worker/server/services/rend/getNewRendererOptions'
import { createRendererOnObject } from '@renderer/worker/server/services/rend/createRendererOnObject'
import { changeRendererType as changeRendererTypeService } from '@renderer/worker/server/services/rend/changeRendererType'
import { getRendererChangeTypes } from '@renderer/worker/server/services/rend/getRendererChangeTypes'
import {
  coloringStyleNames,
  getRendererPaintInfo,
} from '@renderer/worker/server/services/coloring/panelList'
import { setGenericProp } from '@renderer/worker/server/services/props/write'
import { setColoringProp, setRendererColoring } from '@renderer/worker/server/services/coloring/applyColoring'
import { paintObjectSelection, paintRendererSelection } from '@renderer/worker/server/services/coloring/paintCrud'
import { applyMolSelString } from '@renderer/worker/server/services/select/applyMolSelString'
import { getMolFromRenderer, getObjectColoringClassName } from '@renderer/worker/server/services/coloring/colorTargets'
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord'
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import type { RendColoringId } from '@shared/types/sceneCtxMenu'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { NO_OBJECT, NO_RENDERER } from '../errors'
import { defineOp } from '../op'
import type { OpOutcome } from '../op'
import { boolean, color, coloringTarget, enumOf, objectId, optional, rendererId, rendererType, selection, string } from '../params'

/** The colouring modes that are not style names. */
const PAINT_TYPES = [
  'paint-type-cpk',
  'paint-type-rainbow',
  'paint-type-bfac',
  'paint-type-solid',
  'paint-type-resetdef',
] as const

export const getRendererTypes = defineOp({
  name: 'list_renderer_types',
  description:
    'List the renderer types that can be created on one object (for example simple, ball, ' +
    'cartoon, spacefill), and the presets available. Only a type from this list will work.',
  params: {
    objId: objectId('Uid of the object, from get_scene_state.'),
  },
  mutates: false,
  expose: { tool: 'core', console: true },
  group: 'renderers',
  run(ctx, args, oc) {
    const result = getNewRendererOptions(ctx, {
      sceneId: oc.sceneId,
      sourceNodeId: args.objId,
      sourceNodeType: 'object',
    })
    if (!result.ok) return { ok: false, error: NO_OBJECT }
    return {
      ok: true,
      data: {
        rendererTypes: result.rendererTypes,
        presetTypes: result.presetTypes.map((p) => p.name),
        defaultName: result.defaultName,
        objectName: result.objName,
        isMolecule: result.isMol,
      },
    }
  },
})

/**
 * Build the full `RendererOptions` from the few fields the caller supplies.
 *
 * The dialog fills the rest in from the user's choices; a headless call has
 * no dialog, so the same fields get the values the dialog would have started
 * with.
 */
function rendererOptions(
  objectName: string,
  rendererType: string,
  rendererName: string,
  sel: string | null,
  centerView = false,
): Record<string, unknown> {
  return {
    objectName,
    rendererType,
    rendererName,
    selectionEnabled: sel !== null,
    selection: sel ?? '*',
    centerView,
    mapCenterPolicy: 'auto',
  }
}

const CENTER_VIEW_DESC = 'True also centres the view on the new renderer (MolCoord objects only). Null or false leaves the view.'

export const createRenderer = defineOp({
  name: 'create_renderer',
  description:
    'Draw an object a new way: create a renderer of the given type on it. Returns the new ' +
    "renderer's uid. The type must be one list_renderer_types listed for that object.",
  params: {
    objId: objectId('Uid of the object to draw.'),
    rendererType: rendererType('Renderer type, from list_renderer_types.'),
    name: optional(string('Name for the renderer. Null picks an unused default.')),
    selection: optional(
      selection('Draw only this selection. Null draws the whole object. Check it with count_selection first.'),
    ),
    centerView: optional(boolean(CENTER_VIEW_DESC)),
  },
  mutates: true,
  describe: (a, n) => `Add ${a.rendererType}${a.name ? ` ${a.name}` : ''} to ${n('objId')}${a.selection ? ` (${a.selection})` : ''}`,
  expose: { tool: 'core', console: true },
  group: 'renderers',
  run(ctx, args, oc) {
    const options = getNewRendererOptions(ctx, {
      sceneId: oc.sceneId,
      sourceNodeId: args.objId,
      sourceNodeType: 'object',
    })
    if (!options.ok) return { ok: false, error: NO_OBJECT }
    if (!options.rendererTypes.includes(args.rendererType)) {
      return {
        ok: false,
        error: `This object has no renderer type "${args.rendererType}". Available: ${options.rendererTypes.join(', ')}.`,
      }
    }
    // The dialog's default name is for its first type, not the one asked for.
    const scene = getSceneOrNull(ctx, oc.sceneId)
    const name = args.name ?? (scene ? unusedRendererName(scene, args.rendererType) : `${args.rendererType}1`)

    const result = createRendererOnObject(ctx, {
      sceneId: oc.sceneId,
      objId: args.objId,
      rendOpts: rendererOptions(
        options.objName,
        args.rendererType,
        name,
        args.selection,
        args.centerView ?? false,
      ) as never,
    })
    if (!result.ok) return { ok: false, error: 'The renderer could not be created.' }
    return { ok: true, data: { rendererId: result.newRendId, name: result.newName } }
  },
})

export const createPresetRenderer = defineOp({
  name: 'create_preset_renderer',
  description:
    'Draw an object with a renderer preset: a renderer group whose renderers, selections and ' +
    'styles the preset (a style) defines. The preset must be one list_renderer_types listed ' +
    "for that object. Returns the group's uid.",
  params: {
    objId: objectId('Uid of the object to draw.'),
    preset: string('Preset name, from the presetTypes of list_renderer_types.'),
    name: string('Name of the group; its renderers are named after it.'),
    centerView: optional(boolean(CENTER_VIEW_DESC)),
  },
  mutates: true,
  describe: (a, n) => `Add preset ${a.preset} ${a.name} to ${n('objId')}`,
  expose: { tool: 'core', console: true },
  group: 'renderers',
  run(ctx, args, oc) {
    const options = getNewRendererOptions(ctx, {
      sceneId: oc.sceneId,
      sourceNodeId: args.objId,
      sourceNodeType: 'object',
    })
    if (!options.ok) return { ok: false, error: NO_OBJECT }
    const presets = options.presetTypes.map((p) => p.name)
    if (!presets.includes(args.preset)) {
      return {
        ok: false,
        error: `This object has no renderer preset "${args.preset}". Available: ${presets.join(', ') || 'none'}.`,
      }
    }
    const result = createRendererOnObject(ctx, {
      sceneId: oc.sceneId,
      objId: args.objId,
      rendOpts: { ...rendererOptions(options.objName, '', args.name, null, args.centerView ?? false), presetName: args.preset } as never,
    })
    if (!result.ok) return { ok: false, error: 'The preset renderer could not be created.' }
    return { ok: true, data: { rendererId: result.newRendId, name: result.newName } }
  },
})

export const setRendererSelection = defineOp({
  name: 'set_renderer_selection',
  description:
    'Change which atoms one renderer draws. Check the expression with count_selection first: ' +
    'an expression that matches nothing leaves the renderer drawing nothing.',
  params: {
    rendId: rendererId('Uid of the renderer.'),
    selection: selection('Selection expression the renderer should draw.'),
  },
  mutates: true,
  describe: (a, n) => `Draw ${a.selection} in ${n('rendId')}`,
  expose: { tool: 'core', console: true },
  group: 'renderers',
  run(ctx, args, oc) {
    // `setRendererSelection` takes six fixed kinds (all, visible, none, ...)
    // rather than an expression, so an arbitrary one is written through the
    // generic property path, which compiles it with `makeSel`.
    const result = setGenericProp(ctx, {
      sceneId: oc.sceneId,
      nodeId: args.rendId,
      nodeType: 'renderer',
      propName: 'sel',
      op: 'set',
      valueType: 'object<MolSelection>',
      value: args.selection,
      mode: 'commit',
    })
    return normalizeServiceResult(
      result,
      'The selection could not be applied to that renderer. Check the id and the expression.',
    )
  },
})

export const getColoringStyles = defineOp({
  name: 'list_coloring_styles',
  description:
    'List the named colouring styles available in this scene. These are the style names ' +
    'set_renderer_coloring accepts; the fixed modes it also accepts are listed in its own ' +
    'description.',
  params: {},
  mutates: false,
  expose: { tool: 'coloring', console: true },
  group: 'coloring',
  run(ctx, _args, oc) {
    return { ok: true, data: { styles: coloringStyleNames(ctx, oc.sceneId) } }
  },
})

export const setRendererColoringOp = defineOp({
  name: 'set_renderer_coloring',
  description:
    'Colour one renderer, or an object (the colouring its renderers take by default; style ' +
    'names are for renderers only). Either give a mode -- cpk (by element), rainbow (along the chain), ' +
    'bfac (by B-factor), solid (one colour), resetdef (back to the default) -- or a style ' +
    'name from list_coloring_styles.',
  params: {
    ...coloringTarget('to colour'),
    mode: enumOf(
      [...PAINT_TYPES, 'style'],
      'One of the fixed modes, or "style" to use styleName instead.',
    ),
    styleName: optional(
      string('Style name from list_coloring_styles. Required when mode is "style", otherwise null.'),
    ),
  },
  mutates: true,
  describe: (a, n) => `Colour ${n('nodeId')} by ${a.styleName ?? a.mode}`,
  expose: { tool: 'core', console: true },
  group: 'coloring',
  run(ctx, args, oc) {
    let coloringId: RendColoringId
    if (args.mode === 'style' && args.nodeType === 'object') {
      return { ok: false, error: 'A colouring style can only be set on a renderer.' }
    }
    if (args.mode === 'style') {
      const styleName = args.styleName ?? ''
      if (styleName === '') {
        return { ok: false, error: 'mode is "style" but no styleName was given.' }
      }
      if (!coloringStyleNames(ctx, oc.sceneId).includes(styleName)) {
        return {
          ok: false,
          error: `No colouring style named "${styleName}". Call list_coloring_styles for the list.`,
        }
      }
      coloringId = `style-${styleName}`
    } else {
      coloringId = args.mode as RendColoringId
    }

    const result = setRendererColoring(ctx, {
      sceneId: oc.sceneId,
      rendId: args.nodeId,
      coloringId,
      targetKind: args.nodeType,
    })
    return normalizeServiceResult(result, `The colouring could not be applied to that ${args.nodeType}.`)
  },
})

/** A property value as typed: a number when it reads as one (hues, params), else the text. */
function coloringPropValue(text: string): string | number {
  const t = text.trim()
  return t !== '' && Number.isFinite(Number(t)) ? Number(t) : text
}

export const setColoringPropOp = defineOp({
  name: 'set_coloring_prop',
  description:
    'Set one property of the colouring a renderer or an object uses (what the CPK, Rainbow and ' +
    'B-factor sections of the Coloring panel change), e.g. col_C, start / end hue, mode, lowcol. ' +
    'A colouring still shared from a style is given its own copy first, so only this one changes.',
  params: {
    ...coloringTarget('whose colouring to change'),
    prop: string('Property name of the colouring scheme.'),
    value: string('The value, as text: a colour, a number, or a mode name.'),
  },
  mutates: true,
  describe: (a, n) => `Set ${a.prop} = ${a.value} on the colouring of ${n('nodeId')}`,
  expose: { tool: 'coloring', console: true },
  group: 'coloring',
  run(ctx, args, oc) {
    return normalizeServiceResult(
      setColoringProp(ctx, {
        sceneId: oc.sceneId,
        rendId: args.nodeId,
        targetKind: args.nodeType,
        propName: args.prop,
        propValue: coloringPropValue(args.value),
      }),
      `That colouring property could not be set (does the ${args.nodeType} have a colouring with "${args.prop}"?).`,
    )
  },
})

export const paintSelection = defineOp({
  name: 'add_paint',
  description:
    'Colour part of what one renderer (or every renderer of an object that follows its ' +
    'colouring) draws, leaving the rest as it is. Use this for "make ' +
    'chain A red" or "colour the ligand yellow" -- set_renderer_coloring replaces the whole ' +
    "renderer's colouring instead. Painting the same renderer again adds another colour on " +
    'top, so several regions can be coloured one call at a time.',
  params: {
    ...coloringTarget('to paint'),
    selection: selection('Which atoms to colour. Check it with count_selection first.'),
    color: color(
      'Colour as hex ("#FF0000"), a CueMol colour name ("red"), or hsb(h,s,b). ' +
        'Hex is the safest.',
    ),
  },
  mutates: true,
  describe: (a, n) => `Paint ${a.selection} ${a.color} on ${n('nodeId')}`,
  expose: { tool: 'core', console: true },
  group: 'coloring',
  run(ctx, args, oc): OpOutcome {
    const target = { sceneId: oc.sceneId, rendId: args.nodeId, targetKind: args.nodeType }
    if (args.selection.trim() === '') {
      return { ok: false, error: 'The selection expression is empty.' }
    }

    const scene = getSceneOrNull(ctx, oc.sceneId)
    if (!scene) return { ok: false, error: 'The scene could not be read.' }
    const onObject = args.nodeType === 'object'
    const node = onObject ? scene.getObject(args.nodeId) : scene.getRenderer(args.nodeId)
    if (!node) return { ok: false, error: onObject ? NO_OBJECT : NO_RENDERER }
    const mol = onObject ? (node as unknown as MolCoord) : getMolFromRenderer(node as Renderer)
    if (!mol) {
      return { ok: false, error: `That ${args.nodeType} is not on a MolCoord object, so it cannot be painted.` }
    }

    // The paint service reads the region from the MolCoord object's current
    // selection rather than taking it as an argument, so it has to be set
    // first. This is a visible side effect: the user sees the selection
    // change, the same as if they had made it by hand.
    const applied = applyMolSelString(ctx, {
      sceneId: oc.sceneId,
      molId: mol.uid,
      selStr: args.selection,
    })
    if (!applied.ok) {
      return {
        ok: false,
        error: 'That selection could not be applied. Check it with count_selection.',
      }
    }

    // Painting needs a PaintColoring to insert into; anything else has no
    // per-selection entries. Switching costs the renderer's previous
    // colouring, which is why it is only done when it is not one already.
    const canPaint = onObject
      ? getObjectColoringClassName(mol) === 'PaintColoring'
      : getRendererPaintInfo(ctx, { sceneId: oc.sceneId, rendId: args.nodeId }).canPaint
    if (!canPaint) {
      const switched = setRendererColoring(ctx, { ...target, coloringId: 'paint-type-paint' })
      if (!switched.ok) {
        return { ok: false, error: `That ${args.nodeType} cannot be switched to per-selection colouring.` }
      }
    }

    const painted = onObject
      ? paintObjectSelection(ctx, { sceneId: oc.sceneId, objId: args.nodeId, colorValue: args.color })
      : paintRendererSelection(ctx, { sceneId: oc.sceneId, rendId: args.nodeId, colorValue: args.color })
    if (!painted.ok) {
      return {
        ok: false,
        error:
          `The colour could not be applied. Check that "${args.color}" is a colour ` +
          'CueMol knows, and that the selection matches some atoms.',
      }
    }
    return { ok: true, data: { nodeId: args.nodeId, nodeType: args.nodeType, selection: args.selection, color: args.color } }
  },
})

export const changeRendererType = defineOp({
  name: 'set_renderer_type',
  description:
    'Redraw one renderer as another type (for example cartoon to ribbon), keeping its name, ' +
    'selection and place in the list. The renderer is replaced, so it gets a NEW uid, which ' +
    'is returned; use that one from now on. Use this rather than creating a second renderer ' +
    'when the user wants the same thing drawn differently.',
  params: {
    rendId: rendererId('Uid of the renderer.'),
    rendererType: rendererType('The new type. Must be one the renderer can change to; a wrong one is answered with the list.'),
  },
  mutates: true,
  describe: (a, n) => `Change ${n('rendId')} to ${a.rendererType}`,
  expose: { tool: 'core', console: true },
  group: 'renderers',
  aliases: [{ name: 'retype', summary: 'Redraw a renderer as another type: retype 1crn/cartoon1, ribbon' }],
  run(ctx, args, oc) {
    const allowed = getRendererChangeTypes(ctx, { sceneId: oc.sceneId, rendId: args.rendId }).typeNames
    if (!allowed.includes(args.rendererType)) {
      return {
        ok: false,
        error: allowed.length === 0
          ? 'That renderer cannot change type (or there is no renderer with that id).'
          : `It cannot become "${args.rendererType}". Allowed: ${allowed.join(', ')}.`,
      }
    }
    const result = changeRendererTypeService(ctx, { sceneId: oc.sceneId, rendId: args.rendId, newType: args.rendererType })
    if (!result.ok) return { ok: false, error: 'The renderer type could not be changed.' }
    return { ok: true, data: { rendererId: result.newRendId, name: result.newName } }
  },
})

export const RENDERER_OPS = [
  changeRendererType,
  getRendererTypes,
  createRenderer,
  createPresetRenderer,
  setRendererSelection,
  getColoringStyles,
  setRendererColoringOp,
  setColoringPropOp,
  paintSelection,
]
