<!-- AUTO-GENERATED — DO NOT EDIT MANUALLY. See specs/260420_uxpgui_step1_panel.md for generation instructions. -->

# UXP Inventory — Panel

> ⚠️ このファイルは Claude Code による自動生成です。手修正しないでください。
> 再生成する場合は `_spec.md` に従ってください。

- Generated: 2026-04-20
- Source: `uxp_gui/cuemol2/`
- Spec: [_spec.md](./_spec.md)
- Entries: 9

## Index

- [`panel.anim`](#panelanim)
- [`panel.btmpanel-holder`](#panelbtmpanel-holder)
- [`panel.coloring`](#panelcoloring)
- [`panel.densitymap`](#paneldensitymap)
- [`panel.fakedial`](#panelfakedial)
- [`panel.molstruct`](#panelmolstruct)
- [`panel.selection`](#panelselection)
- [`panel.symmetry`](#panelsymmetry)
- [`panel.workspace`](#panelworkspace)

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

### `panel.coloring`

- **File**: `uxp_gui/cuemol2/base/content/coloring-panel.xul`
- **Root element**: `<overlay>`
- **Title**: "Color" (`&coloringPanel.title;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/coloring-panel.xul`
- **Associated JS**: `coloring-panel.js`, `treeview.js`, `object-menulist.js`
- **Overlays applied**: `coloring-deck-paint.xul`, `coloring-deck-cpk.xul`, `coloring-deck-rainbow.xul`, `coloring-deck-bfac.xul`, `coloring-deck-elepot.xul`, `coloring-deck-script.xul`

#### User-visible features
- Renderer selector menulist
- Coloring type dropdown button with menu: Paint coloring (submenu), Solid coloring, CPK coloring, Bfac/Occ coloring, Rainbow coloring, Electrostatic potential, Multi-gradient coloring, Reset to default style
- Deck widget that switches sub-panels per coloring mode:
  - Index 0 (`coloring-deck-undef`): "Coloring isn't supported" message
  - Index 1 (`coloring-deck-unknown`): class name label + default color picker
  - Index 2 (`coloring-deck-multigrad`): label + color map object selector + "Edit color…" button
  - Additional deck pages injected by the six `<?xul-overlay?>` overlays (paint, cpk, rainbow, bfac, elepot, script)
- Side panel toggle menu item

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Coloring type dropdown | `cuemolui.panels.paint.onChgColoring(event)` | Switches active coloring mode, updates deck index |
| Paint coloring submenu showing | `cuemolui.panels.paint.onPaintColShowing(event)` | Populates paint style submenu |
| Default color picker change | `cuemolui.panels.paint.onDefaultColorChanged(event)` | Updates default solid color on renderer |
| Edit color button | `cuemolui.panels.paint.onEditMultiGrad(event)` | Opens multi-gradient editor dialog |
| Panel toggle menu item | `cuemolui.sidepanel.onToggle('coloring-panel')` | Shows/hides the coloring side panel |

#### i18n keys used
- `&coloringPanel.title;` (dtd: `cuemol2.dtd`)

#### Notes
- Six deck sub-pages are dynamically injected at runtime via `<?xul-overlay?>` PIs; the deck panels for cpk, rainbow, bfac, elepot, and script coloring modes come from those overlay files.

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

### `panel.workspace`

- **File**: `uxp_gui/cuemol2/base/content/workspace_panel.xul`
- **Root element**: `<overlay>`
- **Title**: "Scene" (`&workspacePanel.title;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/workspace_panel.xul`
- **Associated JS**: `workspace_panel.js`, `treeview.js`
- **Overlays applied**: none

#### User-visible features
- Scene object/renderer tree (`objectTree`): columns V (visibility toggle) and Name; editable, multi-select, drag-and-drop enabled
- Toolbar buttons: Zoom at, Add, Delete, Property
- **Scene context menu** (`wspcPanelSceneCtxtMenu`): Background color (White/Black), Use color proofing toggle, Paste, Properties
- **Object context menu** (`wspcPanelObjCtxtMenu`): Regenerate surface, Selection submenu (All/Unselect/Invert/Toggle sidechain/Around by-resid/Around/protein/nucleic/water/ligand/sugar/hydrogen), Paint menu (inlined from `color-menu.xul`), Copy Object, Paste Renderer, New Renderer, New Group, Save As, Delete Object, Properties
- **Renderer context menu** (`wspcPanelRendCtxtMenu`): Change sel submenu, Change type submenu, Coloring submenu, Paint menu, Style submenu, Edit style, Create style, Edit interaction list, Generate surface obj, Copy, New Renderer, Delete, Properties
- **Renderer group context menu** (`wspcPanelRendGrpCtxtMenu`): Copy, Paste Renderer, Change Name, New Renderer, Delete
- **Camera context menu** (`wspcPanelCameraCtxtMenu`): New Camera, Delete, Copy, Paste, Camera file (Load/Reload/Save/Save as), Save from view, Apply to view, Save from scene (vis flags), Apply to scene (vis flags), Edit vis flags, Clear vis flags, Rename, Properties
- **Style context menu** (`wspcStyleCtxtMenu`): New Style, Copy, Paste, Delete, Style file (Load/Reload/Save/Save As), Read-only toggle, Rename, Edit
- **Multi-selection context menu** (`wspcPanelMulCtxtMenu`): Copy, Delete, Show, Hide
- Side panel toggle menu item

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Tree drag start | `cuemolui.panels.workspace.onDragStart(event)` | Initiates drag-and-drop for tree items |
| Zoom at button | `cuemolui.panels.workspace.onBtnZoomCmd(event)` | Zooms view to selected object |
| Add button | `cuemolui.panels.workspace.onNewCmd(event)` | Opens new renderer/object dialog |
| Delete button | `cuemolui.panels.workspace.onDeleteCmd(event)` | Deletes selected object or renderer |
| Property button | `cuemolui.panels.workspace.onPropCmd(event)` | Opens property dialog |
| Scene ctx — Background color | `gQm2Main.setBgColor(...)` | Sets scene background color |
| Scene ctx — Color proofing | `gQm2Main.onToggleColProof(event)` | Toggles color proofing mode |
| Scene ctx — Paste | `cuemolui.panels.workspace.onPasteObj(event)` | Pastes copied object into scene |
| Object ctx — selection ops | `cuemolui.panels.workspace.selectMol(...)`, `invertMolSel()`, `toggleSideCh()`, `aroundMolSel(...)` | Various selection commands |
| Object ctx — Paint | `cuemolui.panels.workspace.onPaintMol(event)` | Applies paint color to object |
| Object ctx — Copy Object | `cuemolui.panels.workspace.onCopyCmd(event)` | Copies object to clipboard |
| Object ctx — Paste Renderer | `cuemolui.panels.workspace.onPasteRend(event)` | Pastes renderer onto object |
| Object ctx — New Renderer | `cuemolui.panels.workspace.onNewCmd(event)` | Opens new renderer dialog |
| Object ctx — New Group | `cuemolui.panels.workspace.onNewRendGrp(event)` | Creates renderer group |
| Object ctx — Save As | `cuemolui.panels.workspace.onSaveAsObj(event)` | Saves object to file |
| Object ctx — Regen surface | `cuemolui.panels.workspace.onMolSurfRegen(event)` | Regenerates molecular surface |
| Renderer ctx — Change sel | `cuemolui.panels.workspace.setRendSel(...)` | Changes renderer atom selection |
| Renderer ctx — Change type | `cuemolui.panels.workspace.chgRendType(event)` | Changes renderer type |
| Renderer ctx — Coloring | `cuemolui.panels.workspace.onColoringMol(event)` | Applies coloring style |
| Renderer ctx — Style | `cuemolui.panels.workspace.styleMol(event)` | Applies shape style |
| Renderer ctx — Edit/Create style | `cuemolui.panels.workspace.onApplyStyle(event)` / `onCreateStyle(event)` | Style editing dialogs |
| Renderer ctx — Edit interaction | `cuemolui.panels.workspace.onEditIntr(event)` | Opens interaction list editor |
| Renderer ctx — Gen surface obj | `cuemolui.panels.workspace.onGenSurfObj(event)` | Generates surface object from renderer |
| Camera ctx — New/Delete/Copy/Paste | `cuemolui.panels.workspace.onNewCmd` / `onDeleteCmd` / `onCameraCopy` / `onCameraPaste` | Camera CRUD operations |
| Camera ctx — Load/Reload/Save file | `cuemolui.panels.workspace.onCamLoadFile` / `onCamReloadFile` / `onCamSaveFile` / `onCamSaveFileAs` | Camera file I/O |
| Camera ctx — Save/Apply view | `cuemolui.panels.workspace.onLoadSaveCam(event, ...)` | Saves camera from / applies to view |
| Camera ctx — Vis flags | `cuemolui.panels.workspace.onEditVisFlags` / `onClearVisFlags` | Visibility flag management |
| Camera ctx — Rename | `cuemolui.panels.workspace.onRenameCamera(event)` | Renames camera |
| Style ctx — copy/paste/delete/rename | `cuemolui.panels.workspace.onCopyStyle` / `onPasteStyle` / `onDeleteCmd` / `onRenameStyle` | Style clipboard and rename |
| Style ctx — Load/Reload/Save file | `cuemolui.panels.workspace.onStyLoadFile` / `onStyReloadFile` / `onStySaveFile` / `onStySaveFileAs` | Style file I/O |
| Style ctx — Read-only toggle | `cuemolui.panels.workspace.onStyToggleRo(event)` | Toggles style read-only flag |
| Multi-select ctx — Show/Hide | `cuemolui.panels.workspace.onShowHideCmd(event, ...)` | Bulk show/hide of selected items |
| Panel toggle menu item | `cuemolui.sidepanel.onToggle('workspace-panel')` | Shows/hides the workspace side panel |

#### i18n keys used
- `&workspacePanel.title;` (dtd: `cuemol2.dtd`)
- `&workspacePanel.object_tree.name;` (dtd: `cuemol2.dtd`)

#### Notes
- Object and renderer context menus use `#include color-menu.xul` (XUL preprocessor directive) to inline the color picker menu at build time; this is not a runtime overlay.
- This is the central scene management panel; it has by far the most context menu items of any panel.
- Context menu item states are controlled by `onCtxtMenuShowing` / `onRendCtxtMenuShowing` / `onCamCtxtShowing` / `onStyCtxtShowing` handlers registered per context menu.

---

## Unresolved

このカテゴリで解決できなかった項目:
- なし

## Statistics

- Total entries: 9
- With JS handler: 9
- With i18n keys: 4 (`panel.coloring`, `panel.densitymap`, `panel.symmetry`, `panel.workspace`)
- Unresolved: 0
