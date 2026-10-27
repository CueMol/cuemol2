/**
 * @file win/swapScript.ts
 * @description The two PowerShell helpers that install a downloaded Setup.exe after the app quits.
 *
 * The app is installed per machine (NSIS perMachine, under Program Files),
 * so the install needs elevation, while the new app must start unelevated.
 * Hence two scripts that signal each other through empty files in a
 * signal directory:
 *
 *   swap.ps1 (unelevated, started detached by the quitting app):
 *     1. wait for the app's processes (the main one and its children) to exit;
 *     2. start install.ps1 elevated, through the launcher (CueMol3 Updater.exe,
 *        built by react-gui/build/updaterLauncher.js) so that the UAC prompt
 *        names CueMol3 rather than PowerShell; a refused prompt ends the
 *        update (`aborted`) and relaunches the old app;
 *     3. wait for `installed`; on `install-failed` (the old version is in
 *        place again) relaunch the old app;
 *     4. launch the new app and wait for its launch marker, which it writes
 *        once its main window is up (by the renderer's signal);
 *     5. marker seen: `confirm-ok`. Otherwise kill the new app, `confirm-fail`,
 *        and relaunch the old app once install.ps1 reports `restored`.
 *
 *   install.ps1 (elevated, once):
 *     1. copy the install directory and the uninstall registry keys aside;
 *     2. run Setup.exe silently (`/S --updated`, see {@link SETUP_ARGS});
 *     3. `installed`, then wait for swap.ps1's verdict;
 *     4. `confirm-ok`: drop the copy. Otherwise put the copy back
 *        (robocopy /MIR, reg import) and report `restored`.
 *
 * install.ps1 writes the outcome (`result.json`, see handoff.ts) except
 * where it never ran: then swap.ps1 does. Both append to the same log.
 */

/**
 * Arguments for the NSIS installer. `--updated` keeps the old version's
 * uninstaller from deleting app data. No `/D=`: passed through Start-Process
 * it was cut at the first space (`C:\Program Files\...` installed to
 * `C:\Program`), and without it NSIS installs to the recorded
 * InstallLocation, which is where the running app is (WinInstaller checks).
 */
export const SETUP_ARGS = '/S --updated'

/** Paths and limits for the two scripts. */
export interface WinScriptParams {
  /** PID to wait for. */
  parentPid: number
  /** The install directory (holds CueMol3.exe). */
  appDir: string
  /** The downloaded Setup.exe. */
  setupPath: string
  /** Where install.ps1 keeps the old version until the new one has started. */
  backupDir: string
  /**
   * HKLM keys to save and restore with the install directory. reg.exe is
   * pinned to the 64-bit view (/reg:64): the installer writes there, and a
   * 32-bit caller would otherwise land in WOW6432Node.
   */
  registryKeys: string[]
  /** install.ps1, for swap.ps1 to start elevated. */
  installScriptPath: string
  /** The launcher that runs install.ps1 elevated (a copy outside the install directory). */
  launcherPath: string
  /** Directory of the signal files (exists and is empty when swap.ps1 starts). */
  signalDir: string
  markerPath: string
  resultPath: string
  pendingPath: string
  logPath: string
  from: string
  to: string
  /** Seconds to wait for the app to exit. */
  exitTimeout: number
  /** Seconds to wait for install.ps1 to back up and install. */
  installTimeout: number
  /** Seconds to wait for the launch marker. */
  launchTimeout: number
  /** Seconds after launch before a missing process counts as a failed start. */
  processGrace: number
  /** Seconds install.ps1 waits for swap.ps1's verdict. */
  confirmTimeout: number
  /** Seconds swap.ps1 waits for install.ps1 to restore the old version. */
  restoreTimeout: number
}

/**
 * Single-quote `s` for PowerShell. PowerShell also takes the typographic
 * single quotes as quote characters, so those are doubled as well.
 */
export function psQuote(s: string): string {
  return `'${s.replace(/['\u2018\u2019\u201A\u201B]/g, (c) => c + c)}'`
}

/** Variables and functions both scripts use. */
function prelude(p: WinScriptParams, tag: string): string {
  return `$ErrorActionPreference = 'Continue'
$Log = ${psQuote(p.logPath)}
$Result = ${psQuote(p.resultPath)}
$Pending = ${psQuote(p.pendingPath)}
$Marker = ${psQuote(p.markerPath)}
$Signals = ${psQuote(p.signalDir)}
$App = ${psQuote(p.appDir)}
$From = ${psQuote(p.from)}
$To = ${psQuote(p.to)}

function Log([string]$m) {
  $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] [${tag}] ' + $m + [Environment]::NewLine
  [IO.File]::AppendAllText($Log, $line)
}
# The app reads result.json with JSON.parse, so it is written without a BOM
# (WriteAllText's default; Out-File in Windows PowerShell adds one).
function Write-Result([string]$outcome, [string]$detail) {
  $json = [ordered]@{ outcome = $outcome; from = $From; to = $To; detail = $detail } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($Result, $json)
  Remove-Item -LiteralPath $Pending, $Marker -Force -ErrorAction SilentlyContinue
  Log ('result: ' + $outcome + ' ' + $detail)
}
function Signal([string]$name) {
  [IO.File]::WriteAllText((Join-Path $Signals $name), '')
}
# The first of $names to appear, or $null after $timeout seconds.
function Wait-Signal([string[]]$names, [int]$timeout) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $timeout) {
    foreach ($n in $names) {
      if (Test-Path -LiteralPath (Join-Path $Signals $n)) { return $n }
    }
    Start-Sleep -Milliseconds 200
  }
  return $null
}
`
}

