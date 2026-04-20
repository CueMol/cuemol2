# UXP Inventory — Dialog_property

> ⚠️ このファイルは Claude Code による自動生成です。手修正しないでください。
> 再生成する場合は `_spec.md` に従ってください。

- Generated: 2026-04-20
- Source: `uxp_gui/cuemol2/`
- Spec: [_spec.md](./_spec.md)
- Entries: 13

## Index

- [`dialog.property.ballstick`](#dialogpropertyballstick)
- [`dialog.property.cartoon`](#dialogpropertycartoon)
- [`dialog.property.contour`](#dialogpropertycontour)
- [`dialog.property.cpk`](#dialogpropertycpk)
- [`dialog.property.disorder`](#dialogpropertydisorder)
- [`dialog.property.isosurf`](#dialogpropertyisosurf)
- [`dialog.property.molsurf`](#dialogpropertymolsurf)
- [`dialog.property.nucl`](#dialogpropertynucl)
- [`dialog.property.object`](#dialogpropertyobject)
- [`dialog.property.renderer`](#dialogpropertyrenderer)
- [`dialog.property.ribbon`](#dialogpropertyribbon)
- [`dialog.property.simple`](#dialogpropertysimple)
- [`dialog.property.tube`](#dialogpropertytube)

---

## Entries

### `dialog.property.ballstick`

- **File**: `uxp_gui/cuemol2/base/content/property/ballstick-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Ballstick renderer properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/property/ballstick-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `propeditor-generic-page.js`, `renderer-common-page.js`, `ballstick-propdlg.js`
- **Overlays applied**: `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/property/renderer-common-page.xul`

#### User-visible features
- Tab "Common": renderer-common-page overlay (coloring, selection, etc.)
- Tab "Ball & Stick": Detail numslider, Bond width numslider (Å), Atom radius numslider (Å)
- Groupbox "Show ring" (toggled by checkbox): ring Thickness numslider (Å), ring Color picker
- Buttons: "Reset all to default", "Apply", OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Button "Reset all to default" | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Button "Apply" | `gMain.apply()` | Applies changes without closing |
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |
| numslider / checkbox change | `gBals.validateWidgets()` | Syncs widget state to internal data |

#### i18n keys used
- none

#### Notes
- All label text is hardcoded English; no DTD entities or `.properties` keys are used.

---

### `dialog.property.cartoon`

- **File**: `uxp_gui/cuemol2/base/content/property/cartoon-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Cartoon representation properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/property/cartoon-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `renderer-common-page.js`, `propeditor-generic-page.js`, `cartoon-hsc-page.js`, `cartoon-propdlg.js`
- **Overlays applied**: `cartoon-helix-page.xul`, `cartoon-sheet-page.xul`, `cartoon-coil-page.xul`, `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/property/renderer-common-page.xul`

#### User-visible features
- Tab "Common": renderer-common-page overlay
- Tab "Cartoon": Axial detail numslider, Smooth color checkbox, Pivot atom name checkbox + textbox, Start type menulist (flat/sphere/none), End type menulist (flat/sphere/none)
- Groupbox "Spline Anchor" (toggled by checkbox): atom selection molsellist, Weight numslider
- Helix / Sheet / Coil tabs injected by overlay pages
- Buttons: "Reset all to default", "Apply", OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Button "Reset all to default" | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Button "Apply" | `gMain.apply()` | Applies changes without closing |
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |
| Widget change | `gCartoon.validateWidgets(event)` | Syncs widget state to internal data |

#### i18n keys used
- none

#### Notes
- Helix/Sheet/Coil tabs and their content come from three separate overlay pages; the main XUL only defines the "Cartoon" tab body.
- Three overlay XUL paths (`cartoon-helix-page.xul` etc.) are relative hrefs, resolved under `property/`.

---

### `dialog.property.contour`

- **File**: `uxp_gui/cuemol2/base/content/property/contour-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Contour renderer properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/property/contour-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `propeditor-generic-page.js`, `renderer-common-page.js`, `contour-propdlg.js`
- **Overlays applied**: `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/property/renderer-common-page.xul`

#### User-visible features
- Tab "Common": renderer-common-page overlay
- Tab "Map": Center update menulist (None/Automatic/Automatic (drag)), Line width numslider (px), Buffer size textbox, Use periodic boundary checkbox
- Groupbox "Limit display by" (toggled by checkbox): Target menulist, Selection molsellist, Distance numslider (Å)
- Buttons: "Reset all to default", "Apply", OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Button "Reset all to default" | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Button "Apply" | `gMain.apply()` | Applies changes without closing |
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |
| Widget change | `gMapMesh.validateWidgets(event)` | Syncs widget state to internal data |

#### i18n keys used
- none

#### Notes
- All label text is hardcoded English.

---

### `dialog.property.cpk`

- **File**: `uxp_gui/cuemol2/base/content/property/cpk-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "CPK Rend Properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/property/cpk-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `propeditor-generic-page.js`, `renderer-common-page.js`, `propeditor-radii-common.js`, `cpk-propdlg.js`
- **Overlays applied**: `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/property/renderer-common-page.xul`, `chrome://cuemol2/content/propeditor-radii-common.xul`

#### User-visible features
- Tab "Common": renderer-common-page overlay
- Tab "Atom radii": propeditor-radii-common overlay (per-element radius settings)
- Buttons: "Reset all to default", "Apply", OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Button "Reset all to default" | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Button "Apply" | `gMain.apply()` | Applies changes without closing |
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |

#### i18n keys used
- none

#### Notes
- The "Atom radii" tab content is entirely supplied by the `propeditor-radii-common.xul` overlay; no CPK-specific controls appear in the main XUL.

---

### `dialog.property.disorder`

- **File**: `uxp_gui/cuemol2/base/content/property/disorder-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Disorder renderer properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/property/disorder-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `propeditor-generic-page.js`, `renderer-common-page.js`, `disorder-propdlg.js`
- **Overlays applied**: `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/property/renderer-common-page.xul`

#### User-visible features
- Tab "Common": renderer-common-page overlay
- Tab "Disorder": Target renderer menulist, Detail numslider, Dot size numslider (Å), Dot separation numslider (Å), Loop size numslider (Å), Loop size 2 numslider (Å), Color picker
- Buttons: "Reset all to default", "Apply", OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Button "Reset all to default" | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Button "Apply" | `gMain.apply()` | Applies changes without closing |
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |
| Slider / picker change | `gDiso.validateWidgets()` | Syncs widget state to internal data |

#### i18n keys used
- none

#### Notes
- "Target" menulist is populated dynamically (empty `<menupopup/>`); filled at runtime by JS.

---

### `dialog.property.isosurf`

- **File**: `uxp_gui/cuemol2/base/content/property/isosurf-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Isosurf renderer properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/property/isosurf-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `propeditor-generic-page.js`, `renderer-common-page.js`, `isosurf-propdlg.js`
- **Overlays applied**: `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/property/renderer-common-page.xul`

#### User-visible features
- Tab "Common": renderer-common-page overlay
- Tab "Map": Center update menulist (None/Automatic/Automatic (drag)), Drawing Mode menulist (fill/line/point), Line/Point size numslider (px), Max grid size textbox
- Back-face culling checkbox, Use periodic boundary checkbox
- Groupbox "Limit display by" (toggled by checkbox): Target menulist, Selection molsellist, Distance numslider (Å)
- Buttons: "Reset all to default", "Apply", OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Button "Reset all to default" | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Button "Apply" | `gMain.apply()` | Applies changes without closing |
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |
| Widget change | `gMapSurf.validateWidgets(event)` | Syncs widget state to internal data |

#### i18n keys used
- none

#### Notes
- Structure is nearly identical to `dialog.property.contour` but with an additional Drawing Mode selector and back-face culling option for surface rendering.

---

### `dialog.property.molsurf`

- **File**: `uxp_gui/cuemol2/base/content/property/molsurf-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "MolSurf Rend Properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/property/molsurf-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `propeditor-generic-page.js`, `renderer-common-page.js`, `molsurf-page.js`, `molsurf-propdlg.js`
- **Overlays applied**: `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/property/renderer-common-page.xul`, `chrome://cuemol2/content/property/molsurf-page.xul`

#### User-visible features
- Tab "Common": renderer-common-page overlay
- Tab "MolSurf": molsurf-page overlay (content defined in `molsurf-page.xul`)
- Buttons: "Reset all to default", "Apply", OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Button "Reset all to default" | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Button "Apply" | `gMain.apply()` | Applies changes without closing |
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |

#### i18n keys used
- none

#### Notes
- The "MolSurf" tab is entirely supplied by `molsurf-page.xul`; this file contains no renderer-specific inline controls.

---

### `dialog.property.nucl`

- **File**: `uxp_gui/cuemol2/base/content/property/nucl-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Nucl renderer properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/property/nucl-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `propeditor-generic-page.js`, `renderer-common-page.js`, `tube-page.js`, `nucl-propdlg.js`
- **Overlays applied**: `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/property/renderer-common-page.xul`, `chrome://cuemol2/content/property/tube-page.xul`

#### User-visible features
- Tab "Common": renderer-common-page overlay
- Tab "Nucleic acid": Show Tube checkbox, Connect base pair checkbox, Base type menulist (basepair/simple1/detail1/detail2), Detail numslider, Base size numslider (Å), Base thick numslider (%)
- Tab "Tube": tube-page overlay (`propeditor-renderer-tube` overlaytarget)
- Buttons: "Reset all to default", "Apply", OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Button "Reset all to default" | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Button "Apply" | `gMain.apply()` | Applies changes without closing |
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |

#### i18n keys used
- none

#### Notes
- Reuses `tube-page.xul` / `tube-page.js` for the backbone-tube tab, shared with `dialog.property.tube`.

---

### `dialog.property.object`

- **File**: `uxp_gui/cuemol2/base/content/property/object-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Object properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/property/object-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `propeditor-generic-page.js`, `molsellist.js`, `object-propdlg.js`
- **Overlays applied**: `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/propeditor-object-common.xul`

#### User-visible features
- Tab "Common": Name textbox, Selection molsellist (editable), Visible checkbox, Locked checkbox, Linked (read-only) textbox
- No "Reset all to default" or "Apply" buttons — only OK

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |

#### i18n keys used
- none

#### Notes
- Unlike all other `dialog.property.*` entries, this dialog has no "Reset" or "Apply" buttons; it is an object-level (not renderer-level) property editor.
- Does not use `renderer-common-page.xul`; uses `propeditor-object-common.xul` instead.

---

### `dialog.property.renderer`

- **File**: `uxp_gui/cuemol2/base/content/property/renderer-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Renderer properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/property/renderer-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `propeditor-generic-page.js`, `renderer-common-page.js` (plus inline `<script>` block)
- **Overlays applied**: `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/property/renderer-common-page.xul`

#### User-visible features
- Tab "Common": renderer-common-page overlay (coloring, selection, etc.)
- Buttons: "Reset all to default", "Apply", OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Button "Reset all to default" | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Button "Apply" | `gMain.apply()` | Applies changes without closing |
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |
| Inline JS | `new cuemolui.GenPropEdit()` / `new cuemolui.RendCommPropPage(gMain)` | Constructs and registers page objects |

#### i18n keys used
- none

#### Notes
- Generic fallback renderer property dialog with no renderer-specific tab; no separate `.js` file — controller logic is entirely in the inline `<script>` block.
- Used as a fallback when no renderer-specific property dialog is registered.

---

### `dialog.property.ribbon`

- **File**: `uxp_gui/cuemol2/base/content/property/ribbon-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Ribbon representation properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/property/ribbon-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `renderer-common-page.js`, `propeditor-generic-page.js`, `ribbon-hsc-page.js`, `ribbon-propdlg.js`
- **Overlays applied**: `chrome://cuemol2/content/property/ribbon-helix-page.xul`, `chrome://cuemol2/content/property/ribbon-sheet-page.xul`, `chrome://cuemol2/content/property/ribbon-coil-page.xul`, `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/property/renderer-common-page.xul`

#### User-visible features
- Tab "Common": Section detail numslider, Axial detail numslider, Smooth color checkbox, Pivot atom name checkbox + textbox, Cap type menulist (flat/sphere/none), Segment-end fade out checkbox; renderer-common-page overlay target embedded in this tab
- Helix / Sheet / Coil tabs injected by overlay pages
- Buttons: "Reset all to default", "Apply", OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Button "Reset all to default" | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Button "Apply" | `gMain.apply()` | Applies changes without closing |
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |
| Widget change | `gComm.validateWidgets(event)` | Syncs widget state to internal data |

#### i18n keys used
- none

#### Notes
- Unlike `dialog.property.cartoon`, the renderer-common-page overlay target is placed inside the "Common" tab panel (not as a separate tab).
- `ribbon-hsc-page.js` provides shared helix/sheet/coil page logic for all three overlay tabs.

---

### `dialog.property.simple`

- **File**: `uxp_gui/cuemol2/base/content/property/simple-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Simple Rend Properties" (hardcoded, but dynamically changed to "Trace renderer properties" at runtime when renderer type is `trace`)
- **Chrome URL**: `chrome://cuemol2/content/property/simple-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `propeditor-generic-page.js`, `renderer-common-page.js` (plus inline `<script>` block; no separate external `.js` file)
- **Overlays applied**: `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/property/renderer-common-page.xul`

#### User-visible features
- Tab "Simple" (or "Trace" for trace renderer): Line width numslider (px); renderer-common-page overlay target
- Buttons: "Reset all to default", "Apply", OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Button "Reset all to default" | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Button "Apply" | `gMain.apply()` | Applies changes without closing |
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |
| Line width change | `gSimple.validateWidgets()` | Writes new line width to internal data |
| Inline JS (load) | `gMain.getRendType()` check | Dynamically relabels dialog title and tab for `trace` renderer type |

#### i18n keys used
- none

#### Notes
- Shared by both the `simple` and `trace` renderer types; the title and tab label are switched in the inline `onLoad` handler based on `gMain.getRendType()`.
- All controller logic (`SimplePropEdit` class) is defined inline in a `<![CDATA[...]]>` script block; there is no same-named external `.js` file.

---

### `dialog.property.tube`

- **File**: `uxp_gui/cuemol2/base/content/property/tube-propdlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Tube Rend Properties" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/property/tube-propdlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `propeditor-generic-page.js`, `renderer-common-page.js`, `tube-page.js` (plus inline `<script>` block)
- **Overlays applied**: `chrome://cuemol2/content/propeditor-generic-page.xul`, `chrome://cuemol2/content/property/renderer-common-page.xul`, `chrome://cuemol2/content/property/tube-page.xul`

#### User-visible features
- Tab "Common": renderer-common-page overlay
- Tab "Tube": tube-page overlay (`propeditor-renderer-tube` overlaytarget)
- Buttons: "Reset all to default", "Apply", OK, Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Button "Reset all to default" | `gMain.resetAllToDefault()` | Resets all properties to defaults |
| Button "Apply" | `gMain.apply()` | Applies changes without closing |
| Dialog accept | `gMain.onDialogAccept(event)` | Applies and closes |
| Inline JS | `new cuemolui.GenPropEdit()` / `new cuemolui.RendCommPropPage(gMain)` / `new cuemolui.RendTubePropPage()` | Constructs and registers page objects |

#### i18n keys used
- none

#### Notes
- No tube-specific external `.js` file; all page-object wiring is done in the inline `<script>` block.
- `tube-page.xul` and `tube-page.js` are reused by `dialog.property.nucl`.

---

## Unresolved

このカテゴリで解決できなかった項目:
- (なし)

## Statistics

- Total entries: 13
- With JS handler: 13
- With i18n keys: 0
- Unresolved: 0
