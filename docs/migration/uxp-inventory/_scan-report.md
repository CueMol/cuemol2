<!-- AUTO-GENERATED — DO NOT EDIT MANUALLY. -->

# UXP GUI Scan Report

- **Scan date**: 2026-04-20
- **Target directory**: `uxp_gui/cuemol2/`

> **Snapshot semantics.** The counts and file lists below describe the UXP
> source *as of the scan date*; they are not re-derived when upstream changes.
> Known delta since then: `exportqsl-opt-dlg.xul` was deleted upstream
> (commit `ca8cec02`), so the working tree now holds 99 `.xul` files, not the
> 100 recorded here. Re-run the scan per `_spec.md` rather than hand-editing
> the numbers.

---

## Directory Structure (2–3 levels)

```
uxp_gui/cuemol2/
├── app/                         Application profile and build metadata
│   ├── macbuild/                macOS bundle skeleton
│   └── profile/                 Default profile and extensions
├── base/                        Primary UI package
│   ├── content/                 XUL/JS UI sources (100 .xul, 13 .xml bindings)
│   │   ├── anim/                Animation UI (dialogs, panel, ribbon overlay)
│   │   ├── bottom-panels/       Bottom panel holder overlay
│   │   ├── images/              UI icons and images
│   │   ├── property/            Renderer property dialogs and overlay pages
│   │   ├── style/               Style editor dialogs
│   │   ├── tools/               Tool dialogs (structure editing, surface, etc.)
│   │   └── topbar/              Ribbon/topbar overlay
│   ├── locale/
│   │   ├── en-US/               English DTD and .properties files
│   │   └── ja/                  Japanese DTD and .properties files
│   └── skin/                    CSS skin files
├── branding/                    App branding (icons, manifest)
│   └── unofficial/
├── components/
│   └── jsmods/                  JS SDK modules (api-utils-lib, cuemol2ui-lib, etc.)
├── config/                      Build configuration
├── installer/                   Windows NSIS installer scripts
└── locales/                     Installer locale strings
```

---

## File Counts by Extension

| Extension | Count | Role |
|-----------|------:|------|
| `.js` | 197 | JavaScript (controllers, utilities, modules) |
| `.xul` | 100 | XUL UI markup (dialogs, panels, overlays, windows) |
| `.xml` | 15 | XBL bindings (13) + misc XML (2) |
| `.properties` | 8 | Localization string tables |
| `.dtd` | 8 | Localization entity definitions |
| `.manifest` | 2 | Chrome package manifests |
| `.xhtml` | 0 | — |
| `.html` | 0 | — |

---

## Category Breakdown (XUL + XML UI files)

### Summary table

| Category | Count | Root / Pattern |
|----------|------:|----------------|
| Dialogs — property (`dialog.property.*`) | 13 | `<dialog>` under `property/` |
| Dialogs — tool (`dialog.tool.*`) | 21 | `<dialog>` under `tools/` |
| Dialogs — other (`dialog.*`) | 18 | `<dialog>` at root-level, `anim/`, `style/` |
| Overlays (property/config/fopen pages) | 28 | `<overlay>` + page/config pattern |
| Panels (side / bottom panels) | 9 | `<overlay>` + panel pattern |
| Menus | 4 | `<menupopup>` or menu `<overlay>` |
| Custom Widgets | 13 | `<bindings>` in `.xml` |
| Toolbars | 2 | `<overlay>` + ribbon / topbar |
| Other (windows, prefwindow, empty) | 5 | `<window>`, `<prefwindow>`, empty |
| **Total** | **113** | |

---

### Dialogs (property) — 13 files  (`dialog.property.*`)

Root element `<dialog>`. All located under `base/content/property/`.
These are renderer-specific property dialogs; each wraps multiple overlay sub-pages.

- `property/ballstick-propdlg.xul`
- `property/cartoon-propdlg.xul`
- `property/contour-propdlg.xul`
- `property/cpk-propdlg.xul`
- `property/disorder-propdlg.xul`
- `property/isosurf-propdlg.xul`
- `property/molsurf-propdlg.xul`
- `property/nucl-propdlg.xul`
- `property/object-propdlg.xul`
- `property/renderer-propdlg.xul`
- `property/ribbon-propdlg.xul`
- `property/simple-propdlg.xul`
- `property/tube-propdlg.xul`

---

### Dialogs (tool) — 21 files  (`dialog.tool.*`)

Root element `<dialog>`. All located under `base/content/tools/`.
These are operation/workflow dialogs invoked from the Tools menu.

- `tools/aintr-edit-dlg.xul`
- `tools/apbs-calcpot.xul`
- `tools/bond-edit-dlg.xul`
- `tools/chg_chname.xul`
- `tools/chg_resindex.xul`
- `tools/intr-tool-dlg.xul`
- `tools/makesurf.xul`
- `tools/mol_delete.xul`
- `tools/mol_merge.xul`
- `tools/molclient-tools-dlg.xul`
- `tools/morphanim-tool-dlg.xul`
- `tools/msms-makesurf.xul`
- `tools/multigrad_editor.xul`
- `tools/netpdb-progress-dlg.xul`
- `tools/openPDB.xul`
- `tools/prot2ndry-tool-dlg.xul`
- `tools/render-pov-dlg.xul`
- `tools/ssm_sup.xul`
- `tools/surf-cutbyplane.xul`
- `tools/symm-chg-dlg.xul`
- `tools/visflagset-edit-dlg.xul`

---

### Dialogs (other) — 18 files  (`dialog.*`)

Root element `<dialog>`. Located at root-level, `anim/`, and `style/`.

