# UXP Inventory — Toolbar

> ⚠️ このファイルは Claude Code による自動生成です。手修正しないでください。
> 再生成する場合は `_spec.md` に従ってください。

- Generated: 2026-04-20
- Source: `uxp_gui/cuemol2/`
- Spec: [_spec.md](./_spec.md)
- Entries: 2

## Index

- [`toolbar.cuemol2-ribbon`](#toolbarcuemol2-ribbon)
- [`toolbar.anim-ribbon`](#toolbaranim-ribbon)

---

## Entries

### `toolbar.cuemol2-ribbon`

- **File**: `uxp_gui/cuemol2/base/content/topbar/cuemol2-ribbon.xul`
- **Root element**: `<overlay>`
- **Title**: none (toolbar overlay — no title attribute)
- **Chrome URL**: `chrome://cuemol2/content/topbar/cuemol2-ribbon.xul`
- **Associated JS**: `tool-ribbon.js`, `navi-toolribbon.js`, `measure-toolribbon.js` (all in same directory; also an inline `<script>` block)
- **Overlays applied**: none

#### User-visible features
- Ribbon tab bar with two tabs: **Home** (`navigate-ribbon-tab`) and **Measure** (`measure-ribbon-tab`)
- Collapse/expand button for the ribbon panel (`ribbon-collapse-button`)
- **Home tab toolbar**:
  - New Tab button → `cmd_new_tab`
  - File Open button → `cmd_file_open`
  - File Save As button → `cmd_file_save_as`
  - Scene Open button → `cmd_open_scene`
  - Scene Reload button → `cmd_reload_scene`
  - Scene Save button → `cmd_save_scene`
  - Get PDB button (fetch structure by accession code) — tooltiptext: `&open_PDB.label;`
  - Undo button with dropdown history popup
  - Redo button with dropdown history popup
  - **Rotate** radio button (default navigation mode)
  - **Rect Select** radio button (rectangular selection mode)
- **Measure tab toolbar**:
  - Distance radio button (2-atom pick)
  - Angle radio button (3-atom pick)
  - Torsion radio button (4-atom pick)
  - Renderer name dropdown (`measure-ribbon-tgtlist`) — lists `atomintr`-type renderers in scene
- **Context menu on atom pick** (`navi-ctxtmenu-atom`): atom/renderer labels, Center at this atom, Select (atom/residue/chain/mol), Add Select (atom/residue/chain), Unselect, Invert Sel, Toggle Sidechain, Around Byresid (3/5/7/10 Å), Around (3/5/7/10 Å), symmetry-related items (hidden unless sym renderer)
- **Context menu on generic pick** (`navi-cmenu-gen`): message label, Center at here

#### Commands / Handlers

| Trigger | Handler | Description |
|---------|---------|-------------|
| Collapse button `onclick` | `gToolRibbon.onToggleCollapse(event)` | Toggle ribbon panel collapsed state |
| XUL `command="cmd_new_tab"` | XUL command controller | Open new tab/view |
| XUL `command="cmd_file_open"` | XUL command controller | Open file dialog |
| XUL `command="cmd_file_save_as"` | XUL command controller | Save as dialog |
| XUL `command="cmd_open_scene"` | XUL command controller | Open scene file |
| XUL `command="cmd_reload_scene"` | XUL command controller | Reload current scene |
| XUL `command="cmd_save_scene"` | XUL command controller | Save current scene |
| Get PDB button `oncommand` | `gQm2Main.onOpenPDBsite()` | Open PDB-fetch dialog |
| Undo popup `onpopupshowing` | `gQm2Main.populateUndoMenu(event)` | Populate undo history dropdown |
| Undo popup `oncommand` | `gQm2Main.popupUndo(event)` | Execute undo to selected step |
| Redo popup `onpopupshowing` | `gQm2Main.populateRedoMenu(event)` | Populate redo history dropdown |
| Redo popup `oncommand` | `gQm2Main.popupRedo(event)` | Execute redo to selected step |
| Rotate/Rect radio `command` | `NaviToolRibbon.onRadioBtn()` (navi-toolribbon.js) | Switch navigation mode |
| Mouse click on GL view | `NaviToolRibbon.onMouseClicked()` (navi-toolribbon.js) | Hit-test, show atom info or context menu |
| Mouse double-click on GL view | `NaviToolRibbon.onMouseDoubleClicked()` (navi-toolribbon.js) | Toggle/extend residue selection |
| Rect drag on GL view | `NaviToolRibbon.mouseDragStart/Move/End()` (navi-toolribbon.js) | Rectangular selection |
| Atom context menu `command` | `NaviToolRibbon.onCtxtMenu()` (navi-toolribbon.js) | Select/center/add-select/unselect/around actions |
| Generic context menu `command` | `NaviToolRibbon.onCMenuGen()` (navi-toolribbon.js) | Center view at picked point |
| Distance/Angle/Torsion radio `command` | `MeasToolRibbon.onRadioBtn()` (measure-toolribbon.js) | Switch measurement mode |
| Renderer dropdown `popupshowing` | `MeasToolRibbon.onTgtListShowing()` (measure-toolribbon.js) | Enumerate atomintr renderers in scene |
| Mouse click on GL view (Measure tab) | `MeasToolRibbon.onMouseClicked()` (measure-toolribbon.js) | Pick atoms and define distance/angle/torsion label |

#### i18n keys used
- `&open_PDB.label;` (dtd: `cuemol2.dtd`)

#### Notes
- This overlay targets `<overlaytarget id="ribbon-overlay-target">` in `cuemol2.xul`.
- `window.gToolRibbon` is created inline and tools (`NaviToolRibbon`, `MeasToolRibbon`) are registered on it. `anim-ribbon.xul` later registers `AnimUIToolRibbon` on the same object, so load order matters.
- The ribbon panel's collapsed state is persisted via the `persist="collapsed"` attribute on `#ribbon-tabpanels`.
- Rect-select mode uses a `RectSelDrawObj` draw object obtained from the view; it is enabled/disabled on mode switch.
- Symmetry context menu items are hidden by default and shown only when a `*symm` renderer is hit.

---

### `toolbar.anim-ribbon`

- **File**: `uxp_gui/cuemol2/base/content/anim/anim-ribbon.xul`
- **Root element**: `<overlay>`
- **Title**: none (toolbar overlay — no title attribute)
- **Chrome URL**: `chrome://cuemol2/content/anim/anim-ribbon.xul`
- **Associated JS**: `anim-ribbon.js` (same directory, `src="anim-ribbon.js"`)
- **Overlays applied**: none

#### User-visible features
- Adds an **Animation** tab (`animui-ribbon-tab`) to the ribbon tab bar defined by `toolbar.cuemol2-ribbon`
- **Animation tab toolbar**:
  - Play/Pause toggle button (`animui-play-pause`) — icon changes between play and pause states
  - Stop button (`animui-stop`)
  - Loop checkbox (`animui-chkloop`)
  - Animation position slider (`animui-scale`, XBL binding `#animslider` from `anim/anim-slider-bindings.xml`)
  - Current time display: MM:SS labels (`animui-cur-min`, `animui-cur-sec`)
  - Total duration display: MM:SS labels (`animui-total-min`, `animui-total-sec`)

#### Commands / Handlers

| Trigger | Handler | Description |
|---------|---------|-------------|
| Play/Pause button `command` | `AnimUIToolRibbon.onPlayPause()` (anim-ribbon.js) | Start or pause animation via `AnimMgr.start()` / `AnimMgr.pause()` |
| Stop button `command` | `AnimUIToolRibbon.onStop()` (anim-ribbon.js) | Stop animation via `AnimMgr.stop()` |
| Loop checkbox `command` | `AnimUIToolRibbon.onCmdLoop()` (anim-ribbon.js) | Toggle `AnimMgr.loop` property |
| Slider `dragStateChange` | `AnimUIToolRibbon.onSliChg()` (anim-ribbon.js) | Seek animation to slider position via `AnimMgr.goTime()` |
| 1 s interval timer | `AnimUIToolRibbon.onTimer()` (anim-ribbon.js) | Periodically refresh elapsed time display while playing |
| Mouse click on GL view (Animation tab) | delegates to `NaviToolRibbon.onMouseClicked()` | Hit-test forwarded to navigation tool |

#### i18n keys used
- none (all labels hardcoded: "Animation", "Play", "Stop", "Loop")

#### Notes
- This overlay injects into three separate targets: `scripts-overlay-target` (JS), `tool-ribbon-tabcontainer` (adds tab), and `ribbon-tabpanels` (adds tab panel). It depends on `toolbar.cuemol2-ribbon` having run first to create `window.gToolRibbon`.
- The Play/Pause button state (`state="play"` / `state="pause"`) is toggled via attribute; CSS uses `-moz-image-region` sprite slicing on `button-play-pause.png`.
- Inline CSS (`<style>` block) defines `.anim-play-pause-btn`, `.anim-stop-btn`, and `.animslider` using `-moz-binding` and `-moz-image-region` — all Firefox/UXP-specific properties requiring migration.
- `AnimUIToolRibbon` starts a 1-second `setInterval` timer while playing to update the elapsed time display; the timer is cleared in `onInactivated()`.

---

## Unresolved

このカテゴリで解決できなかった項目: なし

## Statistics

- Total entries: 2
- With JS handler: 2
- With i18n keys: 1
- Unresolved: 0
