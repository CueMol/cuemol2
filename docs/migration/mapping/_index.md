# Migration Mapping — Index

- Updated: 2026-06-03 (`dialog.property.ballstick` done: UXP "Ball & Stick" タブの detail/bondw/sphr/ring/thickness/ringcolor を Inspector Properties タブの独立 accordion entry ("Ball and stick") として実装済み。`rendererPropSections` registry に `type_name "ballstick"` で登録、`NumRow`/`BoolRow`/`ColorRow` を再利用、ring off 時に thickness/ringcolor を disable。mapping 行の更新漏れを是正)
- Updated: 2026-06-03 (`dialog.property.cpk` done: UXP "Atom radii" タブを Inspector Properties タブの 2 accordion ("Atom radii" 7 元素 van der Waals 半径 + "Detail" `detail`) に実装。UXP で groupbox 外だった detail を別 section に分離。`rendererPropSections` registry に `type_name "cpk"` で登録、`NumRow` (DragNumericField, realtime preview) を再利用)
- Updated: 2026-06-02 (`dialog.property.simple` done: UXP "Simple" タブの Line width を Inspector Properties タブの独立 accordion entry として実装。`rendererPropSections` registry に `type_name "simple"` で登録、DragNumericField (realtime preview) で `width` を編集。ported renderer-type は折りたたみ dummy ではなく実 section を表示)
- Updated: 2026-06-01 (`dialog.property.renderer` wip: renderer-common-page (Basic settings + Edge lines) implemented as the Inspector Properties tab via live `getGenericProps`/`setGenericProp`; renderer-type-specific sections deferred to `rendererPropSections` registry — currently Common + collapsed dummy)
- Updated: 2026-05-25 (`panel.densitymap` done: DensityMapPane wired with custom stepper (+ step-precision quantize) and typed-property-setter writes for color/center; multi-gradient mode dropped)
- Updated: 2026-05-24 (`panel.symmetry` ported: SymmetryPane + Change modal + Symm-mol/Unit-cell renderer setup; activity bar group renamed Dummy → Crystal with cube icon)
- Updated: 2026-05-24 (`panel.btmpanel-holder.seq` mapping done after E2E verification; remaining selection-commit latency tracked in ADR-0019)
- Updated: 2026-05-24 (`panel.btmpanel-holder.seq` Phase 3: all 13 ctx menu items wired -- Toggle sel / Around 3-10 / Around Byresid 3-10 / Unselect all / Invert sel / Copy sequence)
- Updated: 2026-05-24 (`panel.btmpanel-holder.seq` Phase 2: drag range select + shift+click range extend with green tracking rect; pointer flow + setPointerCapture)
- Updated: 2026-05-24 (`panel.btmpanel-holder` split into `.log` / `.seq`; `.seq` Phase 1 wip: Canvas grid + click toggle + Center ctx menu)
- Updated: 2026-05-24 (`panel.selection` Command tab done: molecule selector + multi-line text + History MRU shared with `MolSelList` via `applyMolSelString`; E2E verified)
- Updated: 2026-05-30 (`widget.colpicker` done: rolled out app-wide via shared `ColorPickerProvider`/`CueColorField` to Inspector, DensityMap, Paint cell, App Settings — ADR-0020)
- Updated: 2026-05-29 (`widget.colpicker` / `widget.colorslider` / `menu.color`: color picker widget — ADR-0020)
- Source files: `docs/migration/mapping/*.md` (excluding this file)
- Option-specification UX: see [`../option-ux-guidelines.md`](../option-ux-guidelines.md)
  for routing dialog migrations to modal / panel / drawer / popover patterns

---

## Category Summary

| Category | File | Total | done | wip | review | todo | frozen |
|----------|------|------:|-----:|----:|-------:|-----:|-------:|
| Panel | [panels.md](panels.md) | 27 | 4 | 17 | 1 | 5 | 0 |
| Menu | [menus.md](menus.md) | 4 | 2 | 2 | 0 | 0 | 0 |
| Toolbar | [toolbars.md](toolbars.md) | 2 | 0 | 1 | 0 | 1 | 0 |
| Dialog\_property | [prop\_dlgs.md](prop_dlgs.md) | 13 | 3 | 1 | 0 | 9 | 0 |
| Dialog\_other | [other\_dlgs.md](other_dlgs.md) | 18 | 0 | 3 | 0 | 15 | 0 |
| Dialog\_tool | [tool\_dlgs.md](tool_dlgs.md) | 21 | 1 | 0 | 0 | 20 | 0 |
| Custom Widget | [custom\_widgets.md](custom_widgets.md) | 13 | 2 | 1 | 0 | 10 | 0 |
| Overlay | [overlay.md](overlay.md) | 28 | 0 | 1 | 0 | 27 | 0 |
| Other | [other.md](other.md) | 4 | 0 | 1 | 0 | 3 | 0 |
| **Total** | | **130** | **9** | **27** | **1** | **93** | **0** |

