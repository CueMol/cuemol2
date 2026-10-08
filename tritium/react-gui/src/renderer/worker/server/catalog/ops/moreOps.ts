/**
 * @file worker/server/catalog/ops/moreOps.ts
 * @description Ops over the remaining GUI services: renderer styles, paint
 * entries and default colours, saving files, animation playback, and
 * focusing on a node.
 */

import * as nodePath from 'path'
import {
  applyRendererStyle,
  getRendererStyleEntries,
} from '@renderer/worker/server/services/rend/rendererStyle'
import { clearPaintEntries } from '@renderer/worker/server/services/coloring/paintClipboard'
import { setRendererDefaultColor } from '@renderer/worker/server/services/coloring/applyColoring'
import { saveScene } from '@renderer/worker/server/services/scene/saveScene'
import { getObjectSaveInfo, saveObjectToFile } from '@renderer/worker/server/services/file/objectSave'
import { goTime, pause, play, stop } from '@renderer/worker/server/services/anim/transport'
import { focusOnNode } from '@renderer/worker/server/services/sceneTree/sceneOps'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { defineOp } from '../op'
import { color, enumOf, nodeId, objectId, optional, path, real, rendererId, string } from '../params'
import { outputPath } from '../outputFile'

export const listRendererStyles = defineOp({
  name: 'list_renderer_styles',
  description:
    'List the named styles one renderer can take: type styles (a whole look, e.g. a ribbon ' +
    'width preset) and edge styles (outlines). Apply one with apply_renderer_style.',
  params: { rendId: rendererId('Uid of the renderer.') },
  mutates: false,
  expose: { tool: 'style', console: true },
  run(ctx, args, oc) {
    const res = getRendererStyleEntries(ctx, { sceneId: oc.sceneId, rendId: args.rendId })
    if (!res.ok) return { ok: false, error: 'No renderer with that id in this scene.' }
    return {
      ok: true,
      data: {
        typeStyles: res.typeStyles.map((e) => ({ name: e.name, label: e.label })),
        edgeStyles: res.edgeStyles.map((e) => ({ name: e.name, label: e.label })),
      },
    }
  },
})

export const applyRendererStyleOp = defineOp({
  name: 'apply_renderer_style',
  description:
    'Apply a named style (from list_renderer_styles) to one renderer, replacing the style of ' +
    'the same kind it had.',
  params: {
    rendId: rendererId('Uid of the renderer.'),
    style: string('Style name, from list_renderer_styles.'),
  },
  mutates: true,
  expose: { tool: 'style', console: true },
  aliases: [{ name: 'style', summary: 'Apply a named style to a renderer: style 1crn/cartoon1, <name>' }],
  run(ctx, args, oc) {
    const res = getRendererStyleEntries(ctx, { sceneId: oc.sceneId, rendId: args.rendId })
    if (!res.ok) return { ok: false, error: 'No renderer with that id in this scene.' }
    const entry = [...res.typeStyles, ...res.edgeStyles].find((e) => e.name === args.style)
    if (!entry) {
      return { ok: false, error: `No style "${args.style}" for that renderer. Call list_renderer_styles for the names.` }
    }
    return normalizeServiceResult(
      applyRendererStyle(ctx, { sceneId: oc.sceneId, rendId: args.rendId, styleName: entry.name, pattern: entry.pattern, flags: entry.flags }),
      'The style could not be applied.',
    )
  },
})

export const clearPaint = defineOp({
  name: 'clear_paint',
  description: 'Remove every region painted on one renderer with paint_selection.',
  params: { rendId: rendererId('Uid of the renderer.') },
  mutates: true,
  expose: { tool: 'coloring', console: true },
  run(ctx, args, oc) {
    return normalizeServiceResult(
      clearPaintEntries(ctx, { sceneId: oc.sceneId, rendId: args.rendId }),
      'That renderer has no painted regions to clear.',
    )
  },
})

export const setDefaultColor = defineOp({
  name: 'set_default_color',
  description:
    'Set the colour a painted renderer uses where no painted region applies (its base colour).',
  params: {
    rendId: rendererId('Uid of the renderer.'),
    color: color('The colour, e.g. white or #c0c0c0.'),
  },
  mutates: true,
  expose: { tool: 'coloring', console: true },
  run(ctx, args, oc) {
    return normalizeServiceResult(
      setRendererDefaultColor(ctx, { sceneId: oc.sceneId, rendId: args.rendId, colorValue: args.color }),
      'The default colour could not be set (is the renderer painted?).',
    )
  },
})

