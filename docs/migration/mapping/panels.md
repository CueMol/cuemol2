<!--
Mapping values:
  direct      -- one-to-one React component
  split       -- split into multiple React components
  merged      -- merged into existing React component
  dropped     -- not migrated (feature removed)
  deferred    -- migration deferred

Status values:
  todo        -- not started
  wip         -- in progress
  review      -- PR open, under review
  done        -- merged
  blocked     -- blocked by dependency
-->

# Mapping — Panel

> `panel.workspace` was split into 9 per-surface rows on 2026-05-12 (see
> `uxp-inventory/panels.md` history) because the original single row's
> Notes column grew unwieldy as different UI surfaces (tree, toolbar,
> seven context menus) progressed on independent phases.

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`panel.anim`](../uxp-inventory/panels.md#panelanim) | | | todo | | | |
| [`panel.btmpanel-holder`](../uxp-inventory/panels.md#panelbtmpanel-holder) | | | todo | | | |
| [`panel.coloring`](../uxp-inventory/panels.md#panelcoloring) | | | todo | | | |
| [`panel.densitymap`](../uxp-inventory/panels.md#paneldensitymap) | | | todo | | | |
| [`panel.fakedial`](../uxp-inventory/panels.md#panelfakedial) | | | todo | | | |
| [`panel.molstruct`](../uxp-inventory/panels.md#panelmolstruct) | | | todo | | | |
| [`panel.selection`](../uxp-inventory/panels.md#panelselection) | | | todo | | | |
| [`panel.symmetry`](../uxp-inventory/panels.md#panelsymmetry) | | | todo | | | |
| [`panel.workspace.tree`](../uxp-inventory/panels.md#panelworkspacetree) | `ScenePane` (tree) / `useSceneTree` / `sceneTree.service` | split | wip | | | Live tree (4 node types + synthesised cameraRoot / styleRoot), visibility toggle (undo-wrapped), node selection, auto-refresh via `cm.addEventListener` (`SEM_SCENE\|OBJECT\|RENDERER\|CAMERA\|STYLE`). Pending: inline rename (currently via ctxmenu `window.prompt`), drag-drop reorder, multi-select. |
| [`panel.workspace.toolbar`](../uxp-inventory/panels.md#panelworkspacetoolbar) | `ScenePane` (toolbar) / `sceneOps.service` | split | wip | | | Focus / Delete / Property buttons wired (`focusOnNode` / `deleteNode` / `getNodeInfo`); property dialog is a read-only key/value stub. Add button (new renderer / new object dialog) pending. |
| [`panel.workspace.ctxmenu.scene`](../uxp-inventory/panels.md#panelworkspacectxmenuscene) | `useSceneContextMenu` / `main/sceneContextMenu` (scene branch) / `sceneClipboard.service` / `sceneBgColor.service` | split | wip | | | Background color submenu (White / Black radio reflecting current `bgcolor`) reuses `setSceneBgColor` worker service from menu-bar wiring. Use color proofing toggle (checkbox reflecting combined gate `use_colproof && icc_filename != ""`) via new `toggleSceneColorProofing` / `getSceneColorProofing` services; turn-on assigns `GenericCMYK.icm` when no profile is configured, turn-off preserves the existing profile for next turn-on. Paste Object wired. All UXP-listed scene-ctx items are wired; row stays wip because Properties is still the panel-wide read-only stub (real per-scene editor lands in Phase 5). |
| [`panel.workspace.ctxmenu.object`](../uxp-inventory/panels.md#panelworkspacectxmenuobject) | `useSceneContextMenu` / `main/sceneContextMenu` (object branch) / `sceneOps.service` / `sceneClipboard.service` | split | wip | | | Phase 3a: Show / Hide / Rename / Delete / Properties (stub). Phase 3b: Selection submenu (all / unselect / invert / protein / nucleic / water / sugar / hydrogen / sidechain) via `selectObjectMol`. Phase 4a: Copy Object / Paste Renderer via worker-singleton clipboard (`StreamManager.toXML/fromXML`, name uniquification). Pending: Paint (object-level), Regenerate surface, New Renderer, New Group, Save As. |
| [`panel.workspace.ctxmenu.renderer`](../uxp-inventory/panels.md#panelworkspacectxmenurenderer) | `useSceneContextMenu` / `main/sceneContextMenu` (renderer branch) / `rendererColoring.service` / `rendererStyle.service` / `sceneClipboard.service` | split | wip | | | Phase 3a: Show / Hide / Rename / Delete / Properties (stub). Phase 4a: Copy. Phase 3c-1: static Coloring items (CPK molcol/dark/light → `applyStyles` after `/Paint$/` strip; B-factor / Rainbow → `createObj` + assign), gated by className (`*selection`/`*namelabel`/`atomintr` hide submenu), molsurf forces `colormode = "molecule"`; `styleutil.ts` helper. Phase 3c-2: dynamic "Paint (Secondary str.)" sub-submenu via `getPaintColoringStyles` (global + scene `getStyleNamesJSON`, filter `/Paint$/`); `RendColoringId` widened to `` `style-${string}` ``. Phase 3c-3a: Paint color-picker (`color-menu.xul` replica) via `paintRendererSelection` ("Insert paint entry" undo txn), gated by `getRendererPaintInfo.canPaint`. Phase 3c-3b: Style (shape) submenu via `getRendererStyleEntries` (type-suffix `/<type>$/i` + edge `/^EgLine/`, edge omitted for simple/trace/spline/coutour/`*namelabel`/`*selection`); `applyRendererStyle` runs `styleutil.remove`+`push`+`applyStyles` under "Change style" txn; type_name regex metachars escaped. Pending: Change sel submenu, Change type, Edit / Create style dialogs, Edit interaction list, Generate surface obj, New Renderer. |
| [`panel.workspace.ctxmenu.rendgroup`](../uxp-inventory/panels.md#panelworkspacectxmenurendgroup) | `useSceneContextMenu` / `main/sceneContextMenu` (rendGroup branch) / `sceneClipboard.service` | split | wip | | | Phase 3a header items (Show / Hide / Rename / Delete / Properties stub). Phase 4a: Copy. Pending: Paste Renderer into group, New Renderer, Change Name (currently routes through rename which works). |
| [`panel.workspace.ctxmenu.camera`](../uxp-inventory/panels.md#panelworkspacectxmenucamera) | `useSceneContextMenu` / `main/sceneContextMenu` (camera branch) | split | todo | | | Native ctx menu shows Rename / Delete / Properties items but the worker services (`renameNode` / `deleteNode` / `getNodeInfo`) currently reject camera nodes — items are visible stubs only. Real wiring + Camera file I/O / Save/Apply view / Vis flags / property dialog lands in Phase 5 (camera nodes have no name setter; rename needs atomic destroy + re-register). |
| [`panel.workspace.ctxmenu.style`](../uxp-inventory/panels.md#panelworkspacectxmenustyle) | `useSceneContextMenu` / `main/sceneContextMenu` (style branch) | split | todo | | | Native ctx menu shows Rename / Delete / Properties items but the worker services reject style nodes — items are visible stubs only. Real wiring + Style file I/O / Read-only toggle / Editor dialog lands in Phase 5. |
| [`panel.workspace.ctxmenu.multi`](../uxp-inventory/panels.md#panelworkspacectxmenumulti) | | split | todo | | | Tree multi-select is deferred, so the multi-select ctx menu has no entry point yet. To unblock: add multi-select support to `useSceneTree`, then port Copy / Delete / Show / Hide bulk handlers. |
