# ADR-0037: Scene-export menu items gated by libcuemol2 exporter capability

- Status: accepted
- Date: 2026-07-12
- Mapping rows: [`menu.cuemol2.rendering`](../mapping/menus.md#menucuemol2rendering)

## Context

The Rendering > Export scene submenu offers one item per file type
(PNG / Umbreon ray-traced PNG / POV-Ray SDL / STL / MQO), each routed to a
fixed exporter name (`runSceneExportFlow` -> `exportScene` worker ->
`StreamManager.createHandler(name, 2)`). Unlike UXP -- which enumerates the
category-2 exporters dynamically via `getInfoJSON2()` to build the file-dialog
filter list (`fileopen.js` `makeFilter(fp, 2)`) -- tritium hardcodes the list
in `SCENE_EXPORTERS` because Electron's save dialog cannot report which filter
the user picked (png vs umbreon are both `*.png`).

Some exporters are optional at the C++ build level. The Umbreon (Embree) ray
tracer is compiled in only when `HAVE_UMBREON` is defined. On a build without
it, `createHandler('umbreon', 2)` throws; the worker caught this and returned
`{ ok: false }`, but every layer above ignored the result -- the menu item was
always shown, and selecting it walked the user through the save dialog and the
PNG options dialog before silently writing nothing. The render-window path
(`UmbreonBackend`) already surfaces an error in the same situation, so the two
Umbreon entry points were inconsistent.

## Decision

Gate each scene-export menu item on whether its exporter is registered in the
running libcuemol2 build, hiding unavailable items rather than letting them
fail silently. A new worker service `getAvailableSceneExporters`
(`exportImage.service.ts`) reads `getInfoJSON2()` and returns the category-2
exporter nicknames. The renderer probes it once at startup via
`useSceneExportCaps` (availability is a static build property) and feeds the
result to both menu surfaces:

- Native menu (macOS + Win/Linux): pushed to main as a new `MenuState.exportCaps`
  slice through the existing `MENU_UPDATE_STATE` path; `applyMenuStateTo` sets
  `MenuItem.visible` per `SCENE_EXPORT_MENU_EXPORTERS` (id -> exporter). Cached
  in `lastMenuState` so it survives menu rebuilds (MRU changes).
- React `MenuBar` (Win/Linux): the same availability array is passed as the
  `exportAvailable` prop; `isExportItemUnavailable` drops the item from the
  submenu.

This reuses `getInfoJSON2()` purely as a capability probe -- it is deliberately
NOT used to drive the file-dialog filter list (that stays hardcoded per the
Electron filter-index constraint above).

## Consequences

- Umbreon (and any other absent category-2 exporter) disappears from the
  Export scene submenu on builds that lack it, instead of offering a silent
  no-op. Behaviour now matches the render-window error path.
- Gating is fail-open: an empty / unresolved availability set hides nothing.
  A successful probe always includes the always-built `png`, so a non-empty set
  is trustworthy; a failed probe leaves the full menu rather than hiding
  everything.
- The `exportScene` worker keeps its `createHandler` try/catch as
  defence-in-depth, but with the menu gated the unreachable-export path is no
  longer user-reachable on normal builds.
- On a non-Umbreon build there is a brief window at startup where the item is
  visible before the probe resolves and hides it; on Umbreon builds nothing
  changes.
- The render-window backend selector is out of scope (it already reports an
  error); it could adopt the same probe later if we want to hide rather than
  error there too.

## Notes

- Worker probe: `worker/server/services/exportImage.service.ts`
  `getAvailableSceneExporters` (category `IOH_CAT_RENDTOFILE = 2`);
  `ServiceMap` row in `worker/shared/WorkerCalls.ts`.
- Renderer: `hooks/useSceneExportCaps.ts` (probe + `MENU_UPDATE_STATE` push);
  wired in `App.tsx`, prop passed to `components/MenuBar.tsx`.
- Shared: `shared/menuTemplate.ts` `SCENE_EXPORT_MENU_EXPORTERS` +
  `isExportItemUnavailable`; `shared/types/menuState.ts` `MenuState.exportCaps`;
  `shared/menuStateApply.ts` (`MenuItemLike.visible`, `mergeMenuState`,
  `applyMenuStateTo` export gate).
- Tests: `__test__/sceneExportCaps.test.ts` (probe cat-2 filter / umbreon
  absence / parse failure; menu gate hide / show / fail-open).
- UXP parity reference: `uxp_gui/cuemol2/base/content/fileopen.js`
  `makeFilter(fp, 2)` / `onExportScene` -- dynamic enumeration, used there for
  the filter list.
- Related: QSL was retired from CueMol entirely as part of the same work --
  both the exporter (`dialog.exportqsl-opt` -> dropped) and the `.qsl`
  scene-reader extension in `src/qsys/SceneXMLReader.cpp` were removed. The
  lwview module that produced `.qsl` (LWObject / lwrend) is no longer built, so
  such files could not be read back anyway. QSL is not one of the gated items.
