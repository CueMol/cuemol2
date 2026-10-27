/**
 * @file win/installerWin.ts
 * @description Windows {@link Installer}: run the downloaded NSIS Setup.exe after quit, elevated.
 *
 * The app is installed per machine (Program Files, HKLM), so every update
 * goes through UAC: the prompt names "CueMol3 Updater.exe" (the launcher
 * shipped in the app's resources) from an unknown publisher, and a standard
 * user is asked for an administrator's credentials. A refusal leaves the old
 * version running. swap.ps1 (win/swapScript.ts) drives the update; the
 * launcher (react-gui/build/updater-launcher.nsi) does the elevated part.
 *
 * What the launcher reads from the work directory is fixed here: the
 * installer at `staging/CueMol3-Setup.exe`, and `install.ini` with the two
 * versions and the installer's SHA-256, which it checks before running it.
 *
 * Verified on Windows 11 with the unsigned installer: a Setup.exe written by
 * Node has no Zone.Identifier (so no SmartScreen prompt), `/S --updated`
 * installs into the recorded InstallLocation keeping the shortcuts and the
 * "Open with" registration, and robocopy + reg import of the saved copy
 * brings back a version that starts.
 */

import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, createReadStream, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import type { Installer, InstallStep } from '../controller'
import { handoffPaths, writePending } from '../handoff'
import { buildSwapPs1 } from './swapScript'

/**
 * The NSIS app GUID: electron-builder derives it from the appId
 * (`org.cuemol.cuemol3`) as a UUID v5 in its own namespace, and names the
 * installer's registry keys with it. react-gui/build/updaterLauncher.js
 * derives the same value for the launcher (a react-gui test pins the two
 * together). A changed appId makes the InstallLocation check in
 * `canInstall` fail, which only turns in-place updates off.
 */
export const WIN_APP_GUID = '5b87087f-2593-5995-97e1-71545168d052'

const UNINSTALLER = 'Uninstall CueMol3.exe'

/** The UTF-8 byte order mark, as a string. */
const BOM = String.fromCharCode(0xfeff)

