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

# Mapping — Menu

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`menu.color`](../uxp-inventory/menus.md#menucolor) | | | todo | | | Color picker popup; deferred pending color picker UI design |
| [`menu.cuemol2`](../uxp-inventory/menus.md#menucuemol2) | `menuTemplate` / `MenuBar` / `useMenuDispatch` | split | wip | | | Full 9-group menu structure added (File/Edit/Rendering/Scene/View/Tools/Window/Help); functional: File(open/save/tab), Edit(undo/redo), Scene(new), View projection(Perspective/Orthographic with checked state); ~40 mock stubs log `console.warn`; `MenuBar` (React) is suppressed on macOS — native Electron menu only |
| [`menu.cuemol2-macos`](../uxp-inventory/menus.md#menucuemol2-macos) | `main/menu.ts` (`macOnlyGroups`) | direct | wip | | | macOS App menu (Preferences/Services/Hide/Quit) added; Preferences is a stub |
| [`menu.cuemol2-scripts`](../uxp-inventory/menus.md#menucuemol2-scripts) | — | dropped | done | | | XUL script loader overlay; Electron app handles module loading natively — no migration needed |
