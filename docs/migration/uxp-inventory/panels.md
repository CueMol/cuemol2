# UXP Inventory — Panel

> Hand-maintained. See [`_spec.md`](./_spec.md) for entry format and
> editing guidance.

- Origin: one-time scan of `uxp_gui/cuemol2/` (2026-04-20)
- Spec: [_spec.md](./_spec.md)
- Entries: 26

## Index

- [`panel.anim`](#panelanim)
- [`panel.btmpanel-holder`](#panelbtmpanel-holder)
- [`panel.coloring.shell`](#panelcoloringshell)
- [`panel.coloring.deck.undef`](#panelcoloringdeckundef)
- [`panel.coloring.deck.solid`](#panelcoloringdecksolid)
- [`panel.coloring.deck.multigrad`](#panelcoloringdeckmultigrad)
- [`panel.coloring.deck.paint`](#panelcoloringdeckpaint)
- [`panel.coloring.deck.cpk`](#panelcoloringdeckcpk)
- [`panel.coloring.deck.rainbow`](#panelcoloringdeckrainbow)
- [`panel.coloring.deck.bfac`](#panelcoloringdeckbfac)
- [`panel.coloring.deck.elepot`](#panelcoloringdeckelepot)
- [`panel.coloring.deck.script`](#panelcoloringdeckscript)
- [`panel.densitymap`](#paneldensitymap)
- [`panel.fakedial`](#panelfakedial)
- [`panel.molstruct`](#panelmolstruct)
- [`panel.selection`](#panelselection)
- [`panel.symmetry`](#panelsymmetry)
- [`panel.workspace.tree`](#panelworkspacetree)
- [`panel.workspace.toolbar`](#panelworkspacetoolbar)
- [`panel.workspace.ctxmenu.scene`](#panelworkspacectxmenuscene)
- [`panel.workspace.ctxmenu.object`](#panelworkspacectxmenuobject)
- [`panel.workspace.ctxmenu.renderer`](#panelworkspacectxmenurenderer)
- [`panel.workspace.ctxmenu.rendgroup`](#panelworkspacectxmenurendgroup)
- [`panel.workspace.ctxmenu.camera`](#panelworkspacectxmenucamera)
- [`panel.workspace.ctxmenu.style`](#panelworkspacectxmenustyle)
- [`panel.workspace.ctxmenu.multi`](#panelworkspacectxmenumulti)

---

## Entries

### `panel.anim`

- **File**: `uxp_gui/cuemol2/base/content/anim/anim-panel.xul`
- **Root element**: `<overlay>`
- **Title**: "Animation" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/anim/anim-panel.xul`
- **Associated JS**: `anim/anim-panel.js`, `treeview.js`, `object-menulist.js`
- **Overlays applied**: none

#### User-visible features
- Animation duration display (read-only `<timeedit>` widget)
- Start camera selector (`<camerasel>` widget)
- Animation list tree with columns: Name, Start, End
- Toolbar buttons: Add (menu with 8 types), Delete, Properties/Change, Move Up, Move Down
- Context menu: Change, Delete, Add (same 8 types), Move up, Move down
- Side panel show/hide toggle menu item in the left-panels popup

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Add button / menu | `cuemolui.panels.anim.onAddCmd(event)` | Opens type submenu; adds animation object (SimpleSpin, CamMotion, ShowAnim, HideAnim, SlideInAnim, SlideOutAnim, MolAnim, NoopAnimObj) |
| Delete button | `cuemolui.panels.anim.onDeleteCmd(event)` | Deletes selected animation object |
| Properties button | `cuemolui.panels.anim.onPropCmd(event)` | Opens property dialog for selected animation |
| Move Up button | `cuemolui.panels.anim.onMoveUpCmd(event)` | Moves selected animation up in list |
| Move Down button | `cuemolui.panels.anim.onMoveDownCmd(event)` | Moves selected animation down in list |
| Context menu showing | `cuemolui.panels.anim.onCtxtMenuShowing(event)` | Updates context menu item states before display |
| Panel toggle menu item | `cuemolui.sidepanel.onToggle('anim-panel')` | Shows/hides the animation side panel |

#### i18n keys used
- none

#### Notes
- Overlays into `panels-overlay-target` (side panel container) and `menus-overlay-target` (popupset).
- Also injects a toggle menu item into `window-leftpanels-popup`.

---

### `panel.btmpanel-holder`

- **File**: `uxp_gui/cuemol2/base/content/bottom-panels/btmpanel-holder.xul`
- **Root element**: `<overlay>`
- **Title**: unknown (no `title` attribute on the panel container)
- **Chrome URL**: `chrome://cuemol2/content/bottom-panels/btmpanel-holder.xul`
- **Associated JS**: `bottom-panels/logpanel.js`, `bottom-panels/seqpanel.js`
- **Overlays applied**: none

#### User-visible features
- Two-tab bottom panel (tabs at bottom edge): **Output** tab and **Sequence** tab
- Output tab: scrollable monospace log text area (read-only), command prompt input field
- Sequence tab: residue name list (left side), ruler canvas and sequence canvas (right side), horizontal splitter between name list and canvas area
- Sequence context menu: residue label (disabled), Center here, Toggle sel, Around Byresid (3/5/7/10 Å), Around (3/5/7/10 Å), Unselect all, Invert sel, Copy sequence

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Sequence context menu items | wired in `seqpanel.js` (not in XUL) | Center, selection toggle, around-selection, copy sequence operations |

#### i18n keys used
- none

#### Notes
- Overlays into `btmpanels-overlay-target` (not `panels-overlay-target` like other panels); this targets the dedicated bottom panel region.
- JS files are loaded with relative (non-chrome) paths, resolving to `bottom-panels/logpanel.js` and `bottom-panels/seqpanel.js`.
- Context menu item `oncommand` handlers are not defined in XUL; wired via `seqpanel.js`.

---

### `panel.coloring.shell`

- **File**: `uxp_gui/cuemol2/base/content/coloring-panel.xul` (`<vbox id="coloring-panel">`)
- **Root element**: `<overlay>`
- **Title**: "Color" (`&coloringPanel.title;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/coloring-panel.xul`
- **Associated JS**: `coloring-panel.js`, `treeview.js`, `object-menulist.js`
- **Overlays applied**: `coloring-deck-paint.xul`, `coloring-deck-cpk.xul`, `coloring-deck-rainbow.xul`, `coloring-deck-bfac.xul`, `coloring-deck-elepot.xul`, `coloring-deck-script.xul`

#### User-visible features
- Renderer selector menulist (`colpanel-rend-menulist`) — paint-capable renderers only (filtered by `paint_coloring_filter`)
- Coloring type dropdown button (`colpanel-coloring-menu`) with items:
  - Paint coloring (submenu, populated at popup-show time from style names ending in `Paint`)
  - Solid coloring (`paint-type-solid`)
  - CPK coloring (`paint-type-cpk`)
  - Bfac/Occ coloring (`paint-type-bfac`)
  - Rainbow coloring (`paint-type-rainbow`)
  - Electrostatic potential (`paint-type-elepot`)
  - Multi-gradient coloring (`paint-type-multigrad`)
  - Reset to default style (`paint-type-resetdef`)
- `<deck id="colpanel-deck">` container — drives which sub-pane (`panel.coloring.deck.*`) is shown
- Side panel show/hide toggle menu item (`menu-coloring-panel-toggle`) in `window-leftpanels-popup`

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Renderer selector change | wired in `coloring-panel.js` via `cuemolui.ObjMenuList` | Loads the chosen renderer's coloring state into the active deck |
| Renderer property change | `addPropChgListener("*", …)` → `targetPropChanged()` | Refreshes widgets when the renderer's `coloring` / `defaultcolor` changes |
| Coloring type dropdown command | `cuemolui.panels.paint.onChgColoring(event)` | Switches active coloring mode and updates the `<deck>` selectedIndex (resetdef → `cuemol.resetProp(rend, "coloring")`; other items → `gQm2Main.setRendColoring(id, rend)` under an undo txn) |
| Paint submenu popup-showing | `cuemolui.panels.paint.onPaintColShowing(event)` | Populates the Paint submenu via `cuemolui.populateStyleMenus(scene_uid, menu, /Paint$/, true)` |
| Panel toggle menu item | `cuemolui.sidepanel.onToggle('coloring-panel')` | Shows/hides the coloring side panel |

#### i18n keys used
- `&coloringPanel.title;` (dtd: `cuemol2.dtd`)

#### Notes
- `_setupData` (`coloring-panel.js`) reads `aRend.coloring._wrapped.getClassName()` and maps it to one of the deck indices: `PaintColoring` → Paint, `CPKColoring` → CPK, `RainbowColoring` → Rainbow, `BfacColoring` → Bfac, `ScriptColoring` → Script, otherwise → unknown/solid fallback. `molsurf`/`dsurface` renderers additionally allow Elepot and Multi-gradient.
- The `paint-type-elepot` and `paint-type-multigrad` items in the dropdown are only meaningful for surface renderers (handled inside `onChgColoring`).
- This entry owns the side-panel container; the deck pages live in `panel.coloring.deck.*` sub-entries.

---

### `panel.coloring.deck.undef`

- **File**: `uxp_gui/cuemol2/base/content/coloring-panel.xul` (`<vbox id="coloring-deck-undef">`)
- **Root element**: `<vbox>` (deck page, index 0)
- **Title**: shares `panel.coloring.shell` ("Color"); deck page has no own label
- **Chrome URL**: `chrome://cuemol2/content/coloring-panel.xul`
- **Associated JS**: none — purely static markup
- **Overlays applied**: none

#### User-visible features
- A single read-only `<description value="Coloring isn't supported"/>` label
- No controls

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (none) | (none) | This deck has no interactive elements. |

#### i18n keys used
- none

#### Notes
- Displayed by `_setupData` when the active renderer either has no `coloring` property or its renderer type does not support coloring at all.
- The base XUL holds a commented-out `<numslider>` stub; the current behaviour is label-only.

---

### `panel.coloring.deck.solid`

- **File**: `uxp_gui/cuemol2/base/content/coloring-panel.xul` (`<vbox id="coloring-deck-unknown">`)
- **Root element**: `<vbox>` (deck page, index 1)
- **Title**: shares `panel.coloring.shell` ("Color"); deck page has no own label
- **Chrome URL**: `chrome://cuemol2/content/coloring-panel.xul`
- **Associated JS**: `coloring-panel.js`
- **Overlays applied**: none

#### User-visible features
- Read-only class-name label (`colpanel-clsname`) showing the current coloring class (or "(none)") — fallback display when the panel does not recognise the coloring class
- "Default color" label + `<mycolpicker id="paint-default-color">` — edits the renderer's `defaultcolor` property

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Default color picker change | `cuemolui.panels.paint.onDefaultColorChanged(event)` | After `aEvent.isCompleted`, calls `commitRendPropChange("defaultcolor", color._wrapped, ...)` on the active renderer (undo-wrapped) |

#### i18n keys used
- none

#### Notes
- The deck `id` (`coloring-deck-unknown`) is historical; it doubles as the "Solid coloring" mode when the active coloring is null/unset (default color is the only meaningful control).
- `colpanel-clsname` is set from `aRend.coloring._wrapped.getClassName()` for the unknown-class case (e.g. a third-party plug-in coloring); for the truly-solid case the label is "(none)".

---

### `panel.coloring.deck.multigrad`

- **File**: `uxp_gui/cuemol2/base/content/coloring-panel.xul` (`<vbox id="coloring-deck-multigrad">`)
- **Root element**: `<vbox>` (deck page, index 2)
- **Title**: shares `panel.coloring.shell` ("Color"); deck page has no own label
- **Chrome URL**: `chrome://cuemol2/content/coloring-panel.xul`
- **Associated JS**: `coloring-panel.js`
- **Overlays applied**: none

#### User-visible features
- Read-only `<description value="Multi-gradient coloring:"/>` label
- Color map object selector menulist (`paint-colmap-obj-selector`) — chooses a `ColorMap` object from the scene
- "Edit color…" button (`colpanel-editmultig`)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Color map object selector change | wired in `coloring-panel.js` (`onColMapSelChanged`) | Assigns the chosen `ColorMap` object to the renderer's multi-gradient coloring |
| Edit color button | `cuemolui.panels.paint.onEditMultiGrad(event)` | Opens `chrome://cuemol2/content/tools/multigrad_editor.xul` with `scene_id` / `rend_id` args |

#### i18n keys used
- none

#### Notes
- This deck is only reachable for renderers whose type supports `multi_grad` (in practice scalar-field surface renderers such as `molsurf` / `dsurface`).
- The multigrad editor itself is a separate dialog (`dialog.tool.multigrad-editor`); this deck is just the entry point.

---

### `panel.coloring.deck.paint`

- **File**: `uxp_gui/cuemol2/base/content/coloring-deck-paint.xul` (`<vbox id="coloring-deck-paint">`)
- **Root element**: `<overlay>` (overlay-target `colpanel-deck`)
- **Title**: shares `panel.coloring.shell` ("Color"); deck page has no own label
- **Chrome URL**: `chrome://cuemol2/content/coloring-deck-paint.xul`
- **Associated JS**: `coloring-panel.js` (handlers under `cuemolui.panels.paint`)
- **Overlays applied**: none (this file itself is overlayed into `coloring-panel.xul`)

#### User-visible features
- Read-only `<description value="Paint coloring:"/>` label
- Two-column tree (`paint-listbox`) with **Selection** / **Color** columns; `seltype="multiple"`, splitter between columns
- Toolbar buttons (icon-only, with tooltips):
  - **Add** (`paintpanel-addbtn`) — opens `paint-propdlg.xul` to enter selection + color
  - **Delete** (`paintpanel-delbtn`) — removes the selected rows (multi-row aware)
  - **Delete all** (`paintpanel-delallbtn`) — clears every paint entry
  - **Change** (`paintpanel-propbtn`) — opens `paint-propdlg.xul` for the selected row
  - **Move up** (`paintpanel-moveupbtn`) — moves selected row up
  - **Move down** (`paintpanel-movedownbtn`) — moves selected row down
- Context menu (`paintPanelCtxtMenu`): Change… / Delete / Add… / Cut / Copy / Paste

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Add / context Add | `cuemolui.panels.paint.onAddCmd(event)` | Opens `paint-propdlg.xul`; on accept calls `coloring.insertBefore(idx, sel, col)` under an undo txn |
| Delete | `cuemolui.panels.paint.onDeleteCmd(event)` | Iterates selected rows in descending index order, calls `coloring.removeAt(idx)`; `paintpanel-delallbtn` passes a `bDelAll` flag |
| Change / context Change… | `cuemolui.panels.paint.onPropCmd(event)` | Opens `paint-propdlg.xul` for the selected entry; on accept calls `coloring.changeAt(idx, sel, col)` |
| Move up / Move down | `cuemolui.panels.paint.onMoveUpCmd` / `onMoveDownCmd` | Copy → `removeAt` → `insertBefore` / `append` round-trip via `_moveUpDownImpl(event, bUp)` |
| Context menu popup-showing | `cuemolui.panels.paint.onCtxtMenuShowing(event)` | Enables Paste based on internal `qsc-paint` clipboard; updates Change/Delete state |
| Cut / Copy / Paste | `cuemolui.panels.paint.onCut` / `onCopy` / `onPaste` | Clipboard ops on paint entries (per-panel buffer, not OS clipboard) |

#### i18n keys used
- none

#### Notes
- Tree contents are driven by `cuemolui.TreeView` bound to the renderer's `PaintColoring` object (`size` + `getSelAt(i)` + `getColorAt(i)`).
- Add / Change open `chrome://cuemol2/content/paint-propdlg.xul` (covered separately in the Dialog inventory) to capture selection + color before mutating the C++ object.
- All mutations are wrapped in `scene.startUndoTxn()` / `commitUndoTxn()` in the handler.

---

### `panel.coloring.deck.cpk`

- **File**: `uxp_gui/cuemol2/base/content/coloring-deck-cpk.xul` (`<vbox id="coloring-deck-cpk">`)
- **Root element**: `<overlay>` (overlay-target `colpanel-deck`)
- **Title**: shares `panel.coloring.shell` ("Color"); deck page has no own label
- **Chrome URL**: `chrome://cuemol2/content/coloring-deck-cpk.xul`
- **Associated JS**: `coloring-panel.js` (`onCPKColChanged`)
- **Overlays applied**: none

#### User-visible features
- Read-only `<description value="CPK coloring:"/>` label
- Two-column grid of element label + `<mycolpicker>` pairs:
  - Carbon (`cpk_col_C`), Nitrogen (`cpk_col_N`), Oxygen (`cpk_col_O`), Sulfur (`cpk_col_S`), Phosphorus (`cpk_col_P`), Hydrogen (`cpk_col_H`), Others (`cpk_col_X`)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Any element color picker change | `cuemolui.panels.paint.onCPKColChanged(event)` | After `aEvent.isCompleted`, updates the matching `CPKColoring` property (`col_C` / `col_N` / …) on the active renderer's coloring; undo-wrapped |

#### i18n keys used
- `&elem.carbon;` (dtd: `cuemol2.dtd`)
- `&elem.nitrogen;` (dtd: `cuemol2.dtd`)
- `&elem.oxygen;` (dtd: `cuemol2.dtd`)
- `&elem.sulfur;` (dtd: `cuemol2.dtd`)
- `&elem.phosphorus;` (dtd: `cuemol2.dtd`)
- `&elem.hydrogen;` (dtd: `cuemol2.dtd`)
- `&elem.others;` (dtd: `cuemol2.dtd`)

#### Notes
- The handler resolves which element a picker corresponds to via the `id` suffix (`cpk_col_<elem>`).
- The deck is only valid when the renderer's coloring class is `CPKColoring`; switching to it via the dropdown instantiates a fresh `CPKColoring` with default per-element colors.

---

### `panel.coloring.deck.rainbow`

- **File**: `uxp_gui/cuemol2/base/content/coloring-deck-rainbow.xul` (`<vbox id="coloring-deck-rainbow">`)
- **Root element**: `<overlay>` (overlay-target `colpanel-deck`)
- **Title**: shares `panel.coloring.shell` ("Color"); deck page has no own label
- **Chrome URL**: `chrome://cuemol2/content/coloring-deck-rainbow.xul`
- **Associated JS**: `coloring-panel.js` (`onRainbowChange`)
- **Overlays applied**: none

#### User-visible features
- Read-only `<description value="Rainbow coloring:"/>` label
- **Mode** menulist (`paint-rnb-mode`): Molecule / Chain (a "Shown" item is commented out in source)
- **Change by** menulist (`paint-rnb-incrmode`): Chain / Residue / Prot secstr
- **Start H** numslider (`paint-rnb-starth`) — 0–360°, step 1°
- **End H** numslider (`paint-rnb-endh`) — 0–360°, step 1°
- **Brightness** numslider (`paint-rnb-bri`) — 0–100%, step 1%
- **Saturation** numslider (`paint-rnb-sat`) — 0–100%, step 1%

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Any menulist or slider change | `cuemolui.panels.paint.onRainbowChange(event)` | Reads all six widgets and pushes the values onto the active renderer's `RainbowColoring` (mode/incrmode/starth/endh/brightness/saturation); undo-wrapped |

#### i18n keys used
- none

#### Notes
- A "Shown" mode (`value="rend"`) is present in the markup but commented out; only Molecule / Chain are active.

---

### `panel.coloring.deck.bfac`

- **File**: `uxp_gui/cuemol2/base/content/coloring-deck-bfac.xul` (`<vbox id="coloring-deck-bfac">`)
- **Root element**: `<overlay>` (overlay-target `colpanel-deck`)
- **Title**: shares `panel.coloring.shell` ("Color"); deck page has no own label
- **Chrome URL**: `chrome://cuemol2/content/coloring-deck-bfac.xul`
- **Associated JS**: `coloring-panel.js` (`onBfacChange`)
- **Overlays applied**: none

#### User-visible features
- Read-only `<description value="Bfac coloring:"/>` label
- **Mode** menulist (`paint-bfac-mode`): B-factor / Occupancy / Distance from center
- Low / High `<mycolpicker>` pair (`paint-bfac-collo` / `paint-bfac-colhi`) for the gradient endpoints
- **Parameter** groupbox:
  - Auto/manual menulist (`paint-bfac-auto`): Manual / Auto (by mol) / Auto (by rend)
  - Low textbox (`paint-bfac-parlo`) and High textbox (`paint-bfac-parhi`) — numeric, infinite-decimal
- Body is wrapped in a scrollable `<vbox>` so it can overflow vertically

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Any menulist / colorpicker / textbox change | `cuemolui.panels.paint.onBfacChange(event)` | Pushes mode / Low / High colors / auto-mode / low-high params to the renderer's `BfacColoring`; undo-wrapped |

#### i18n keys used
- none

#### Notes
- "Auto (by mol)" derives the Low/High parameters from the parent molecule's range; "Auto (by rend)" uses only the renderer's selection range. The Low/High textboxes are visible (and edited) only when mode is Manual.

---

### `panel.coloring.deck.elepot`

- **File**: `uxp_gui/cuemol2/base/content/coloring-deck-elepot.xul` (`<vbox id="coloring-deck-elepot">`)
- **Root element**: `<overlay>` (overlay-target `colpanel-deck`)
- **Title**: shares `panel.coloring.shell` ("Color"); deck page has no own label
- **Chrome URL**: `chrome://cuemol2/content/coloring-deck-elepot.xul`
- **Associated JS**: `coloring-panel.js` (`onElepotChange`)
- **Overlays applied**: none

#### User-visible features
- Read-only `<description value="Elepot coloring:"/>` label
- ElePotMap object selector menulist (`paint-elepot-obj-selector`)
- "Color by SAS" checkbox (`paint-elepot-ramp-above`)
- Three-row grid (High / Mid / Low):
  - numeric textbox for the value threshold (`paint-elepot-parh` / `paint-elepot-parm` / `paint-elepot-parl`)
  - `<mycolpicker>` for the color at that threshold (`paint-elepot-colh` / `paint-elepot-colm` / `paint-elepot-coll`)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Any control change | `cuemolui.panels.paint.onElepotChange(event)` | Pushes ElePotMap target / SAS flag / High/Mid/Low thresholds + colors onto the renderer's electrostatic-potential coloring; undo-wrapped |

#### i18n keys used
- none

#### Notes
- This deck is only valid for surface renderers (`molsurf` / `dsurface`); the dropdown enables it conditionally.
- The selector lists scene objects of class `ElePotMap`; the editor reads/writes through that object rather than embedding the field in the coloring scheme.

---

### `panel.coloring.deck.script`

- **File**: `uxp_gui/cuemol2/base/content/coloring-deck-script.xul` (`<vbox id="coloring-deck-script">`)
- **Root element**: `<overlay>` (overlay-target `colpanel-deck`)
- **Title**: shares `panel.coloring.shell` ("Color"); deck page has no own label
- **Chrome URL**: `chrome://cuemol2/content/coloring-deck-script.xul`
- **Associated JS**: `coloring-panel.js` (`onLoadColoringScript`)
- **Overlays applied**: none

#### User-visible features
- Header row with `<description value="Script coloring:"/>` and an **Update** button (`paint-script-updatebtn`)
- Multi-line textbox (`paint-sciprt-textbox`) with placeholder `(noscript)`

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Update button | `cuemolui.panels.paint.onLoadColoringScript(event)` | Reads the textbox content and pushes it as the script body of the renderer's `ScriptColoring`; undo-wrapped |

#### i18n keys used
- none

#### Notes
- The textbox id (`paint-sciprt-textbox`) contains an apparent typo (`sciprt`); referenced verbatim from `coloring-panel.js`.
- The `<overlay id="coloring-deck-paint-overlay">` element in this file shares its id with `coloring-deck-paint.xul` (harmless duplicate at the XUL overlay layer).

---

### `panel.densitymap`

- **File**: `uxp_gui/cuemol2/base/content/densitymap-panel.xul`
- **Root element**: `<overlay>`
- **Title**: "Density map" (`&denmapPanel.title;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/densitymap-panel.xul`
- **Associated JS**: `densitymap-panel.js`, `object-menulist.js`
- **Overlays applied**: none

#### User-visible features
- Renderer selector menulist
- Options dropdown button: level mode (sigma / absolute), color mode (solid / multi-gradient)
- Redraw button, Cell (unit cell visibility toggle) button
- Color picker (solid mode) or "Edit color…" button (multi-gradient mode), inside a deck
- Transparency slider (0–1, step 0.1)
- Level slider (−10 to 10 σ, step 0.1)
- Extent slider (0–100 Å, step 1)
- Side panel toggle menu item

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Renderer selector change | `cuemolui.panels.denmap.onSelChanged(event)` | Loads selected renderer properties into controls |
| Renderer list change | `cuemolui.panels.denmap.onListChanged(event)` | Refreshes renderer list |
| Options menu item | `cuemolui.panels.denmap.onMenuChanged(event)` | Switches level/color mode |
| Options menu showing | `cuemolui.panels.denmap.onMenuShowing(event)` | Updates radio check states |
| Redraw button | `cuemolui.panels.denmap.onRedraw(event)` | Forces redraw of density map renderer |
| Cell button | `cuemolui.panels.denmap.onShowCell(event)` | Toggles unit cell box visibility |
| Edit color button | `cuemolui.panels.denmap.onEditColor(event)` | Opens multi-gradient color editor |
| Slider / color picker change | `cuemolui.panels.denmap.validateWidget(event)` | Pushes updated value to renderer |
| Panel toggle menu item | `cuemolui.sidepanel.onToggle('denmap-panel')` | Shows/hides the density map side panel |

#### i18n keys used
- `&denmapPanel.title;` (dtd: `cuemol2.dtd`)

#### Notes
- The color row uses a `<deck>` to show either a color picker (solid mode) or "Edit color…" button (multi-gradient mode).

---

### `panel.fakedial`

- **File**: `uxp_gui/cuemol2/base/content/fakedial-panel.xul`
- **Root element**: `<overlay>`
- **Title**: "View" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/fakedial-panel.xul`
- **Associated JS**: `fakedial-panel.js`
- **Overlays applied**: none

#### User-visible features
- **Rotation** section: RotX, RotY, RotZ — each has a `<wheelbtn>` dial and numeric textbox (in degrees °)
- **Translation** section: TraX, TraY, TraZ — each has a `<wheelbtn>` dial and numeric textbox (in Å)
- **Zoom/Slab** section: Zoom, Slab, Dist — each has a `<wheelbtn>` dial and numeric textbox (in Å)
- Section headers with horizontal rule separators
- Side panel toggle menu item

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Wheel / textbox interaction | wired in `fakedial-panel.js` (not in XUL) | Adjusts view rotation, translation, or zoom/slab via the active scene view |
| Panel toggle menu item | `cuemolui.sidepanel.onToggle('fakedial-panel')` | Shows/hides the view control side panel |

#### i18n keys used
- none

#### Notes
- Uses an inline `<!DOCTYPE>` with `%cuemol2DTD;` parameter entity, but no `&entity;` references appear in the XUL body; effectively no i18n strings.
- All value-change logic is in `fakedial-panel.js`; no `oncommand` attributes in the XUL.

---

### `panel.molstruct`

- **File**: `uxp_gui/cuemol2/base/content/molstruct-panel.xul`
- **Root element**: `<overlay>`
- **Title**: "MolStruct" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/molstruct-panel.xul`
- **Associated JS**: `molstruct-panel.js`, `treeview.js`, `object-menulist.js`
- **Overlays applied**: none

#### User-visible features
- Molecule selector menulist
- Molecular structure tree (`molStructTree`) with a single "Name" column; displays chains → residues → atoms hierarchy; `treelines="true"`, multi-select
- Toolbar buttons: Select atoms, Center at, Zoom at, Properties

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Select atoms button | wired in `molstruct-panel.js` | Applies current tree selection as atom selection |
| Center at button | wired in `molstruct-panel.js` | Centers view on selected structure element |
| Zoom at button | wired in `molstruct-panel.js` | Zooms view to selected structure element |
| Properties button | wired in `molstruct-panel.js` | Opens property dialog for selected element |
| Panel toggle menu item | `cuemolui.sidepanel.onToggle('molstruct-panel')` | Shows/hides the molstruct side panel |

#### i18n keys used
- none

#### Notes
- Toolbar buttons have no `oncommand` attributes in XUL; all handlers wired via `molstruct-panel.js`.
- The context menu block (`wspcPanelSceneCtxtMenu`, `wspcPanelObjCtxtMenu`, `wspcPanelRendCtxtMenu`) is fully commented out in the current source.

---

### `panel.selection`

- **File**: `uxp_gui/cuemol2/base/content/selection-panel.xul`
- **Root element**: `<overlay>`
- **Title**: "Selection" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/selection-panel.xul`
- **Associated JS**: `selection-panel.js`
- **Overlays applied**: none

#### User-visible features
- Molecule selector menulist
- Two-tab panel:
  - **Command tab** (icon: `tabbtn-cmdsel1.png`): multi-line text input with "Input selection command" placeholder, History menu button, Select button, Clear input button
  - **Editor tab** (icon: `tabbtn-list1.png`): rich list box of selection items, Select button, Add button (Hierarchical / Terminal / Around–Expand submenu), Delete button, Delete-all button
- Side panel toggle menu item

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Clear input button | `document.getElementById('select-command-input').value=''` (inline) | Clears command text box |
| History button | wired in `selection-panel.js` | Shows command history popup |
| Select (command tab) | wired in `selection-panel.js` | Executes text command as selection |
| Select (editor tab) | wired in `selection-panel.js` | Applies composed selection from list |
| Add — Hierarchical | wired in `selection-panel.js` | Adds hierarchical selector item to list |
| Add — Terminal | wired in `selection-panel.js` | Adds terminal selector item to list |
| Add — Around/Expand | wired in `selection-panel.js` | Adds around/expand selector item to list |
| Delete button | wired in `selection-panel.js` | Removes selected item from list |
| Delete-all button | wired in `selection-panel.js` | Clears all items from list |
| Panel toggle menu item | `cuemolui.sidepanel.onToggle('selection-panel')` | Shows/hides the selection side panel |

#### i18n keys used
- none

#### Notes
- References a stylesheet `chrome://cuemol2/content/selection-widgets.css` via `<?xml-stylesheet?>` (not an overlay).
- All toolbar button handlers (except clear-input inline JS) are wired in `selection-panel.js`.

---

### `panel.symmetry`

- **File**: `uxp_gui/cuemol2/base/content/symmetry-panel.xul`
- **Root element**: `<overlay>`
- **Title**: "Symmetry" (`&symmetryPanel.title;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/symmetry-panel.xul`
- **Associated JS**: `symmetry-panel.js`, `object-menulist.js`
- **Overlays applied**: none

#### User-visible features
- Object selector menulist
- Crystal information HTML table:
  - Lattice type + space group row (using `&symmetryPanel.sg;` label)
  - Unit cell axes row: *a*, *b*, *c* in Å
  - Unit cell angles row: α, β, γ in °
- "Change …" button
- "Symm mol" button (`&symmetryPanel.symmol;`) with submenu: 20 Å, 50 Å, 100 Å, 200 Å, Unit cell
- "Unit cell" button (`&symmetryPanel.unitcell;`)
- Side panel toggle menu item

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Change button | `cuemolui.panels.symm.changeSymm(event)` | Opens dialog to change symmetry settings |
| Symm mol button / submenu | `cuemolui.panels.symm.showSymmRend(event)` | Creates/shows symmetry renderer with chosen distance cutoff |
| Unit cell button | `cuemolui.panels.symm.showUnitCell()` | Shows unit cell box renderer |
| Panel toggle menu item | `cuemolui.sidepanel.onToggle('symm')` | Shows/hides the symmetry side panel |

#### i18n keys used
- `&symmetryPanel.title;` (dtd: `cuemol2.dtd`)
- `&symmetryPanel.sg;` (dtd: `cuemol2.dtd`)
- `&symmetryPanel.symmol;` (dtd: `cuemol2.dtd`)
- `&symmetryPanel.unitcell;` (dtd: `cuemol2.dtd`)

#### Notes
- The panel vbox id is `symm` (not `symmetry-panel`); the toggle call uses `cuemolui.sidepanel.onToggle('symm')`.
- Crystal data is rendered using inline HTML elements (`<html:table>`, `<html:span>`) inside the XUL layout.

---

### `panel.workspace.tree`

- **File**: `uxp_gui/cuemol2/base/content/workspace_panel.xul` (`<tree id="objectTree">`)
- **Root element**: `<tree>`
- **Title**: "Scene" (`&workspacePanel.title;` in `cuemol2.dtd`) — panel-level title shared across all `panel.workspace.*` surfaces
- **Chrome URL**: `chrome://cuemol2/content/workspace_panel.xul`
- **Associated JS**: `workspace_panel.js`, `workspace_panel_dnd.js`, `treeview.js`
- **Overlays applied**: none

#### User-visible features
- Object/renderer tree with columns **V** (visibility toggle) and **Name**
- Inline name editing on the Name column
- Multi-selection enabled (`seltype="multiple"`)
- Drag-and-drop reorder of tree items (`onDragStart` / drop handlers in `workspace_panel_dnd.js`)
- Side panel show/hide toggle menu item in the left-panels popup

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| V cell click | `cuemolui.panels.workspace.onTreeClicked(event)` | Toggles visibility for the clicked row |
| Name cell commit | `cuemolui.panels.workspace.onTextCommit(...)` | Persists inline name edits |
| Selection change | `cuemolui.panels.workspace.onTreeSelChanged(event)` | Updates toolbar / property button enable state |
| Drag start | `cuemolui.panels.workspace.onDragStart(event)` | Initiates DnD payload for tree row |
| Drop | `workspace_panel_dnd` drop handlers | Reorders / regroups renderers under the dropped target |
| Panel toggle menu item | `cuemolui.sidepanel.onToggle('workspace-panel')` | Shows/hides the workspace side panel |

#### i18n keys used
- `&workspacePanel.title;` (dtd: `cuemol2.dtd`)
- `&workspacePanel.object_tree.name;` (dtd: `cuemol2.dtd`)

#### Notes
- Tree contents come from `scene.getSceneDataJSON()` plus synthesised camera / style root rows (cameras and styles are not part of the scene-data JSON).
- Auto-refresh in UXP is driven by `_attachScene` subscribing to the CueMol event manager; the React port mirrors this with `cm.addEventListener` filtering `SEM_SCENE|OBJECT|RENDERER|CAMERA|STYLE`.

---

### `panel.workspace.toolbar`

- **File**: `uxp_gui/cuemol2/base/content/workspace_panel.xul` (`<toolbar id="wspcPanelToolbar">`)
- **Root element**: `<toolbar>`
- **Title**: shares `panel.workspace` ("Scene"); toolbar has no own label
- **Chrome URL**: `chrome://cuemol2/content/workspace_panel.xul`
- **Associated JS**: `workspace_panel.js`
- **Overlays applied**: none

#### User-visible features
- Four toolbar buttons acting on the currently selected tree row: **Zoom at**, **Add**, **Delete**, **Property**

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Zoom at button | `cuemolui.panels.workspace.onBtnZoomCmd(event)` | Zooms view to selected object/renderer |
| Add button | `cuemolui.panels.workspace.onNewCmd(event)` | Opens new renderer/object dialog |
| Delete button | `cuemolui.panels.workspace.onDeleteCmd(event)` | Deletes selected object or renderer |
| Property button | `cuemolui.panels.workspace.onPropCmd(event)` | Opens property dialog for the selection |

#### i18n keys used
- (none — button labels are tooltip-only in UXP)

#### Notes
- Add opens the same dialog as the Object / Renderer / RendGroup context menus' "New …" items.
- Delete and Property are also reachable from each per-type context menu's "Delete" / "Properties" items; the toolbar variant works on the current tree selection.

---

### `panel.workspace.ctxmenu.scene`

- **File**: `uxp_gui/cuemol2/base/content/workspace_panel.xul` (`<menupopup id="wspcPanelSceneCtxtMenu">`)
- **Root element**: `<menupopup>`
- **Title**: n/a (context menu — no titlebar)
- **Chrome URL**: `chrome://cuemol2/content/workspace_panel.xul`
- **Associated JS**: `workspace_panel_ctxtmenu.js`, `workspace_panel.js`
- **Overlays applied**: none

#### User-visible features
- Background color submenu (White / Black)
- Use color proofing toggle (`<menuitem type="checkbox">`)
- Paste (enabled when clipboard holds an object)
- Properties

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Popup showing | `cuemolui.panels.workspace.onCtxtMenuShowing(event)` (scene branch) | Enables Paste based on `qsc-copipe` clipboard; reflects `scene.use_colproof` toggle state |
| Background color | `gQm2Main.setBgColor(...)` | Sets scene background color |
| Color proofing | `gQm2Main.onToggleColProof(event)` | Toggles color proofing mode |
| Paste | `cuemolui.panels.workspace.onPasteObj(event)` | Pastes copied object into scene |
| Properties | `cuemolui.panels.workspace.onPropCmd(event)` | Opens scene property dialog |

#### i18n keys used
- (none — labels hardcoded)

#### Notes
- Color proofing requires both `scene.use_colproof === true` AND `scene.icc_filename !== ""` to render as checked.
- This is the only ctx menu in the panel that mutates global scene state (bg color, color proof) rather than acting on a tree row.

---

### `panel.workspace.ctxmenu.object`

- **File**: `uxp_gui/cuemol2/base/content/workspace_panel.xul` (`<menupopup id="wspcPanelObjCtxtMenu">`)
- **Root element**: `<menupopup>`
- **Title**: n/a
- **Chrome URL**: `chrome://cuemol2/content/workspace_panel.xul`
- **Associated JS**: `workspace_panel_ctxtmenu.js`, `workspace_panel_molsel.js`, `workspace_panel_copipe.js`
- **Overlays applied**: none

#### User-visible features
- Regenerate surface (visible only for `MolSurfObj` with a known origin mol)
- Selection submenu: All / Unselect / Invert / Toggle sidechain / Around by-resid / Around (3/5/7/10) / protein / nucleic / water / ligand / sugar / hydrogen
- Paint submenu (inlined from `color-menu.xul`)
- Copy Object / Paste Renderer
- New Renderer / New Group
- Save As
- Delete Object / Properties

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Popup showing | `cuemolui.panels.workspace.onCtxtMenuShowing(event)` (object branch) + `setupMolSurfCtxtMenu` | Updates Paste enable + molsurf regen visibility |
| Selection ops | `cuemolui.panels.workspace.selectMol(...)` / `invertMolSel()` / `toggleSideCh()` / `aroundMolSel(...)` | Per-item handlers from `workspace_panel_molsel.js` |
| Paint | `cuemolui.panels.workspace.onPaintMol(event)` | Inserts a paint entry into the mol's coloring |
| Copy Object | `cuemolui.panels.workspace.onCopyCmd(event)` | Copies object to `qscobj` clipboard |
| Paste Renderer | `cuemolui.panels.workspace.onPasteRend(event)` | Pastes renderer from `qscrend` clipboard onto this object |
| New Renderer | `cuemolui.panels.workspace.onNewCmd(event)` | Opens new renderer dialog targeted at this object |
| New Group | `cuemolui.panels.workspace.onNewRendGrp(event)` | Creates a renderer group on this object |
| Save As | `cuemolui.panels.workspace.onSaveAsObj(event)` | Saves object to file |
| Regen surface | `cuemolui.panels.workspace.onMolSurfRegen(event)` | Regenerates `MolSurfObj` from its origin mol |
| Delete / Properties | `cuemolui.panels.workspace.onDeleteCmd` / `onPropCmd` | Shared with toolbar |

#### i18n keys used
- (none — labels hardcoded)

#### Notes
- The Paint submenu is `#include`-d from `color-menu.xul` at XUL preprocessor time, not at runtime.
- Selection menu items live in `workspace_panel_molsel.js` rather than the ctx-menu JS so they can be reused by other panels (e.g. the selection panel).

---

### `panel.workspace.ctxmenu.renderer`

- **File**: `uxp_gui/cuemol2/base/content/workspace_panel.xul` (`<menupopup id="wspcPanelRendCtxtMenu">`)
- **Root element**: `<menupopup>`
- **Title**: n/a
- **Chrome URL**: `chrome://cuemol2/content/workspace_panel.xul`
- **Associated JS**: `workspace_panel_ctxtmenu.js`
- **Overlays applied**: none

#### User-visible features
- Change sel submenu: Current / All / Protein / Nucleic / Water / Ligand / Sugar
- Change type submenu (dynamically populated from compatible renderer types)
- Coloring submenu: Paint (Secondary str.) sub-submenu / CPK molcol / CPK dark gray / CPK light gray / B-factor / Rainbow
- Paint submenu (inlined from `color-menu.xul`)
- Style submenu (dynamically populated from `<type_name>$/i` + edge styles `/^EgLine/`)
- Edit style… / Create style…
- Edit interaction list… (visible only for `atomintr` renderer)
- Generate surface obj (visible only for `isosurf` renderer)
- Copy / New Renderer / Delete / Properties

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Popup showing | `cuemolui.panels.workspace.onRendCtxtMenuShowing(event)` | Enables/disables Paint / Coloring / Style / Copy by renderer type and current coloring class |
| Change sel | `cuemolui.panels.workspace.setRendSel(...)` | Changes renderer atom selection |
| Change type popup-showing | `cuemolui.panels.workspace.onChgRendTypeShowing(event)` | Populates compatible-types submenu |
| Change type | `cuemolui.panels.workspace.chgRendType(event)` | Replaces renderer with chosen type |
| Coloring | `cuemolui.panels.workspace.onColoringMol(event)` → `gQm2Main.setRendColoring(...)` | Applies coloring style (style-* or paint-type-*) |
| Paint | `cuemolui.panels.workspace.onPaintMol(event)` | Inserts paint entry into `PaintColoring` |
| Style popup-showing | `cuemolui.panels.workspace.onStyleShowing(event)` | Populates Style submenu via `populateStyleMenus` with `<type_name>$/i` + edge `/^EgLine/` |
| Style item | `cuemolui.panels.workspace.styleMol(event)` | styleutil.remove + push, then `rend.applyStyles(...)` |
| Edit / Create style | `cuemolui.panels.workspace.onApplyStyle(event)` / `onCreateStyle(event)` | Opens style apply / create dialogs |
| Edit interaction | `cuemolui.panels.workspace.onEditIntr(event)` | Opens interaction list editor |
| Gen surface obj | `cuemolui.panels.workspace.onGenSurfObj(event)` | Generates surface object from isosurf renderer |
| Copy | `cuemolui.panels.workspace.onCopyCmd(event)` | Copies renderer to `qscrend` clipboard |
| New Renderer / Delete / Properties | `onNewCmd` / `onDeleteCmd` / `onPropCmd` | Shared handlers |

#### i18n keys used
- (none — labels hardcoded)

#### Notes
- This is the most heavily-conditional ctx menu: most items depend on the renderer's `type_name` and on its current coloring class (e.g. Paint requires `PaintColoring`).
- The Coloring submenu's "Paint (Secondary str.)" sub-submenu is populated at popup time from `StyleManager.getStyleNamesJSON` filtered by `/Paint$/`.
- The Style submenu shows both type-specific styles and (for non-edge-blocklist types) `/^EgLine/` edge styles, separated by a separator.

---

### `panel.workspace.ctxmenu.rendgroup`

- **File**: `uxp_gui/cuemol2/base/content/workspace_panel.xul` (`<menupopup id="wspcPanelRendGrpCtxtMenu">`)
- **Root element**: `<menupopup>`
- **Title**: n/a
- **Chrome URL**: `chrome://cuemol2/content/workspace_panel.xul`
- **Associated JS**: `workspace_panel_ctxtmenu.js`, `workspace_panel_copipe.js`
- **Overlays applied**: none

#### User-visible features
- Copy / Paste Renderer
- Change Name
- New Renderer
- Delete

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Popup showing | `cuemolui.panels.workspace.onCtxtMenuShowing(event)` (rendgroup branch) | Enables Paste based on `qscrend`/`qscrendary` clipboard |
| Copy | `cuemolui.panels.workspace.onCopyCmd(event)` | Copies group + its renderers to clipboard |
| Paste Renderer | `cuemolui.panels.workspace.onPasteRend(event)` | Pastes a renderer into this group |
| Change Name | `cuemolui.panels.workspace.onPropCmd(event)` (rename branch) | Inline rename |
| New Renderer | `cuemolui.panels.workspace.onNewCmd(event)` | Opens new renderer dialog targeted at this group |
| Delete | `cuemolui.panels.workspace.onDeleteCmd(event)` | Deletes the group + its children |

#### i18n keys used
- (none — labels hardcoded)

#### Notes
- Renderer groups are themselves `Renderer` instances (`RendGroup extends Renderer`) so most handlers are shared with the renderer ctx menu; the group-specific menu is much shorter because coloring / style / paint don't apply to the group container.

---

### `panel.workspace.ctxmenu.camera`

- **File**: `uxp_gui/cuemol2/base/content/workspace_panel.xul` (`<menupopup id="wspcPanelCameraCtxtMenu">`)
- **Root element**: `<menupopup>`
- **Title**: n/a
- **Chrome URL**: `chrome://cuemol2/content/workspace_panel.xul`
- **Associated JS**: `workspace_panel_ctxtmenu.js`
- **Overlays applied**: none

#### User-visible features
- New Camera / Delete / Copy / Paste
- Camera file submenu: Load… / Reload / Save / Save As…
- Save from view / Apply to view
- Save from scene (vis flags) / Apply to scene (vis flags)
- Edit vis flags / Clear vis flags
- Rename
- Properties

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Popup showing | `cuemolui.panels.workspace.onCamCtxtShowing(event)` | Enables Paste based on `qsccam` clipboard; toggles Reload availability based on `cam.src` |
| New / Delete / Copy / Paste | `cuemolui.panels.workspace.onNewCmd` / `onDeleteCmd` / `onCameraCopy` / `onCameraPaste` | Camera CRUD |
| Load / Reload / Save / Save As | `onCamLoadFile` / `onCamReloadFile` / `onCamSaveFile` / `onCamSaveFileAs` | Camera file I/O |
| Save / Apply view | `onLoadSaveCam(event, ...)` | Saves camera from view / applies camera to view |
| Vis flags edit / clear | `onEditVisFlags` / `onClearVisFlags` | Visibility flag dialog |
| Rename | `onRenameCamera(event)` | Atomic destroy + setCamera with new name |
| Properties | `onPropCmd(event)` | Camera property dialog |

#### i18n keys used
- (none — labels hardcoded)

#### Notes
- Cameras are owned by `scene.getCameraInfoJSON()` (not by `getSceneDataJSON`); renaming requires removing the old `Camera` and re-registering a copy with the new name (no name setter).

---

### `panel.workspace.ctxmenu.style`

- **File**: `uxp_gui/cuemol2/base/content/workspace_panel.xul` (`<menupopup id="wspcStyleCtxtMenu">`)
- **Root element**: `<menupopup>`
- **Title**: n/a
- **Chrome URL**: `chrome://cuemol2/content/workspace_panel.xul`
- **Associated JS**: `workspace_panel_ctxtmenu.js`
- **Overlays applied**: none

#### User-visible features
- New Style / Copy / Paste / Delete
- Style file submenu: Load… / Reload / Save / Save As…
- Read-only toggle (`<menuitem type="checkbox">`)
- Rename
- Edit

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Popup showing | `cuemolui.panels.workspace.onStyCtxtShowing(event)` | Enables/disables items based on style-set readonly / src / modified flags; gates copy for global styles |
| Copy / Paste / Delete / Rename | `onCopyStyle` / `onPasteStyle` / `onDeleteCmd` / `onRenameStyle` | StyleSet clipboard + rename |
| Load / Reload / Save / Save As | `onStyLoadFile` / `onStyReloadFile` / `onStySaveFile` / `onStySaveFileAs` | Style file I/O |
| Read-only toggle | `onStyToggleRo(event)` | Flips `styleset.readonly`; disabled when set is modified |
| Edit | `onPropCmd(event)` | Opens style editor |

#### i18n keys used
- (none — labels hardcoded)

#### Notes
- Global styles (`scene_id === 0`) cannot be copied or made writable.
- A modified style set cannot be flipped back to read-only.

---

### `panel.workspace.ctxmenu.multi`

- **File**: `uxp_gui/cuemol2/base/content/workspace_panel.xul` (`<menupopup id="wspcPanelMulCtxtMenu">`)
- **Root element**: `<menupopup>`
- **Title**: n/a
- **Chrome URL**: `chrome://cuemol2/content/workspace_panel.xul`
- **Associated JS**: `workspace_panel_ctxtmenu.js`
- **Overlays applied**: none

#### User-visible features
- Copy (enabled only when the multi-selection contains only renderers)
- Delete
- Show
- Hide

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Popup showing | `cuemolui.panels.workspace.onMulCtxtMenuShowing(event)` | Enables Copy iff every selected node is a renderer |
| Copy | `cuemolui.panels.workspace.onCopyCmd(event)` | Copies multiple renderers to clipboard |
| Delete | `cuemolui.panels.workspace.onDeleteCmd(event)` | Bulk delete |
| Show / Hide | `cuemolui.panels.workspace.onShowHideCmd(event, bShow)` | Bulk visibility toggle wrapped in one undo txn |

#### i18n keys used
- (none — labels hardcoded)

#### Notes
- This menu only appears when the tree has 2+ rows selected; the per-type ctx menus (`...ctxmenu.scene/object/renderer/...`) cover the single-selection case.

---

## Unresolved

このカテゴリで解決できなかった項目:
- なし

## Statistics

- Total entries: 26
- With JS handler: 25 (every entry except `panel.coloring.deck.undef`, which is a static label-only placeholder with no controls)
- With i18n keys: 5 (`panel.coloring.shell`, `panel.coloring.deck.cpk`, `panel.densitymap`, `panel.symmetry`, `panel.workspace.tree`). The other `panel.coloring.deck.*` and `panel.workspace.*` sub-entries share the panel-level title implicitly. `panel.coloring.deck.cpk` is the only deck page that owns its own DTD entries (`&elem.*;`).
- Unresolved: 0

### History
- 2026-04-20: Initial scan (9 entries).
- 2026-05-12: `panel.workspace` split into 9 per-surface sub-entries (tree / toolbar / 7 context menus) so each Notes column tracks a single UI surface. See `mapping/panels.md` for migration status per surface.
- 2026-05-22: `panel.coloring` split into 10 sub-entries (`shell` + 9 `deck.*` pages — undef / solid / multigrad / paint / cpk / rainbow / bfac / elepot / script) so each `<deck>` page and the panel chrome are tracked independently. See `mapping/panels.md` for migration status per surface.
