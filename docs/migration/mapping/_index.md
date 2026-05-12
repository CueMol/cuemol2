# Migration Mapping — Index

- Updated: 2026-05-12 (New Renderer wired across object/renderer/rendgroup — Phase 4d)
- Source files: `docs/migration/mapping/*.md` (excluding this file)

---

## Category Summary

| Category | File | Total | done | wip | review | todo | frozen |
|----------|------|------:|-----:|----:|-------:|-----:|-------:|
| Panel | [panels.md](panels.md) | 17 | 0 | 7 | 0 | 10 | 0 |
| Menu | [menus.md](menus.md) | 4 | 1 | 2 | 0 | 1 | 0 |
| Toolbar | [toolbars.md](toolbars.md) | 2 | 0 | 1 | 0 | 1 | 0 |
| Dialog\_property | [prop\_dlgs.md](prop_dlgs.md) | 13 | 0 | 0 | 0 | 13 | 0 |
| Dialog\_other | [other\_dlgs.md](other_dlgs.md) | 18 | 0 | 1 | 0 | 17 | 0 |
| Dialog\_tool | [tool\_dlgs.md](tool_dlgs.md) | 21 | 0 | 0 | 0 | 21 | 0 |
| Custom Widget | [custom\_widgets.md](custom_widgets.md) | 13 | 0 | 1 | 0 | 12 | 0 |
| Overlay | [overlay.md](overlay.md) | 28 | 0 | 0 | 0 | 28 | 0 |
| Other | [other.md](other.md) | 4 | 0 | 1 | 0 | 3 | 0 |
| **Total** | | **120** | **1** | **13** | **0** | **106** | **0** |

> frozen = `blocked` status in mapping files

> Panel category grew from 9 → 17 on 2026-05-12: `panel.workspace` was
> split into 9 per-surface rows (`panel.workspace.tree`, `.toolbar`,
> `.ctxmenu.{scene,object,renderer,rendgroup,camera,style,multi}`) to
> match the actual UI granularity. See `mapping/panels.md` for the
> header note and `uxp-inventory/panels.md` for the inventory split.

---

## Mapping Type Breakdown

| Mapping | Count |
|---------|------:|
| 1:1 (`direct`) | 3 |
| merged | 0 |
| split | 12 |
| redesign | 0 |
| deprecated (`dropped`) | 1 |
| *(not yet assigned)* | 104 |

---

## In Progress (wip / review)

| ID | React | Notes |
|----|-------|-------|
| [`toolbar.cuemol2-ribbon`](toolbars.md#toolbarcuemol2-ribbon) | `ViewportToolPalette` / `useNaviClickHandler` / `NaviContextMenu` | Context menu actions (center/select/around/invert/sidechain) done; Create SYMM mol deferred; measurement tool, rect-select drag pending |
| [`menu.cuemol2`](menus.md#menucuemol2) | `menuTemplate` / `MenuBar` / `useMenuDispatch` | Full 9-group structure added; View > Center mark wired; Scene > Background color wired; File > Get PDB wired (streaming via StreamManager); Hardware stereo and Open web page dropped; item-level completion 21/55; MenuBar suppressed on macOS |
| [`menu.cuemol2-macos`](menus.md#menucuemol2-macos) | `main/menu.ts` | macOS App menu added; item-level completion 6/7 |
| [`dialog.about`](other_dlgs.md#dialogabout) | `AboutDialog` / `useDialog` | GRE info・userAgent は省略 |
| [`other.cuemol2`](other.md#othercuemol2) | `App` / `ContentArea` / `TabBar` / `ConfirmCloseTabDialog` / `useQuitHandler` | Main window layout done; close-tab confirmation dialog (UXP `closeTabImpl`) implemented; UXP `onCloseEvent` quit chain wired (cmd-Q walks all tabs via `before-quit` → `APP_QUIT_REQUEST` → `APP_QUIT_PROCEED`) |
| [`widget.molsellist`](custom_widgets.md) | `MolSelList` (`components/widgets/MolSelList/`) | First consumer wired in `RendererOptionsPane` (file-open dialog); editable `InputGroup` + chevron-only `HTMLSelect` (OS-native dropdown listbox with `<optgroup>` Preset / History / Scene / Global); history via `localStorage`; worker services `getSelDefs` / `validateSelection` added |
| [`panel.workspace.tree`](panels.md#panelworkspacetree) | `ScenePane` (tree) / `useSceneTree` / `sceneTree.service` / `reorderSceneNode.service` | Live tree + visibility toggle + selection (single + multi via Cmd/Ctrl+click) + event-driven auto-refresh + drag-drop reorder (worker + tests OK; in-app DnD does not fire — see panels.md follow-up); pending: inline rename, Shift+range select |
| [`panel.workspace.ctxmenu.multi`](panels.md#panelworkspacectxmenumulti) | `useSceneContextMenu` / `main/sceneContextMenu` (multi) / `bulkSceneNodeOps.service` | Right-clicking a multi-selected row opens a multi-only menu: Show / Hide / Delete via `bulkSetNodeVisible` / `bulkDeleteNode` (single undo txn per batch); worker + tests OK but Cmd/Ctrl+click does not produce a multi-selection in-app — see panels.md follow-up; pending: Copy (clipboard is single-item) |
| [`panel.workspace.toolbar`](panels.md#panelworkspacetoolbar) | `ScenePane` (toolbar) / `sceneOps.service` | Focus / Delete / Property wired; property dialog is a read-only stub; Add button (new renderer/object dialog) pending |
| [`panel.workspace.ctxmenu.scene`](panels.md#panelworkspacectxmenuscene) | `useSceneContextMenu` / `main/sceneContextMenu` (scene) / `sceneBgColor.service` | Background color submenu (W/B radio) + Use color proofing toggle (checkbox) + Paste Object wired; row stays wip because Properties is still the panel-wide read-only stub |
| [`panel.workspace.ctxmenu.object`](panels.md#panelworkspacectxmenuobject) | `useSceneContextMenu` / `main/sceneContextMenu` (object) / `sceneOps.service` / `sceneClipboard.service` / `createRendererGroup.service` / `createRendererOnObject.service` / `getNewRendererOptions.service` | Common items (Show/Hide/Rename/Delete/Props), Selection submenu incl. Around / Around-byres, Copy / Paste Renderer, New Group, New Renderer wired; Paint / Regen surface / Save As pending |
| [`panel.workspace.ctxmenu.renderer`](panels.md#panelworkspacectxmenurenderer) | `useSceneContextMenu` / `main/sceneContextMenu` (renderer) / `rendererColoring.service` / `rendererStyle.service` / `setRendererSelection.service` / `generateRendererSurfObj.service` / `getRendererChangeTypes.service` / `changeRendererType.service` / `sceneClipboard.service` / `createRendererOnObject.service` / `getNewRendererOptions.service` | Common items + Copy + Coloring + Paint(SS) + Paint picker + Style + Change sel + Generate surface obj + Change type + New Renderer wired; Edit-Create style / Edit interaction pending |
| [`panel.workspace.ctxmenu.rendgroup`](panels.md#panelworkspacectxmenurendgroup) | `useSceneContextMenu` / `main/sceneContextMenu` (rendGroup) / `sceneClipboard.service` / `createRendererOnObject.service` / `getNewRendererOptions.service` | Common items + Copy + Paste Renderer into group + New Renderer (group-aware) wired |

---

## Unstarted

**106 / 120** items are `todo` (not yet started).
