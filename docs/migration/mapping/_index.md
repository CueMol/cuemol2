# Migration Mapping — Index

- Updated: 2026-05-12
- Source files: `docs/migration/mapping/*.md` (excluding this file)

---

## Category Summary

| Category | File | Total | done | wip | review | todo | frozen |
|----------|------|------:|-----:|----:|-------:|-----:|-------:|
| Panel | [panels.md](panels.md) | 9 | 0 | 1 | 0 | 8 | 0 |
| Menu | [menus.md](menus.md) | 4 | 1 | 2 | 0 | 1 | 0 |
| Toolbar | [toolbars.md](toolbars.md) | 2 | 0 | 1 | 0 | 1 | 0 |
| Dialog\_property | [prop\_dlgs.md](prop_dlgs.md) | 13 | 0 | 0 | 0 | 13 | 0 |
| Dialog\_other | [other\_dlgs.md](other_dlgs.md) | 18 | 0 | 1 | 0 | 17 | 0 |
| Dialog\_tool | [tool\_dlgs.md](tool_dlgs.md) | 21 | 0 | 0 | 0 | 21 | 0 |
| Custom Widget | [custom\_widgets.md](custom_widgets.md) | 13 | 0 | 1 | 0 | 12 | 0 |
| Overlay | [overlay.md](overlay.md) | 28 | 0 | 0 | 0 | 28 | 0 |
| Other | [other.md](other.md) | 4 | 0 | 1 | 0 | 3 | 0 |
| **Total** | | **112** | **1** | **7** | **0** | **104** | **0** |

> frozen = `blocked` status in mapping files

---

## Mapping Type Breakdown

| Mapping | Count |
|---------|------:|
| 1:1 (`direct`) | 3 |
| merged | 0 |
| split | 4 |
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
| [`panel.workspace`](panels.md#panelworkspace) | `ScenePane` / `useSceneTree` / `sceneTree.service` / `sceneOps.service` / `NodePropertyDialog` | Phase 1: live tree (4 node types + synthesised cameraRoot / styleRoot), visibility toggle (undo-wrapped), node selection, auto-refresh via `cm.addEventListener` (SEM_SCENE\|OBJECT\|RENDERER\|CAMERA\|STYLE). Phase 2: toolbar Focus / Delete / Property buttons (UXP `onBtnZoomCmd` / `onDeleteCmd` / `onPropCmd`) wired through `focusOnNode` / `deleteNode` / `getNodeInfo` worker services; property dialog is a read-only key/value stub. Phase 3: context menus. Phase 4: drag-drop + copy/paste. Phase 5: camera/style file I/O + real property dialog. Phase 6: paint / around-byres / change-type. Add Renderer button and multi-select remain deferred. |

---

## Unstarted

**104 / 112** items are `todo` (not yet started).
