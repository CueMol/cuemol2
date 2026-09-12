/**
 * @file plugins/agent/worker/tools/analysisTools.ts
 * @description Tools that measure the structure or write an image of it.
 */

import { analyzeInteractions } from '@renderer/worker/server/services/molops/analyzeInteractions'
import {
  exportScene,
  getSceneExportInfo,
} from '@renderer/worker/server/services/scene/exportImage'
import { normalizeServiceResult } from '../toolOutput'
import type { AgentTool } from './types'
import { bool, int, nullable, str, strictSchema } from './types'

/** The dialog's own starting values, so both routes measure the same thing. */
const MIN_CONTACT_DIST = 0
const DEFAULT_MAX_CONTACT_DIST = 4.0
const MAX_LABELS = 100
/** The label set contacts are drawn into, as the measurement UI names it. */
const MEASURE_LABEL_SET = 'measure'

const analyzeInteractionsTool: AgentTool = {
  name: 'analyze_interactions',
  description:
    'Find close contacts around a selection and draw them as labelled dashed lines. ' +
    'Use it for hydrogen bonds and for what a ligand touches. This adds labels to the scene.',
  parameters: strictSchema({
    objId: int('Uid of the molecule to measure within.'),
    selection: str('Selection the contacts start from, for example a ligand.'),
    maxDist: nullable('number', `Longest contact to report, in angstroms. Null uses ${DEFAULT_MAX_CONTACT_DIST}.`),
    hbondOnly: bool('True reports only nitrogen and oxygen contacts (hydrogen-bond candidates).'),
  }),
  mutates: true,
  run(ctx, input, turn) {
    const maxDist = input.maxDist === null || input.maxDist === undefined
      ? DEFAULT_MAX_CONTACT_DIST
      : Number(input.maxDist)
    const result = analyzeInteractions(ctx, {
      sceneId: turn.sceneId,
      objId: Number(input.objId),
      selStr: String(input.selection),
      useMol2: false,
      useSel2: false,
      minDist: MIN_CONTACT_DIST,
      maxDist,
      maxLabels: MAX_LABELS,
      hbondOnly: Boolean(input.hbondOnly),
      rendName: MEASURE_LABEL_SET,
    })
    return normalizeServiceResult(
      result,
      'The contacts could not be computed. Check the molecule id and the selection.',
    )
  },
}

/** Reject anything that would write outside the chosen directory. */
const SAFE_BASENAME_RE = /^[A-Za-z0-9._-]+$/

const exportImage: AgentTool = {
  name: 'export_image',
  description:
    'Save a PNG of the current view to the desktop. Give a file name only, not a path. ' +
    'This writes a file; the full path is reported back so you can tell the user where it went.',
  parameters: strictSchema({
    fileName: str('File name with no directories, for example overview.png.'),
    width: nullable('integer', 'Image width in pixels. Null uses the size of the view on screen.'),
    height: nullable('integer', 'Image height in pixels. Null uses the size of the view on screen.'),
  }),
  // The scene is unchanged: this writes a file, which no undo can take back.
  mutates: false,
  run(ctx, input, turn) {
    const fileName = String(input.fileName)
    if (!SAFE_BASENAME_RE.test(fileName)) {
      return {
        ok: false,
        error: 'Give a plain file name with no directory separators, for example overview.png.',
      }
    }
    const info = getSceneExportInfo(ctx, { sceneId: turn.sceneId, viewId: turn.viewId })
    if (!info.ok) return { ok: false, error: 'The view could not be read for export.' }

    const width = input.width === null || input.width === undefined
      ? info.width
      : Number(input.width)
    const height = input.height === null || input.height === undefined
      ? info.height
      : Number(input.height)
    if (width <= 0 || height <= 0) {
      return { ok: false, error: 'The image size must be positive.' }
    }

    const name = fileName.toLowerCase().endsWith('.png') ? fileName : `${fileName}.png`
    const filePath = `${desktopDir()}/${name}`
    const result = exportScene(ctx, {
      sceneId: turn.sceneId,
      viewId: turn.viewId,
      filePath,
      exporterName: 'png',
      width,
      height,
    })
    if (!result.ok) return { ok: false, error: `The image could not be written to ${filePath}.` }
    return { ok: true, data: { path: filePath, width, height } }
  },
}

/**
 * Where an exported image goes.
 *
 * Fixed rather than asked for: the model has no file picker, and a path it
 * chose itself is a path the user did not.
 */
function desktopDir(): string {
  const home = typeof process !== 'undefined' ? (process.env.HOME ?? process.env.USERPROFILE ?? '') : ''
  return home ? `${home}/Desktop` : '.'
}

export const ANALYSIS_TOOLS: AgentTool[] = [analyzeInteractionsTool, exportImage]
