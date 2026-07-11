# UXP Inventory — Menu

> Hand-maintained. See [`_spec.md`](./_spec.md) for entry format and
> editing guidance.
>
> `menu.cuemol2` (the main menubar overlay) was split into 8 per-menu
> surface entries (File / Edit / Rendering / Scene / View / Tools /
> Window / Help) on 2026-07-11 — each menubar dropdown is a distinct
> `<menupopup>` surface that migrates on its own phase. All eight share
> the source file `base/content/cuemol2-menus.xul` and the inline
> `gQm2Main` controller. The macOS Application-menu block in the same
> file is tracked separately as `menu.cuemol2-macos`.

- Origin: one-time scan of `uxp_gui/cuemol2/` (2026-04-20)
- Spec: [_spec.md](./_spec.md)
- Entries: 11

## Index

- [`menu.color`](#menucolor)
- [`menu.cuemol2.file`](#menucuemol2file)
- [`menu.cuemol2.edit`](#menucuemol2edit)
- [`menu.cuemol2.rendering`](#menucuemol2rendering)
- [`menu.cuemol2.scene`](#menucuemol2scene)
- [`menu.cuemol2.view`](#menucuemol2view)
- [`menu.cuemol2.tools`](#menucuemol2tools)
- [`menu.cuemol2.window`](#menucuemol2window)
- [`menu.cuemol2.help`](#menucuemol2help)
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

### `menu.cuemol2.file`

- **File**: `uxp_gui/cuemol2/base/content/cuemol2-menus.xul`
- **Root element**: `<menu>` / `<menupopup>` (File dropdown of the injected `<menubar>`)
- **Title**: "File" (`&menu_file.label;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/cuemol2-menus.xul`
- **Associated JS**: inline `<script>` CDATA block only; handlers on `gQm2Main`
- **Overlays applied**: none

#### User-visible features
- New Window, New Tab, Open File…, Get PDB… (accession code), Open Recent (MRU list), Save File As…, Save current view…, Close Tab, Open Scene…, Reload Scene, Save Scene, Save Scene As…, Open web page…, Quit/Exit

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

#### i18n keys used
- `&menu_file.label;`, `&menu_file.accesskey;` (dtd: `cuemol2.dtd`)
- `&new_window.*;`, `&new_tab.*;`, `&open_file.*;`, `&save_file_as.*;`, `&open_PDB.label;`, `&saveCurrCam.label;`, `&close_tab.label;`, `&open_scene.*;`, `&reload_scene.*;`, `&save_scene.*;` (dtd: `cuemol2.dtd`)
- `&quitApplicationCmd.*;` (non-Windows non-macOS), `&quitApplicationCmdWin.*;` (`#ifdef XP_WIN`) (dtd: `cuemol2.dtd`)

#### Notes
- Open Recent is populated dynamically via `populateFileMRUMenu` on `onpopupshowing`.
- Keybindings: Ctrl/Cmd+N (new tab), Ctrl/Cmd+Shift+N (new window), Ctrl/Cmd+O (open file), Ctrl/Cmd+Shift+O (open scene), Ctrl/Cmd+R (reload scene), Ctrl/Cmd+S (save scene).
- Shares the source file `cuemol2-menus.xul` and the inline `gQm2Main` controller (loaded by `cuemol2-scripts.xul`) with the other seven `menu.cuemol2.*` groups.

---

### `menu.cuemol2.edit`

- **File**: `uxp_gui/cuemol2/base/content/cuemol2-menus.xul`
- **Root element**: `<menu>` / `<menupopup>` (Edit dropdown of the injected `<menubar>`)
- **Title**: "Edit" (`&menu_edit.label;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/cuemol2-menus.xul`
- **Associated JS**: inline `<script>` CDATA block only; handlers on `gQm2Main`
- **Overlays applied**: none

#### User-visible features
- Undo, Redo, Clear undo data, Merge molecule…, Delete mol atoms…, Change chain ID…, Change residue number…, Options (non-macOS)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Edit > Undo | `gQm2Main.undo()` | Undoes last action |
| Edit > Redo | `gQm2Main.redo()` | Redoes last undone action |
| Edit > Clear undo data | `gQm2Main.clearUndoData()` | Clears all undo history |
| Edit > Merge molecule… | `gQm2Main.onMolMerge1()` | Opens molecule merge dialog |
| Edit > Delete mol atoms… | `gQm2Main.onMolDelete1()` | Opens atom deletion dialog |
| Edit > Change chain ID… | `gQm2Main.onChgChName1()` | Opens chain ID change dialog |
| Edit > Change residue number… | `gQm2Main.onShiftResIndex1()` | Opens residue index shift dialog |
| Edit > Options (non-macOS) | `gQm2Main.showConfigDlg()` | Opens preferences dialog |

#### i18n keys used
- `&menu_edit.label;`, `&menu_edit.accesskey;` (dtd: `cuemol2.dtd`)
- `&edit_undo.*;`, `&edit_redo.*;`, `&edit_config.*;` (dtd: `cuemol2.dtd`)

#### Notes
- Keybindings: Ctrl/Cmd+Z (undo), Ctrl/Cmd+Y (redo), Ctrl/Cmd+K (options).
- On macOS, Options is presented as Preferences… in the Application menu (`menu.cuemol2-macos`), same `showConfigDlg()` handler.
- Shares the source file and `gQm2Main` controller with the other `menu.cuemol2.*` groups.

---

### `menu.cuemol2.rendering`

- **File**: `uxp_gui/cuemol2/base/content/cuemol2-menus.xul`
- **Root element**: `<menu>` / `<menupopup>` (Rendering dropdown of the injected `<menubar>`)
- **Title**: "Rendering" (`&menu_render.label;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/cuemol2-menus.xul`
- **Associated JS**: inline `<script>` CDATA block only; handlers on `gQm2Main` / `cuemolui`
- **Overlays applied**: none

#### User-visible features
- POV-Ray rendering…, Animation rendering…, Export scene…

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Rendering > POV-Ray rendering… | `gQm2Main.showPovRenderDlg()` | Opens POV-Ray render dialog |
| Rendering > Animation rendering… | `cuemolui.onAnimRender()` | Opens animation render dialog |
| Rendering > Export scene… | `gQm2Main.exportScene()` | Exports the current scene |

#### i18n keys used
- `&menu_render.label;`, `&menu_render.accesskey;` (dtd: `cuemol2.dtd`)
- `&render_exportscene.label;`, `&render_exportscene.accesskey;` (dtd: `cuemol2.dtd`)

#### Notes
- `cuemolui.onAnimRender` is defined in `anim/anim-ribbon.js:214` (window-global `cuemolui` namespace).
- Shares the source file and `gQm2Main` controller with the other `menu.cuemol2.*` groups.

---

### `menu.cuemol2.scene`

- **File**: `uxp_gui/cuemol2/base/content/cuemol2-menus.xul`
- **Root element**: `<menu>` / `<menupopup>` (Scene dropdown of the injected `<menubar>`)
- **Title**: "Scene" (`&menu_scene.label;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/cuemol2-menus.xul`
- **Associated JS**: inline `<script>` CDATA block only; handlers on `gQm2Main`
- **Overlays applied**: none

#### User-visible features
- Background color (White / Black), Use color proofing (checkbox), Properties…

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Scene > onpopupshowing | `gQm2Main.onSceneMenuShowing(event)` | Updates checkbox/radio state for scene menu |
| Scene > Background > White | `gQm2Main.setBgColor('white')` | Sets scene background to white |
| Scene > Background > Black | `gQm2Main.setBgColor('black')` | Sets scene background to black |
| Scene > Use color proofing | `gQm2Main.onToggleColProof(event)` | Toggles color proofing mode |
| Scene > Properties… | `gQm2Main.showScenePropDlg(event)` | Opens scene properties dialog |

#### i18n keys used
- `&menu_scene.label;`, `&menu_scene.accesskey;` (dtd: `cuemol2.dtd`)

#### Notes
- `onSceneMenuShowing` syncs the Background radio and Use-color-proofing checkbox before display.
- Shares the source file and `gQm2Main` controller with the other `menu.cuemol2.*` groups.

---

### `menu.cuemol2.view`

- **File**: `uxp_gui/cuemol2/base/content/cuemol2-menus.xul`
- **Root element**: `<menu>` / `<menupopup>` (View dropdown of the injected `<menubar>`)
- **Title**: "View" (`&menu_view.label;` in `cuemol2.dtd` — label defined in the DTD but not individually enumerated in the original scan)
- **Chrome URL**: `chrome://cuemol2/content/cuemol2-menus.xul`
- **Associated JS**: inline `<script>` CDATA block only; handlers on `gQm2Main`
- **Overlays applied**: none

#### User-visible features
- Perspective / Orthographic projection (checkboxes), Center mark sub-menu (Cross / Axis / None radio), Hardware stereo (checkbox), View property…

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| View > onpopupshowing | `gQm2Main.onViewMenuShowing(event)` | Syncs projection checkboxes |
| View > Perspective | `gQm2Main.onViewProjChg(event)` | Switches to perspective projection |
| View > Orthographic | `gQm2Main.onViewProjChg(event)` | Switches to orthographic projection |
| View > Center mark > onpopupshowing | `gQm2Main.onViewMenuMarkShowing(event)` | Syncs center mark radio |
| View > Center mark items | `gQm2Main.onViewMarkChg(event)` | Changes center mark style |
| View > Hardware stereo | `gQm2Main.toggleHWStereo()` | Toggles hardware stereo mode |
| View > View property… | `gQm2Main.showViewPropDlg()` | Opens view property dialog |

#### i18n keys used
- View menu label + item entities are defined in `cuemol2.dtd`; the original scan did not enumerate them individually (guessing prohibited).

#### Notes
- The `view-menu-stereo-type` attribute on the Hardware stereo checkbox is used as a radio-group name (non-standard XUL) — migration concern.
- Keybinding: F1 (hardware stereo).
- Shares the source file and `gQm2Main` controller with the other `menu.cuemol2.*` groups.

---

### `menu.cuemol2.tools`

- **File**: `uxp_gui/cuemol2/base/content/cuemol2-menus.xul`
- **Root element**: `<menu>` / `<menupopup>` (Tools dropdown of the injected `<menubar>`)
- **Title**: "Tools" (`&menu_tools.label;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/cuemol2-menus.xul`
- **Associated JS**: inline `<script>` CDATA block only; handlers on `gQm2Main` / `cuemolui`
- **Overlays applied**: none

#### User-visible features
- Molecular superposition…, Mol bond editor…, Interaction…, Reassign secondary str…, Mol morphing animation…, Mol surface generation…, Mol surface cutter…, APBS elepot calculation…, Execute script…, Performance measure (checkbox), Mol client tools (hidden)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
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

#### i18n keys used
- `&menu_tools.label;`, `&menu_tools.accesskey;` (dtd: `cuemol2.dtd`)

#### Notes
- `cuemolui.onIntrTool` → `tools/intr-tool.js:5`, `cuemolui.onProt2ndry` → `tools/prot2ndry-tool.js:5`, `cuemolui.onMorphAnimSetup` → `tools/morphanim-tool.js:5`.
- The `tools-menu-perf-meas` attribute on the Performance measure checkbox is used as a radio-group name (non-standard XUL) — migration concern. Keybinding: F2 (perf measure).
- Mol client tools is hidden by default.
- Shares the source file and `gQm2Main` controller with the other `menu.cuemol2.*` groups.

---

### `menu.cuemol2.window`

- **File**: `uxp_gui/cuemol2/base/content/cuemol2-menus.xul`
- **Root element**: `<menu>` / `<menupopup>` (Window dropdown of the injected `<menubar>`)
- **Title**: "Window" (`&menu_window.label;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/cuemol2-menus.xul`
- **Associated JS**: inline `<script>` CDATA block only; handlers on `gQm2Main` / window globals
- **Overlays applied**: none

#### User-visible features
- Show/Hide Topbar, Clear log contents, Restore default panel location, Panels sub-menu, Windows sub-menu

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Window > Show/Hide Topbar | `window.gToolRibbon.toggleCollapse()` | Collapses or expands the ribbon toolbar |
| Window > Clear log contents | `gQm2Main.clearLogContents()` | Clears the log panel |
| Window > Restore default panel location | `restoreDefaultPanels()` | Restores side panel to default layout |
| Window > Windows > onpopupshowing | `gQm2Main.onWinListPopupShowing(event)` | Populates open-windows list |

#### i18n keys used
- `&menu_window.label;`, `&menu_window.accesskey;` (dtd: `cuemol2.dtd`)

#### Notes
- The Panels sub-menu toggles individual side panels; the Windows sub-menu is populated dynamically via `onWinListPopupShowing`.
- Shares the source file and `gQm2Main` controller with the other `menu.cuemol2.*` groups.

---

### `menu.cuemol2.help`

- **File**: `uxp_gui/cuemol2/base/content/cuemol2-menus.xul`
- **Root element**: `<menu>` / `<menupopup>` (Help dropdown of the injected `<menubar>`)
- **Title**: "Help" (`&menu_help.label;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/cuemol2-menus.xul`
- **Associated JS**: inline `<script>` CDATA block only; handlers on `gQm2Main` + inline helpers
- **Overlays applied**: none

#### User-visible features
- About plugins…, About config…, Addon manager…, About CueMol2, Console, Test crash reporter, Check for updates
- Update alert popup (`update-alert-popup`): dismissible panel showing update message, "Don't check for updates" checkbox, "Check!!" button

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Help > About plugins… | `window.open('about:plugins', ...)` | Opens plugins info page |
| Help > About config… | `showConfig()` (inline) | Opens `about:config` page |
| Help > Addon manager… | `showAddonMgr()` (inline) | Opens addon manager |
| Help > About CueMol2 | `gQm2Main.openAboutDialog()` | Opens about dialog |
| Help > Console | `showConsole()` (inline) | Opens error console |
| Help > Test crash reporter | `showCrashReporter()` (inline) | Confirms and triggers crash reporter test |
| Help > Check for updates | `gQm2Main.checkForUpdates()` | Initiates update check |
| Update popup > Check!! | `gQm2Main.goDownloadSite()` | Opens download site |
| Update popup > close button | `gQm2Main.closeUpdatePopup()` | Dismisses update popup |

#### i18n keys used
- `&menu_help.label;`, `&menu_help.accesskey;` (dtd: `cuemol2.dtd`)
- `&help_about.label;`, `&help_about.accesskey;` (dtd: `cuemol2.dtd`)
- `&help_aboutCmdMac.label;` (dtd: `cuemol2.dtd`, `#ifdef XP_MACOSX` only)
- Inherits `%updateDTD;` (`chrome://mozapps/locale/update/updates.dtd`) for the update-alert popup

#### Notes
- Several handlers are inline helpers (`showConfig` / `showAddonMgr` / `showConsole` / `showCrashReporter`) defined in the overlay's script block rather than on `gQm2Main`.
- Shares the source file and `gQm2Main` controller with the other `menu.cuemol2.*` groups.

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

- Total entries: 11
- With JS handler: 3
- With i18n keys: 2
- Unresolved: 0
