/**
 * @file main/localApi/appEndpoint.ts
 * @description `/app/quit`: the command line's `quit`.
 *
 * Answered by main itself, not relayed to the window: the window is what is
 * about to go away. It belongs to the console endpoint, so it is open exactly
 * when command line access is.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import type { AppQuitResponse } from '@shared/types/localApi'
import { send } from './server'
import type { EndpointHandler } from './server'

export const APP_QUIT_PATH = '/app/quit'

/**
 * @param quit - quits the app (main/appQuit.ts), passed in so this module
 *   stays free of Electron like the rest of the server
 */
export function appEndpoint(quit: (force: boolean) => Promise<AppQuitResponse['outcome']>): EndpointHandler {
  return {
    endpoint: 'console',
    paths: [APP_QUIT_PATH],
    async handle(req: IncomingMessage, res: ServerResponse, body: unknown) {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' }).end()
        return
      }
      const force = (body as { force?: unknown } | undefined)?.force
      if (force !== undefined && typeof force !== 'boolean') return send(res, 400, { error: 'force must be a boolean.' })
      const answer: AppQuitResponse = { outcome: await quit(force === true) }
      send(res, 200, answer)
    },
  }
}
