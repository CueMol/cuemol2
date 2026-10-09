/**
 * @file plugins/console/worker/runtime/opContext.ts
 * @description The `OpContext` a console command gives the op it runs.
 *
 * Shared by the native dialect (every generated command) and the PyMOL
 * dialect (`ray` runs `render_image`), so an op sees a console caller the
 * same way from either.
 */

import type { OpContext } from '@renderer/worker/server/catalog'
import type { CmdContext } from './types'

/**
 * @param tag - names the call in its stream ids, e.g. `call` or `ray`
 */
export function opContextOf(cc: CmdContext, tag: string): OpContext {
  return {
    sceneId: cc.sceneId,
    viewId: cc.viewId,
    callId: cc.streamId(tag),
    markMutated: () => cc.markMutated(),
    noteStream: (reqId) => cc.noteStream(reqId),
    streamId: (t) => cc.streamId(t),
    openScene: (filePath) => cc.openScene(filePath),
    cancelled: () => cc.stopped(),
    // The person at the prompt chose the path.
    fileAccess: 'any',
  }
}