/** The InstallLocation the installer recorded, or null. */
function readInstallLocation(): string | null {
  try {
    const out = execFileSync('reg.exe', ['query', `HKLM\\Software\\${WIN_APP_GUID}`, '/v', 'InstallLocation', '/reg:64'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    const m = /InstallLocation\s+REG_\w+\s+(.+?)\s*$/m.exec(out)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** SHA-256 of a file, in lowercase hex. */
function sha256Of(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')))
  })
}

/** Options of {@link WinInstaller}. */
export interface WinInstallerOptions {
  /** `process.execPath` of the running app. */
  execPath: string
  /** The updater's work directory. */
  workDir: string
  /** PID the helper waits for (the main process). */
  pid: number
  /** `CueMol3 Updater.exe` in the app's resources. */
  launcherPath: string
}

/** See the file header. */
export class WinInstaller implements Installer {
  readonly firstStep: InstallStep = 'stage'
  private readonly appDir: string
  private readonly opts: WinInstallerOptions
  private readonly can: { ok: true } | { ok: false; reason: string }
  /** SHA-256 of the staged installer, once `prepare` has run. */
  private stagedDigest: string | null = null

  constructor(opts: WinInstallerOptions) {
    this.opts = opts
    this.appDir = path.dirname(opts.execPath)
    this.can = this.probe()
  }

  /** The names the launcher expects (updater-launcher.nsi) are fixed here. */
  private get paths() {
    const w = this.opts.workDir
    return {
      stagingDir: path.join(w, 'staging'),
      staged: path.join(w, 'staging', 'CueMol3-Setup.exe'),
      ini: path.join(w, 'install.ini'),
      signals: path.join(w, 'signals'),
      swapScript: path.join(w, 'swap.ps1'),
      // Run from a copy: the installer replaces everything under the app
      // directory, which a running launcher there would hold locked. The
      // launcher also takes its work directory from where it runs.
      launcher: path.join(w, 'CueMol3 Updater.exe'),
    }
  }

  /**
   * Read once: the answer cannot change while the app runs, and `status()`
   * asks on every change.
   */
  private probe(): { ok: true } | { ok: false; reason: string } {
    if (!existsSync(path.join(this.appDir, UNINSTALLER))) {
      return { ok: false, reason: 'The app was not installed with the CueMol3 installer.' }
    }
    if (!existsSync(this.opts.launcherPath)) {
      return { ok: false, reason: 'The updater launcher is missing from this build.' }
    }
    // The silent installer goes to the recorded location; replacing the
    // running copy needs the two to be the same directory.
    const loc = readInstallLocation()
    if (!loc || path.resolve(loc).toLowerCase() !== path.resolve(this.appDir).toLowerCase()) {
      return { ok: false, reason: `The installed copy is not the one running from ${this.appDir}.` }
    }
    return { ok: true }
  }

  canInstall(): { ok: true } | { ok: false; reason: string } {
    return this.can
  }

  async prepare(file: string, onProgress: (step: InstallStep, fraction: number) => void): Promise<void> {
    const p = this.paths
    onProgress('stage', 0)
    rmSync(p.stagingDir, { recursive: true, force: true })
    mkdirSync(p.stagingDir, { recursive: true })
    renameSync(file, p.staged)
    // The download was checked against the release digest; the launcher
    // checks the staged file against this one before it runs it elevated.
    this.stagedDigest = await sha256Of(p.staged)
    onProgress('stage', 1)
  }

  async discard(): Promise<void> {
    rmSync(this.paths.stagingDir, { recursive: true, force: true })
    this.stagedDigest = null
  }

  launchSwap(from: string, to: string): void {
    if (!this.stagedDigest) return
    const p = this.paths
    const h = handoffPaths(this.opts.workDir)
    writePending(this.opts.workDir, from, to)
    rmSync(p.signals, { recursive: true, force: true })
    mkdirSync(p.signals, { recursive: true })
    copyFileSync(this.opts.launcherPath, p.launcher)
    // ASCII only: NSIS's ReadINIStr reads it in the ANSI code page.
    writeFileSync(p.ini, `[install]\r\nfrom=${from}\r\nto=${to}\r\nsha256=${this.stagedDigest}\r\n`, 'ascii')
    const script = buildSwapPs1({
      parentPid: this.opts.pid,
      appDir: this.appDir,
      launcherPath: p.launcher,
      signalDir: p.signals,
      markerPath: h.marker,
      resultPath: h.result,
      pendingPath: h.pending,
      logPath: h.log,
      from,
      to,
      exitTimeout: 60,
      installTimeout: 600,
      launchTimeout: 120,
      processGrace: 15,
      restoreTimeout: 120,
    })
    // Windows PowerShell reads a script without a BOM in the ANSI code page,
    // which would garble a non-ASCII user name in the paths.
    writeFileSync(p.swapScript, BOM + script, 'utf8')
    const env: NodeJS.ProcessEnv = { ...process.env, CUEMOL_SWAP_PS1: p.swapScript }
    delete env.ELECTRON_RUN_AS_NODE
    // powershell.exe spawned detached (DETACHED_PROCESS, no console) exits 0
    // without running the script, and one spawned attached dies with this
    // app's console. `start` gives it a console of its own. The script path
    // goes through the environment: cmd expands %VAR% once and does not
    // reparse the result, so a & or % in the user name stays literal.
    spawn(
      'cmd.exe',
      ['/d', '/s', '/c', '"start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%CUEMOL_SWAP_PS1%""'],
      { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, env },
    ).unref()
  }

  /** Remove what a finished or abandoned update left in the work directory. */
  cleanup(): void {
    const w = this.opts.workDir
    for (const d of ['staging', 'download', 'signals', 'backup']) {
      // The backup is written by the elevated launcher, which also removes
      // it; a leftover this user cannot delete is not worth failing the start.
      try {
        rmSync(path.join(w, d), { recursive: true, force: true })
      } catch {
        /* see above */
      }
    }
    const p = this.paths
    for (const f of [p.swapScript, p.ini, p.launcher]) rmSync(f, { force: true })
  }
}
