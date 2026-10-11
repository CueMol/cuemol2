import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import { downloadVerified } from './download'

// The asset is served behind a redirect, as GitHub serves it from its storage host.
const body = Buffer.from('installer bytes')
let server: http.Server
let base = ''
beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/asset') { res.writeHead(302, { Location: '/storage' }); res.end(); return }
    res.writeHead(200, { 'Content-Length': body.length }); res.end(body)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => { server.close() })

describe('downloadVerified', () => {
  it('keeps the file only when it matches the digest', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'upd-dl-'))
    const good = 'sha256:' + createHash('sha256').update(body).digest('hex')
    await downloadVerified({ url: `${base}/asset`, dest: path.join(dir, 'ok.dmg'), digest: good })
    expect(existsSync(path.join(dir, 'ok.dmg'))).toBe(true)

    const bad = 'sha256:' + '0'.repeat(64)
    await expect(downloadVerified({ url: `${base}/asset`, dest: path.join(dir, 'bad.dmg'), digest: bad }))
      .rejects.toThrow(/digest/)
    expect(readdirSync(dir)).toEqual(['ok.dmg'])
  })
})
