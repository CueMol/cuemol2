# UXP Inventory — Dialog_tool

> ⚠️ このファイルは Claude Code による自動生成です。手修正しないでください。
> 再生成する場合は `_spec.md` に従ってください。

- Generated: 2026-04-20
- Source: `uxp_gui/cuemol2/base/content/tools/`
- Spec: [_spec.md](./_spec.md)
- Entries: 21

## Index

- [`dialog.tool.aintr-edit`](#dialogtoolaintr-edit)
- [`dialog.tool.apbs-calcpot`](#dialogtoolapbs-calcpot)
- [`dialog.tool.bond-edit`](#dialogtoolbond-edit)
- [`dialog.tool.chg-chname`](#dialogtoolchg-chname)
- [`dialog.tool.chg-resindex`](#dialogtoolchg-resindex)
- [`dialog.tool.intr-tool`](#dialogtoolintr-tool)
- [`dialog.tool.makesurf`](#dialogtoolmakesurf)
- [`dialog.tool.mol-delete`](#dialogtoolmol-delete)
- [`dialog.tool.mol-merge`](#dialogtoolmol-merge)
- [`dialog.tool.molclient-tools`](#dialogtoolmolclient-tools)
- [`dialog.tool.morphanim-tool`](#dialogtoolmorphanim-tool)
- [`dialog.tool.msms-makesurf`](#dialogtoolmsms-makesurf)
- [`dialog.tool.multigrad-editor`](#dialogtoolmultigrad-editor)
- [`dialog.tool.netpdb-progress`](#dialogtoolnetpdb-progress)
- [`dialog.tool.open-pdb`](#dialogtoolopen-pdb)
- [`dialog.tool.prot2ndry-tool`](#dialogtoolprot2ndry-tool)
- [`dialog.tool.render-pov`](#dialogtoolrender-pov)
- [`dialog.tool.ssm-sup`](#dialogtoolssm-sup)
- [`dialog.tool.surf-cutbyplane`](#dialogtoolsurf-cutbyplane)
- [`dialog.tool.symm-chg`](#dialogtoolsymm-chg)
- [`dialog.tool.visflagset-edit`](#dialogtoolvisflagset-edit)

---

## Entries

### `dialog.tool.aintr-edit`

- **File**: `uxp_gui/cuemol2/base/content/tools/aintr-edit-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Edit interaction list" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/aintr-edit-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `treeview.js`, `aintr-edit-dlg.js`
- **Overlays applied**: none

#### User-visible features
- Mol name label (read-only display)
- Interaction list tree with columns: Rend/Atom0, Atom1, Atom2, Atom3
- Delete toolbar button

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gDlgObj.onDialogAccept(event)` | Commits edits to the interaction list |
| Delete button (delete-btn) | unknown | Deletes selected interaction entry |

#### i18n keys used
- none

#### Notes
- Delete button has no `oncommand` in XUL; handler is in `aintr-edit-dlg.js`.

---

### `dialog.tool.apbs-calcpot`

- **File**: `uxp_gui/cuemol2/base/content/tools/apbs-calcpot.xul`
- **Root element**: `<dialog>`
- **Title**: "APBS tool" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/apbs-calcpot.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `molsellist.js`, `apbs-calcpot.js`
- **Overlays applied**: none

#### User-visible features
- APBS executable path textbox with "Change ..." browse button
- Target molecule selector
- Optional atom selection with enable checkbox
- Electrostatic potential object name textbox
- Charge calculation method radio group: Use PDB2PQR (with pdb2pqr.py path and force field selector) or Use internal method (with hydrogen atoms option)
- APBS options: solve non-linear PBE checkbox, temperature, max grid size, water dielectric, protein dielectric

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `gDlgObj.onStartStop2(event)` | Starts/stops APBS calculation |
| APBS exe path "Change ..." | `gDlgObj.onApbsExePath()` | Opens file browser for APBS executable |
| Selection checkbox | `gDlgObj.onSelChk()` | Enables/disables selection input |
| Charge method radio | `gDlgObj.onChgMthSel(event.target.id)` | Switches charge method UI |
| pdb2pqr "Change ..." | `gDlgObj.onPdb2PqrPath()` | Opens file browser for pdb2pqr.py |

#### i18n keys used
- none

#### Notes
- Dialog does not close on accept (`return false`); designed for start/stop workflow.

---

### `dialog.tool.bond-edit`

- **File**: `uxp_gui/cuemol2/base/content/tools/bond-edit-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Edit non-standard bonds" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/bond-edit-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `treeview.js`, `object-menulist.js`, `bond-edit-dlg.js`
- **Overlays applied**: none

#### User-visible features
- Molecule selector menulist
- Bond list tree with columns: Atom0, Atom1
- Delete toolbar button
- Atom1 / Atom2 textbox pair with Add toolbar button for adding bonds

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gDlgObj.onDialogAccept(event)` | Commits bond edits |
| Delete button (delete-btn) | unknown | Deletes selected bond |
| Add button (add-btn) | unknown | Adds a bond between Atom1 and Atom2 |

#### i18n keys used
- none

#### Notes
- `bond-edit-dlg.js` is referenced by relative URL (not full chrome URL), located in the same `tools/` directory.
- Delete/Add button handlers are not specified in XUL; defined in JS.

---

### `dialog.tool.chg-chname`

- **File**: `uxp_gui/cuemol2/base/content/tools/chg_chname.xul`
- **Root element**: `<dialog>`
- **Title**: "Change chain ID" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/chg_chname.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `molsellist.js`, `chg_chname.js`
- **Overlays applied**: none

#### User-visible features
- Molecule selector
- Atom selection input (molsellist with inline error label)
- New chain ID textbox (single character)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gChgChnmDlg.onDialogAccept()` | Applies chain ID change |

#### i18n keys used
- none

---

### `dialog.tool.chg-resindex`

- **File**: `uxp_gui/cuemol2/base/content/tools/chg_resindex.xul`
- **Root element**: `<dialog>`
- **Title**: "Change residue index" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/chg_resindex.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `molsellist.js`, `chg_resindex.js`
- **Overlays applied**: none

#### User-visible features
- Molecule selector
- Atom selection input (molsellist with inline error label)
- Radio group: "Shift by:" (with numeric input) or "Start from:" (with numeric input)
- "Renumber" checkbox

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gChgResIndDlg.onDialogAccept()` | Applies residue index change |

#### i18n keys used
- none

---

### `dialog.tool.intr-tool`

- **File**: `uxp_gui/cuemol2/base/content/tools/intr-tool-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Interaction analysis" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/intr-tool-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `molsellist.js`, `intr-tool.js`
- **Overlays applied**: none

#### User-visible features
- Primary molecule selector and selection 1 input (molsellist)
- Optional second molecule with checkbox and selector
- Optional second selection with checkbox and molsellist
- Min distance (Å) numeric input
- Max distance (Å) numeric input
- Max labels numeric input
- "Hydrogen bond (N, O) only" checkbox
- Renderer name editable menulist

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gDlg.onDialogAccept()` | Runs interaction analysis |

#### i18n keys used
- none

#### Notes
- JS instantiation inline: `window.gDlg = new cuemolui.IntrTool();`

---

### `dialog.tool.makesurf`

- **File**: `uxp_gui/cuemol2/base/content/tools/makesurf.xul`
- **Root element**: `<dialog>`
- **Title**: "Mol surface tool" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/makesurf.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `molsellist.js`, `makesurf.js`
- **Overlays applied**: none

#### User-visible features
- Target molecule selector
- Optional atom selection with enable checkbox (molsellist)
- Surface object name textbox
- Point density numeric input (/Å)
- Probe radius numeric input (Å, default 1.4)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gDlgObj.onDialogAccept(event)` | Creates solvent-excluded surface |
| Selection checkbox | `window.gDlgObj.onSelChk(event)` | Enables/disables selection input |

#### i18n keys used
- none

#### Notes
- `makesurf.js` is referenced by relative URL; located in the same `tools/` directory.
- Uses built-in surface calculation (as opposed to `dialog.tool.msms-makesurf` which uses the external MSMS program).

---

### `dialog.tool.mol-delete`

- **File**: `uxp_gui/cuemol2/base/content/tools/mol_delete.xul`
- **Root element**: `<dialog>`
- **Title**: "Delete mol atoms" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/mol_delete.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `molsellist.js`, `mol_delete.js`
- **Overlays applied**: none

#### User-visible features
- Molecule selector
- Atom selection input (molsellist with inline error label)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gMolDelDlg.onDialogAccept()` | Deletes selected atoms from molecule |

#### i18n keys used
- none

---

### `dialog.tool.mol-merge`

- **File**: `uxp_gui/cuemol2/base/content/tools/mol_merge.xul`
- **Root element**: `<dialog>`
- **Title**: "Merge molecule" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/mol_merge.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `molsellist.js`, `mol_merge.js`
- **Overlays applied**: none

#### User-visible features
- "From" groupbox: source molecule selector and atom selection (molsellist)
- "To" groupbox: destination molecule selector
- "Copy" checkbox (if unchecked, atoms are moved)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gMolMrgDlg.onDialogAccept()` | Merges (or copies) atoms between molecules |

#### i18n keys used
- none

---

### `dialog.tool.molclient-tools`

- **File**: `uxp_gui/cuemol2/base/content/tools/molclient-tools-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "MolClient tools" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/molclient-tools-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `molclient-tools-dlg.js`
- **Overlays applied**: none

#### User-visible features
- MolServer URL textbox (default: `http://127.0.0.1:8000/RPC2`)
- SMILES string textbox
- Mol name textbox

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `gDlgObj.onDialogAccept(event)` | Sends SMILES to MolServer and creates molecule |

#### i18n keys used
- none

#### Notes
- `molclient-tools-dlg.js` is referenced by relative URL.
- The label says "Cut molecular surface by the current clipping plane" but the actual controls are for a MolServer XMLRPC call — likely a copy-paste artifact in the XUL label.

---

### `dialog.tool.morphanim-tool`

- **File**: `uxp_gui/cuemol2/base/content/tools/morphanim-tool-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Morph animation tool" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/morphanim-tool-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `treeview.js`, `morphanim-tool.js`
- **Overlays applied**: none

#### User-visible features
- Molecule list tree with columns: Name, Source
- Delete toolbar button
- Add toolbar button with menu: "Add PDB file...", "Add MolCoord..."

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gDlg.onDialogAccept()` | Applies morph animation setup |
| Delete button | `window.gDlg.onDelete(event)` | Removes selected molecule from list |
| Add button | `window.gDlg.onAdd(event)` | Adds a molecule (PDB file or MolCoord) to the list |

#### i18n keys used
- none

#### Notes
- JS instantiation inline: `window.gDlg = new cuemolui.MorphAnimTool();`
- Move up/move down buttons are present in XUL but commented out.

---

### `dialog.tool.msms-makesurf`

- **File**: `uxp_gui/cuemol2/base/content/tools/msms-makesurf.xul`
- **Root element**: `<dialog>`
- **Title**: "Mol surface tool" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/msms-makesurf.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `molsellist.js`, `msms-makesurf.js`
- **Overlays applied**: none

#### User-visible features
- MSMS executable path textbox with "Change ..." browse button
- Target molecule selector
- Optional atom selection with enable checkbox (molsellist)
- Surface object name textbox
- Point density numeric input (/Å)
- Probe radius numeric input (Å, default 1.4)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gDlgObj.onDialogAccept(event)` | Creates surface using external MSMS program |
| MSMS exe "Change ..." | `window.gDlgObj.onMsmsExePath()` | Opens file browser for MSMS executable |
| Selection checkbox | `window.gDlgObj.onSelChk(event)` | Enables/disables selection input |

#### i18n keys used
- none

#### Notes
- Functionally similar to `dialog.tool.makesurf` but invokes the external MSMS binary rather than the built-in algorithm.
- Title is identical to `dialog.tool.makesurf` ("Mol surface tool"); distinguish by dialog ID `msms-makesurf-dialog`.

---

### `dialog.tool.multigrad-editor`

- **File**: `uxp_gui/cuemol2/base/content/tools/multigrad_editor.xul`
- **Root element**: `<dialog>`
- **Title**: "Multi-gradient editor" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/multigrad_editor.xul`
- **Associated JS**: `cuemol2-utils.js`, `treeview.js`, `colpicker.js`, `multigrad_editor.js`
- **Overlays applied**: none

#### User-visible features
- Histogram canvas (`<html:canvas>`)
- SVG linear gradient preview bar with Min/Max labels
- Gradient stop tree (columns: Param, Color)
- Add / Delete / Delete-all toolbar buttons
- "Keep ratio" toggle button
- "Load preset" menu button (Rainbow, ResMap, HeatMap)
- Param (numeric) and color picker edit row
- Three dialog buttons: Preview (extra1), OK (accept), Cancel

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `gMain.onDialogAccept(event)` | Applies the gradient definition |
| Preview button (extra1) | `gMain.onPreview(event)` | Renders a live preview of the gradient |
| Cancel button | `gMain.onDialogCancel(event)` | Discards changes |
| Add button | `gMain.onAddNode(event)` | Adds a gradient stop |
| Delete button | `gMain.onDelNode(event)` | Removes selected gradient stop |
| Delete all button | `gMain.onDelAllNodes(event)` | Removes all gradient stops |
| Load preset menu | `window.gMain.onPresetSel(event)` | Loads a built-in gradient preset |

#### i18n keys used
- none

---

### `dialog.tool.netpdb-progress`

- **File**: `uxp_gui/cuemol2/base/content/tools/netpdb-progress-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "PDB Download" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/netpdb-progress-dlg.xul`
- **Associated JS**: none (all logic is inline `<script>` inside the XUL)
- **Overlays applied**: none

#### User-visible features
- Progress meter (undetermined mode)
- Status description label showing byte count or status message

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Dialog load | `gProgDlg.init()` | Initializes progress listener from `window.arguments[0]` |
| Cancel button | `gProgDlg.onCancel()` | Calls `forceCancel()` on the listener |

#### i18n keys used
- none

#### Notes
- All JS is inline CDATA — no external `.js` file.
- Progress is pushed by caller via `showProgress(aLen)` callback, not polled.
- `window.arguments[0]` must be a factory function that returns a listener object.

---

### `dialog.tool.open-pdb`

- **File**: `uxp_gui/cuemol2/base/content/tools/openPDB.xul`
- **Root element**: `<dialog>`
- **Title**: "Download PDB" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/openPDB.xul`
- **Associated JS**: `cuemol2-utils.js`, `openPDB.js`
- **Overlays applied**: none

#### User-visible features
- PDB ID editable menulist (retains history)
- Coordinates groupbox: "Fetch pdb file" checkbox and server selector (RCSB CIF, RCSB PDB)
- Density maps groupbox: 2Fo-Fc / Fo-Fc fetch checkboxes and map server selector (RCSB, EBI)
- Result text description label

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `gPdbDlg.onFind()` | Initiates PDB download |
| Dialog load | `gPdbDlg.init()` | Initializes dialog state |

#### i18n keys used
- none

---

### `dialog.tool.prot2ndry-tool`

- **File**: `uxp_gui/cuemol2/base/content/tools/prot2ndry-tool-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Protein secondary str tool" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/prot2ndry-tool-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `molsellist.js`, `object-menulist.js`, `prot2ndry-tool.js`
- **Overlays applied**: none

#### User-visible features
- Target molecule selector
- Radio group with two modes:
  - "Recalc secondary str": ignore β bulge checkbox, helix gap-fill angle checkbox + numeric input
  - "Assign by selection": atom selection input, secondary structure type selector (Coil, β strand, α helix, 3-10 helix, π helix)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gDlg.onDialogAccept()` | Recalculates or assigns secondary structure |

#### i18n keys used
- none

#### Notes
- JS instantiation inline: `window.gDlg = new cuemolui.Prot2ndryTool();`

---

### `dialog.tool.render-pov`

- **File**: `uxp_gui/cuemol2/base/content/tools/render-pov-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "POV-Ray rendering" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/render-pov-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `render-pov-dlg.js`
- **Overlays applied**: none

#### User-visible features
- Tabbox with two tabs:
  - **Main options**: image size (W, H, unit, DPI, preset), projection (Perspective/Orthographic), stereo mode + depth, CPU thread count, transparent background, clipping plane, post-render alpha blending, edge lines, pixel labels
  - **POV-Ray options**: povray exe path, povray include path, radiosity mode selector, lighting (shadow, spread, intensity, flash fraction, ambient fraction)
- Result groupbox with rendered image preview (richlistbox + `<image>`), zoom controls, progress meter
- Four dialog buttons: Render (accept), Save image (extra1), Copy to clipboard (extra2), Close (cancel)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Render button (accept) | `window.gDlgObj.onStartStopRender()` | Starts or stops POV-Ray rendering |
| Save image (extra1) | `window.gDlgObj.onSaveImage()` | Saves rendered image to file |
| Copy to clipboard (extra2) | `window.gDlgObj.onCopyImage()` | Copies rendered image to clipboard |
| Close (cancel) | `window.gDlgObj.onCloseEvent(null)` | Closes dialog (with guard) |
| Image size unit selector | `window.gDlgObj.onImgSzUnitSel(event)` | Converts W/H values to selected unit |
| Preset size menu | `window.gDlgObj.onPresetSel(event)` | Fills in preset image dimensions |
| POV exe "Change ..." | `window.gDlgObj.onPovExePath()` | Opens file browser for POV-Ray binary |
| POV inc "Change ..." | `window.gDlgObj.onPovIncPath()` | Opens file browser for POV-Ray include path |

#### i18n keys used
- none

#### Notes
- `render-pov-dlg.js` is referenced by relative URL.
- Accept does not close the dialog (`return false`); designed for async start/stop workflow.
- `tabpanels-overlay-target` and `tabs-overlay-target` IDs suggest tab overlays may be applied by external files, but no `<?xul-overlay?>` PI is present in this file.
- Window size is persisted via `persist="screenX screenY width height"`.

---

### `dialog.tool.ssm-sup`

- **File**: `uxp_gui/cuemol2/base/content/tools/ssm_sup.xul`
- **Root element**: `<dialog>`
- **Title**: "Molecular superposition" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/ssm_sup.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `molsellist.js`, `ssm_sup.js`
- **Overlays applied**: none

#### User-visible features
- Algorithm radio group: Least Square Fitting (LSQ) or Secondary Structure Matching (SSM)
- Reference groupbox: molecule selector and selection input (molsellist)
- Moving groupbox: molecule selector and selection input (molsellist)
- "Auto recenter" checkbox
- "Write RMSD info file" checkbox
- "Use xformMat property" checkbox

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gSSMSupDlg.onDialogAccept()` | Runs structural superposition |

#### i18n keys used
- none

---

### `dialog.tool.surf-cutbyplane`

- **File**: `uxp_gui/cuemol2/base/content/tools/surf-cutbyplane.xul`
- **Root element**: `<dialog>`
- **Title**: "MolSurf cutting tool" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/surf-cutbyplane.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `surf-cutbyplane.js`
- **Overlays applied**: none

#### User-visible features
- Target surface selector (MolSurf objects)
- Cross section type menulist (Complete / Separately / Section only / No section)
- Section mesh density numeric input (/Å)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `gDlgObj.onDialogAccept(event)` | Cuts surface at current clipping plane |

#### i18n keys used
- none

#### Notes
- `surf-cutbyplane.js` is referenced by relative URL.

---

### `dialog.tool.symm-chg`

- **File**: `uxp_gui/cuemol2/base/content/tools/symm-chg-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Change symmetry" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/symm-chg-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `object-menulist.js`, `molsellist.js`, `symm-chg-dlg.js`
- **Overlays applied**: none

#### User-visible features
- Symmetry groupbox: crystal system selector, space group selector (populated dynamically), "Biomolecules only" checkbox, space group number (read-only)
- Cell dimension groupbox: "Restrict by symmetry" checkbox, a/b/c cell lengths and α/β/γ angles (numeric inputs)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | unknown | Applies symmetry change; handler defined in `symm-chg-dlg.js` |

#### i18n keys used
- none

#### Notes
- `symm-chg-dlg.js` is referenced by relative URL.
- No `ondialogaccept` attribute in XUL; accept handler is wired in JS.

---

### `dialog.tool.visflagset-edit`

- **File**: `uxp_gui/cuemol2/base/content/tools/visflagset-edit-dlg.xul`
- **Root element**: `<dialog>`
- **Title**: "Edit visibility flags" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/visflagset-edit-dlg.xul`
- **Associated JS**: `cuemol2-utils.js`, `treeview.js`, `visflagset-edit-dlg.js`
- **Overlays applied**: none

#### User-visible features
- Visibility settings tree (editable): columns Inc (checkbox), Obj/Rend (name), Vis (visibility state)
- Inline CSS overrides for tree checkbox appearance (uses `-moz-tree-checkbox` pseudo-element)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Accept button | `window.gDlgObj.onDialogAccept(event)` | Applies visibility flag changes |

#### i18n keys used
- none

#### Notes
- Window size is persisted via `persist="screenX screenY width height"`.
- Inline CSS uses Mozilla-specific `treechildren::-moz-tree-checkbox` pseudo-elements, which have no UXP equivalent.

---

## Unresolved

このカテゴリで解決できなかった項目:
- (なし)

## Statistics

- Total entries: 21
- With JS handler: 21
- With i18n keys: 0
- Unresolved: 0
