# UXP Inventory — Custom Widget

> ⚠️ このファイルは Claude Code による自動生成です。手修正しないでください。
> 再生成する場合は `_spec.md` に従ってください。

- Generated: 2026-04-20
- Source: `uxp_gui/cuemol2/`
- Spec: [_spec.md](./_spec.md)
- Entries: 13

## Index

- [`widget.wheelbtn`](#widgetwheelbtn)
- [`widget.numslider`](#widgetnumslider)
- [`widget.colorslider`](#widgetcolorslider)
- [`widget.colpicker`](#widgetcolpicker)
- [`widget.mainview`](#widgetmainview)
- [`widget.molsellist`](#widgetmolsellist)
- [`widget.paintpanel`](#widgetpaintpanel)
- [`widget.selection-widget`](#widgetselection-widget)
- [`widget.sidepanelholder`](#widgetsidepanelholder)
- [`widget.camerasel`](#widgetcamerasel)
- [`widget.anim-slider`](#widgetanim-slider)
- [`widget.multiselect`](#widgetmultiselect)
- [`widget.timeedit`](#widgettimeedit)

---

## Entries

### `widget.wheelbtn`

- **File**: `uxp_gui/cuemol2/base/content/wheelbtn-bindings.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown` (XBL binding; no visible title)
- **Chrome URL**: `chrome://cuemol2/content/wheelbtn-bindings.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Wheel/dial-style toolbar button (`xul:toolbarbutton`, anonid=`wheel-widget`)
- Renders as a button that responds to vertical mouse drag to emulate a rotary control
- Accumulates drag distance in `mWheelCnt`; fires a custom value-change event to consumers

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `mousedown` (button=0) | inline | Starts drag tracking; records initial Y position |
| `mouseup` (button=0) | inline | Ends drag; fires value-change event |
| `mouseover` | inline | Updates hover state |
| `mouseout` | inline | Clears hover state |
| (method) | `mouseMoved(event)` | Computes delta-Y and increments `mWheelCnt` |

#### i18n keys used
- none

#### Notes
- Pure XBL widget; no external JS or DTD.
- Migration: replace with a React component exposing an `onWheelChange` callback.

---

### `widget.numslider`

- **File**: `uxp_gui/cuemol2/base/content/numslider-binding.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown`
- **Chrome URL**: `chrome://cuemol2/content/numslider-binding.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Horizontal slider (`xul:scale`) paired with a numeric text input (`xul:textbox type="number"`) and optional label
- Two bindings: `numslider-core` (extends `scale.xml#scale`) and `numslider` (composite)
- Exposed properties: `value`, `min`, `max`, `disabled`

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Scale change | `onSliChanged(aEvent)` | Updates textbox when slider position changes |
| Textbox change | `onBoxChanged(aEvent)` | Updates slider when user types a number |
| (internal) | `valueChanged(which, newValue, userChanged)` | Overrides XBL `scale` callback |
| (internal) | `dragStateChanged(isDragging)` | Fires drag-start / drag-end events |
| (internal) | `convToScaleVal(val)` / `convFromScaleVal(val)` | Maps between widget value and scale position |

#### i18n keys used
- none

#### Notes
- `numslider-core` extends `chrome://global/content/bindings/scale.xml#scale`; this XBL base is removed in Firefox 75+.
- `mTickMode` controls discrete vs. continuous stepping.

---

### `widget.colorslider`

- **File**: `uxp_gui/cuemol2/base/content/colorSlider.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown`
- **Chrome URL**: `chrome://cuemol2/content/colorSlider.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Color gradient slider: SVG `<linearGradient>` rendered behind a `<slider>` / `<thumb>`
- Hue mode: full rainbow gradient; linear mode: start-color → end-color gradient
- Two bindings: `colslicore` (extends `scale.xml#scale`) and `colorslider` (composite)
- Exposed properties: `value`, `min`, `max`, `increment`, `pageIncrement`, `startColor`, `endColor`

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (internal) | `valueChanged(which, newValue, userChanged)` | Overrides scale callback; fires custom event |
| (internal) | `dragStateChanged(isDragging)` | Fires drag-start / drag-end events |
| (method) | `setHueMode()` | Switches gradient to full hue spectrum |
| (method) | `setLinerMode()` | Switches gradient to linear startColor→endColor |
| (method) | `setHueGrad(aAnonID, aHTMLValue)` | Updates SVG gradient stops for hue mode |
| (method) | `decrease()` / `increase()` | Steps value by `increment` |
| (method) | `decreasePage()` / `increasePage()` | Steps value by `pageIncrement` |

#### i18n keys used
- none

#### Notes
- SVG gradient is inlined in XBL `<content>`; relies on XBL anonymous content rendering.
- `colslicore` extends the global `scale.xml#scale` XBL binding.

---

### `widget.colpicker`

- **File**: `uxp_gui/cuemol2/base/content/colpicker-bindings.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown`
- **Chrome URL**: `chrome://cuemol2/content/colpicker-bindings.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Color picker composite widget: text input + dropdown button opening a panel
- Panel contains: RGB/HSV/named-color mode grid, three `colorslider` instances, listbox for named colors, resizer handle
- Exposed properties: `type` (color model mode), `disabled`

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Constructor | `cuemolui.ColorPicker` init | Attaches external JS controller to the binding |
| (method) | `setColorText(aValue)` / `getColorText()` | Get/set color as CSS string |
| (method) | `setColorObj(aValue)` / `getColorObj()` | Get/set color as a cuemol color object |
| (method) | `setTargetSceneID(aValue)` | Binds widget to a specific scene |
| (method) | `setParentUpdate(aValue)` | Registers parent update callback |

#### i18n keys used
- none

#### Notes
- Color-model logic lives in `cuemolui.ColorPicker` (external JS module); XBL shell delegates to it.
- Depends on `widget.colorslider` (`xul:colorslider` element used internally).

---

### `widget.mainview`

- **File**: `uxp_gui/cuemol2/base/content/mainViewBindings.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown`
- **Chrome URL**: `chrome://cuemol2/content/mainViewBindings.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Multi-tab GL view container (`tabmolview`): `xul:tabbox` with `xul:tabs` + `xul:tabpanels`
- Each tab hosts one OpenGL viewport; tabs are drag-reorderable
- Tab header shows scene/view label, close button, and context menu (`xul:toolbarbutton` + `xul:menupopup`)
- Three bindings: `tabmolview` (container), `tabmolview-tabs` (tab strip), `tabmolview-tab` (individual tab)
- Camera state exposed: `rotQuat`, `viewCenter`, `zoom`, `slab`, `distance`

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (method) | `addMolViewTab(aScID, aVwID)` | Adds a new viewport tab for the given scene/view |
| (method) | `removeTab(aTab)` / `removeAllTabs()` | Removes one or all viewport tabs |
| (method) | `bindMolViewTab(aTabIndex, aScID, aVwID)` | Associates an existing tab slot with a scene/view |
| (method) | `moveTabTo(aTab, aInd)` | Reorders a tab to the given index |
| (method) | `rotateView(x,y,z)` | Rotates the current viewport |
| (method) | `translateView(x,y,z,bDrag)` | Translates the current viewport |
| (method) | `zoomView(x)` / `slabView(x)` | Zooms / adjusts slab of current viewport |
| `dragstart` / `dragover` / `drop` / `dragend` | inline (tabmolview-tabs) | Tab reorder via drag-and-drop |
| `mousedown` (multiple buttons) | inline (tabmolview-tab) | Tab selection; middle-click close |

#### i18n keys used
- none

#### Notes
- `currentNativeWidget` property returns the raw OpenGL canvas element.
- Critical migration target: this is the core viewport container of the entire application.

---

### `widget.molsellist`

- **File**: `uxp_gui/cuemol2/base/content/molsellist-bindings.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown`
- **Chrome URL**: `chrome://cuemol2/content/molsellist-bindings.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Editable `menulist` dropdown for molecule selection; shows scene molecules as menu items
- Supports typed selection expressions with browseable history
- Exposed properties: `sceneID`, `molID`, `origSel`, `selectedSel`, `disabled`, `textBoxSize`

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Constructor | `cuemolui.MolSelList` init | Attaches external JS controller managing scene mol list |
| (method) | `buildBox()` | Rebuilds dropdown items from current scene |
| (method) | `appendSelJSON(aElem, aJson)` | Appends a JSON-encoded selection entry to the list |
| (method) | `addHistorySel()` | Adds current selection expression to history |

#### i18n keys used
- none

#### Notes
- Controller logic lives in `cuemolui.MolSelList` (external JS module).
- `mSelErrBox` property holds a reference to an error display element.

---

### `widget.paintpanel`

- **File**: `uxp_gui/cuemol2/base/content/paintpanel-bindings.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown`
- **Chrome URL**: `chrome://cuemol2/content/paintpanel-bindings.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Rich list item bindings for a paint-mode property panel
- Four bindings: `paintlistitem-base`, `paintlistitem`, `paintlistitem-selected`, `paintprop-listitem-icon`
- Each item renders an icon (`xul:image`), a label, and a type selector (`xul:menulist`)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Constructor (`paintlistitem`) | inline | Initialises list item state from bound data |
| Constructor (`paintlistitem-selected`) | inline | Initialises the selected-state variant |
| (method) | `test()` (paintprop-listitem-icon) | Utility method on icon element |

#### i18n keys used
- none

#### Notes
- Item-level XBL bindings used inside a `richlistbox`; not standalone widgets.
- `type` property on `paintlistitem-base` identifies the paint entry kind (solid, gradient, etc.).

---

### `widget.selection-widget`

- **File**: `uxp_gui/cuemol2/base/content/selection-widget-bindings.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown`
- **Chrome URL**: `chrome://cuemol2/content/selection-widget-bindings.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Rich-list item bindings for building structured molecular selections
- Five bindings: `molselitem-hier` (hierarchy node), `molselitem-term` (terminal term), `molselitem-around` (around-clause), `molsel-boolop` (Boolean operator control), `molsel-noop` (no-op placeholder)
- `molselitem-hier`: chain/residue hierarchy selector with `menulist` + `textbox`
- `molselitem-term`: terminal selection term with command `menulist` + args `deck`
- `molsel-boolop`: AND/OR/NOT selector `menulist`

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `onpopupshowing` | `onChainListPopupShowing(aElem)` | Populates chain list from scene data |
| `onpopupshowing` | `onAnameListPopupShowing(aElem)` | Populates atom-name list from scene data |
| `oncommand` / `onselect` | `setupArgs(aEvent)` | Updates the args deck for the chosen command |

#### i18n keys used
- none

#### Notes
- Item-level bindings used inside the `richlistbox` in the Selection panel.
- Exposed properties: `boolop`, `chainName`, `residIndex`, `atomName`, `commandName`, `commandArgs`, `value`.

---

### `widget.sidepanelholder`

- **File**: `uxp_gui/cuemol2/base/content/sidepanelholder-bindings.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown`
- **Chrome URL**: `chrome://cuemol2/content/sidepanelholder-bindings.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Side-panel infrastructure: four bindings — `sidepanelbar` (collapsible panel title bar), `sidepanelholder` (panel container), `color-menuitem` (iconic menu item), `tlbtn-repeat` (repeating toolbar button)
- `sidepanelbar`: hbox with collapse/close buttons, drag handle, and title label
- `sidepanelholder`: vbox container that accepts panel registrations and handles drag-drop reordering

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (method) | `onClickCollapse()` | Collapses or expands the panel bar |
| (method) | `onClickClose()` | Hides the panel |
| (method) | `onDragStart(aEvent)` | Initiates panel drag for reorder |
| (method) | `onClickTitle(aEvent)` | Toggles panel expansion on title click |
| (method) | `registerPanel(aPanel)` | Registers a side panel into the holder |
| (method) | `realize()` | Finalises panel layout after all panels are registered |
| (method) | `saveSession(aName)` / `loadSession(aName)` | Persist / restore panel layout to/from session storage |
| (method) | `restoreDefault()` | Resets panel arrangement to the default |
| `dragover` / `dragleave` / `drop` | inline (sidepanelholder) | Accepts panel drag-and-drop reorder |

#### i18n keys used
- none

#### Notes
- `color-menuitem` and `tlbtn-repeat` are utility bindings bundled in this file; they extend global XBL bindings.
- `setBarImpl(aImpl)` wires the JS panel controller to the XBL bar element.

---

### `widget.camerasel`

- **File**: `uxp_gui/cuemol2/base/content/camerasel-binding.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown`
- **Chrome URL**: `chrome://cuemol2/content/camerasel-binding.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Editable `menulist` for selecting a named camera from the current scene
- Dynamically populated and kept in sync with scene camera add/remove events
- Exposed properties: `sceneID`, `value`, `disabled`

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Constructor | inline | Registers `unload` listener; calls `_attachScene()` |
| Destructor | `_detachScene()` | Detaches scene event listener on unload |
| Scene event | `_onQsysEvent(args)` | Responds to scene object add/remove events |
| (method) | `_buildContents()` | Rebuilds menu items from current scene cameras |
| (method) | `_selectItem(aValue)` | Selects the menu item matching `aValue` |
| (method) | `_removeItem(aValue)` | Removes a camera entry from the menu |
| `select` | `_onSelect(aEvent)` | Fires when user picks a camera from the list |

#### i18n keys used
- none

#### Notes
- One of the few XBL bindings with both a constructor and a destructor for scene lifecycle management.
- `value` reflects the selected camera name as a string.

---

### `widget.anim-slider`

- **File**: `uxp_gui/cuemol2/base/content/anim/anim-slider-bindings.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown`
- **Chrome URL**: `chrome://cuemol2/content/anim/anim-slider-bindings.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Animation timeline slider; extends `xul:scale` (from `scale.xml#scale`)
- No additional visual content beyond the base scale widget; appearance is inherited

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Scale change | `valueChanged(which, newValue, userChanged)` | Overrides scale callback; fires animation-position event |
| Drag state | `dragStateChanged(isDragging)` | Fires drag-start / drag-end for animation scrubbing |

#### i18n keys used
- none

#### Notes
- Thin wrapper around `chrome://global/content/bindings/scale.xml#scale`; adds animation-specific event semantics.

---

### `widget.multiselect`

- **File**: `uxp_gui/cuemol2/base/content/anim/multiselect-binding.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown`
- **Chrome URL**: `chrome://cuemol2/content/anim/multiselect-binding.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Multi-selection list widget: `xul:listbox` (seltype="multiple") flanked by Add/Remove toolbar buttons
- Dropdown `xul:menupopup` provides choices for the Add button

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `select` (listbox) | `_onListSelect(aEvent)` | Updates selection state; triggers `_fireChangedEvent()` |
| `command` (Add button) | `_onAddCmd(aEvent)` | Adds selected menu choice to the list |
| `command` (Remove button) | `_onRemoveCmd(aEvent)` | Removes selected items from the list |
| `focus` (capturing) | inline | Tracks focused state for widget |
| `change` | `_fireChangedEvent()` | Fires a `change` custom event to parent |
| (method) | `setList(aList)` | Populates both listbox and dropdown menu from an array |
| (method) | `setSelValues(aStr)` / `getSelValues()` | Get/set selection as a comma-separated string |

#### i18n keys used
- none

#### Notes
- Used in animation dialogs to select multiple scene objects (e.g., visible renderers for an animation track).

---

### `widget.timeedit`

- **File**: `uxp_gui/cuemol2/base/content/anim/timeedit-binding.xml`
- **Root element**: `<bindings>`
- **Title**: `unknown`
- **Chrome URL**: `chrome://cuemol2/content/anim/timeedit-binding.xml`
- **Associated JS**: `none`
- **Overlays applied**: `none`

#### User-visible features
- Time-code editor: multiple `html:input` fields separated by `xul:label` separators (hh:mm:ss.ff style), with `xul:spinbuttons` for increment/decrement
- Keyboard-navigable between fields; arrow keys increment/decrement the active field
- Exposed properties: `value` (integer ticks), `strvalue` (formatted display string), `_currentField` (readonly active field)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Constructor | inline | Creates initial `TimeValue` object; sets `value = 0` |
| `focus` (capturing) | inline | Sets `_currentField` to the focused input field |
| `keypress` VK_UP | `_increaseOrDecrease(+1)` | Increments the focused time field |
| `keypress` VK_DOWN | `_increaseOrDecrease(-1)` | Decrements the focused time field |
| `input` | `_setValueOnChange(field)` | Validates/constrains typed digits; propagates carry to adjacent fields |
| `change` | `_fireEvent('change', ...)` | Fires a `change` event when the final value is committed |
| (method) | `convToStrValue(aValue)` / `convToIntValue(aValue)` | Convert between integer ticks and display string |
| (method) | `_constrainValue(aField, aValue, aNoWrap)` | Clamps or wraps a field value within its valid range |

#### i18n keys used
- none

#### Notes
- Used in animation timeline dialogs for entering frame-accurate time codes.
- `_currentField` tracks which sub-field (hours/minutes/seconds/frames) is currently active.

---

## Unresolved

このカテゴリで解決できなかった項目:
- なし

## Statistics

- Total entries: 13
- With JS handler: 0 (all JS is inline CDATA; no external `.js` files associated)
- With i18n keys: 0
- Unresolved: 0