> frozen = `blocked` status in mapping files

> Panel category grew from 9 → 17 on 2026-05-12: `panel.workspace` was
> split into 9 per-surface rows (`panel.workspace.tree`, `.toolbar`,
> `.ctxmenu.{scene,object,renderer,rendgroup,camera,style,multi}`) to
> match the actual UI granularity. See `mapping/panels.md` for the
> header note and `uxp-inventory/panels.md` for the inventory split.

> Panel category grew from 17 → 26 on 2026-05-22: `panel.coloring` was
> split into 10 per-surface rows (`panel.coloring.shell` + nine
> `panel.coloring.deck.*` pages: undef / solid / multigrad / paint / cpk
> / rainbow / bfac / elepot / script) so each `<deck>` page tracks its
> own migration status. See `mapping/panels.md` for the header note and
> `uxp-inventory/panels.md` for the inventory split.

> Panel category grew from 26 → 27 on 2026-05-24: `panel.btmpanel-holder`
> was split into `panel.btmpanel-holder.log` and `panel.btmpanel-holder.seq`
> rows (Output tab vs Sequence tab) per the spec's "one user-visible
> surface per entry" rule.

---

## Mapping Type Breakdown

| Mapping | Count |
|---------|------:|
| 1:1 (`direct`) | 8 |
| merged | 2 |
| split | 19 |
| redesign | 0 |
| deprecated (`dropped`) | 2 |
| *(not yet assigned)* | 99 |

---

## In Progress (wip / review)

