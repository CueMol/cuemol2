/**
 * @file mac/installerMac.ts
 * @description macOS {@link Installer}: unpack the DMG into a staged copy, then swap it in after quit.
 *
 * The staged copy, the backup and the helper all live in the work directory
 * under userData, which is on the same (Data) volume as /Applications, so
 * the swap is two renames. Nothing is written next to the installed app.
 *
 * Verified on macOS 26 with an ad-hoc-signed app: a DMG fetched by Node has
 * no quarantine attribute, the copied app starts without a Gatekeeper
 * prompt, and the app replacing its own bundle raised no App Management
 * prompt.
 */

import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { accessSync, constants, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import type { Installer, InstallStep } from '../controller'
import { handoffPaths, writePending } from '../handoff'
import { buildSwapScript } from './swapScript'

/**
 * The `.app` bundle the executable belongs to, or null when it is not in one.
 *
 * @param execPath - `process.execPath`, e.g. `/Applications/CueMol3.app/Contents/MacOS/CueMol3`
 */
export function appBundleOf(execPath: string): string | null {
  const m = /^(.*?\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath)
  return m ? m[1] : null
}

/** Run a command and resolve its stdout. */
function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr.trim() || err.message}`))
      else resolve(stdout)
    })
  })
}

/** Size of a tree in KiB (`du -sk`). */
async function sizeKiB(p: string): Promise<number> {
  const out = await run('du', ['-sk', p])
  return Number.parseInt(out, 10) || 0
}

/** Options of {@link MacInstaller}. */
export interface MacInstallerOptions {
  /** `process.execPath` of the running app. */
  execPath: string
  /** The updater's work directory. */
  workDir: string
  /** PID the helper waits for (the main process). */
  pid: number
}

/** See the file header. */
export class MacInstaller implements Installer {
  readonly firstStep: InstallStep = 'mount'
  private readonly appPath: string | null
  private readonly opts: MacInstallerOptions

  constructor(opts: MacInstallerOptions) {
    this.opts = opts
    this.appPath = appBundleOf(opts.execPath)
  }

  private get paths() {
    const w = this.opts.workDir
    return {
      mount: path.join(w, 'mnt'),
      stagingDir: path.join(w, 'staging'),
      staging: path.join(w, 'staging', 'CueMol3.app'),
      backup: path.join(w, 'backup', 'CueMol3.app'),
      failed: path.join(w, 'failed', 'CueMol3.app'),
      script: path.join(w, 'swap.sh'),
    }
  }

  canInstall(): { ok: true } | { ok: false; reason: string } {
    const app = this.appPath
    if (!app) return { ok: false, reason: 'The app is not running from an application bundle.' }
    if (app.includes('/AppTranslocation/')) {
      return { ok: false, reason: 'The app is running from a translocated location. Move it to Applications first.' }
    }
    try {
      accessSync(path.dirname(app), constants.W_OK)
      accessSync(app, constants.W_OK)
    } catch {
      return { ok: false, reason: `No permission to replace ${app}.` }
    }
    return { ok: true }
  }

  async prepare(file: string, onProgress: (step: InstallStep, fraction: number) => void): Promise<void> {
    const p = this.paths
    onProgress('mount', 0)
    await run('hdiutil', ['detach', p.mount, '-force']).catch(() => {})
    mkdirSync(p.mount, { recursive: true })
    await run('hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', p.mount, file])
    try {
      const appName = readdirSync(p.mount).find((n) => n.endsWith('.app'))
      if (!appName) throw new Error('the disk image has no application in it')
      const src = path.join(p.mount, appName)
      const total = await sizeKiB(src)

      rmSync(p.stagingDir, { recursive: true, force: true })
      mkdirSync(p.stagingDir, { recursive: true })
      onProgress('copy', 0)
      // ditto keeps the bundle's symlinks, modes and signature; the progress
      // is the size copied so far, polled, since ditto reports none.
      await new Promise<void>((resolve, reject) => {
        const child = spawn('ditto', [src, p.staging], { stdio: ['ignore', 'ignore', 'pipe'] })
        let stderr = ''
        child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
        const timer = setInterval(() => {
          sizeKiB(p.staging)
            .then((done) => onProgress('copy', total ? Math.min(done / total, 1) : 0))
            .catch(() => {})
        }, 500)
        child.on('error', (e) => {
          clearInterval(timer)
          reject(e)
        })
        child.on('close', (code) => {
          clearInterval(timer)
          if (code === 0) resolve()
          else reject(new Error(`ditto failed: ${stderr.trim() || `exit ${code}`}`))
        })
      })

      onProgress('verify', 1)
      await run('codesign', ['--verify', '--deep', '--strict', p.staging])
    } finally {
      await run('hdiutil', ['detach', p.mount, '-force']).catch(() => {})
    }
  }

  async discard(): Promise<void> {
    rmSync(this.paths.stagingDir, { recursive: true, force: true })
  }

  launchSwap(from: string, to: string): void {
    if (!this.appPath) return
    const p = this.paths
    const h = handoffPaths(this.opts.workDir)
    writePending(this.opts.workDir, from, to)
    writeFileSync(
      p.script,
      buildSwapScript({
        parentPid: this.opts.pid,
        appPath: this.appPath,
        stagingPath: p.staging,
        backupPath: p.backup,
        failedPath: p.failed,
        markerPath: h.marker,
        resultPath: h.result,
        pendingPath: h.pending,
        logPath: h.log,
        from,
        to,
        exitTimeout: 60,
        launchTimeout: 120,
        processGrace: 15,
      }),
    )
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    spawn('/bin/sh', [p.script], { detached: true, stdio: 'ignore', env }).unref()
  }

  /** Remove what a finished or abandoned update left in the work directory. */
  cleanup(): void {
    const w = this.opts.workDir
    for (const d of ['staging', 'backup', 'failed', 'download', 'mnt']) {
      rmSync(path.join(w, d), { recursive: true, force: true })
    }
    rmSync(this.paths.script, { force: true })
  }
}
