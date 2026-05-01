<!-- AUTO-GENERATED — DO NOT EDIT MANUALLY. See specs/260420_uxpgui_step1_menu.md for generation instructions. -->

# UXP Inventory — Menu

> ⚠️ このファイルは Claude Code による自動生成です。手修正しないでください。
> 再生成する場合は `_spec.md` に従ってください。

- Generated: 2026-04-20
- Source: `uxp_gui/cuemol2/`
- Spec: [_spec.md](./_spec.md)
- Entries: 4

## Index

- [`menu.color`](#menucolor)
- [`menu.cuemol2`](#menucuemol2)
- [`menu.cuemol2-macos`](#menucuemol2-macos)
- [`menu.cuemol2-scripts`](#menucuemol2-scripts)

---

## Entries

### `menu.color`

- **File**: `uxp_gui/cuemol2/base/content/color-menu.xul`
- **Root element**: `<menupopup>`
- **Title**: unknown (no title attribute; this is a detached popup fragment with no dialog wrapper)
- **Chrome URL**: `chrome://cuemol2/content/color-menu.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Hierarchical color-picker popup with 8 top-level submenus: Monochrome, Red, Orange, Yellow, Green, Cyan, Blue, Purple
- Each submenu contains 5–7 `<menuitem>` entries representing shades defined by HSB or hex `value` attributes (e.g. `hsb(0, 1.0, 1.0)`, `#FFF`)
- Items use CSS class `color-menuitem menuitem-iconic` — the colored swatch is applied by skin CSS

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `<menuitem>` select | unknown | Value is read by the parent widget that opens this popup; no `oncommand` defined in this file |

#### i18n keys used
- none (all labels are hardcoded English strings)

#### Notes
- File has no XML declaration or DOCTYPE — it is a bare fragment loaded by a parent XBL binding (e.g. `colpicker-bindings.xml`) rather than opened directly as a chrome document. The chrome package is registered via `chrome/cuemol2.manifest` (`content cuemol2 cuemol2/content/cuemol2/`), so the URL `chrome://cuemol2/content/color-menu.xul` is valid within the application.
- Color values use the application-specific `hsb(hue, sat, bri)` format, not standard CSS.

---

### `menu.cuemol2`

- **File**: `uxp_gui/cuemol2/base/content/cuemol2-menus.xul`
- **Root element**: `<overlay>`
- **Title**: unknown (overlay has no title; it injects a full `<menubar>` into the main window)
- **Chrome URL**: `chrome://cuemol2/content/cuemol2-menus.xul`
- **Associated JS**: inline `<script>` CDATA block only; no external same-name `.js` file
- **Overlays applied**: none

#### User-visible features
- **File menu**: New Window, New Tab, Open File…, Get PDB (accession code), Open Recent (MRU list), Save File As…, Save current view…, Close Tab, Open Scene…, Reload Scene, Save Scene, Save Scene As…, Open web page…, Quit/Exit
- **Edit menu**: Undo, Redo, Clear undo data, Merge molecule…, Delete mol atoms…, Change chain ID…, Change residue number…, Options (non-macOS)
- **Rendering menu**: POV-Ray rendering…, Animation rendering…, Export scene…
- **Scene menu**: Background color (White/Black), Use color proofing (checkbox), Properties…
- **View menu**: Perspective / Orthographic projection (checkboxes), Center mark sub-menu (Cross/Axis/None radio), Hardware stereo (checkbox), View property…
- **Tools menu**: Molecular superposition…, Mol bond editor…, Interaction…, Reassign secondary str…, Mol morphing animation…, Mol surface generation…, Mol surface cutter…, APBS elepot calculation…, Execute script…, Performance measure (checkbox), Mol client tools (hidden)
- **Window menu**: Show/Hide Topbar, Clear log contents, Restore default panel location, Panels sub-menu, Windows sub-menu
- **Help menu**: About plugins…, About config…, Addon manager…, About CueMol2, Console, Test crash reporter, Check for updates
- **macOS Application menu** (`#ifdef XP_MACOSX`): Preferences…, Services, Hide CueMol2, Hide Others, Show All, Quit CueMol2
- **Update alert popup** (`update-alert-popup`): dismissible panel showing update message, "Don't check for updates" checkbox, "Check!!" button
- **Global keybindings**: Ctrl/Cmd+N (new tab), Ctrl/Cmd+Shift+N (new window), Ctrl/Cmd+O (open file), Ctrl/Cmd+Shift+O (open scene), Ctrl/Cmd+R (reload scene), Ctrl/Cmd+S (save scene), Ctrl/Cmd+Z (undo), Ctrl/Cmd+Y (redo), Ctrl/Cmd+K (options), F1 (hardware stereo), F2 (perf measure)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| File > New Window | `gQm2Main.onNewTabWindow(true)` | Opens a new application window |
| File > New Tab | `gQm2Main.onNewTabWindow(false)` | Opens a new tab in the current window |
| File > Open File… | `gQm2Main.onFileOpen()` | Opens file-open dialog |
| File > Get PDB… | `gQm2Main.onOpenPDBsite()` | Fetches PDB by accession code |
| File > Open Recent > populate | `gQm2Main.populateFileMRUMenu(event)` | Dynamically populates MRU list on `onpopupshowing` |
| File > Open Recent > Clear Menu | `gQm2Main.clearMRUMenu(event)` | Clears the MRU list |
| File > Save File As… | `gQm2Main.onFileSaveAs()` | Opens save-as dialog |
| File > Save current view… | `gQm2Main.onSaveCurView()` | Saves current camera/view state |
| File > Close Tab | `gQm2Main.onCloseTab()` | Closes current tab |
| File > Open Scene… | `gQm2Main.onOpenScene()` | Opens a scene file |
| File > Reload Scene | `gQm2Main.onReloadScene()` | Reloads current scene from disk |
| File > Save Scene | `gQm2Main.onSaveScene()` | Saves scene in place |
| File > Save Scene As… | `gQm2Main.onSaveSceneAs()` | Opens save-scene-as dialog |
| File > Open web page… | `gQm2Main.onOpenURL()` | Opens a URL |
| File > Quit (non-macOS) | `gQm2Main.onCloseEvent()` | Exits the application |
| Edit > Undo | `gQm2Main.undo()` | Undoes last action |
| Edit > Redo | `gQm2Main.redo()` | Redoes last undone action |
| Edit > Clear undo data | `gQm2Main.clearUndoData()` | Clears all undo history |
| Edit > Merge molecule… | `gQm2Main.onMolMerge1()` | Opens molecule merge dialog |
| Edit > Delete mol atoms… | `gQm2Main.onMolDelete1()` | Opens atom deletion dialog |
| Edit > Change chain ID… | `gQm2Main.onChgChName1()` | Opens chain ID change dialog |
| Edit > Change residue number… | `gQm2Main.onShiftResIndex1()` | Opens residue index shift dialog |
| Edit > Options (non-macOS) | `gQm2Main.showConfigDlg()` | Opens preferences dialog |
| Rendering > POV-Ray rendering… | `gQm2Main.showPovRenderDlg()` | Opens POV-Ray render dialog |
| Rendering > Animation rendering… | `cuemolui.onAnimRender()` | Opens animation render dialog |
| Rendering > Export scene… | `gQm2Main.exportScene()` | Exports the current scene |
| Scene > onpopupshowing | `gQm2Main.onSceneMenuShowing(event)` | Updates checkbox/radio state for scene menu |
| Scene > Background > White | `gQm2Main.setBgColor('white')` | Sets scene background to white |
| Scene > Background > Black | `gQm2Main.setBgColor('black')` | Sets scene background to black |
| Scene > Use color proofing | `gQm2Main.onToggleColProof(event)` | Toggles color proofing mode |
| Scene > Properties… | `gQm2Main.showScenePropDlg(event)` | Opens scene properties dialog |
| View > onpopupshowing | `gQm2Main.onViewMenuShowing(event)` | Syncs projection checkboxes |
| View > Perspective | `gQm2Main.onViewProjChg(event)` | Switches to perspective projection |
| View > Orthographic | `gQm2Main.onViewProjChg(event)` | Switches to orthographic projection |
| View > Center mark > onpopupshowing | `gQm2Main.onViewMenuMarkShowing(event)` | Syncs center mark radio |
| View > Center mark items | `gQm2Main.onViewMarkChg(event)` | Changes center mark style |
| View > Hardware stereo | `gQm2Main.toggleHWStereo()` | Toggles hardware stereo mode |
| View > View property… | `gQm2Main.showViewPropDlg()` | Opens view property dialog |
| Tools > Molecular superposition… | `gQm2Main.onSSMSup1()` | Opens SSM superposition dialog |
| Tools > Mol bond editor… | `gQm2Main.onMolBondEditor()` | Opens bond editor dialog |
| Tools > Interaction… | `cuemolui.onIntrTool()` | Opens interaction tool dialog |
| Tools > Reassign secondary str… | `cuemolui.onProt2ndry()` | Reassigns secondary structure |
| Tools > Mol morphing animation… | `cuemolui.onMorphAnimSetup()` | Opens morph animation setup dialog |
| Tools > Mol surface generation… | `gQm2Main.calcMolSurf()` | Runs mol surface generation |
| Tools > Mol surface cutter… | `gQm2Main.surfCutByPlaneTool()` | Opens surface cut-by-plane tool |
| Tools > APBS elepot calculation… | `gQm2Main.calcApbsPot()` | Runs APBS electrostatic potential |
| Tools > Execute script… | `gQm2Main.onExecScr()` | Opens script execution dialog |
| Tools > Performance measure | `gQm2Main.togglePerfMeas(event)` | Toggles performance measurement mode |
| Window > Show/Hide Topbar | `window.gToolRibbon.toggleCollapse()` | Collapses or expands the ribbon toolbar |
| Window > Clear log contents | `gQm2Main.clearLogContents()` | Clears the log panel |
| Window > Restore default panel location | `restoreDefaultPanels()` | Restores side panel to default layout |
| Window > Windows > onpopupshowing | `gQm2Main.onWinListPopupShowing(event)` | Populates open-windows list |
| Help > About plugins… | `window.open('about:plugins', ...)` | Opens plugins info page |
| Help > About config… | `showConfig()` (inline) | Opens `about:config` page |
| Help > Addon manager… | `showAddonMgr()` (inline) | Opens addon manager |
| Help > About CueMol2 | `gQm2Main.openAboutDialog()` | Opens about dialog |
| Help > Console | `showConsole()` (inline) | Opens error console |
| Help > Test crash reporter | `showCrashReporter()` (inline) | Confirms and triggers crash reporter test |
| Help > Check for updates | `gQm2Main.checkForUpdates()` | Initiates update check |
| Update popup > Check!! | `gQm2Main.goDownloadSite()` | Opens download site |
| Update popup > close button | `gQm2Main.closeUpdatePopup()` | Dismisses update popup |
| macOS > Preferences… | `gQm2Main.showConfigDlg()` | Opens preferences dialog (macOS) |
| macOS > Quit CueMol2 | `gQm2Main.onCloseEvent()` | Exits application (macOS) |

#### i18n keys used
- `&menu_file.label;`, `&menu_file.accesskey;` (dtd: `cuemol2.dtd`)
- `&new_window.label;`, `&new_window.accesskey;`, `&new_window.commandkey;` (dtd: `cuemol2.dtd`)
- `&new_tab.label;`, `&new_tab.accesskey;`, `&new_tab.commandkey;` (dtd: `cuemol2.dtd`)
- `&open_file.label;`, `&open_file.accesskey;`, `&open_file.commandkey;` (dtd: `cuemol2.dtd`)
- `&save_file_as.label;`, `&save_file_as.accesskey;`, `&save_file_as.commandkey;` (dtd: `cuemol2.dtd`)
- `&open_PDB.label;` (dtd: `cuemol2.dtd`)
- `&saveCurrCam.label;` (dtd: `cuemol2.dtd`)
- `&close_tab.label;` (dtd: `cuemol2.dtd`)
- `&open_scene.label;`, `&open_scene.accesskey;` (dtd: `cuemol2.dtd`)
- `&reload_scene.label;`, `&reload_scene.accesskey;`, `&reload_scene.commandkey;` (dtd: `cuemol2.dtd`)
- `&save_scene.label;`, `&save_scene.accesskey;`, `&save_scene.commandkey;` (dtd: `cuemol2.dtd`)
- `&menu_edit.label;`, `&menu_edit.accesskey;` (dtd: `cuemol2.dtd`)
- `&edit_undo.label;`, `&edit_undo.accesskey;`, `&edit_undo.commandkey;` (dtd: `cuemol2.dtd`)
- `&edit_redo.label;`, `&edit_redo.accesskey;`, `&edit_redo.commandkey;` (dtd: `cuemol2.dtd`)
- `&edit_config.label;`, `&edit_config.accesskey;`, `&edit_config.commandkey;` (dtd: `cuemol2.dtd`)
- `&menu_render.label;`, `&menu_render.accesskey;` (dtd: `cuemol2.dtd`)
- `&render_exportscene.label;`, `&render_exportscene.accesskey;` (dtd: `cuemol2.dtd`)
- `&menu_scene.label;`, `&menu_scene.accesskey;` (dtd: `cuemol2.dtd`)
- `&menu_tools.label;`, `&menu_tools.accesskey;` (dtd: `cuemol2.dtd`)
- `&menu_window.label;`, `&menu_window.accesskey;` (dtd: `cuemol2.dtd`)
- `&menu_help.label;`, `&menu_help.accesskey;` (dtd: `cuemol2.dtd`)
- `&help_about.label;`, `&help_about.accesskey;` (dtd: `cuemol2.dtd`)
- `&help_aboutCmdMac.label;` (dtd: `cuemol2.dtd`, `#ifdef XP_MACOSX` only)
- `&quitApplicationCmd.label;`, `&quitApplicationCmd.accesskey;` (dtd: `cuemol2.dtd`, non-Windows non-macOS)
- `&quitApplicationCmdWin.label;`, `&quitApplicationCmdWin.accesskey;` (dtd: `cuemol2.dtd`, `#ifdef XP_WIN` only)
- `&quitApplicationCmdMac.label;`, `&quitApplicationCmdMac.key;` (dtd: `cuemol2.dtd`, `#ifdef XP_MACOSX` only)
- `&configCmdMac.label;`, `&configCmdMac.commandkey;` (dtd: `cuemol2.dtd`, `#ifdef XP_MACOSX` only)
- `&servicesMenuMac.label;` (dtd: `cuemol2.dtd`, `#ifdef XP_MACOSX` only)
- `&hideThisAppCmdMac.label;`, `&hideThisAppCmdMac.commandkey;` (dtd: `cuemol2.dtd`, `#ifdef XP_MACOSX` only)
- `&hideOtherAppsCmdMac.label;`, `&hideOtherAppsCmdMac.commandkey;` (dtd: `cuemol2.dtd`, `#ifdef XP_MACOSX` only)
- `&showAllAppsCmdMac.label;` (dtd: `cuemol2.dtd`, `#ifdef XP_MACOSX` only)
- Inherits `%brandDTD;` (`chrome://global/locale/brand.dtd`) — `&brandShortName;` etc. used indirectly via the above entities
- Inherits `%updateDTD;` (`chrome://mozapps/locale/update/updates.dtd`) — referenced in DOCTYPE but no update entities appear directly in this file's markup

#### Notes
- This is the primary menu overlay; it targets `menus-overlay-target` in `cuemol2.xul`.
- Contains preprocessor directives (`#ifdef XP_MACOSX`, `#ifdef XP_WIN`) — the macOS Application menu block duplicates logic also found in `cuemol2-macos-menus.xul`; the relationship between the two files should be clarified during migration.
- `gQm2Main` is an instance of `Qm2Main` class loaded by `cuemol2-scripts.xul`; all `gQm2Main.*` handlers depend on that overlay being applied first.
- `cuemolui` is a window-global namespace object declared at `base/content/cuemol2-utils.js:30` (`var cuemolui = new Object()`). Methods called from this menu are defined in specific content JS files: `cuemolui.onAnimRender` → `anim/anim-ribbon.js:214`, `cuemolui.onIntrTool` → `tools/intr-tool.js:5`, `cuemolui.onProt2ndry` → `tools/prot2ndry-tool.js:5`, `cuemolui.onMorphAnimSetup` → `tools/morphanim-tool.js:5`. Underlying implementation modules live in `components/jsmods/cuemol2ui-lib/` and are loaded via CommonJS `require()`.
- The `tools-menu-perf-meas` and `view-menu-stereo-type` attributes on checkboxes are used as radio-group names, not standard XUL behavior — migration concern.

---

### `menu.cuemol2-macos`

- **File**: `uxp_gui/cuemol2/base/content/cuemol2-macos-menus.xul`
- **Root element**: `<overlay>`
- **Title**: unknown (overlay with no title; injects macOS Application menu items)
- **Chrome URL**: `chrome://cuemol2/content/cuemol2-macos-menus.xul`
- **Associated JS**: inline `<script>` CDATA block only; no external same-name `.js` file
- **Overlays applied**: none

#### User-visible features
- macOS Application menu (`menu_ToolsPopup`) containing: Preferences…, Services, Hide CueMol2, Hide Others, Show All, Quit CueMol2
- Keyboard bindings: Cmd+, (Preferences), Cmd+H (Hide), Cmd+Opt+H (Hide Others), Cmd+Q (Quit)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Application > Preferences… | `getQm2MainObj().showConfigDlg()` | Opens preferences dialog |
| Application > Quit CueMol2 | `getQm2MainObj().onCloseEvent()` | Quits the application |
| (keybindings delegate to above commands via `<commandset>`) | — | — |

#### i18n keys used
- `&configCmdMac.label;`, `&configCmdMac.commandkey;` (dtd: `cuemol2.dtd`)
- `&servicesMenuMac.label;` (dtd: `cuemol2.dtd`)
- `&hideThisAppCmdMac.label;`, `&hideThisAppCmdMac.commandkey;` (dtd: `cuemol2.dtd`)
- `&hideOtherAppsCmdMac.label;`, `&hideOtherAppsCmdMac.commandkey;` (dtd: `cuemol2.dtd`)
- `&showAllAppsCmdMac.label;` (dtd: `cuemol2.dtd`)
- `&quitApplicationCmdMac.label;`, `&quitApplicationCmdMac.key;` (dtd: `cuemol2.dtd`)
- Inherits `%brandDTD;` (`chrome://global/locale/brand.dtd`)

#### Notes
- Targets `menus-overlay-target`, same as `cuemol2-menus.xul`.
- **適用ウィンドウの確定**: `cuemol2.xul` (main window) は `#ifdef XP_MACOSX` 内でこのファイルを適用 (`cuemol2.xul:9-11`)。`hiddenWindow.xul` もこのファイルだけを適用 (`hiddenWindow.xul:15`)。すなわち `cuemol2-macos-menus.xul` は **メインウィンドウ + hidden window の両方** に適用される。
- **重複の実態**: macOS メインウィンドウには `cuemol2-menus.xul`(の `#ifdef XP_MACOSX` ブロック) と `cuemol2-macos-menus.xul` の **両方** が `menu_ToolsPopup` に注入される。これは意図的な冗長ではなくコードの重複であり、migration 時に整理が必要。
- hidden window 向けに `getQm2MainObj()` ヘルパーを持つ。これは `nsIWindowMediator` でもっとも直近の `cuemol2:mainwnd` を取得するクロスウィンドウ呼び出しで、hidden window に `gQm2Main` が存在しないための回避策。
- `menu_mac_services`, `menu_mac_hide_app`, `menu_mac_hide_others`, `menu_mac_show_all` は Gecko/XUL プラットフォームが OS レベルで認識する標準 ID。
- `menu_mac_services`, `menu_mac_hide_app`, `menu_mac_hide_others`, `menu_mac_show_all` are standard macOS Gecko IDs recognized by the XUL platform for OS-level integration.

---

### `menu.cuemol2-scripts`

- **File**: `uxp_gui/cuemol2/base/content/cuemol2-scripts.xul`
- **Root element**: `<overlay>`
- **Title**: unknown (no title; this overlay loads scripts only — no visual elements)
- **Chrome URL**: `chrome://cuemol2/content/cuemol2-scripts.xul`
- **Associated JS**: `renderer.js`, `fileopen.js`, `dragdropopen.js`, `export-qsl.js`, `tools/netpdbopen.js`, `chrome://cuemol2/content/tools/intr-tool.js`, `chrome://cuemol2/content/tools/prot2ndry-tool.js`, `chrome://cuemol2/content/tools/morphanim-tool.js`, `tools/molclient-tools.js` (all loaded via `<script src="...">`)
- **Overlays applied**: none

#### User-visible features
- No directly user-visible UI elements.
- Provides the JavaScript runtime for the main window by loading all major JS modules and instantiating `window.gQm2Main = new Qm2Main()`.

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Overlay load | `new Qm2Main()` assigned to `window.gQm2Main` | Instantiates the main controller object used by all menu commands |

#### i18n keys used
- none

#### Notes
- Acts as the script-bundle overlay for the main window; without it, all `gQm2Main.*` handlers in `menu.cuemol2` are undefined.
- Loads `chrome://global/content/` utility scripts (nsUserSettings.js, nsTransferable.js, nsClipboard.js, nsDragAndDrop.js, findUtils.js, strres.js, globalOverlay.js) that are standard Gecko/XUL platform scripts — these have no UXP equivalent and will need to be evaluated individually during migration.
- Classified as `menu.*` because the scan report identifies it as adding menu-related commands to the application (see `_scan-report.md` ambiguous files note).

---

## Unresolved

このカテゴリで解決できなかった項目:
- なし (3件すべて解決済み)

## Statistics

- Total entries: 4
- With JS handler: 3
- With i18n keys: 2
- Unresolved: 0
