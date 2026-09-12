/**
 * @file plugins/agent/worker/tools/rendererTools.ts
 * @description Tools that create and configure renderers.
 */

import { getNewRendererOptions } from '@renderer/worker/server/services/rend/getNewRendererOptions'
import { createRendererOnObject } from '@renderer/worker/server/services/rend/createRendererOnObject'
import { getGenericProps } from '@renderer/worker/server/services/props/read'
import { setGenericProp } from '@renderer/worker/server/services/props/write'
import { getPaintColoringStyles } from '@renderer/worker/server/services/coloring/panelList'
import { setRendererColoring } from '@renderer/worker/server/services/coloring/applyColoring'
import type { RendColoringId } from '@shared/types/sceneCtxMenu'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import { normalizeServiceResult } from '../toolOutput'
import type { AgentTool, ToolOutcome } from './types'
import { enumStr, int, nullable, str, strictSchema } from './types'

/** The colouring modes that are not style names. */
const PAINT_TYPES = [
  'paint-type-cpk',
  'paint-type-rainbow',
  'paint-type-bfac',
  'paint-type-solid',
  'paint-type-resetdef',
] as const

const getRendererTypes: AgentTool = {
  name: 'get_renderer_types',
  description:
    'List the renderer types that can be created on one object (for example simple, ball, ' +
    'cartoon, spacefill), and the presets available. Only a type from this list will work.',
  parameters: strictSchema({
    objId: int('Uid of the object, from get_scene_state.'),
  }),
  mutates: false,
  run(ctx, input, turn) {
    const result = getNewRendererOptions(ctx, {
      sceneId: turn.sceneId,
      sourceNodeId: Number(input.objId),
      sourceNodeType: 'object',
    })
    if (!result.ok) return { ok: false, error: 'No object with that id in this scene.' }
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
}

/**
 * Build the full `RendererOptions` from the few fields the model supplies.
 *
 * The dialog fills the rest in from the user's choices; a headless call has
 * no dialog, so the same fields get the values the dialog would have started
 * with.
 */
function rendererOptions(
  objectName: string,
  rendererType: string,
  rendererName: string,
  selection: string | null,
): Record<string, unknown> {
  return {
    objectName,
    rendererType,
    rendererName,
    selectionEnabled: selection !== null,
    selection: selection ?? '*',
    centerView: false,
    mapCenterPolicy: 'auto',
  }
}

const createRenderer: AgentTool = {
  name: 'create_renderer',
  description:
    'Draw an object a new way: create a renderer of the given type on it. Returns the new ' +
    "renderer's uid. The type must be one get_renderer_types listed for that object.",
  parameters: strictSchema({
    objId: int('Uid of the object to draw.'),
    rendererType: str('Renderer type, from get_renderer_types.'),
    name: nullable('string', 'Name for the renderer. Null picks an unused default.'),
    selection: nullable(
      'string',
      'Draw only this selection. Null draws the whole object. Check it with check_selection first.',
    ),
  }),
  mutates: true,
  run(ctx, input, turn) {
    const objId = Number(input.objId)
    const rendererType = String(input.rendererType)
    const options = getNewRendererOptions(ctx, {
      sceneId: turn.sceneId,
      sourceNodeId: objId,
      sourceNodeType: 'object',
    })
    if (!options.ok) return { ok: false, error: 'No object with that id in this scene.' }
    if (!options.rendererTypes.includes(rendererType)) {
      return {
        ok: false,
        error: `This object has no renderer type "${rendererType}". Available: ${options.rendererTypes.join(', ')}.`,
      }
    }
    const name = input.name === null || input.name === undefined
      ? options.defaultName || `${rendererType}1`
      : String(input.name)
    const selection = input.selection === null || input.selection === undefined
      ? null
      : String(input.selection)

    const result = createRendererOnObject(ctx, {
      sceneId: turn.sceneId,
      objId,
      rendOpts: rendererOptions(
        options.objName,
        rendererType,
        name,
        selection,
      ) as never,
    })
    if (!result.ok) return { ok: false, error: 'The renderer could not be created.' }
    return { ok: true, data: { rendererId: result.newRendId, name: result.newName } }
  },
}

const setRendererSelection: AgentTool = {
  name: 'set_renderer_selection',
  description:
    'Change which atoms one renderer draws. Check the expression with check_selection first: ' +
    'an expression that matches nothing leaves the renderer drawing nothing.',
  parameters: strictSchema({
    rendId: int('Uid of the renderer.'),
    selection: str('Selection expression the renderer should draw.'),
  }),
  mutates: true,
  run(ctx, input, turn) {
    // `setRendererSelection` takes six fixed kinds (all, visible, none, ...)
    // rather than an expression, so an arbitrary one is written through the
    // generic property path, which compiles it with `makeSel`.
    const result = setGenericProp(ctx, {
      sceneId: turn.sceneId,
      nodeId: Number(input.rendId),
      nodeType: 'renderer',
      propName: 'sel',
      op: 'set',
      valueType: 'object<MolSelection>',
      value: String(input.selection),
      mode: 'commit',
    })
    return normalizeServiceResult(
      result,
      'The selection could not be applied to that renderer. Check the id and the expression.',
    )
  },
}

const getRendererProps: AgentTool = {
  name: 'get_renderer_props',
  description:
    'List the writable properties of one renderer with their current values and, for ' +
    'enumerated ones, the allowed values. Read this before set_renderer_prop.',
  parameters: strictSchema({
    rendId: int('Uid of the renderer.'),
  }),
  mutates: false,
  run(ctx, input, turn) {
    const result = getGenericProps(ctx, {
      sceneId: turn.sceneId,
      nodeId: Number(input.rendId),
      nodeType: 'renderer',
    })
    if (!result.ok) return { ok: false, error: 'No renderer with that id in this scene.' }
    return {
      ok: true,
      data: {
        type: result.typeLabel,
        name: result.displayName,
        // Container rows are the headers of nested objects: they carry no
        // value and cannot be written, so they are noise here.
        properties: result.entries
          .filter((e: GenericPropEntry) => !e.isContainer)
          .map((e: GenericPropEntry) => ({
            key: e.key,
            type: e.type,
            value: e.value,
            readonly: e.readonly,
            ...(e.enumdef ? { allowed: e.enumdef } : {}),
          })),
      },
    }
  },
}

/** Coerce the model's string into what the property's C++ type expects. */
function coerceProp(entry: GenericPropEntry, raw: string): string | number | boolean | null {
  switch (entry.type) {
    case 'boolean': {
      const v = raw.trim().toLowerCase()
      if (v === 'true' || v === '1' || v === 'yes') return true
      if (v === 'false' || v === '0' || v === 'no') return false
      return null
    }
    case 'integer': {
      const n = Number(raw)
      return Number.isInteger(n) ? n : null
    }
    case 'real': {
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    }
    default:
      return raw
  }
}

const setRendererProp: AgentTool = {
  name: 'set_renderer_prop',
  description:
    'Set one property of one renderer, for example a width, a detail level, or a mode. ' +
    'Call get_renderer_props first: the property name, its type, and the allowed values ' +
    'all come from there.',
  parameters: strictSchema({
    rendId: int('Uid of the renderer.'),
    prop: str('Property name, exactly as get_renderer_props reported it.'),
    value: str('New value, written as text. It is converted to the property type.'),
  }),
  mutates: true,
  run(ctx, input, turn): ToolOutcome {
    const rendId = Number(input.rendId)
    const propName = String(input.prop)
    const props = getGenericProps(ctx, {
      sceneId: turn.sceneId,
      nodeId: rendId,
      nodeType: 'renderer',
    })
    if (!props.ok) return { ok: false, error: 'No renderer with that id in this scene.' }
    const entry = props.entries.find((e: GenericPropEntry) => e.key === propName)
    if (!entry) {
      return {
        ok: false,
        error: `This renderer has no property "${propName}". Call get_renderer_props for the list.`,
      }
    }
    if (entry.readonly) return { ok: false, error: `"${propName}" is read only.` }

    const raw = String(input.value)
    if (entry.enumdef && !entry.enumdef.includes(raw)) {
      return {
        ok: false,
        error: `"${raw}" is not allowed for "${propName}". Allowed: ${entry.enumdef.join(', ')}.`,
      }
    }
    const value = coerceProp(entry, raw)
    if (value === null) {
      return { ok: false, error: `"${raw}" is not a valid ${entry.type} for "${propName}".` }
    }

    const result = setGenericProp(ctx, {
      sceneId: turn.sceneId,
      nodeId: rendId,
      nodeType: 'renderer',
      propName,
      op: 'set',
      valueType: entry.type,
      value,
      mode: 'commit',
    })
    return normalizeServiceResult(result, `"${propName}" could not be written.`)
  },
}

const getColoringStyles: AgentTool = {
  name: 'get_coloring_styles',
  description:
    'List the named colouring styles available in this scene. These are the style names ' +
    'set_renderer_coloring accepts; the fixed modes it also accepts are listed in its own ' +
    'description.',
  parameters: strictSchema({}),
  mutates: false,
  run(ctx, _input, turn) {
    const result = getPaintColoringStyles(ctx, { sceneId: turn.sceneId })
    if (!result.ok) return { ok: false, error: 'The colouring styles could not be read.' }
    return { ok: true, data: { styles: result.entries.map((e) => e.name) } }
  },
}

const setRendererColoringTool: AgentTool = {
  name: 'set_renderer_coloring',
  description:
    'Colour one renderer. Either give a mode -- cpk (by element), rainbow (along the chain), ' +
    'bfac (by B-factor), solid (one colour), resetdef (back to the default) -- or a style ' +
    'name from get_coloring_styles.',
  parameters: strictSchema({
    rendId: int('Uid of the renderer.'),
    mode: enumStr(
      [...PAINT_TYPES, 'style'],
      'One of the fixed modes, or "style" to use styleName instead.',
    ),
    styleName: nullable(
      'string',
      'Style name from get_coloring_styles. Required when mode is "style", otherwise null.',
    ),
  }),
  mutates: true,
  run(ctx, input, turn) {
    const mode = String(input.mode)
    let coloringId: RendColoringId
    if (mode === 'style') {
      const styleName = input.styleName === null || input.styleName === undefined
        ? ''
        : String(input.styleName)
      if (styleName === '') {
        return { ok: false, error: 'mode is "style" but no styleName was given.' }
      }
      const styles = getPaintColoringStyles(ctx, { sceneId: turn.sceneId })
      if (styles.ok && !styles.entries.some((e) => e.name === styleName)) {
        return {
          ok: false,
          error: `No colouring style named "${styleName}". Call get_coloring_styles for the list.`,
        }
      }
      coloringId = `style-${styleName}`
    } else {
      coloringId = mode as RendColoringId
    }

    const result = setRendererColoring(ctx, {
      sceneId: turn.sceneId,
      rendId: Number(input.rendId),
      coloringId,
      targetKind: 'renderer',
    })
    return normalizeServiceResult(result, 'The colouring could not be applied to that renderer.')
  },
}

export const RENDERER_TOOLS: AgentTool[] = [
  getRendererTypes,
  createRenderer,
  setRendererSelection,
  getRendererProps,
  setRendererProp,
  getColoringStyles,
  setRendererColoringTool,
]
