; Custom NSIS include for the CueMol3 Windows installer, wired in via
; nsis.include in electron-builder.yml.
;
; Registers CueMol3 as an "Open with" CANDIDATE for the molecular file types
; it can read, and nothing more:
;   - The app is registered once under Software\Classes\Applications\
;     CueMol3.exe (FriendlyAppName, open command, SupportedTypes).
;   - Each extension gets a Software\Classes\.<ext>\OpenWithList\CueMol3.exe
;     subkey, which only ever feeds the "Open with" menu.
; No ProgID is created and no extension default value is written. This
; matters: a ProgID listed in OpenWithProgids can be promoted by the shell to
; the effective default handler when the extension has no other association
; (observed with .pdb), whereas OpenWithList entries are never used for
; default-verb resolution. An existing default (e.g. CueMol2's Inno Setup
; registration of .qsc) is therefore untouched. This is the Windows
; counterpart of the macOS document types declared with
; LSHandlerRank=Alternate in electron-builder.yml -- keep the extension list
; in sync with mac.fileAssociations there.
;
; SHCTX resolves to HKLM because nsis.perMachine=true; electron-builder runs
; customInstall after the files are laid out and customUnInstall from the
; uninstaller (also on update, where the subsequent install re-registers).

!define APPS_KEY "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"

!macro addOpenWith EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithList\${APP_EXECUTABLE_FILENAME}" "" ""
  WriteRegStr SHCTX "${APPS_KEY}\SupportedTypes" ".${EXT}" ""
!macroend

!macro removeOpenWith EXT
  DeleteRegKey SHCTX "Software\Classes\.${EXT}\OpenWithList\${APP_EXECUTABLE_FILENAME}"
!macroend

; An earlier build (2.3.8.495) registered CueMol3.* ProgIDs via
; OpenWithProgids; the shell promoted them to the default handler for
; previously unassociated extensions (.pdb). Remove those entries on both
; install (migration) and uninstall (safety net for a machine that never
; upgrades past that build).
!macro purgeLegacyProgId EXT PROGID
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}"
  DeleteRegKey SHCTX "Software\Classes\${PROGID}"
!macroend

!macro purgeLegacyProgIds
  !insertmacro purgeLegacyProgId "qsc"   "CueMol3.Scene"
  !insertmacro purgeLegacyProgId "pdb"   "CueMol3.PDB"
  !insertmacro purgeLegacyProgId "ent"   "CueMol3.PDB"
  !insertmacro purgeLegacyProgId "cif"   "CueMol3.mmCIF"
  !insertmacro purgeLegacyProgId "mmcif" "CueMol3.mmCIF"
  !insertmacro purgeLegacyProgId "mol2"  "CueMol3.Mol2"
  !insertmacro purgeLegacyProgId "sdf"   "CueMol3.MolSDF"
  !insertmacro purgeLegacyProgId "mol"   "CueMol3.MolSDF"
  !insertmacro purgeLegacyProgId "ccp4"  "CueMol3.CCP4Map"
  !insertmacro purgeLegacyProgId "map"   "CueMol3.CCP4Map"
  !insertmacro purgeLegacyProgId "mrc"   "CueMol3.CCP4Map"
  !insertmacro purgeLegacyProgId "mtz"   "CueMol3.MTZ"
  !insertmacro purgeLegacyProgId "cns"   "CueMol3.CNSMap"
  !insertmacro purgeLegacyProgId "dx"    "CueMol3.DXMap"
  !insertmacro purgeLegacyProgId "brix"  "CueMol3.BRIXMap"
  !insertmacro purgeLegacyProgId "omap"  "CueMol3.BRIXMap"
!macroend

; SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, NULL, NULL) so Explorer
; refreshes its "Open with" cache without waiting for a logoff.
!macro notifyAssocChanged
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customInstall
  !insertmacro purgeLegacyProgIds

  ; "CueMol3" is what the "Open with" menu shows; without FriendlyAppName the
  ; shell falls back to the exe's FileDescription version resource (the long
  ; package.json description).
  WriteRegStr SHCTX "${APPS_KEY}" "FriendlyAppName" "CueMol3"
  WriteRegStr SHCTX "${APPS_KEY}\DefaultIcon" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr SHCTX "${APPS_KEY}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  !insertmacro addOpenWith "qsc"
  !insertmacro addOpenWith "pdb"
  !insertmacro addOpenWith "ent"
  !insertmacro addOpenWith "cif"
  !insertmacro addOpenWith "mmcif"
  !insertmacro addOpenWith "mol2"
  !insertmacro addOpenWith "sdf"
  !insertmacro addOpenWith "mol"
  !insertmacro addOpenWith "ccp4"
  !insertmacro addOpenWith "map"
  !insertmacro addOpenWith "mrc"
  !insertmacro addOpenWith "mtz"
  !insertmacro addOpenWith "cns"
  !insertmacro addOpenWith "dx"
  !insertmacro addOpenWith "brix"
  !insertmacro addOpenWith "omap"

  !insertmacro notifyAssocChanged
!macroend

!macro customUnInstall
  !insertmacro removeOpenWith "qsc"
  !insertmacro removeOpenWith "pdb"
  !insertmacro removeOpenWith "ent"
  !insertmacro removeOpenWith "cif"
  !insertmacro removeOpenWith "mmcif"
  !insertmacro removeOpenWith "mol2"
  !insertmacro removeOpenWith "sdf"
  !insertmacro removeOpenWith "mol"
  !insertmacro removeOpenWith "ccp4"
  !insertmacro removeOpenWith "map"
  !insertmacro removeOpenWith "mrc"
  !insertmacro removeOpenWith "mtz"
  !insertmacro removeOpenWith "cns"
  !insertmacro removeOpenWith "dx"
  !insertmacro removeOpenWith "brix"
  !insertmacro removeOpenWith "omap"

  DeleteRegKey SHCTX "${APPS_KEY}"

  !insertmacro purgeLegacyProgIds

  !insertmacro notifyAssocChanged
!macroend
