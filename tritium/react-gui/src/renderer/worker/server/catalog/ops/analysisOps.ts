/**
 * @file worker/server/catalog/ops/analysisOps.ts
 * @description Ops that measure the structure, or picture it -- for the user
 * as a file, or for a model to look at.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as nodePath from 'path'

import { analyzeInteractions } from '@renderer/worker/server/services/molops/analyzeInteractions'
import {
  exportScene,
  getSceneExportInfo,
} from '@renderer/worker/server/services/scene/exportImage'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { VIEW_UNREADABLE } from '../errors'
import { defineOp } from '../op'
import { outputPath } from '../outputFile'
import { boolean, integer, moleculeId, optional, path, real, selection } from '../params'

/** The dialog's own starting values, so both routes measure the same thing. */
const MIN_CONTACT_DIST = 0
const DEFAULT_MAX_CONTACT_DIST = 4.0
const MAX_LABELS = 100
/** The label set contacts are drawn into, as the measurement UI names it. */
const MEASURE_LABEL_SET = 'measure'

export const analyzeInteractionsOp = defineOp({
  name: 'analyze_interactions',
  description:
    'Find close contacts around a selection and draw them as labelled dashed lines. ' +
    'Use it for hydrogen bonds and for what a ligand touches; by default only polar atoms ' +
    '(no carbon) are paired. This adds labels to the scene.',
  params: {
    objId: moleculeId('Uid of the molecule to measure within.'),
    selection: selection('Selection the contacts start from, for example a ligand.'),
    maxDist: optional(real(`Longest contact to report, in angstroms. Null uses ${DEFAULT_MAX_CONTACT_DIST}.`)),
    includeCarbon: optional(
      boolean(
        'True also reports contacts that involve a carbon atom. Null or false leaves carbon ' +
          'out, so only atoms that can make hydrogen bonds or salt bridges (N, O, S, ...) are ' +
          'reported -- which is what "interactions" usually means.',
      ),
    ),
  },
  mutates: true,
  expose: { tool: 'analysis', console: true },
  group: 'analysis',
  run(ctx, args, oc) {
    const result = analyzeInteractions(ctx, {
      sceneId: oc.sceneId,
      objId: args.objId,
      selStr: args.selection,
      useMol2: false,
      useSel2: false,
      minDist: MIN_CONTACT_DIST,
      maxDist: args.maxDist ?? DEFAULT_MAX_CONTACT_DIST,
      maxLabels: MAX_LABELS,
      // C++ `hbond` skips carbon (hydrogen is skipped either way).
      hbondOnly: !(args.includeCarbon ?? false),
      rendName: MEASURE_LABEL_SET,
    })
    return normalizeServiceResult(
      result,
      'The contacts could not be computed. Check the molecule id and the selection.',
    )
  },
})

export const exportImage = defineOp({
  name: 'export_image',
  description:
    'Save a PNG of the current view to a file, only when the user asks for a file. To look at ' +
    'the view yourself, use capture_view, which saves nothing. ' +
    'Give a plain file name, which is saved to the desktop, or an absolute path where the ' +
    'caller allows one; the full path is reported back -- tell the user where it went.',
  params: {
    path: path('The file, e.g. overview.png.'),
    width: optional(integer('Image width in pixels. Null uses the size of the view on screen.')),
    height: optional(integer('Image height in pixels. Null uses the size of the view on screen.')),
  },
  // The scene is unchanged: this writes a file, which no undo can take back.
  mutates: false,
  expose: { tool: 'files', console: true, mcp: true },
  group: 'files',
  run(ctx, args, oc) {
    const target = outputPath(oc, args.path, '.png')
    if ('error' in target) return { ok: false, error: target.error }
    return writePng(ctx, oc.sceneId, oc.viewId, target.path, args.width, args.height)
  },
})

/**
 * Render the view to a PNG file.
 *
 * Used by `export_image`, which decides where through `outputPath`.
 *
 * @param width - null uses the size of the view on screen; so does `height`.
 */