**Root-level (13):**
- `aboutDialog.xul`
- `atomintr-propdlg.xul`
- `deleteObject.xul`
- `dsurf-propdlg.xul`
- `exportlxs-opt-dlg.xul`
- `exportpng-opt-dlg.xul`
- `exportqsl-opt-dlg.xul`
- `fopen-option-dlg.xul`
- `generic-propdlg.xul`
- `new-tabwnd-dlg.xul`
- `paint-propdlg.xul`
- `qscwriter-option-dlg.xul`
- `setupRenderer.xul`

**anim/ (2):**
- `anim/anim-render-dlg.xul`
- `anim/animobj-propdlg.xul`

**style/ (3):**
- `style/apply_rend_style.xul`
- `style/rendstyle_create.xul`
- `style/style_editor.xul`

---

### Overlays — property/config/fopen pages: 28 files

Root element `<overlay>`. These are sub-page overlays embedded inside dialogs or the preferences window.

**Coloring deck pages (6):**
- `coloring-deck-bfac.xul`, `coloring-deck-cpk.xul`, `coloring-deck-elepot.xul`
- `coloring-deck-paint.xul`, `coloring-deck-rainbow.xul`, `coloring-deck-script.xul`

**Config overlays (3):**
- `config-keybind.xul`, `config-misc.xul`, `config-mouse.xul`

**File-open option pages (7):**
- `fopen-ccp4map-page.xul`, `fopen-mmcifopt-page.xul`, `fopen-msmsopt-page.xul`
- `fopen-mtzopt-page.xul`, `fopen-namdcooropt-page.xul`, `fopen-pdbopt-page.xul`
- `fopen-renderopt-page.xul`

**Property editor generic pages (2):**
- `propeditor-generic-page.xul`, `propeditor-radii-common.xul`

**Renderer property sub-pages (9):**
- `property/cartoon-coil-page.xul`, `cartoon-helix-page.xul`, `cartoon-sheet-page.xul`
- `property/molsurf-page.xul`, `renderer-common-page.xul`
- `property/ribbon-coil-page.xul`, `ribbon-helix-page.xul`, `ribbon-sheet-page.xul`
- `property/tube-page.xul`

**Animation property page (1):**
- `anim/animobj-common-proppage.xul`

---

### Panels — side/bottom panels: 9 files

Root element `<overlay>`. These panels are injected into the main window via `<?xul-overlay?>`.

- `anim/anim-panel.xul`
- `bottom-panels/btmpanel-holder.xul`
- `coloring-panel.xul`
- `densitymap-panel.xul`
- `fakedial-panel.xul`
- `molstruct-panel.xul`
- `selection-panel.xul`
- `symmetry-panel.xul`
- `workspace_panel.xul`

---

### Menus — 4 files

- `color-menu.xul` — standalone `<menupopup>` (color picker popup)
- `cuemol2-menus.xul` — `<overlay>` injecting main menubar
- `cuemol2-macos-menus.xul` — `<overlay>` macOS-specific menu additions
- `cuemol2-scripts.xul` — `<overlay>` adding script/macro menu commands

---

### Toolbars — 2 files

Root element `<overlay>`. Ribbon-style toolbars overlaid onto the main window.

- `topbar/cuemol2-ribbon.xul`
- `anim/anim-ribbon.xul`

---

### Custom Widgets (XBL) — 13 files

Root element `<bindings>` in `.xml` files.

**Core widgets (10):**
- `wheelbtn-bindings.xml` — wheel/dial button
- `numslider-binding.xml` — numeric slider
- `colorSlider.xml` — color slider
- `colpicker-bindings.xml` — color picker
- `mainViewBindings.xml` — main GL view widget
- `molsellist-bindings.xml` — molecule selection list
- `paintpanel-bindings.xml` — paint-mode panel widget
- `selection-widget-bindings.xml` — selection widget
- `sidepanelholder-bindings.xml` — side panel tab holder
- `camerasel-binding.xml` — camera selection widget

**Animation widgets (3):**
- `anim/anim-slider-bindings.xml`
- `anim/multiselect-binding.xml`
- `anim/timeedit-binding.xml`

---

### Other — 5 files

| File | Root element | Note |
|------|-------------|------|
| `cuemol2.xul` | `<window>` | Main application window (uses preprocessor `#ifdef`; root not matched by simple grep) |
| `hiddenWindow.xul` | `<window>` | Background hidden window |
| `tools/mybrowser.xul` | `<window>` | Embedded browser window |
| `config-dialog.xul` | `<prefwindow>` | Preferences window |
| `cuemol2-panels.xul` | *(empty)* | Empty placeholder file (0 bytes) |

---

## Ambiguous / Difficult-to-classify Files

| File | Issue |
|------|-------|
| `cuemol2.xul` | Root `<window>` element comes after many `<?xul-overlay?>` PIs and a `<!DOCTYPE>` block; simple root-element grep returns empty. Confirmed as `<window>` by reading the DOCTYPE declaration. |
| `cuemol2-panels.xul` | File is 0 bytes. Likely a removed or placeholder file. Assigned to `other.*`. |
| `cuemol2-scripts.xul` | Root is `<overlay>` but content is script/command definitions rather than visual markup. Classified as `menu.` because it adds menu commands. |
| `config-keybind.xul`, `config-misc.xul`, `config-mouse.xul` | Root is `<overlay>` but they are sub-pages of the `<prefwindow>`. Classified under `overlay.` (config pages) rather than `panel.`. |
| `fopen-option-dlg.xul` | Root is `<dialog>` and acts as a container for fopen overlay pages. Classified as `dialog.` even though it hosts overlays. |
| `propeditor-radii-common.xul` | Root is `<overlay>` but name suggests a shared sub-component. Classified as `overlay.` |