| ID | React | Notes |
|----|-------|-------|
| [`toolbar.cuemol2-ribbon`](toolbars.md#toolbarcuemol2-ribbon) | `ViewportToolPalette` / `useNaviClickHandler` / `NaviContextMenu` | Context menu actions (center/select/around/invert/sidechain) done; Create SYMM mol deferred; measurement tool, rect-select drag pending |
| [`menu.cuemol2`](menus.md#menucuemol2) | `menuTemplate` / `MenuBar` / `useMenuDispatch` | Full 9-group structure added; View > Center mark wired; Scene > Background color wired; File > Get PDB wired (streaming via StreamManager); File > Open Recent wired (electron-store-backed MRU, app.addRecentDocument); Hardware stereo and Open web page dropped; File > Save File As / Save current view / Reload Scene wired; item-level completion 25/55; MenuBar suppressed on macOS |
| [`menu.cuemol2-macos`](menus.md#menucuemol2-macos) | `main/menu.ts` | macOS App menu added; item-level completion 6/7 |
| [`dialog.about`](other_dlgs.md#dialogabout) | `AboutDialog` / `useDialog` | GRE info・userAgent は省略 |
| [`other.cuemol2`](other.md#othercuemol2) | `App` / `ContentArea` / `TabBar` / `ConfirmCloseTabDialog` / `useQuitHandler` | Main window layout done; close-tab confirmation dialog (UXP `closeTabImpl`) implemented; UXP `onCloseEvent` quit chain wired (cmd-Q walks all tabs via `before-quit` → `APP_QUIT_REQUEST` → `APP_QUIT_PROCEED`) |
| [`widget.molsellist`](custom_widgets.md) | `MolSelList` (`h3-kit/MolSelList/`) | First consumer wired in `RendererOptionsPane` (file-open dialog); editable `InputGroup` + chevron-only `HTMLSelect` (OS-native dropdown listbox with `<optgroup>` Preset / History / Scene / Global); history via `localStorage`; worker services `getSelDefs` / `validateSelection` added |
| [`panel.workspace.tree`](panels.md#panelworkspacetree) | `ScenePane` (tree) / `useSceneTree` / `useSceneTreeController` / `sceneTreeDnd` / `InlineRenameInput` / `sceneTree.service` / `reorderSceneNode.service` | Live tree + visibility toggle + selection (single + multi via Cmd/Ctrl+click) + event-driven auto-refresh + drag-drop reorder (worker + in-app DnD OK; ADR-0001) + F2 inline rename; pending: Shift+range select |
| [`panel.workspace.ctxmenu.multi`](panels.md#panelworkspacectxmenumulti) | `useSceneContextMenu` / `main/sceneContextMenu` (multi) / `bulkSceneNodeOps.service` | Right-clicking a multi-selected row opens a multi-only menu: Show / Hide / Delete via `bulkSetNodeVisible` / `bulkDeleteNode` (single undo txn per batch); worker + in-app multi-select OK; pending: Copy (clipboard is single-item) |
| [`panel.workspace.toolbar`](panels.md#panelworkspacetoolbar) | `ScenePane` (toolbar) / `useSceneTreeController` / `sceneOps.service` / `createRendererOnObject.service` / `getNewRendererOptions.service` | Focus / Delete / Property / Add wired (Add shares the New Renderer flow with the ctxmenu); property dialog still a read-only stub |
| [`panel.workspace.ctxmenu.scene`](panels.md#panelworkspacectxmenuscene) | `useSceneContextMenu` / `main/sceneContextMenu` (scene) / `sceneBgColor.service` | Background color submenu (W/B radio) + Use color proofing toggle (checkbox) + Paste Object wired; row stays wip because Properties is still the panel-wide read-only stub |
| [`panel.workspace.ctxmenu.object`](panels.md#panelworkspacectxmenuobject) | `useSceneContextMenu` / `main/sceneContextMenu` (object) / `sceneOps.service` / `sceneClipboard.service` / `createRendererGroup.service` / `createRendererOnObject.service` / `getNewRendererOptions.service` / `rendererColoring.service` (object paint) / `objectSave.service` | Common items (Show/Hide/Rename/Delete/Props), Selection submenu incl. Around / Around-byres, Copy / Paste Renderer, New Group, New Renderer, Paint (object-level via paintObjectSelection), Save As (multi-writer filter via DIALOG_OBJECT_SAVE) wired; Regen surface pending (Phase 6c, deferred). |
| [`panel.workspace.ctxmenu.renderer`](panels.md#panelworkspacectxmenurenderer) | `useSceneContextMenu` / `main/sceneContextMenu` (renderer) / `rendererColoring.service` / `rendererStyle.service` / `setRendererSelection.service` / `generateRendererSurfObj.service` / `getRendererChangeTypes.service` / `changeRendererType.service` / `sceneClipboard.service` / `createRendererOnObject.service` / `getNewRendererOptions.service` | Common items + Copy + Coloring + Paint(SS) + Paint picker + Style + Change sel + Generate surface obj + Change type + New Renderer wired; Edit-Create style / Edit interaction pending |
| [`panel.workspace.ctxmenu.rendgroup`](panels.md#panelworkspacectxmenurendgroup) | `useSceneContextMenu` / `main/sceneContextMenu` (rendGroup) / `sceneClipboard.service` / `createRendererOnObject.service` / `getNewRendererOptions.service` | Common items + Copy + Paste Renderer into group + New Renderer (group-aware) wired |
| [`panel.workspace.ctxmenu.style`](panels.md#panelworkspacectxmenustyle) | `useSceneContextMenu` / `main/sceneContextMenu` (style) / `styleOps.service` / `styleFile.service` / `sceneClipboard.service` (style kind) / `sceneOps.deleteNode` (style branch) | New Style + Copy / Paste + Delete + Style file Load / Save / Save As (Reload stub) + Read-only toggle wired; `sceneTree.service` switched to `getStyleSetsJSON` so style nodes carry real C++ uids + `styleInfo`. Editor dialog (Phase 5a) pending. |
| [`panel.workspace.ctxmenu.camera`](panels.md#panelworkspacectxmenucamera) | `useSceneContextMenu` / `main/sceneContextMenu` (camera) / `cameraOps.service` / `cameraFile.service` / `sceneClipboard.service` (camera kind) | New Camera + Rename (atomic destroy+setCamera) + Delete + Copy / Paste + Camera file Load / Reload / Save / Save As + Save/Apply from view + Save/Apply with vis flags + Clear vis flags wired; `sceneTree.service` synthesises `cameraInfo` from `getCameraInfoJSON`. Edit vis flags dialog (Phase 6c) + property dialog (Phase 5a) pending. |
| [`overlay.propeditor-generic`](overlay.md#overlaypropeditor-generic) | `InspectorPanel` / `GenericTab` / `genericProps.service` / `useInspectorState` | Generic property editor as the Generic tab of the docked inspector pane (ADR-0015); `getPropsJSON` bridge, live-apply, undo-wrapped writes. First stage edits primitive types (string/int/real/bool/enum); color/vector/timeval/nested-object editing deferred. Replaces the retired read-only `NodePropertyDialog` modal. |
| [`dialog.property.renderer`](prop_dlgs.md) | `inspector/RendererCommonSection` / `inspector/PropertiesTab` / `rendererPropSections` / `getMaterialNames.service` | renderer-common-page (Basic settings + Edge lines) as the structured Properties tab, default for renderer targets; live `getGenericProps`/`setGenericProp` (sel compiled via `makeSel`, egcolor/material as strings). Per-renderer-type sections deferred to the `rendererPropSections` registry — every type currently shows Common + a collapsed dummy placeholder. |
| [`panel.coloring.shell`](panels.md#panelcoloringshell) | `ColorPane` / `usePaintCapableRenderers` / `rendererColoring.service` | Phase 1: renderer selector (paint-capable filter) + Coloring type dropdown (Paint / Solid / Reset enabled; CPK / Bfac / Rainbow / Elepot / Multi-gradient "coming soon"). |
| [`panel.coloring.deck.paint`](panels.md#panelcoloringdeckpaint) | `ColorPane` / `useRendererColoringState` / `rendererColoring.service` (Paint CRUD) | Phase 1: inline-edit Paint table (no `paint-propdlg` dialog yet). Add / Delete / Move + cell-level commit on blur via `add/remove/update/movePaintEntry`. |
| [`panel.coloring.deck.solid`](panels.md#panelcoloringdecksolid) | `ColorPane` / `useRendererColoringState` / `rendererColoring.service` (`setRendererDefaultColor`) | Phase 1: default-color text input + preview swatch; commits on blur via `setRendererDefaultColor`. |
| [`panel.coloring.deck.cpk`](panels.md#panelcoloringdeckcpk) | `ColorPane` (CpkDeck) / `rendererColoring.service` (`setColoringProp`) | Phase 2: 7 element colour fields (col_C…col_X) committing through `setColoringProp` with the materialize-on-default guard. |
| [`panel.coloring.deck.rainbow`](panels.md#panelcoloringdeckrainbow) | `ColorPane` (RainbowDeck) / `rendererColoring.service` (`setColoringProp`) | Phase 2: Mode / Change-by + Start H / End H / Brightness / Saturation. UI scales bri/sat 0–100% ↔ stored 0–1. |
| [`panel.coloring.deck.bfac`](panels.md#panelcoloringdeckbfac) | `ColorPane` (BfacDeck) / `rendererColoring.service` (`setColoringProp`) | Phase 2: Mode + Low/High colour + Auto/Manual + Low/High parameter (disabled outside Manual). |
| [`panel.coloring.deck.elepot`](panels.md#panelcoloringdeckelepot) | `ColorPane` (ElepotDeck) / `useElePotMapObjects` / `rendererColoring.service` (`setRendererElepotProp`, `listElePotMapObjects`, `paint-type-elepot`) | Phase 3: ElePotMap selector + Color-by-SAS + Low/Mid/High (par, colour) ramp. Elepot props live on the surface renderer (not a ColoringScheme); deck appears when `colormode === "potential"` on `molsurf` / `dsurface`. Dropdown item is surface-gated. |
| [`panel.molstruct`](panels.md#panelmolstruct) | `MolStructPane` / `useMolStructure` / `selStrFromTree` / `getMolStructure.service` / `applyMolSelString.service` | Phase 1+2: molecule selector + lazy chain/residue/atom tree (per-chain & per-residue cache, self-heal on missing) + multi-select + Select / Center / Zoom (ADR-0018). Known issue: first-expand stagger from Blueprint `Tree` Collapse JS state machine (virtualization swap deferred). |
| [`panel.symmetry`](panels.md#panelsymmetry) | `SymmetryPane` / `useSymmetryPanel` / `SymmetryChangeDialog` / `symmetryPanelOps.service` | UXP-parity port: object selector + crystal info readout + Change modal (Crystal system / Space Group with per-lattice cell constraints) + Symm mol popover (20/50/100/200 Å + Unit cell) + Unit cell renderer. Replaces DummyPane1; activity bar group renamed Dummy → Crystal (cube icon). 12 worker-side tests pin the service contract. Awaiting E2E sign-off. |

---

## Unstarted

**97 / 130** items are `todo` (not yet started).