/** swap.ps1; run it with `powershell.exe -File`. */
export function buildSwapPs1(p: WinScriptParams): string {
  return `# Generated by @cuemol/updater (win/swapScript.ts). Installs a downloaded CueMol3 update.
${prelude(p, 'swap')}
$Exe = Join-Path $App 'CueMol3.exe'
$InstallScript = ${psQuote(p.installScriptPath)}
$Launcher = ${psQuote(p.launcherPath)}
$Parent = ${p.parentPid}

# Every CueMol3.exe running from the install directory (main and children).
function App-Processes {
  Get-Process -Name 'CueMol3' -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($App + '\\', [StringComparison]::OrdinalIgnoreCase) }
}

Log ('swap ' + $From + ' -> ' + $To + ', waiting for pid ' + $Parent)
$sw = [Diagnostics.Stopwatch]::StartNew()
while ((Get-Process -Id $Parent -ErrorAction SilentlyContinue) -or (App-Processes)) {
  if ($sw.Elapsed.TotalSeconds -ge ${p.exitTimeout}) { Write-Result 'aborted' 'the app did not exit'; exit 1 }
  Start-Sleep -Milliseconds 200
}
Remove-Item -LiteralPath $Marker -Force -ErrorAction SilentlyContinue

# Start-Process joins -ArgumentList unquoted, so the path is quoted here.
Log 'starting the installer as administrator'
try {
  Start-Process -FilePath $Launcher -Verb RunAs -ArgumentList ('"' + $InstallScript + '"') -ErrorAction Stop | Out-Null
} catch {
  Write-Result 'aborted' 'the update was not allowed to run as administrator'
  Start-Process -FilePath $Exe
  exit 1
}

$s = Wait-Signal @('installed', 'install-failed', 'broken') ${p.installTimeout}
if ($s -ne 'installed') {
  if ($s -eq 'install-failed') { Start-Process -FilePath $Exe }
  elseif ($null -eq $s) { Log 'the installer did not finish in time' }
  exit 1
}

Log 'installed, launching the new app'
Start-Process -FilePath $Exe
$sw = [Diagnostics.Stopwatch]::StartNew()
while (-not (Test-Path -LiteralPath $Marker)) {
  $t = $sw.Elapsed.TotalSeconds
  $dead = ($t -ge ${p.processGrace}) -and -not (App-Processes)
  if ($dead -or $t -ge ${p.launchTimeout}) {
    Log ('the new app did not start (exited=' + $dead + '), rolling back')
    App-Processes | Stop-Process -Force -ErrorAction SilentlyContinue
    $kill = [Diagnostics.Stopwatch]::StartNew()
    while ((App-Processes) -and $kill.Elapsed.TotalSeconds -lt 10) { Start-Sleep -Milliseconds 200 }
    Signal 'confirm-fail'
    if ((Wait-Signal @('restored', 'broken') ${p.restoreTimeout}) -eq 'restored') { Start-Process -FilePath $Exe }
    exit 1
  }
  Start-Sleep -Milliseconds 200
}
Signal 'confirm-ok'
Log 'the new app started'
exit 0
`
}

/** install.ps1; swap.ps1 starts it elevated. */
export function buildInstallPs1(p: WinScriptParams): string {
  const keys = p.registryKeys.map(psQuote).join(', ')
  return `# Generated by @cuemol/updater (win/swapScript.ts). Runs elevated; started by swap.ps1.
${prelude(p, 'install')}
$Setup = ${psQuote(p.setupPath)}
$Backup = ${psQuote(p.backupDir)}
$Keys = @(${keys})

# Put the saved install directory and registry keys back; $true on success.
function Restore-Backup {
  robocopy (Join-Path $Backup 'app') $App /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Log ('restore: robocopy exit ' + $LASTEXITCODE); return $false }
  for ($i = 0; $i -lt $Keys.Count; $i++) {
    & reg.exe delete $Keys[$i] /f /reg:64 2>&1 | Out-Null
    & reg.exe import (Join-Path $Backup ('key' + $i + '.reg')) /reg:64 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Log ('restore: reg import exit ' + $LASTEXITCODE); return $false }
  }
  return $true
}

Log ('backing up ' + $App)
Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $Backup -Force | Out-Null
robocopy $App (Join-Path $Backup 'app') /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
$ok = $LASTEXITCODE -lt 8
for ($i = 0; $i -lt $Keys.Count; $i++) {
  & reg.exe export $Keys[$i] (Join-Path $Backup ('key' + $i + '.reg')) /y /reg:64 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { $ok = $false }
}
if (-not $ok) {
  Write-Result 'failed' 'could not back up the installed version'
  Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue
  Signal 'install-failed'
  exit 1
}

Log 'running the installer'
$p = Start-Process -FilePath $Setup -ArgumentList ${psQuote(SETUP_ARGS)} -Wait -PassThru
if ($p.ExitCode -ne 0) {
  if (Restore-Backup) {
    Write-Result 'failed' ('the installer failed (exit ' + $p.ExitCode + ')')
    Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue
    Signal 'install-failed'
  } else {
    Write-Result 'failed' ('the installer failed and the previous version could not be restored from ' + $Backup)
    Signal 'broken'
  }
  exit 1
}
Signal 'installed'

if ((Wait-Signal @('confirm-ok', 'confirm-fail') ${p.confirmTimeout}) -eq 'confirm-ok') {
  Write-Result 'ok' ''
  Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue
  exit 0
}
Log 'rolling back'
if (Restore-Backup) {
  Write-Result 'rolledBack' 'the new version did not start'
  Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue
  Signal 'restored'
} else {
  Write-Result 'failed' ('could not restore the previous version from ' + $Backup)
  Signal 'broken'
}
exit 1
`
}
