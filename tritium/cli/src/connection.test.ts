/**
 * @file connection.test.ts
 * @description Starting the app when none answers: which command, with what.
 */

import { describe, it, expect, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ensureApp } from './connection'

describe('tritium_cli starting the app', () => {
  it('launches its own executable with --tritium-cli and waits for the console endpoint', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tcli-')), 'local-api.json')
    const quiet = { file, onStart: () => {}, pollMs: 5, timeoutMs: 2000 }
    // Run by node, not through the wrapper: there is no app to start.
    const unused = vi.fn()
    await expect(ensureApp({ ...quiet, env: {}, launch: unused })).rejects.toThrow()
    expect(unused).not.toHaveBeenCalled()

    // Through the wrapper: the app is started without the run-as-node switch,
    // and is ready once its info file lists the console.
    const ready = () =>
      fs.writeFileSync(file, JSON.stringify({ port: 1, token: 't', pid: process.pid, endpoints: ['console'] }))
    const launch = vi.fn((_cmd: string, _args: string[], _env: NodeJS.ProcessEnv, _cwd?: string) => ready())
    await ensureApp({ ...quiet, env: { ELECTRON_RUN_AS_NODE: '1', HOME: '/h' }, execPath: '/app/CueMol3', launch })
    expect(launch).toHaveBeenCalledWith('/app/CueMol3', ['--tritium-cli'], { HOME: '/h' }, undefined)

    // From the repo (task run_tritium_cli): the built dev app, started the way
    // `pnpm run start` does but without rebuilding, with the flag after `--`.
    fs.rmSync(file)
    launch.mockClear()
    await ensureApp({ ...quiet, env: { TRITIUM_CLI_DEV_APP: '/repo/react-gui', HOME: '/h' }, launch })
    expect(launch).toHaveBeenCalledWith(
      'pnpm',
      ['exec', 'electron-vite', 'preview', '--skipBuild', '--', '--tritium-cli'],
      { HOME: '/h' },
      '/repo/react-gui',
    )
  })
})
