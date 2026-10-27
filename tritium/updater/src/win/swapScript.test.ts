/**
 * The generated helper is parsed by Windows PowerShell itself: a quoting
 * slip in a path (a space, a quote, a non-ASCII user name) would otherwise
 * show only when an update runs. The run itself needs UAC and is checked on
 * a real machine.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildSwapPs1, type WinScriptParams } from './swapScript'

// A user name with a space, both kinds of single quote and Japanese.
const work = 'C:\\Users\\O\'Brien \u2019\u77f3\u8c37\u2019\\AppData\\Roaming\\CueMol3\\updater'
const params: WinScriptParams = {
  parentPid: 1234,
  appDir: 'C:\\Program Files\\CueMol3',
  launcherPath: path.win32.join(work, 'CueMol3 Updater.exe'),
  signalDir: path.win32.join(work, 'signals'),
  markerPath: path.win32.join(work, 'launch-ok'),
  resultPath: path.win32.join(work, 'result.json'),
  pendingPath: path.win32.join(work, 'pending.json'),
  logPath: path.win32.join(work, 'swap.log'),
  from: '2.4.1.547',
  to: '2.4.2.550',
  exitTimeout: 60, installTimeout: 600, launchTimeout: 120, processGrace: 15, restoreTimeout: 120,
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

describe.skipIf(process.platform !== 'win32')('Windows swap helper', () => {
  it('parses, and keeps paths with spaces, quotes and non-ASCII characters intact', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'upd-win-'))
    const parser = path.join(dir, 'parse.ps1')
    writeFileSync(parser, PARSE)
    const file = path.join(dir, 'swap.ps1')
    // Written as WinInstaller writes it: UTF-8 with a BOM.
    writeFileSync(file, String.fromCharCode(0xfeff) + buildSwapPs1(params), 'utf8')
    const vars = { App: params.appDir, Launcher: params.launcherPath, Signals: params.signalDir }
    const out = execFileSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', parser, file, Object.keys(vars).join(','),
    ], { encoding: 'utf8' })
    const got = JSON.parse(out)
    expect(got.errors).toEqual([])
    for (const [k, v] of Object.entries(vars)) expect(got[k]).toBe(v)
  }, 30_000)
})
