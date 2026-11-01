; CueMol3 Updater: the elevated half of the Windows self-update.
;
; Built by build/updaterLauncher.js (afterPack) with electron-builder's own
; makensis, into resources/CueMol3 Updater.exe. The app copies it into its
; updater work directory and swap.ps1 (unelevated, see @cuemol/updater
; win/swapScript.ts) starts it elevated, so the UAC prompt names CueMol3.
;
; It takes no arguments and runs no script: the steps below are fixed here.
; What it reads from outside:
;   - the install directory: InstallLocation under HKLM, which only an
;     administrator can change;
;   - install.ini in its own directory: the two version numbers for the
;     outcome, and the SHA-256 the staged installer must have;
;   - staging\CueMol3-Setup.exe in its own directory, run only when its
;     SHA-256 matches.
;
; Steps: back up the install directory and the installer's two HKLM keys ->
; run the installer silently -> signal `installed` -> wait for swap.ps1's
; verdict (`confirm-ok` once the new version reported it started) -> drop
; the backup, or put it back on `confirm-fail` / timeout. The outcome goes to
; result.json, which the next start of the app reports.
;
; Defined on the makensis command line: OUT_FILE, ICON, VERSION, COPYRIGHT,
; APP_GUID (the NSIS app GUID electron-builder derives from the appId).

Unicode true
!include FileFunc.nsh
!include LogicLib.nsh
!include x64.nsh

Name "CueMol3 Updater"
OutFile "${OUT_FILE}"
Icon "${ICON}"
RequestExecutionLevel admin
SilentInstall silent
VIProductVersion "${VERSION}"
VIAddVersionKey "ProductName" "CueMol3"
VIAddVersionKey "FileDescription" "CueMol3 Updater"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "${COPYRIGHT}"

!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}"
!define APP_KEY "Software\${APP_GUID}"
; Seconds to wait for swap.ps1's verdict: longer than its launch timeout (120)
; plus the time it takes to stop a new version that did not start.
!define CONFIRM_TIMEOUT 180

Var Work
Var Signals
Var Backup
Var Setup
Var AppDir
Var From
Var To

; --- Helpers. They use $0-$9 freely; the main section keeps its state in the
; --- named variables and $R0-$R9.

!macro Log MSG
  Push `${MSG}`
  Call LogLine
!macroend

Function LogLine
  Pop $9
  ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
  FileOpen $8 "$Work\swap.log" a
  FileSeek $8 0 END
  FileWrite $8 "[$2-$1-$0 $4:$5:$6] [install] $9$\r$\n"
  FileClose $8
FunctionEnd

; The outcome, in the shape of handoff.ts (ASCII, so no BOM to trip JSON.parse).
!macro Result OUTCOME DETAIL
  Push `${DETAIL}`
  Push `${OUTCOME}`
  Call WriteResult
!macroend

Function WriteResult
  Pop $0
  Pop $1
  FileOpen $2 "$Work\result.json" w
  FileWrite $2 '{"outcome":"$0","from":"$From","to":"$To","detail":"$1"}'
  FileClose $2
  Delete "$Work\pending.json"
  Delete "$Work\launch-ok"
  !insertmacro Log "result: $0 $1"
FunctionEnd

!macro Signal NAME
  FileOpen $9 "$Signals\${NAME}" w
  FileClose $9
!macroend

; robocopy /MIR <src> <dst>. Push dst, then src. $0 = 1 on success.
Function Mirror
  Pop $1
  Pop $2
  nsExec::Exec '"$SYSDIR\robocopy.exe" "$1" "$2" /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP'
  Pop $3
  ; robocopy: 0-7 are success (what was copied), 8 and up are failures.
  ${If} $3 == "error"
  ${OrIf} $3 >= 8
    !insertmacro Log "robocopy exit $3"
    StrCpy $0 0
  ${Else}
    StrCpy $0 1
  ${EndIf}
FunctionEnd

; Run reg.exe (64-bit view) with the given arguments. $0 = its exit code.
!macro Reg ARGS
  nsExec::Exec '"$SYSDIR\reg.exe" ${ARGS} /reg:64'
  Pop $0
!macroend

; Put the saved install directory and registry keys back. $0 = 1 on success.
Function Restore
  Push $AppDir
  Push "$Backup\app"
  Call Mirror
  ${If} $0 != 1
    Return
  ${EndIf}
  !insertmacro Reg 'delete "HKLM\${UNINSTALL_KEY}" /f'
  !insertmacro Reg 'import "$Backup\key0.reg"'
  ${If} $0 != 0
    StrCpy $0 0
    Return
  ${EndIf}
  !insertmacro Reg 'delete "HKLM\${APP_KEY}" /f'
  !insertmacro Reg 'import "$Backup\key1.reg"'
  ${If} $0 != 0
    StrCpy $0 0
    Return
  ${EndIf}
  StrCpy $0 1
FunctionEnd

