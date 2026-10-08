/**
 * @file worker/server/catalog/ops/renderOps.ts
 * @description Ray-traced rendering of the view to an image file: PyMOL's
 * `ray` + `png`, through the same job pipeline the Rendering window uses.
 *
 * The umbreon backends render in-process on a C++ background thread, so the
 * worker (and with it the 3D view) stays responsive and the render can be
 * stopped. They read their settings from the scene's stored render settings,
 * the ones the Rendering window edits; this op only sets the image size there
 * when asked, so a render here looks like one made from the window.
 */

import * as fs from 'fs'
import { renderCancel, renderStart } from '@renderer/worker/server/services/renderjob/renderJob.service'
import { waitForRenderJob } from '@renderer/worker/server/services/renderjob/jobRegistry'
import {
  getSceneRenderSettings,
  setSceneRenderSettings,
} from '@renderer/worker/server/services/renderSettings/renderSettings.service'
import { getAvailableSceneExporters } from '@renderer/worker/server/services/scene/exportImage'
import { DEFAULT_RENDER_BINARIES } from '@renderer/worker/shared/renderTypes'
import { defineOp } from '../op'
import type { OpContext, OpOutcome } from '../op'
import { enumOf, integer, optional, path } from '../params'
import { outputPath } from '../outputFile'

/** Rendering styles, by the backend each runs on. */
const STYLE_BACKEND = { gi: 'umbreon', npr: 'umbreon_npr' } as const

export const renderImage = defineOp({
  name: 'render_image',
  description:
    'Render the current view with the ray tracer and save it as a PNG: global illumination ' +
    '(soft shadows, ambient occlusion) by default, or an illustration style with hatching ' +
    '(npr). Takes from seconds to minutes depending on size; the rest of the render settings ' +
    'are the scene\'s own, as in the Rendering window. ' +
    'Give a plain file name, which is saved to the desktop, or an absolute path where the ' +
    'caller allows one; the full path is reported back -- tell the user where it went. ' +
    'Use capture_view to look at the view quickly instead.',
  params: {
    fileName: path('PNG file to write. A bare name is saved to the desktop.'),
    width: optional(integer('Width in pixels. Null keeps the scene\'s render size.')),
    height: optional(integer('Height in pixels. Null keeps the scene\'s render size.')),
    style: optional(enumOf(['gi', 'npr'], 'gi (default): photorealistic lighting; npr: hatched illustration.')),
  },
  // The scene is unchanged (see the size handling below); the file is written.
  mutates: false,
  expose: { tool: 'render', console: true },
  aliases: [{ name: 'ray', summary: 'Ray-trace the view to a PNG: ray out.png, 1920, 1080' }],
  async run(ctx, args, oc) {
    const target = outputPath(oc, args.fileName, '.png')
    if ('error' in target) return { ok: false, error: target.error }
    if (!getAvailableSceneExporters(ctx).names.includes('umbreon')) {
      return { ok: false, error: 'This build has no ray tracer.' }
    }

    // The umbreon backends size the image from the scene's render settings,
    // so a size given here is written there for the render and put back
    // after it. The pair nets to nothing, and the scene is not marked as
    // changed: a caller that changed nothing else rolls both back.
    let restore: Record<string, string | number | boolean> | null = null
    if (args.width !== null || args.height !== null) {
      if ((args.width ?? 1) <= 0 || (args.height ?? 1) <= 0) return { ok: false, error: 'The size must be positive.' }
      const before = getSceneRenderSettings(ctx, { sceneId: oc.sceneId })
      if (!before.ok) return { ok: false, error: `The render settings could not be read: ${before.error}` }
      const values: Record<string, string | number> = { unit: 'px' }
      if (args.width !== null) values.width = args.width
      if (args.height !== null) values.height = args.height
      const set = setSceneRenderSettings(ctx, { sceneId: oc.sceneId, values })
      if (!set.ok) return { ok: false, error: `The render size could not be set: ${set.error}` }
      restore = Object.fromEntries(Object.keys(values).map((k) => [k, before.values[k]])) as Record<string, string | number | boolean>
    }
    try {
      return await renderTo(ctx, oc, target.path, args.style ?? 'gi')
    } finally {
      if (restore) setSceneRenderSettings(ctx, { sceneId: oc.sceneId, values: restore as never })
    }
  },
})

/** Run one render job to completion and copy its image to `filePath`. */
async function renderTo(
  ctx: Parameters<typeof renderStart>[0],
  oc: OpContext,
  filePath: string,
  style: keyof typeof STYLE_BACKEND,
): Promise<OpOutcome> {
  const target = { path: filePath }
  const backend = STYLE_BACKEND[style]
  const started = renderStart(ctx, {
    sceneId: oc.sceneId,
    viewId: oc.viewId,
    // The umbreon backends read the scene's stored settings, not these.
    snapshot: { mode: 'still', backend, commonProps: [], backendProps: [] },
    binaries: DEFAULT_RENDER_BINARIES,
  })
  if (!started.ok) return { ok: false, error: started.error || 'The render could not be started.' }

  const end = await waitForRenderJob(
    started.jobId,
    () => oc.cancelled?.() ?? false,
    () => { renderCancel(ctx, { jobId: started.jobId }) },
  )
  if (end.type === 'error') return { ok: false, error: end.error }

  try {
    fs.copyFileSync(end.imagePath, target.path)
  } catch (e) {
    return { ok: false, error: `The image could not be written to ${target.path}: ${e instanceof Error ? e.message : String(e)}` }
  } finally {
    // The work dir is kept for the Rendering window's history; nothing here
    // will show it, so it goes now.
    if (end.workDir) {
      try { fs.rmSync(end.workDir, { recursive: true, force: true }) } catch { /* left for the OS */ }
    }
  }
  const size = getSceneRenderSettings(ctx, { sceneId: oc.sceneId })
  return {
    ok: true,
    data: {
      path: target.path,
      ...(size.ok ? { width: size.values.width, height: size.values.height, unit: size.values.unit } : {}),
      seconds: Math.round(end.elapsedSec),
    },
  }
}

export const RENDER_OPS = [renderImage]
