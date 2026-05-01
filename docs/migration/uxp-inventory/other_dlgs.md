# UXP Inventory — Dialog_other

> ⚠️ このファイルは Claude Code による自動生成です。手修正しないでください。
> 再生成する場合は `_spec.md` に従ってください。

- Generated: 2026-04-20
- Source: `uxp_gui/cuemol2/`
- Spec: [_spec.md](./_spec.md)
- Entries: 18

## Index

- [`dialog.about`](#dialogabout)
- [`dialog.atomintr`](#dialogatomintr)
- [`dialog.delete-object`](#dialogdelete-object)
- [`dialog.dsurf`](#dialogdsurf)
- [`dialog.exportlxs-opt`](#dialogexportlxs-opt)
- [`dialog.exportpng-opt`](#dialogexportpng-opt)
- [`dialog.exportqsl-opt`](#dialogexportqsl-opt)
- [`dialog.fopen-option`](#dialogfopen-option)
- [`dialog.generic`](#dialoggeneric)
- [`dialog.new-tabwnd`](#dialognew-tabwnd)
- [`dialog.paint`](#dialogpaint)
- [`dialog.qscwriter-option`](#dialogqscwriter-option)
- [`dialog.setup-renderer`](#dialogsetup-renderer)
- [`dialog.anim-render`](#dialoganim-render)
- [`dialog.animobj`](#dialoganimobj)
- [`dialog.apply-rend-style`](#dialogapply-rend-style)
- [`dialog.rendstyle-create`](#dialogrendstyle-create)
- [`dialog.style-editor`](#dialogstyle-editor)

---

## Entries

### `dialog.about`

- **File**: `uxp_gui/cuemol2/base/content/aboutDialog.xul`
- **Root element**: `<dialog>`
- **Title**: "About CueMol2" (`&aboutDialog.title;` → "About &brandShortName;" in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/aboutDialog.xul`
- **Associated JS**: `cuemol2-utils.js` + inline script (external `aboutDialog.js` is commented out)
- **Overlays applied**: none

#### User-visible features
- CueMol2 logo / app name label
- Version label (populated at runtime via SceneManager)
- Build ID label
- GRE (Mozilla platform) info label
- Copyright description with clickable license link
- Read-only user-agent textbox
- OK button

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `onload` | `init(event)` | Fetches version, buildID, GRE info, and userAgent at open |
| `onunload` | `uninit(event)` | No-op guard against non-document events |
| License link click | `goLicPage(event)` | Opens license URL in the OS default browser via `nsIExternalProtocolService` |

#### i18n keys used
- `&aboutDialog.title;` (dtd: `cuemol2.dtd`)
- `&aboutDialog.version;` (dtd: `cuemol2.dtd`)
- `&aboutDialog.build;` (dtd: `cuemol2.dtd`)
- `&aboutDialog.copyrightInfo1;` (dtd: `cuemol2.dtd`)
- `&aboutDialog.copyrightInfoLink;` (dtd: `cuemol2.dtd`)
- `&aboutDialog.copyrightInfoLinkURL;` (dtd: `cuemol2.dtd`)
- `&aboutDialog.copyrightInfo2;` (dtd: `cuemol2.dtd`)
- `&brandShortName;` (dtd: `brand.dtd` via `chrome://global/locale/brand.dtd`)

#### Notes
- `aboutDialog.js` referenced in a comment; actual logic is inlined in the XUL `<script>` block.
- Uses XPCOM services (`nsIHttpProtocolHandler`, `nsIExternalProtocolService`) which do not exist in Electron — need Web API / Electron shell equivalents.

---

### `dialog.atomintr`

- **File**: `uxp_gui/cuemol2/base/content/atomintr-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Interaction renderer properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/atomintr-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `propeditor-generic-page.js`, `property/renderer-common-page.js`, `atomintr-propdlg.js`
- **Overlays applied**: `propeditor-generic-page.xul`, `property/renderer-common-page.xul`

#### User-visible features
- Tabbed dialog: "Common" tab (from `renderer-common-page` overlay) + "Interaction" tab
- Mode selector: Simple line / 3D tube
- Show label checkbox
- Width numeric slider (Å unit)
- Color picker
- Dashed line groupbox with 6 dash/gap pattern textboxes
- 3D tube options: Detail menulist, Start cap / End cap menus (Flat / Round / Arrow)
- Buttons: Reset all to default, Apply, OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Reset all button | `gMain.resetAllToDefault()` | Resets all renderer properties to defaults |
| Apply button | `gMain.apply()` | Applies current values without closing |
| `ondialogaccept` | `gMain.onDialogAccept(event)` | Saves and closes |
| Widget changes | `gAintr.validateWidgets(event)` | Enables/disables dependent controls on change |

#### i18n keys used
- none

#### Notes
- Inherits generic property-editor infrastructure (`GenPropEdit`) via `propeditor-generic-page`.
- Overlay injection pattern: `<overlaytarget id="renderer-common-page"/>` and `<overlaytarget id="tabpanels-overlay-target"/>`.

---

### `dialog.delete-object`

- **File**: `uxp_gui/cuemol2/base/content/deleteObject.xul`
- **Root element**: `<dialog>`
- **Title**: "Delete object" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/deleteObject.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Label "Object to delete:"
- Menulist of objects (populated by caller via `window.arguments[0]`)
- OK / Cancel buttons

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `onload` | `window.arguments[0](document)` | Caller-supplied callback that populates the object menulist |
| `ondialogaccept` | `window.arguments[1](document)` | Caller-supplied callback that performs the deletion |

#### i18n keys used
- none

#### Notes
- No embedded JS — entirely driven by caller-supplied callbacks passed via `window.arguments`.
- Migration: the callback pattern must be replaced with a proper IPC/props mechanism in Electron.

---

### `dialog.dsurf`

- **File**: `uxp_gui/cuemol2/base/content/dsurf-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "DSurf Rend Properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/dsurf-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `propeditor-generic-page.js`, `property/renderer-common-page.js`, `property/molsurf-page.js`, `propeditor-radii-common.js`, `dsurf-propdlg.js`
- **Overlays applied**: `propeditor-generic-page.xul`, `property/renderer-common-page.xul`, `property/molsurf-page.xul`, `propeditor-radii-common.xul`

#### User-visible features
- Tabbed dialog: "Common" tab, "MolSurf" tab, "Atom radii" tab (all content from overlays)
- Buttons: Reset all to default, Apply, OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Reset all button | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Apply button | `gMain.apply()` | Applies without closing |
| `ondialogaccept` | `gMain.onDialogAccept(event)` | Saves and closes |

#### i18n keys used
- none

#### Notes
- All tab content is contributed entirely by overlays; the XUL itself is a thin shell.
- DSurf is the dynamic surface renderer; tab layout matches `molsurf-propdlg` closely.

---

### `dialog.exportlxs-opt`

- **File**: `uxp_gui/cuemol2/base/content/exportlxs-opt-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "LuxRender options" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/exportlxs-opt-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `exportlxs-opt-dlg.js`
- **Overlays applied**: none

#### User-visible features
- Image size groupbox: Width textbox (px), Height textbox (px), "Retain aspect ratio" checkbox
- Background menulist: transparent / wall / box
- HaltSPP (samples-per-pixel halt threshold) number textbox
- OK / Cancel buttons

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `onload` | `window.gDlg.onLoad()` | Initializes form values from caller data |
| `ondialogaccept` | `window.gDlg.onAccept()` | Writes back options to caller data object |
| Width textbox change | `gDlg.validateSizeText(event)` | Enforces aspect-ratio constraint |
| Aspect ratio checkbox | `gDlg.validateReasp()` | Locks/unlocks height input |

#### i18n keys used
- none

#### Notes
- LuxRender export path; the LuxRender renderer itself is an optional/legacy component.

---

### `dialog.exportpng-opt`

- **File**: `uxp_gui/cuemol2/base/content/exportpng-opt-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "PNG options" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/exportpng-opt-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `exportpng-opt-dlg.js`
- **Overlays applied**: none

#### User-visible features
- Image size groupbox: Resolution menulist (72/150/300/600 DPI), Width textbox with unit selector (mm/cm/inch/pixel), Height label (auto-computed)
- "Retain aspect ratio" checkbox
- "Transparent PNG" checkbox
- OK / Cancel buttons

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `onload` | `window.gDlg.onLoad()` | Initializes form |
| `ondialogaccept` | `window.gDlg.onAccept()` | Saves PNG export options |
| Resolution menulist | `gDlg.validateUnitRes()` | Recalculates physical dimensions on DPI change |
| Unit menulist | `gDlg.validateUnitRes()` | Recalculates on unit change |
| Width change | `gDlg.validateSizeText(event)` | Syncs height if aspect ratio locked |
| Aspect ratio checkbox | `gDlg.validateReasp()` | Locks/unlocks height |

#### i18n keys used
- none

---

### `dialog.exportqsl-opt`

- **File**: `uxp_gui/cuemol2/base/content/exportqsl-opt-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "QSL options" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/exportqsl-opt-dlg.xul`
- **Associated JS**: `cuemol2-utils.js` + inline script (no external `exportqsl-opt-dlg.js`)
- **Overlays applied**: none

#### User-visible features
- "Change detail:" checkbox + numeric slider (1–5)
- "Use compression" checkbox
- "Open the resulting qsl file" checkbox
- OK / Cancel buttons

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `onload` | `window.gDlg.onLoad()` | Binds DOM element references |
| `ondialogaccept` | `window.gDlg.onAccept()` | Writes detail, compress, and open flags to caller data |
| Detail checkbox | `gDlg.onChgDetail()` | Enables/disables the detail slider |

#### i18n keys used
- none

#### Notes
- All dialog logic is inline in the XUL `<script>` block rather than an external file.
- QSL is the CueMol scene-light export format.

---

### `dialog.fopen-option`

- **File**: `uxp_gui/cuemol2/base/content/fopen-option-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "File open options" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/fopen-option-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `fopen-option-dlg.js`
- **Overlays applied**: `fopen-renderopt-page.xul`, `fopen-pdbopt-page.xul`, `fopen-msmsopt-page.xul`, `fopen-mtzopt-page.xul`, `fopen-namdcooropt-page.xul`, `fopen-ccp4map-page.xul`, `fopen-mmcifopt-page.xul`

#### User-visible features
- Tabbed container — each tab is contributed by a format-specific overlay
- Accept / Cancel buttons

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `ondialogaccept` | `window.gDlgObj.onDialogAccept(event)` | Collects all tab values and returns them to the caller |

#### i18n keys used
- none

#### Notes
- Shell container only; all UI is contributed by the 7 `fopen-*-page.xul` overlays.
- Script `src` uses a relative path (`cuemol2-utils.js`) rather than a `chrome://` URL — unusual in this codebase.
- Classified as `dialog.` (not `overlay.`) because the root element is `<dialog>`, consistent with scan-report note.

---

### `dialog.generic`

- **File**: `uxp_gui/cuemol2/base/content/generic-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Object properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/generic-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `propeditor-generic-page.js`
- **Overlays applied**: `propeditor-generic-page.xul`

#### User-visible features
- Tabbed container (tabs/panels injected by property-page overlays at runtime)
- OK button

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `ondialogaccept` | `window.gObjPropDlg.onDialogAccept(event)` | Saves object properties via `cuemolui.GenPropEdit` |

#### i18n keys used
- none

#### Notes
- Instantiates `cuemolui.GenPropEdit()` from `propeditor-generic-page.js` to drive the tab content.
- Used as a generic host when no renderer-specific property dialog exists.

---

### `dialog.new-tabwnd`

- **File**: `uxp_gui/cuemol2/base/content/new-tabwnd-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "New Tab/Window" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/new-tabwnd-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `new-tabwnd-dlg.js`
- **Overlays applied**: none

#### User-visible features
- Label "Create new tab for:"
- Radio group: "New Scene" (with Scene Name textbox) / "New View for" (with View Name textbox)
- "Inherit view props" checkbox
- OK / Cancel buttons

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `ondialogaccept` | `window.gDialog.onOK(event)` | Creates the new scene or view tab |
| Radio group change | `window.gDialog.onRadioCmd(event)` | Enables/disables the Name textbox matching the selected radio |

#### i18n keys used
- `mainView.properties` loaded via `<stringbundle id="strings">` (keys used in JS, not directly in XUL)

#### Notes
- The stringbundle loads `chrome://cuemol2/locale/mainView.properties`; specific keys are referenced only in `new-tabwnd-dlg.js`.

---

### `dialog.paint`

- **File**: `uxp_gui/cuemol2/base/content/paint-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Paint property" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/paint-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `colpicker.js`, `molsellist.js`, `paint-propdlg.js`
- **Overlays applied**: none

#### User-visible features
- Selection input (`<molsellist>` custom widget) with error message label
- Color picker (`<mycolpicker>`)
- OK / Cancel buttons

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `ondialogaccept` | `window.gDlgObj.onDialogAccept(event)` | Applies the paint color to the selection |

#### i18n keys used
- none

#### Notes
- Uses two XBL custom widgets: `molsellist` (from `molsellist-bindings.xml`) and `mycolpicker` (from `colpicker-bindings.xml`).

---

### `dialog.qscwriter-option`

- **File**: `uxp_gui/cuemol2/base/content/qscwriter-option-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Scene options" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/qscwriter-option-dlg.xul`
- **Associated JS**: `qscwriter-option-dlg.js`
- **Overlays applied**: none

#### User-visible features
- "Embed possible" checkbox
- Compatibility menulist: Ver 2.2 or later (QDF0) / Ver 2.3 or later (QDF1)
- Compression menulist: xz / gzip / none
- "Enable text encoding" checkbox (base64)
- OK / Cancel buttons

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `onload` | `onLoad(event)` | Initializes controls from current scene settings |
| `ondialogaccept` | `onDialogAccept(event)` | Saves QSC writer options |
| Compatibility menulist | `onSelect(event)` | Updates dependent options for the chosen format version |

#### i18n keys used
- none

#### Notes
- Script `src` uses a relative path (`qscwriter-option-dlg.js`) without `chrome://` — unusual.
- QSC (QDF) is the native CueMol scene file format.

---

### `dialog.setup-renderer`

- **File**: `uxp_gui/cuemol2/base/content/setupRenderer.xul`
- **Root element**: `<dialog>`
- **Title**: "Setup renderer" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/setupRenderer.xul`
- **Associated JS**: `cuemol2-utils.js`
- **Overlays applied**: `fopen-renderopt-page.xul`

#### User-visible features
- Renderer options panel (injected by `fopen-renderopt-page` overlay into `<vbox id="tabpanels-overlay-target">`)
- OK / Cancel buttons

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `ondialogaccept` | `window.gRenderOptPage.onDialogAccept(event)` | Saves renderer setup options; handler defined in the overlay |

#### i18n keys used
- none

#### Notes
- The XUL itself is nearly empty; the entire UI content and the accept handler come from the `fopen-renderopt-page.xul` overlay.

---

### `dialog.anim-render`

- **File**: `uxp_gui/cuemol2/base/content/anim/anim-render-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Animation rendering" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/anim/anim-render-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `anim/anim-render-dlg.js`
- **Overlays applied**: none

#### User-visible features
- Tabbed dialog with 4 tabs:
  - **Main options**: output directory, base name, image size (with preset menu), projection, NCPU, loop checkbox, frame rate, progress bar, log textbox
  - **Render options**: Povray exe/inc paths, checkboxes for clipping/shadow/edge lines/labels, radiosity mode menulist
  - **Movie options**: FFmpeg exe, output format (QuickTime H.264/H.265, MP4, WMV, GIF), bitrate, re-encode button
  - **Preview**: frame slider, image/movie preview area
- Buttons: Stop (extra1), Start (accept), Close (cancel)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Start button (`ondialogaccept`) | `window.gDlgObj.onStart()` | Begins animation rendering; returns false to keep dialog open |
| Stop button (`ondialogextra1`) | `window.gDlgObj.onStop()` | Stops an in-progress render |
| Output dir button | `window.gDlgObj.onOutputPath()` | Opens directory chooser |
| Preset size menu | `window.gDlgObj.onPresetSel(event)` | Fills width/height from preset |
| Povray exe button | `window.gDlgObj.onPovExePath()` | Opens file chooser for Povray executable |
| Povray inc button | `window.gDlgObj.onPovIncPath()` | Opens directory chooser for Povray include path |
| FFmpeg exe button | `window.gDlgObj.onFFmpegExePath()` | Opens file chooser for FFmpeg executable |

#### i18n keys used
- none

#### Notes
- Uses the `animslider` XBL binding (`anim/anim-slider-bindings.xml#animslider`) for the preview frame slider; bound via inline CSS `-moz-binding`.
- `ondialogaccept` returns `false` to prevent the dialog from closing while rendering proceeds; the dialog closes only when the user clicks Close.

---

### `dialog.animobj`

- **File**: `uxp_gui/cuemol2/base/content/anim/animobj-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Animation object properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/anim/animobj-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `propeditor-generic-page.js`, `anim/animobj-common-proppage.js`, `object-menulist.js`
- **Overlays applied**: `anim/animobj-common-proppage.xul`, `propeditor-generic-page.xul`

#### User-visible features
- Tabbed dialog (tabs injected by overlays; "common-tab" registered by `AnimObjPropPage`)
- Buttons: Reset all to default, OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Reset all button | `gMain.resetAllToDefault()` | Resets animation object properties to defaults |
| `ondialogaccept` | `gMain.onDialogAccept(event)` | Saves and closes |

#### i18n keys used
- none

#### Notes
- Instantiates `cuemolui.GenPropEdit()` as `gMain` and registers an `AnimObjPropPage` page for the common tab.
- Tab content is entirely contributed by overlays.

---

### `dialog.apply-rend-style`

- **File**: `uxp_gui/cuemol2/base/content/style/apply_rend_style.xul`
- **Root element**: `<dialog>`
- **Title**: "Apply Renderer Style" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/style/apply_rend_style.xul`
- **Associated JS**: `cuemol2-utils.js`, `style/apply_rend_style.js`
- **Overlays applied**: none

#### User-visible features
- Renderer info label
- "Styles:" label with priority markers (low / high priority)
- Listbox of applied styles (ordered, lower index = lower priority)
- Toolbar buttons: Add (with popup menu), Delete, Move up, Move down
- OK / Cancel buttons

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `ondialogaccept` | `gMain.onDialogAccept(event)` | Applies the style list to the renderer |
| Listbox select | `gMain.onStySelChg(event)` | Updates button enabled states |
| Add button popup | `gMain.onAddBtnPopupShowing(event)` | Populates add-style popup with available styles |
| Add command | `gMain.onAddCmd(event)` | Adds selected style to the list |
| Delete button | `gMain.onDeleteCmd(event)` | Removes selected style |
| Move up button | `gMain.onMoveUpDownCmd(event)` | Moves selected style toward lower priority |
| Move down button | `gMain.onMoveUpDownCmd(event)` | Moves selected style toward higher priority |

#### i18n keys used
- none

---

### `dialog.rendstyle-create`

- **File**: `uxp_gui/cuemol2/base/content/style/rendstyle_create.xul`
- **Root element**: `<dialog>`
- **Title**: "Create Renderer Style" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/style/rendstyle_create.xul`
- **Associated JS**: `cuemol2-utils.js`, `style/rendstyle_create.js`
- **Overlays applied**: none

#### User-visible features
- "Original rend:" info label
- "Target Style set:" listbox (list of existing style sets)
- "Style name:" textbox with auto-appended postfix label
- OK / Cancel buttons

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `ondialogaccept` | `gMain.onDialogAccept(event)` | Creates a new renderer style in the chosen style set |

#### i18n keys used
- none

---

### `dialog.style-editor`

- **File**: `uxp_gui/cuemol2/base/content/style/style_editor.xul`
- **Root element**: `<dialog>`
- **Title**: "Style editor" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/style/style_editor.xul`
- **Associated JS**: `cuemol2-utils.js`, `treeview.js`, `colpicker.js`, `style/style_editor.js`
- **Overlays applied**: none

#### User-visible features
- Style name groupbox (caption), source textbox (read-only), type label
- Tabbed editor with 3 tabs:
  - **Color**: tree of named colors, Add/Delete toolbar buttons, Name textbox + color picker for editing
  - **Selection**: tree of named MolSel definitions, Add/Delete buttons, Name/Value textboxes
  - **Styles**: listbox of style entries, Delete button
- OK / Cancel buttons

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `ondialogaccept` | `gMain.onDialogAccept(event)` | Saves all style edits |
| Add color | `gMain.onAddColor(event)` | Inserts a new color entry |
| Delete color | `gMain.onDelColor(event)` | Removes selected color entry |
| Color name/value change | `gMain.onColChg(event)` | Updates the selected color definition |
| Add molsel | `gMain.onAddMolSel(event)` | Inserts a new selection definition |
| Delete molsel | `gMain.onDelMolSel(event)` | Removes selected selection |
| Sel name/value change | `gMain.onSelChg(event)` | Updates the selected MolSel definition |
| Delete style | `gMain.onDelStyle(event)` | Removes selected style from the list |

#### i18n keys used
- none

#### Notes
- Uses `treeview.js` for the custom tree view implementation backing the color and selection trees.
- Uses `mycolpicker` XBL widget (from `colpicker-bindings.xml`) for inline color editing.

---

## Unresolved

このカテゴリで解決できなかった項目:
- なし

## Statistics

- Total entries: 18
- With JS handler: 17 (all except `dialog.delete-object` which uses caller-supplied `window.arguments` callbacks with no embedded JS)
- With i18n keys: 2 (`dialog.about` uses DTD entities; `dialog.new-tabwnd` loads a `.properties` stringbundle)
- Unresolved: 0
