/**
 * @file download.ts
 * @description Download an installer and check it against the release's digest.
 *
 * The app is unsigned, so the SHA-256 GitHub reports for the asset is what
 * stands in for a signature check. The file is fetched with Node, never
 * through Chromium's download manager: Node writes no quarantine attribute
 * (macOS) or Mark of the Web (Windows), so the installer is not put through
 * Gatekeeper / SmartScreen as a file from the internet.
 *
 * Node's `http` / `https` rather than `fetch`: piping undici's body to a file
 * that applies backpressure tripped an assertion inside undici
 * (`assert(!this.paused)`, an uncaught exception in the main process) when
 * the server ended the response by closing the connection while the stream
 * was paused. The plain request stream handles the pause itself.
 */

import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

/** Redirects to follow (GitHub sends an asset to its storage host). */
const MAX_REDIRECTS = 5

/** Options of {@link downloadVerified}. */
export interface DownloadOptions {
  url: string
  /** Final path; the data goes to `<dest>.part` until it is verified. */
  dest: string
  /** `sha256:<hex>` */
  digest: string
  signal?: AbortSignal
  /** Bytes so far and the total (from Content-Length, 0 when unknown). */
  onProgress?: (received: number, total: number) => void
}

/** GET `url`, following redirects; resolves the final 200 response. */
function get(url: string, signal: AbortSignal | undefined, redirects = 0): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http
    const req = lib.get(url, { signal }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        if (redirects >= MAX_REDIRECTS) return reject(new Error('download failed: too many redirects'))
        const next = new URL(res.headers.location, url).toString()
        get(next, signal, redirects + 1).then(resolve, reject)
        return
      }
      if (status !== 200) {
        res.resume()
        return reject(new Error(`download failed: HTTP ${status}`))
      }
      resolve(res)
    })
    req.on('error', reject)
  })
}

/**
 * Download `url` to `dest`. Resolves once the file is complete and its
 * SHA-256 matches `digest`; on a mismatch, an HTTP error or an abort it
 * rejects and leaves no file behind.
 */
export async function downloadVerified(opts: DownloadOptions): Promise<void> {
  const m = /^sha256:([0-9a-f]{64})$/i.exec(opts.digest)
  if (!m) throw new Error(`unsupported digest: ${opts.digest}`)
  const expected = m[1].toLowerCase()
  const part = `${opts.dest}.part`
  try {
    const res = await get(opts.url, opts.signal)
    const total = Number(res.headers['content-length'] ?? 0)
    const hash = createHash('sha256')
    let received = 0
    const meter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        hash.update(chunk)
        received += chunk.length
        opts.onProgress?.(received, total)
        done(null, chunk)
      },
    })
    await pipeline(res, meter, createWriteStream(part), { signal: opts.signal })
    if (total && received !== total) throw new Error('download ended early')
    if (hash.digest('hex') !== expected) throw new Error('downloaded file does not match the release digest')
    await rename(part, opts.dest)
  } catch (e) {
    await rm(part, { force: true })
    throw e
  }
}
