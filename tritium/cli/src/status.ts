/**
 * @file status.ts
 * @description `tritium_cli status`: whether CueMol is running and what it
 * has open, read from its info file. Never starts the app.
 */

import type { ConsoleInfoResponse, LocalApiInfoFile } from '@cuemol/console-kit'

/** What `status` prints, and its exit status (0 running, 1 not). */
export function statusReport(
  info: LocalApiInfoFile | null,
  alive: (pid: number) => boolean,
  app: ConsoleInfoResponse | null,
): { lines: string[]; code: number } {
  if (!info || (typeof info.pid === 'number' && !alive(info.pid))) {
    return {
      lines: [
        'CueMol is not running, or none of its local API endpoints is open',
        '(command line access is off: Settings > Plugins > Console > Command line access).',
      ],
      code: 1,
    }
  }
  const lines = [`CueMol is running (pid ${info.pid}, 127.0.0.1:${info.port}).`]
  lines.push(`Endpoints: ${info.endpoints.length > 0 ? info.endpoints.join(', ') : 'none'}`)
  if (!info.endpoints.includes('console')) lines.push('Command line access is off; tritium_cli commands will start it.')
  if (app) lines.push(`Version: ${app.version}${app.build ? ` (build ${app.build})` : ''}`)
  return { lines, code: 0 }
}