; Whether the staged installer's SHA-256 is $R0 (64 hex digits). $0 = 1 if so.
; certutil's first and last lines are localized; the hash line is only hex.
Function CheckDigest
  StrCpy $0 0
  StrLen $1 $R0
  ${If} $1 != 64
    Return
  ${EndIf}
  nsExec::ExecToStack '"$SYSDIR\certutil.exe" -hashfile "$Setup" SHA256'
  Pop $2
  Pop $3
  ${If} $2 != 0
    Return
  ${EndIf}
  ; Look for the expected hash in the output (StrCmp ignores case).
  StrCpy $4 0
  ${Do}
    StrCpy $5 $3 64 $4
    ${If} $5 == ""
      Return
    ${EndIf}
    ${If} $5 == $R0
      StrCpy $0 1
      Return
    ${EndIf}
    IntOp $4 $4 + 1
  ${Loop}
FunctionEnd

; swap.ps1's verdict: $0 = "ok", "fail", or "" after CONFIRM_TIMEOUT seconds.
Function WaitConfirm
  StrCpy $1 0
  IntOp $2 ${CONFIRM_TIMEOUT} * 5
  ${Do}
    ${If} ${FileExists} "$Signals\confirm-ok"
      StrCpy $0 "ok"
      Return
    ${EndIf}
    ${If} ${FileExists} "$Signals\confirm-fail"
      StrCpy $0 "fail"
      Return
    ${EndIf}
    Sleep 200
    IntOp $1 $1 + 1
  ${LoopUntil} $1 >= $2
  StrCpy $0 ""
FunctionEnd

; Report a failure that left the old version in place, and stop.
!macro FailBeforeInstall DETAIL
  !insertmacro Result failed `${DETAIL}`
  RMDir /r $Backup
  !insertmacro Signal install-failed
  SetErrorLevel 1
  Quit
!macroend

Section
  ; This is a 32-bit process: without these, $SYSDIR would run the 32-bit
  ; tools and the registry calls would land in WOW6432Node.
  ${If} ${RunningX64}
    ${DisableX64FSRedirection}
    SetRegView 64
  ${EndIf}

  StrCpy $Work $EXEDIR
  StrCpy $Signals "$Work\signals"
  StrCpy $Backup "$Work\backup"
  StrCpy $Setup "$Work\staging\CueMol3-Setup.exe"
  ReadINIStr $From "$Work\install.ini" install from
  ReadINIStr $To "$Work\install.ini" install to
  ReadINIStr $R0 "$Work\install.ini" install sha256

  ReadRegStr $AppDir HKLM "${APP_KEY}" InstallLocation
  ${If} $AppDir == ""
    !insertmacro FailBeforeInstall "the install location is not recorded"
  ${EndIf}
  Call CheckDigest
  ${If} $0 != 1
    !insertmacro FailBeforeInstall "the staged installer does not match its digest"
  ${EndIf}

  !insertmacro Log "backing up $AppDir"
  RMDir /r $Backup
  CreateDirectory $Backup
  Push "$Backup\app"
  Push $AppDir
  Call Mirror
  ${If} $0 != 1
    !insertmacro FailBeforeInstall "could not back up the installed version"
  ${EndIf}
  !insertmacro Reg 'export "HKLM\${UNINSTALL_KEY}" "$Backup\key0.reg" /y'
  ${If} $0 != 0
    !insertmacro FailBeforeInstall "could not back up the installed version"
  ${EndIf}
  !insertmacro Reg 'export "HKLM\${APP_KEY}" "$Backup\key1.reg" /y'
  ${If} $0 != 0
    !insertmacro FailBeforeInstall "could not back up the installed version"
  ${EndIf}

  ; No /D=: the installer goes to the recorded InstallLocation, which is the
  ; directory backed up above. --updated keeps the old uninstaller from
  ; deleting app data.
  !insertmacro Log "running the installer"
  ClearErrors
  ExecWait '"$Setup" /S --updated' $R1
  ${If} ${Errors}
  ${OrIf} $R1 != 0
    Call Restore
    ${If} $0 == 1
      !insertmacro FailBeforeInstall "the installer failed (exit $R1)"
    ${EndIf}
    !insertmacro Result failed "the installer failed and the previous version could not be restored"
    !insertmacro Signal broken
    SetErrorLevel 1
    Quit
  ${EndIf}
  !insertmacro Signal installed

  Call WaitConfirm
  ${If} $0 == "ok"
    !insertmacro Result ok ""
    RMDir /r $Backup
    SetErrorLevel 0
    Quit
  ${EndIf}

  !insertmacro Log "rolling back"
  Call Restore
  ${If} $0 == 1
    !insertmacro Result rolledBack "the new version did not start"
    RMDir /r $Backup
    !insertmacro Signal restored
  ${Else}
    !insertmacro Result failed "could not restore the previous version"
    !insertmacro Signal broken
  ${EndIf}
  SetErrorLevel 1
SectionEnd
