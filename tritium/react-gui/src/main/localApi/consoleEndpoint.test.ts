/**
 * @file main/localApi/consoleEndpoint.test.ts
 * @description The command line client against the real console endpoint.
 *
 * The two ends of one wire format live in different packages (the client in
 * tritium/cli), so they are run against each other: the client
 * finds the server through the info file the server writes, its request
 * reaches the window as a `console` / `run` relay, and the answer comes back.
 * When the endpoint is off the client says how to turn it on. `quit` goes to
 * main's /app/quit and reports whether the app's save prompt let it go.
 */

import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'fs'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import { createLocalApiServer } from './server'
import type { LocalApiServer } from './server'
import { consoleEndpoint } from './consoleEndpoint'
import { appEndpoint } from './appEndpoint'
import type { LocalApiRelay } from './relay'
import { post, quitApp } from '@cuemol/tritium-cli/src/connection'

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port
      s.close(() => resolve(port))
    })
  })
}

let server: LocalApiServer | null = null
afterEach(async () => {
  await server?.stop()
  server = null
  delete process.env.CUEMOL_LOCAL_API_INFO
})

describe('tritium_cli and the console endpoint', () => {
  it('runs through the info file, and says how to turn access on when it is off', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuemol-cli-'))
    const infoFile = path.join(dir, 'local-api.json')
    process.env.CUEMOL_LOCAL_API_INFO = infoFile

    const asked: { endpoint: string; kind: string; payload: unknown }[] = []
    const relay: LocalApiRelay = {
      async request(endpoint, kind, payload) {
        asked.push({ endpoint, kind, payload })
        return { entries: [{ kind: 'output', text: '/data' }], aborted: false, interrupted: false, cwd: '/data' }
      },
      reply: () => undefined,
      failAll: () => undefined,
    }
    server = createLocalApiServer({
      handlers: [consoleEndpoint(relay)],
      token: () => 'tok',
      port: await freePort(),
      infoFile,
    })
    await server.setEndpoint('console', true)

    const res = await post('/console/run', { dialect: 'native', text: 'cd data; pwd', cwd: '/' })
    expect(res.cwd).toBe('/data')
    expect(asked).toEqual([
      { endpoint: 'console', kind: 'run', payload: { dialect: 'native', text: 'cd data; pwd', cwd: '/' } },
    ])

    await server.setEndpoint('console', false)
    await expect(post('/console/run', { dialect: 'native', text: 'pwd', cwd: '/' })).rejects.toThrow(
      /Command line access/,
    )
  })

  it('quit passes force to main and returns its outcome', async () => {
    const infoFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cuemol-cli-')), 'local-api.json')
    process.env.CUEMOL_LOCAL_API_INFO = infoFile
    const forced: boolean[] = []
    server = createLocalApiServer({
      handlers: [appEndpoint(async (force) => (forced.push(force), 'cancelled'))],
      token: () => 'tok',
      port: await freePort(),
      infoFile,
    })
    await server.setEndpoint('console', true)

    await expect(quitApp(true)).resolves.toBe('cancelled')
    expect(forced).toEqual([true])
  })
})
