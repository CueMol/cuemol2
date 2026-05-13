# UXP Inventory — Panel

> Hand-maintained. See [`_spec.md`](./_spec.md) for entry format and
> editing guidance.

- Origin: one-time scan of `uxp_gui/cuemol2/` (2026-04-20)
- Spec: [_spec.md](./_spec.md)
- Entries: 17

## Index

- [`panel.anim`](#panelanim)
- [`panel.btmpanel-holder`](#panelbtmpanel-holder)
- [`panel.coloring`](#panelcoloring)
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

- Total entries: 17
- With JS handler: 17 (every entry references at least one `cuemolui.panels.*` handler)
- With i18n keys: 4 (`panel.coloring`, `panel.densitymap`, `panel.symmetry`, `panel.workspace.tree` — only the tree row owns the `&workspacePanel.*;` DTD entries; the other `panel.workspace.*` sub-entries share the panel title implicitly)
- Unresolved: 0

### History
- 2026-04-20: Initial scan (9 entries).
- 2026-05-12: `panel.workspace` split into 9 per-surface sub-entries (tree / toolbar / 7 context menus) so each Notes column tracks a single UI surface. See `mapping/panels.md` for migration status per surface.