export const saveSceneOp = defineOp({
  name: 'save_scene',
  description: 'Save the whole scene to a .qsc file.',
  params: { path: path('Where to write the .qsc file.') },
  mutates: false,
  // Saving resets the undo stack, which cannot happen inside an agent turn's
  // transaction: the console runs it alone on its line, an MCP call outside
  // any transaction.
  expose: { tool: false, console: true, mcp: true },
  outsideTxn: () => true,
  aliases: [{ name: 'save', summary: 'Save the scene: save ~/work/session.qsc' }],
  run(ctx, args, oc) {
    const target = outputPath(oc, args.path, '.qsc')
    if ('error' in target) return { ok: false, error: target.error }
    const res = saveScene(ctx, { sceneId: oc.sceneId, viewId: oc.viewId, filePath: target.path })
    return res.ok ? { ok: true, data: { path: target.path } } : { ok: false, error: `The scene could not be saved to ${target.path}.` }
  },
})

export const saveObject = defineOp({
  name: 'save_object',
  description:
    'Write one object to a file in the format its extension names (for a molecule e.g. .pdb ' +
    'or .cif). ' +
    'Give a plain file name, which is saved to the desktop, or an absolute path where the ' +
    'caller allows one; the full path is reported back -- tell the user where it went.',
  params: {
    objId: objectId('Uid of the object.'),
    fileName: path('The file, e.g. model.pdb.'),
  },
  mutates: false,
  expose: { tool: 'files', console: true },
  aliases: [{ name: 'write', summary: 'Write an object to a file: write 1crn, out.pdb' }],
  run(ctx, args, oc) {
    const target = outputPath(oc, args.fileName, '.pdb')
    if ('error' in target) return { ok: false, error: target.error }
    const info = getObjectSaveInfo(ctx, { sceneId: oc.sceneId, objId: args.objId })
    if (!info.ok) return { ok: false, error: 'No object with that id in this scene.' }
    const ext = nodePath.extname(target.path).slice(1).toLowerCase()
    const writer = info.filters.find((f) => f.extensions.map((e) => e.toLowerCase()).includes(ext))
    if (!writer) {
      const known = info.filters.flatMap((f) => f.extensions).join(', ')
      return { ok: false, error: `No writer for .${ext}. This object can be written as: ${known}.` }
    }
    const res = saveObjectToFile(ctx, { sceneId: oc.sceneId, objId: args.objId, path: target.path, writerName: writer.name })
    return res.ok ? { ok: true, data: { path: target.path, format: writer.name } } : { ok: false, error: `The object could not be written to ${target.path}.` }
  },
})

export const animate = defineOp({
  name: 'animate',
  description:
    'Control the scene\'s animation (made in the Animation panel): play it, pause it, stop it, or show ' +
    'the frame at a time.',
  params: {
    action: enumOf(['play', 'pause', 'stop', 'seek'], 'play, pause (keep the time), stop, or seek to timeMs.'),
    timeMs: optional(real('With seek: the time to show, in milliseconds. Null otherwise.')),
  },
  // Playback is not part of the undo history.
  mutates: false,
  expose: { tool: 'anim', console: true },
  run(ctx, args, oc) {
    if (args.action === 'seek' && args.timeMs === null) return { ok: false, error: 'seek needs timeMs.' }
    const res = args.action === 'play'
      ? play(ctx, { sceneId: oc.sceneId, viewId: oc.viewId })
      : args.action === 'pause'
        ? pause(ctx, { sceneId: oc.sceneId })
        : args.action === 'stop'
          ? stop(ctx, { sceneId: oc.sceneId })
          : goTime(ctx, { sceneId: oc.sceneId, viewId: oc.viewId, ms: args.timeMs ?? 0 })
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, data: { state: res.mgr.playState, timeMs: res.mgr.elapsedMs, lengthMs: res.mgr.lengthMs } }
  },
})

export const focusNode = defineOp({
  name: 'focus_node',
  description: 'Fit the view to one object or renderer (what double-clicking it in the scene tree does).',
  params: {
    nodeId: nodeId('Uid of the object, renderer, or renderer group.', 'nodeType'),
    nodeType: enumOf(['object', 'renderer', 'rendGroup'], 'What nodeId refers to.'),
  },
  mutates: false,
  expose: { tool: 'view', console: true },
  aliases: [{ name: 'focus', summary: 'Fit the view to a node: focus 1crn/cartoon1' }],
  run(ctx, args, oc) {
    return normalizeServiceResult(
      focusOnNode(ctx, { sceneId: oc.sceneId, viewId: oc.viewId, nodeId: args.nodeId, nodeType: args.nodeType }),
      'That node cannot be focused on.',
    )
  },
})

export const MORE_OPS = [
  listRendererStyles,
  applyRendererStyleOp,
  clearPaint,
  setDefaultColor,
  saveSceneOp,
  saveObject,
  animate,
  focusNode,
]
