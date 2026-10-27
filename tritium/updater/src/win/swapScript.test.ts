/**
 * The generated helpers are parsed by Windows PowerShell itself: a quoting
 * slip in a path (a space, a quote, a non-ASCII user name) would otherwise
 * show only when an update runs. The run itself needs UAC and is checked on
 * a real machine.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SETUP_ARGS, buildInstallPs1, buildSwapPs1, type WinScriptParams } from './swapScript'

const work = String.raw`C:\Users\O'Brien ’石谷’\AppData\Roaming\CueMol3\updater`
const params: WinScriptParams = {
  parentPid: 1234,
  appDir: String.raw`C:\Program Files\CueMol3`,
  setupPath: path.win32.join(work, 'staging', 'CueMol3-2.4.2.550-Windows-x64-Setup.exe'),
  backupDir: path.win32.join(work, 'backup'),
  registryKeys: [String.raw`HKLM\Software\abc`],
  installScriptPath: path.win32.join(work, 'install.ps1'),
  launcherPath: path.win32.join(work, 'CueMol3 Updater.exe'),
  signalDir: path.win32.join(work, 'signals'),
  markerPath: path.win32.join(work, 'launch-ok'),
  resultPath: path.win32.join(work, 'result.json'),
  pendingPath: path.win32.join(work, 'pending.json'),
  logPath: path.win32.join(work, 'swap.log'),
  from: '2.4.1.547',
  to: '2.4.2.550',
  exitTimeout: 60, installTimeout: 600, launchTimeout: 120, processGrace: 15,
  confirmTimeout: 180, restoreTimeout: 120,
}

/** Parse `file`; print its parse errors and the value assigned to each of the comma-separated `names`. */
const PARSE = String.raw`
param([string]$file, [string]$names)
$errs = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$null, [ref]$errs)
$out = @{ errors = @($errs | ForEach-Object { $_.Message }) }
foreach ($n in $names -split ",") {
  $a = $ast.Find({ param($x) $x -is [System.Management.Automation.Language.AssignmentStatementAst] -and
    $x.Left.VariablePath.UserPath -eq $n }, $true)
  $out[$n] = $a.Right.Expression.Value
}
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$out | ConvertTo-Json -Compress
`

describe.skipIf(process.platform !== 'win32')('Windows update helpers', () => {
  it('parse, and keep paths with spaces, quotes and non-ASCII characters intact', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'upd-win-'))
    const parser = path.join(dir, 'parse.ps1')
    writeFileSync(parser, PARSE)
    const check = (name: string, text: string, vars: Record<string, string>) => {
      const file = path.join(dir, name)
      // Written as WinInstaller writes it: UTF-8 with a BOM.
      writeFileSync(file, '\uFEFF' + text, 'utf8')
      const out = execFileSync('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', parser, file, Object.keys(vars).join(','),
      ], { encoding: 'utf8' })
      const got = JSON.parse(out)
      expect(got.errors).toEqual([])
      for (const [k, v] of Object.entries(vars)) expect(got[k]).toBe(v)
    }
    check('swap.ps1', buildSwapPs1(params), {
      App: params.appDir, InstallScript: params.installScriptPath, Launcher: params.launcherPath,
    })
    check('install.ps1', buildInstallPs1(params), {
      Setup: params.setupPath, Backup: params.backupDir, Result: params.resultPath,
    })
  }, 30_000)
})

describe('Setup.exe arguments', () => {
  it('leave the install directory to the recorded InstallLocation', () => {
    // A /D= passed through Start-Process was cut at the first space and
    // installed CueMol3 to C:\Program.
    expect(SETUP_ARGS).not.toMatch(/\/D=/i)
    expect(buildInstallPs1(params)).toContain(`-ArgumentList '${SETUP_ARGS}'`)
  })
})
