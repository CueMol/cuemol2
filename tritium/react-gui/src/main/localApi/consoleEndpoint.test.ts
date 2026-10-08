/**
 * @file main/localApi/consoleEndpoint.test.ts
 * @description The command line client against the real console endpoint.
 *
 * The two ends of one wire format are written in different files (and one of
 * them in plain JavaScript), so they are run against each other: the client
 * finds the server through the info file the server writes, its request
 * reaches the window as a `console` / `run` relay, and the answer comes back.
 * When the endpoint is off the client says how to turn it on.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import { createLocalApiServer } from './server'
import type { LocalApiServer } from './server'
import { consoleEndpoint } from './consoleEndpoint'
import type { LocalApiRelay } from './relay'
import { ensureApp, post } from '../../../tools/tritium_cli.mjs'

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
})

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
    const launch = vi.fn((_exe: string, _args: string[], _env: Record<string, string>) => {
      fs.writeFileSync(file, JSON.stringify({ port: 1, token: 't', pid: process.pid, endpoints: ['console'] }))
    })
    await ensureApp({ ...quiet, env: { ELECTRON_RUN_AS_NODE: '1', HOME: '/h' }, execPath: '/app/CueMol3', launch })
    expect(launch).toHaveBeenCalledWith('/app/CueMol3', ['--tritium-cli'], { HOME: '/h' })
  })
})