export function writePng(
  ctx: Parameters<typeof exportScene>[0],
  sceneId: number,
  viewId: number,
  filePath: string,
  w: number | null,
  h: number | null,
): { ok: true; data: { path: string; width: number; height: number } } | { ok: false; error: string } {
  const info = getSceneExportInfo(ctx, { sceneId, viewId })
  if (!info.ok) return { ok: false, error: 'The view could not be read for export.' }

  const width = w ?? info.width
  const height = h ?? info.height
  if (width <= 0 || height <= 0) {
    return { ok: false, error: 'The image size must be positive.' }
  }

  const result = exportScene(ctx, {
    sceneId,
    viewId,
    filePath,
    exporterName: 'png',
    width,
    height,
  })
  if (!result.ok) return { ok: false, error: `The image could not be written to ${filePath}.` }
  return { ok: true, data: { path: filePath, width, height } }
}

/** The longer side of a picture for a model, unless it asks for another. */
const DEFAULT_LONG_SIDE = 1024
/**
 * The range a requested size is clamped to. Below the floor a structure is a
 * smudge. The ceiling is where Anthropic starts downscaling (about 1568 px,
 * 1.15 MP); OpenAI and Gemini would take more, but only at a token cost that
 * zooming the camera avoids, so every provider gets the same cap.
 */
const MIN_LONG_SIDE = 256
const MAX_LONG_SIDE = 1568

/** The view's size scaled so its longer side is `longSide`, aspect kept. */
export function fitLongSide(width: number, height: number, longSide: number): { width: number; height: number } {
  const scale = longSide / Math.max(width, height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export const captureView = defineOp({
  name: 'capture_view',
  description:
    'Look at the current view: returns a picture of what the user sees. Use it to check that ' +
    'a change looks the way you intended, or when the user refers to something on screen. ' +
    'Each picture costs about a thousand tokens, so capture once a change is done rather than ' +
    'after every step. To see detail, zoom in first with center_view rather than raising ' +
    'longSide: tokens grow with the pixel count. Nothing is saved; use export_image to give ' +
    'the user a file.',
  params: {
    longSide: optional(
      integer(
        `Pixels on the longer side. Null uses ${DEFAULT_LONG_SIDE}, which suits almost every ` +
          `check; clamped to ${MIN_LONG_SIDE}-${MAX_LONG_SIDE}.`,
      ),
    ),
  },
  mutates: false,
  // A picture is for a model to look at; a console has nowhere to show it.
  expose: { tool: 'core', console: false },
  group: 'viewing',
  run(ctx, args, oc) {
    const info = getSceneExportInfo(ctx, { sceneId: oc.sceneId, viewId: oc.viewId })
    if (!info.ok || info.width <= 0 || info.height <= 0) {
      return { ok: false, error: VIEW_UNREADABLE }
    }
    const requested = args.longSide ?? DEFAULT_LONG_SIDE
    const longSide = Math.min(MAX_LONG_SIDE, Math.max(MIN_LONG_SIDE, Math.round(requested) || DEFAULT_LONG_SIDE))
    const { width, height } = fitLongSide(info.width, info.height, longSide)

    // The exporter writes only to a path, so the picture goes through a
    // temporary file that is removed as soon as it has been read.
    const filePath = nodePath.join(
      os.tmpdir(),
      `cuemol-agent-view-${oc.callId.replace(/[^A-Za-z0-9_-]/g, '') || Date.now()}.png`,
    )
    try {
      const result = exportScene(ctx, {
        sceneId: oc.sceneId,
        viewId: oc.viewId,
        filePath,
        exporterName: 'png',
        width,
        height,
      })
      if (!result.ok) return { ok: false, error: 'The view could not be rendered.' }
      const base64 = fs.readFileSync(filePath).toString('base64')
      return {
        ok: true,
        data: { width, height },
        image: { mediaType: 'image/png', base64 },
      }
    } catch (e) {
      return { ok: false, error: `The view could not be captured: ${e instanceof Error ? e.message : String(e)}` }
    } finally {
      try { fs.rmSync(filePath, { force: true }) } catch { /* already gone */ }
    }
  },
})


export const ANALYSIS_OPS = [analyzeInteractionsOp, captureView, exportImage]
