# UXP Inventory — Overlay

> ⚠️ このファイルは Claude Code による自動生成です。手修正しないでください。
> 再生成する場合は `_spec.md` に従ってください。

- Generated: 2026-04-20
- Source: `uxp_gui/cuemol2/`
- Spec: [_spec.md](./_spec.md)
- Entries: 28

## Index

- [`overlay.coloring-deck-bfac`](#overlaycoloring-deck-bfac)
- [`overlay.coloring-deck-cpk`](#overlaycoloring-deck-cpk)
- [`overlay.coloring-deck-elepot`](#overlaycoloring-deck-elepot)
- [`overlay.coloring-deck-paint`](#overlaycoloring-deck-paint)
- [`overlay.coloring-deck-rainbow`](#overlaycoloring-deck-rainbow)
- [`overlay.coloring-deck-script`](#overlaycoloring-deck-script)
- [`overlay.config-keybind`](#overlayconfig-keybind)
- [`overlay.config-misc`](#overlayconfig-misc)
- [`overlay.config-mouse`](#overlayconfig-mouse)
- [`overlay.fopen-ccp4map`](#overlayfopen-ccp4map)
- [`overlay.fopen-mmcifopt`](#overlayfopen-mmcifopt)
- [`overlay.fopen-msmsopt`](#overlayfopen-msmsopt)
- [`overlay.fopen-mtzopt`](#overlayfopen-mtzopt)
- [`overlay.fopen-namdcooropt`](#overlayfopen-namdcooropt)
- [`overlay.fopen-pdbopt`](#overlayfopen-pdbopt)
- [`overlay.fopen-renderopt`](#overlayfopen-renderopt)
- [`overlay.propeditor-generic`](#overlaypropeditor-generic)
- [`overlay.propeditor-radii-common`](#overlaypropeditor-radii-common)
- [`overlay.property.cartoon-coil`](#overlaypropertycartoon-coil)
- [`overlay.property.cartoon-helix`](#overlaypropertycartoon-helix)
- [`overlay.property.cartoon-sheet`](#overlaypropertycartoon-sheet)
- [`overlay.property.molsurf`](#overlaypropertymolsurf)
- [`overlay.property.renderer-common`](#overlaypropertyrenderer-common)
- [`overlay.property.ribbon-coil`](#overlaypropertyribbon-coil)
- [`overlay.property.ribbon-helix`](#overlaypropertyribbon-helix)
- [`overlay.property.ribbon-sheet`](#overlaypropertyribbon-sheet)
- [`overlay.property.tube`](#overlaypropertytube)
- [`overlay.anim.animobj-common-proppage`](#overlayanimanimobj-common-proppage)

---

## Entries

### `overlay.coloring-deck-bfac`

- **File**: `uxp_gui/cuemol2/base/content/coloring-deck-bfac.xul`
- **Root element**: `<overlay>`
- **Title**: "Bfac coloring" (hardcoded, description label)
- **Chrome URL**: `chrome://cuemol2/content/coloring-deck-bfac.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Mode dropdown: B-factor / Occupancy / Distance from center
- Low and High color pickers (`mycolpicker`)
- Parameter groupbox: auto/manual mode dropdown (Manual / Auto by mol / Auto by rend), Low and High numeric fields

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `command` on mode/auto dropdowns | `cuemolui.panels.paint.onBfacChange(event)` | Updates coloring on mode change |
| `change` on color pickers / numeric fields | `cuemolui.panels.paint.onBfacChange(event)` | Updates coloring on parameter value change |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Injected into the coloring panel deck via overlaytarget `colpanel-deck`. Deck card for BfacColoring (index 5).

---

### `overlay.coloring-deck-cpk`

- **File**: `uxp_gui/cuemol2/base/content/coloring-deck-cpk.xul`
- **Root element**: `<overlay>`
- **Title**: "CPK coloring" (hardcoded, description label)
- **Chrome URL**: `chrome://cuemol2/content/coloring-deck-cpk.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Grid of element-to-color mappings: Carbon, Nitrogen, Oxygen, Sulfur, Phosphorus, Hydrogen, Others — each with a `mycolpicker`

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `change` on any color picker | `cuemolui.panels.paint.onCPKColChanged(event)` | Applies new CPK element color |

#### i18n keys used
- `&elem.carbon;` (dtd: `cuemol2.dtd`)
- `&elem.nitrogen;` (dtd: `cuemol2.dtd`)
- `&elem.oxygen;` (dtd: `cuemol2.dtd`)
- `&elem.sulfur;` (dtd: `cuemol2.dtd`)
- `&elem.phosphorus;` (dtd: `cuemol2.dtd`)
- `&elem.hydrogen;` (dtd: `cuemol2.dtd`)
- `&elem.others;` (dtd: `cuemol2.dtd`)

#### Notes
- Deck card index 3 in `colpanel-deck`.

---

### `overlay.coloring-deck-elepot`

- **File**: `uxp_gui/cuemol2/base/content/coloring-deck-elepot.xul`
- **Root element**: `<overlay>`
- **Title**: "Elepot coloring" (hardcoded, description label)
- **Chrome URL**: `chrome://cuemol2/content/coloring-deck-elepot.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Object selector dropdown (`paint-elepot-obj-selector`)
- Checkbox: "Color by SAS"
- Three rows of value + color picker: High, Mid, Low

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `command` on SAS checkbox | `cuemolui.panels.paint.onElepotChange(event)` | Toggles SAS coloring mode |
| `change` on value textboxes / color pickers | `cuemolui.panels.paint.onElepotChange(event)` | Updates potential thresholds and colors |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Deck card for electrostatic potential coloring (MolSurf elepot mode, index 6) in `colpanel-deck`.

---

### `overlay.coloring-deck-paint`

- **File**: `uxp_gui/cuemol2/base/content/coloring-deck-paint.xul`
- **Root element**: `<overlay>`
- **Title**: "Paint coloring" (hardcoded, description label)
- **Chrome URL**: `chrome://cuemol2/content/coloring-deck-paint.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Tree view with Selection / Color columns
- Toolbar buttons: Add, Delete, Delete all, Change, Move up, Move down
- Context menu (`paintPanelCtxtMenu`): Change, Delete, Add, Cut, Copy, Paste

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Add button `command` | `cuemolui.panels.paint.onAddCmd(event)` | Opens add-color dialog |
| Delete button `command` | `cuemolui.panels.paint.onDeleteCmd(event)` | Deletes selected entry |
| Delete all button `command` | `cuemolui.panels.paint.onDeleteCmd(event)` | Deletes all entries |
| Change button `command` | `cuemolui.panels.paint.onPropCmd(event)` | Opens color-edit dialog |
| Move up button `command` | `cuemolui.panels.paint.onMoveUpCmd(event)` | Moves selection up |
| Move down button `command` | `cuemolui.panels.paint.onMoveDownCmd(event)` | Moves selection down |
| Context menu `popupshowing` | `cuemolui.panels.paint.onCtxtMenuShowing(event)` | Updates context menu state |
| Cut `command` | `cuemolui.panels.paint.onCut(event)` | Cuts selected entry |
| Copy `command` | `cuemolui.panels.paint.onCopy(event)` | Copies selected entry |
| Paste `command` | `cuemolui.panels.paint.onPaste(event)` | Pastes entry |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Also injects a `<popupset>` into `menus-overlay-target` for the context menu.
- Deck card index 2 in `colpanel-deck`.

---

### `overlay.coloring-deck-rainbow`

- **File**: `uxp_gui/cuemol2/base/content/coloring-deck-rainbow.xul`
- **Root element**: `<overlay>`
- **Title**: "Rainbow coloring" (hardcoded, description label)
- **Chrome URL**: `chrome://cuemol2/content/coloring-deck-rainbow.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Mode dropdown: Molecule / Chain
- Change by dropdown: Chain / Residue / Prot secstr
- Start H (hue) slider (0–360°)
- End H (hue) slider (0–360°)
- Brightness slider (0–100%)
- Saturation slider (0–100%)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `command`/`change` on any control | `cuemolui.panels.paint.onRainbowChange(event)` | Applies rainbow coloring parameters |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Deck card index 4 in `colpanel-deck`.

---

### `overlay.coloring-deck-script`

- **File**: `uxp_gui/cuemol2/base/content/coloring-deck-script.xul`
- **Root element**: `<overlay>`
- **Title**: "Script coloring" (hardcoded, description label)
- **Chrome URL**: `chrome://cuemol2/content/coloring-deck-script.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- "Script coloring" description label
- "Update" button
- Multiline textbox (empty text `(noscript)`)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Update button `command` | `cuemolui.panels.paint.onLoadColoringScript(event)` | Applies script-based coloring |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- The `<overlay>` element has id `coloring-deck-paint-overlay` (copy-paste bug from `coloring-deck-paint.xul`); actual content vbox id is `coloring-deck-script`.

---

### `overlay.config-keybind`

- **File**: `uxp_gui/cuemol2/base/content/config-keybind.xul`
- **Root element**: `<overlay>`
- **Title**: unknown (prefpane `pane-keybinding` has no `label` attribute)
- **Chrome URL**: `chrome://cuemol2/content/config-keybind.xul`
- **Associated JS**: `treeview.js`, `config-keybind.js`
- **Overlays applied**: none

#### User-visible features
- "Key config:" label
- Tree with columns: Name, Key, Ctrl (checkbox), Alt (checkbox), Shift (checkbox)
- Edit form: Name readonly textbox, Key dropdown (Right/Left/Up/Down), Ctrl/Alt/Shift checkboxes

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `paneload` event | `gKeybindPane.init()` | Loads key bindings into tree |
| `command` on Key dropdown | `window.gKeybindPane.validateWidget(event)` | Validates selected key |
| `command` on modifier checkboxes | `window.gKeybindPane.validateWidget(event)` | Validates modifier combination |

#### i18n keys used
- (none — DTD `config-dialog.dtd` is imported via `%configDTD;` but no `&entity;` references appear in this file)

#### Notes
- Contains inline CSS for tree checkbox appearance (`moz-tree-checkbox`).

---

### `overlay.config-misc`

- **File**: `uxp_gui/cuemol2/base/content/config-misc.xul`
- **Root element**: `<overlay>`
- **Title**: unknown (prefpane `pane-misc` has no `label` attribute)
- **Chrome URL**: `chrome://cuemol2/content/config-misc.xul`
- **Associated JS**: `colpicker.js`, `fontbuilder.js` (from mozapps), `config-dialog.js`
- **Overlays applied**: none

#### User-visible features
- Atom label font group: font-name dropdown, font-size dropdown, color picker, italic/bold checkboxes, sample text display
- Misc settings group: HiDPI/Retina display checkbox (macOS only), UI language dropdown (en-US / ja)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `paneload` event | `gDialog.init()` | Initializes pane controls from preferences |

#### i18n keys used
- `&config_dlg.atomLabelGroup;` (dtd: `config-dialog.dtd`)
- `&config_dlg.atomLabel.font;` (dtd: `config-dialog.dtd`)
- `&config_dlg.atomLabel.size;` (dtd: `config-dialog.dtd`)
- `&config_dlg.atomLabel.color;` (dtd: `config-dialog.dtd`)
- `&config_dlg.atomLabel.italic;` (dtd: `config-dialog.dtd`)
- `&config_dlg.atomLabel.bold;` (dtd: `config-dialog.dtd`)
- `&config_dlg.atomLabel.sample;` (dtd: `config-dialog.dtd`)
- `&config_dlg.langGroup;` (dtd: `config-dialog.dtd`)
- `&config_dlg.lang.en-US;` (dtd: `config-dialog.dtd`)
- `&config_dlg.lang.ja;` (dtd: `config-dialog.dtd`)

#### Notes
- HiDPI checkbox is conditioned on `#ifdef XP_MACOSX` — macOS build only.
- Preference bound: `cuemol2.ui.view.use_hidpi`.

---

### `overlay.config-mouse`

- **File**: `uxp_gui/cuemol2/base/content/config-mouse.xul`
- **Root element**: `<overlay>`
- **Title**: unknown (prefpane `pane-mouseconf` has no `label` attribute)
- **Chrome URL**: `chrome://cuemol2/content/config-mouse.xul`
- **Associated JS**: `config-mouse.js`
- **Overlays applied**: none

#### User-visible features
- "View operation preset" dropdown for mouse binding style
- Numeric input: XY-rot sensitivity (0.1–10.0)
- Numeric input: Pick precision (0.0–100.0)
- Checkbox: Momentum scroll
- (macOS only) Checkbox: Enable multi-touch trackpad
- (macOS only) Checkbox: Emulate mouse R button

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `paneload` event | `gMouseConfPane.init()` | Initializes pane from saved preferences |
| `command` on preset dropdown | `window.gKeybindPane.validateWidget(event)` | Validates binding style selection |

#### i18n keys used
- (none — DTD `config-dialog.dtd` is imported via `%configDTD;` but no `&entity;` references appear in this file)

#### Notes
- macOS-only checkboxes conditioned on `#ifdef XP_MACOSX`.
- Preferences bound: `cuemol2.ui.mouse-multitouch-pad`, `cuemol2.ui.mouse-emulate-rbutton`, `cuemol2.ui.mouse-momentum-scroll`.

---

### `overlay.fopen-ccp4map`

- **File**: `uxp_gui/cuemol2/base/content/fopen-ccp4map-page.xul`
- **Root element**: `<overlay>`
- **Title**: "CCP4Map options" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/fopen-ccp4map-page.xul`
- **Associated JS**: none (inline script only)
- **Overlays applied**: none

#### User-visible features
- Tab labeled "CCP4Map options"
- Checkbox: Normalize by mean and stdev
- Checkbox + numeric field: Truncate density lower than (σ)
- Checkbox + numeric field: Truncate density higher than (σ)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `load` event | `onInit()` | Reads reader properties and reflects to controls |
| Dialog OK | `dlgdata.ondlgok` callback | Writes control state back to reader properties |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Tab is initially hidden; shown when `gDlgObj.selectShowTab(...)` matches reader name `"ccp4map"`.
- Injected into `fopen-option-dlg.xul` via overlaytargets `tabs-overlay-target` / `tabpanels-overlay-target`.

---

### `overlay.fopen-mmcifopt`

- **File**: `uxp_gui/cuemol2/base/content/fopen-mmcifopt-page.xul`
- **Root element**: `<overlay>`
- **Title**: "mmCIF options" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/fopen-mmcifopt-page.xul`
- **Associated JS**: none (inline script only)
- **Overlays applied**: none

#### User-visible features
- Tab labeled "mmCIF options"
- Checkbox: Ignore multiple models
- Checkbox: Ignore anisotropic U
- Checkbox: Ignore alternate conformation
- Checkbox: Calculate protein secondary structure
- Checkbox: Auto-generate non-standard topology

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `load` event | `onInit()` | Reads reader properties and reflects to checkboxes |
| Dialog OK | `dlgdata.ondlgok` callback | Writes checkbox state back to reader properties |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Tab shown when reader name matches `"mmcif"`.
- `calc_2ndry` checkbox maps to `rdr.loadsecstr` with inverted logic (unlike the PDB overlay).

---

### `overlay.fopen-msmsopt`

- **File**: `uxp_gui/cuemol2/base/content/fopen-msmsopt-page.xul`
- **Root element**: `<overlay>`
- **Title**: "MSMS surface file options" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/fopen-msmsopt-page.xul`
- **Associated JS**: none (inline script only)
- **Overlays applied**: none

#### User-visible features
- Tab labeled "MSMS surface file options"
- Vertex file path textbox
- "Change ..." button to open file picker

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `load` event | `onInit()` | Derives default .vert path from .face file path |
| Change button `command` | `selectVertexFile()` | Opens `nsIFilePicker` for .vert file selection |
| Dialog OK | `dlgdata.ondlgok` callback | Writes vertex file path to `rdr.vertex_file` |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Default .vert path is derived from the .face file path (same basename, different extension).
- Tab shown when reader name matches `"msms"`.

---

### `overlay.fopen-mtzopt`

- **File**: `uxp_gui/cuemol2/base/content/fopen-mtzopt-page.xul`
- **Root element**: `<overlay>`
- **Title**: "MTZ options" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/fopen-mtzopt-page.xul`
- **Associated JS**: `fopen-mtzopt-page.js`
- **Overlays applied**: none

#### User-visible features
- Tab labeled "MTZ options"
- Amplitude (F) dropdown (populated from MTZ columns)
- Phase checkbox + dropdown
- Weight checkbox + dropdown
- Max resolution numeric field (Å)
- Grid spacing dropdown: Fine (0.25) / Coarse (0.33)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `command` on Phase/Weight checkboxes | `gMtzDlg.updateDisabledState()` | Enables/disables corresponding dropdowns |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Script is injected via `scripts-overlay-target` using a relative path `fopen-mtzopt-page.js`.
- Column list dropdowns are populated dynamically from the MTZ file header in JS.

---

### `overlay.fopen-namdcooropt`

- **File**: `uxp_gui/cuemol2/base/content/fopen-namdcooropt-page.xul`
- **Root element**: `<overlay>`
- **Title**: "NAMD Coor file options" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/fopen-namdcooropt-page.xul`
- **Associated JS**: none (inline script only)
- **Overlays applied**: none

#### User-visible features
- Tab labeled "NAMD Coor file options"
- PSF file path textbox
- "Change ..." button to open file picker

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `load` event | `onInit()` | Derives default PSF path from .coor path or preference history |
| Change button `command` | `selectPSFFile()` | Opens `nsIFilePicker` for .psf file |
| Dialog OK | `dlgdata.ondlgok` callback | Writes PSF path via `rdr.setSubPath("topo", ...)` and saves to preference |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- PSF path history persisted in preference `cuemol2.ui.histories.namdcoor.psfpath`.
- Tab shown when reader name matches `"namdcoor"`.

---

### `overlay.fopen-pdbopt`

- **File**: `uxp_gui/cuemol2/base/content/fopen-pdbopt-page.xul`
- **Root element**: `<overlay>`
- **Title**: "PDB options" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/fopen-pdbopt-page.xul`
- **Associated JS**: none (inline script only)
- **Overlays applied**: none

#### User-visible features
- Tab labeled "PDB options"
- Checkboxes: Ignore multiple models, Ignore anisotropic U, Ignore alternate conformation, Load SEGID as chain name, Calculate protein secondary structure, Auto-generate non-standard topology

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `load` event | `onInit()` | Reads reader properties and reflects to checkboxes |
| Dialog OK | `dlgdata.ondlgok` callback | Writes checkbox state back to reader properties |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Tab is initially hidden; shown via `gDlgObj.selectShowTab()` when reader is `"pdb"`.
- Injected into `fopen-option-dlg.xul` via overlaytargets `tabs-overlay-target` / `tabpanels-overlay-target`.

---

### `overlay.fopen-renderopt`

- **File**: `uxp_gui/cuemol2/base/content/fopen-renderopt-page.xul`
- **Root element**: `<overlay>`
- **Title**: "Renderer" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/fopen-renderopt-page.xul`
- **Associated JS**: `molsellist.js`, `fopen-renderopt-page.js`
- **Overlays applied**: none

#### User-visible features
- Tab labeled "Renderer"
- Object name textbox
- Renderer type dropdown (populated dynamically)
- Renderer name textbox
- Selection checkbox + `molsellist` widget
- Deck: normal mode shows "Recenter view" checkbox; scalar-object mode shows "Set map center" / "Move view center" radio group

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (in JS file) | unknown | Controls populated and handled by `fopen-renderopt-page.js` |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Scripts injected via `scripts-overlay-target`.
- The deck `recenter-options` switches between selectedIndex 0 (normal) and 1 (scalar-obj).

---

### `overlay.propeditor-generic`

- **File**: `uxp_gui/cuemol2/base/content/propeditor-generic-page.xul`
- **Root element**: `<overlay>`
- **Title**: "Generic" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/propeditor-generic-page.xul`
- **Associated JS**: `colpicker.js`, `propeditor-generic-page.js`
- **Overlays applied**: none

#### User-visible features
- Tab labeled "Generic"
- Property tree with columns: Name, R (read-only flag), Type, Value
- Detail form: Name (readonly), Type (readonly), Value editor deck with 6 panels (text / bool checkbox / color picker / enum dropdown / unsupported label / vector XYZ / timeedit), Default checkbox

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (in JS file) | unknown | Property tree population and value editing handled by `propeditor-generic-page.js` |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- The value deck (`value-deck`) selects the active panel by index based on the property type.

---

### `overlay.propeditor-radii-common`

- **File**: `uxp_gui/cuemol2/base/content/propeditor-radii-common.xul`
- **Root element**: `<overlay>`
- **Title**: unknown (no tab label; injected directly via overlaytarget `propeditor-radii-common`)
- **Chrome URL**: `chrome://cuemol2/content/propeditor-radii-common.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- "Atom radii" groupbox: numsliders for C, N, O, S, P, H, Others (range 0–3 Å each)
- "Detail:" numslider (2–20)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (none in XUL) | — | Read/write handled by parent dialog JS |

#### i18n keys used
- `&elem.carbon;` (dtd: `cuemol2.dtd`)
- `&elem.nitrogen;` (dtd: `cuemol2.dtd`)
- `&elem.oxygen;` (dtd: `cuemol2.dtd`)
- `&elem.sulfur;` (dtd: `cuemol2.dtd`)
- `&elem.phosphorus;` (dtd: `cuemol2.dtd`)
- `&elem.hydrogen;` (dtd: `cuemol2.dtd`)
- `&elem.others;` (dtd: `cuemol2.dtd`)

#### Notes
- Shared sub-component reused across renderer property dialogs that expose per-element radius controls (e.g., CPK, BallStick).

---

### `overlay.property.cartoon-coil`

- **File**: `uxp_gui/cuemol2/base/content/property/cartoon-coil-page.xul`
- **Root element**: `<overlay>`
- **Title**: "Coil" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/property/cartoon-coil-page.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Tab labeled "Coil"
- Spline groupbox: Smoothing slider
- Section groupbox: Type dropdown (Elliptical / Round square / Rectangle), Detail slider, Tuber slider, Sharpness slider, Width (Å) slider

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (none in XUL) | — | Changes picked up by parent dialog JS |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Sub-page overlay for `property/cartoon-propdlg.xul`.

---

### `overlay.property.cartoon-helix`

- **File**: `uxp_gui/cuemol2/base/content/property/cartoon-helix-page.xul`
- **Root element**: `<overlay>`
- **Title**: "Helix" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/property/cartoon-helix-page.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Tab labeled "Helix"
- Helix type dropdown: Cylinder / Ribbon
- Ribbon mode deck: Section (type/detail/width/tuber/sharpness), Head/Tail (type/power/arrow height/arrow width)
- Cylinder mode deck: Spline (smoothing/extend), Section (type/detail/tuber/sharpness), Width (mode/add width/smooth)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (none in XUL) | — | Changes picked up by parent dialog JS |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Uses a `<deck>` to switch between Ribbon and Cylinder sub-forms.

---

### `overlay.property.cartoon-sheet`

- **File**: `uxp_gui/cuemol2/base/content/property/cartoon-sheet-page.xul`
- **Root element**: `<overlay>`
- **Title**: "Sheet" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/property/cartoon-sheet-page.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Tab labeled "Sheet"
- Spline groupbox: Smoothing slider
- Section groupbox: Type, Detail, Tuber, Sharpness, Width (Å), Width Smooth sliders
- Head shape groupbox: Type dropdown (Round/Flat/Arrow), Power, Arrow height, Arrow width sliders

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (none in XUL) | — | Changes picked up by parent dialog JS |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Sub-page overlay for `property/cartoon-propdlg.xul`.

---

### `overlay.property.molsurf`

- **File**: `uxp_gui/cuemol2/base/content/property/molsurf-page.xul`
- **Root element**: `<overlay>`
- **Title**: unknown (no tab; injected directly via overlaytarget `molsurf-page`)
- **Chrome URL**: `chrome://cuemol2/content/property/molsurf-page.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Draw groupbox: Drawing Mode (fill/line/point), Line/Point size, Surface type (vdW/SAS/SES), Detail slider
- Show selected groupbox: Selection mol dropdown, Selection `molsellist`
- Coloring mode dropdown: Solid color / By molecule / By potential

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `command` on Coloring mode dropdown | `gMolSurf.validateWidgets(event)` | Shows/hides potential-related controls |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Used by both molsurf and dsurf renderer property dialogs (per file comment).

---

### `overlay.property.renderer-common`

- **File**: `uxp_gui/cuemol2/base/content/property/renderer-common-page.xul`
- **Root element**: `<overlay>`
- **Title**: unknown (no tab; injected directly via overlaytarget `renderer-common-page`)
- **Chrome URL**: `chrome://cuemol2/content/property/renderer-common-page.xul`
- **Associated JS**: `molsellist.js`
- **Overlays applied**: none

#### User-visible features
- Basic settings groupbox: Name textbox, Selection `molsellist`, Visible/Locked checkboxes, Material dropdown, Opacity slider
- Edge lines groupbox: type dropdown (none/edges/silhouette), Width (Å) slider, Color picker

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (none in XUL) | — | Read/write handled by parent dialog JS |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Shared sub-page included in most renderer property dialogs to expose common Name/Selection/Visible/Material/Opacity/Edge controls.

---

### `overlay.property.ribbon-coil`

- **File**: `uxp_gui/cuemol2/base/content/property/ribbon-coil-page.xul`
- **Root element**: `<overlay>`
- **Title**: "Coil" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/property/ribbon-coil-page.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Tab labeled "Coil"
- Coil Section groupbox: Type dropdown (Elliptical / Round square / Rectangle), Width (Å), Tuber, Sharpness, Smoothness sliders

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (none in XUL) | — | Changes picked up by parent dialog JS |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Sub-page overlay for `property/ribbon-propdlg.xul`.

---

### `overlay.property.ribbon-helix`

- **File**: `uxp_gui/cuemol2/base/content/property/ribbon-helix-page.xul`
- **Root element**: `<overlay>`
- **Title**: "Helix" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/property/ribbon-helix-page.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Tab labeled "Helix"
- Helix Section groupbox: Type dropdown (Elliptical / Round square / Rectangle / Fancy), Width (Å), Tuber, Sharpness, Smoothness sliders, Back color checkbox + color picker
- Helix Head groupbox: Type (Round/Flat/Arrow), Power, Arrow height, Arrow width sliders
- Helix Tail groupbox: Type (Round/Flat/Arrow), Power, Arrow height, Arrow width sliders

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (none in XUL) | — | Changes picked up by parent dialog JS |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- The `<overlay>` element has id `propeditor-generic-page` (copy-paste bug); actual content is ribbon-helix sub-page.

---

### `overlay.property.ribbon-sheet`

- **File**: `uxp_gui/cuemol2/base/content/property/ribbon-sheet-page.xul`
- **Root element**: `<overlay>`
- **Title**: "Sheet" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/property/ribbon-sheet-page.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Tab labeled "Sheet"
- Sheet Section groupbox: Type (Elliptical / Round square / Rectangle / Fancy), Width (Å), Tuber, Sharpness, Smoothness sliders, Side color checkbox + color picker
- Sheet Head groupbox: Type (Round/Flat/Arrow), Power, Arrow height, Arrow width sliders
- Sheet Tail groupbox: Type (Round/Flat/Arrow), Power, Arrow height, Arrow width sliders

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (none in XUL) | — | Changes picked up by parent dialog JS |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Sub-page overlay for `property/ribbon-propdlg.xul`.

---

### `overlay.property.tube`

- **File**: `uxp_gui/cuemol2/base/content/property/tube-page.xul`
- **Root element**: `<overlay>`
- **Title**: unknown (no tab; injected via overlaytarget `propeditor-renderer-tube`)
- **Chrome URL**: `chrome://cuemol2/content/property/tube-page.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Section groupbox: Type (elliptical/round square/rectangle/fancy1), Detail, Width1 (Å), Width2 (Å), Sharpness sliders
- Putty groupbox: Mode (off/Linear/Scaling), Target (B-factor/Occupancy), Low/High scale sliders
- Axial detail slider, Smoothness slider
- Smooth color checkbox, Pivot atom name checkbox + textbox
- Cap type dropdown (flat/sphere/none), Segment-end fade out checkbox

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (none in XUL) | — | Changes picked up by parent dialog JS |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Sub-page overlay for `property/tube-propdlg.xul`.

---

### `overlay.anim.animobj-common-proppage`

- **File**: `uxp_gui/cuemol2/base/content/anim/animobj-common-proppage.xul`
- **Root element**: `<overlay>`
- **Title**: "Common" (hardcoded, tab label)
- **Chrome URL**: `chrome://cuemol2/content/anim/animobj-common-proppage.xul`
- **Associated JS**: none
- **Overlays applied**: none

#### User-visible features
- Tab labeled "Common"
- Common settings groupbox: Name textbox, Disabled checkbox, Start time (`timeedit`) + reference object dropdown, Duration (`timeedit`), Quadric slider (0–50%)
- Conditionally shown type-specific groupboxes (hidden by default, revealed by parent JS):
  - SimpleSpin: Rotation angle slider, Spin axis type dropdown + XYZ vector inputs
  - CamMotion: Target camera (`camerasel`), ignore rotation/center/zoom/slab checkboxes
  - Show/Hide: Target renderers (`multiselect`), Show/Hide dropdown, Fade checkbox, Target opacity slider
  - Slide in/out: Target renderers, Direction angle slider + direction preset dropdown, Distance slider, Show/Hide dropdown
  - MolAnim: Target MorphMol dropdown, Start/End value sliders

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (none in XUL) | — | Groupbox visibility and control read/write handled by parent dialog JS |

#### i18n keys used
- (none — all labels are hardcoded English strings)

#### Notes
- Hidden groupboxes are revealed based on animation object type by the parent dialog JS.
- Uses `multiselect` XBL binding from `anim/multiselect-binding.xml` (bound via inline CSS).
- Uses `camerasel` and `timeedit` custom widgets.

---

## Unresolved

このカテゴリで解決できなかった項目:
- (なし)

## Statistics

- Total entries: 28
- With JS handler: 7
- With i18n keys: 3
- Unresolved: 0
