# Migration Mapping — Index

- Updated: 2026-05-02
- Source files: `docs/migration/mapping/*.md` (excluding this file)

---

## Category Summary

| Category | File | Total | done | wip | review | todo | frozen |
|----------|------|------:|-----:|----:|-------:|-----:|-------:|
| Panel | [panels.md](panels.md) | 9 | 0 | 0 | 0 | 9 | 0 |
| Menu | [menus.md](menus.md) | 4 | 1 | 2 | 0 | 1 | 0 |
| Toolbar | [toolbars.md](toolbars.md) | 2 | 0 | 1 | 0 | 1 | 0 |
| Dialog\_property | [prop\_dlgs.md](prop_dlgs.md) | 13 | 0 | 0 | 0 | 13 | 0 |
| Dialog\_other | [other\_dlgs.md](other_dlgs.md) | 18 | 0 | 0 | 0 | 18 | 0 |
| Dialog\_tool | [tool\_dlgs.md](tool_dlgs.md) | 21 | 0 | 0 | 0 | 21 | 0 |
| Custom Widget | [custom\_widgets.md](custom_widgets.md) | 13 | 0 | 0 | 0 | 13 | 0 |
| Overlay | [overlay.md](overlay.md) | 28 | 0 | 0 | 0 | 28 | 0 |
| Other | [other.md](other.md) | 4 | 0 | 0 | 0 | 4 | 0 |
| **Total** | | **112** | **1** | **3** | **0** | **108** | **0** |

> frozen = `blocked` status in mapping files

---

## Mapping Type Breakdown

| Mapping | Count |
|---------|------:|
| 1:1 (`direct`) | 1 |
| merged | 0 |
| split | 2 |
| redesign | 0 |
| deprecated (`dropped`) | 1 |
| *(not yet assigned)* | 108 |

---

## In Progress (wip / review)

| ID | React | Notes |
|----|-------|-------|
| [`toolbar.cuemol2-ribbon`](toolbars.md#toolbarcuemol2-ribbon) | `ViewportToolPalette` / `useNaviClickHandler` / `NaviContextMenu` | Context menu actions (center/select/around/invert/sidechain) done; Create SYMM mol deferred; measurement tool, rect-select drag pending |
| [`menu.cuemol2`](menus.md#menucuemol2) | `menuTemplate` / `MenuBar` / `useMenuDispatch` | Full 9-group structure added; functional items wired; ~40 stubs; MenuBar suppressed on macOS |
| [`menu.cuemol2-macos`](menus.md#menucuemol2-macos) | `main/menu.ts` | macOS App menu items added |

---

## Unstarted

**108 / 112** items are `todo` (not yet started).
