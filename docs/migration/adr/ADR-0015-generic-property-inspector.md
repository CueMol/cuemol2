# ADR-0015: Generic property inspector — docked pane, live-apply, getPropsJSON bridge

- Status: accepted (color / vector / timeval widgets pending; nested-object
  editing enabled 2026-06-03 — see Update)
- Date: 2026-05-16
- Mapping rows: [`overlay.propeditor-generic`](../mapping/overlay.md#overlaypropeditor-generic)

## Context

UXP exposes a generic, type-aware property editor (`propeditor-generic-page`,
the "Generic" tab inside `generic-propdlg.xul` and every per-type
`*-propdlg.xul`). It lists every property of any object / renderer / scene in
a flat tree and edits each with a type-specific widget, committing on dialog
accept inside one undo transaction.

tritium already shipped a mock inspector pane (`components/inspector/`,
`InspectorPanel.tsx`, `useInspectorState.ts`) backed by static `RIBBON_*`
sample data, plus a separate Phase-2 read-only modal (`NodePropertyDialog`)
that dumped a fixed key/value list via the `getNodeInfo` worker service.
`docs/migration/option-ux-guidelines.md` §4.4 recommends consolidating
property editing into a docked pane rather than modal dialogs.

## Decision

Implement the generic editor as the **Generic tab of the existing docked
inspector pane** (mapping = `merged`), not as a modal.

- Worker side: `genericProps.service.ts` exposes `getGenericProps` (dumps a
  node's properties via the C++ `BaseWrapper.getPropsJSON()` bridge) and
  `setGenericProp` (writes one property via `setProp` / `resetProp` inside
  `withUndoTxn`). `helpers/parseGenericProps.ts` flattens the JSON;
  `helpers/resolvePropTarget.ts` maps a scene-tree node to its wrapper.
- Renderer side: `useInspectorState` fetches on node selection and applies
  edits **live** (no OK/Cancel) — a docked pane stays visible against the 3D
  view, so immediate apply is the natural model; undo reverts. A
  `SEM_PROPCHG` subscription refetches so undo/redo and script changes stay
  in sync.
- The scene-tree Property action (button + double-click) opens this pane.
  The read-only `NodePropertyDialog` modal, its `NodePropertyDialogProvider`,
  the `getNodeInfo` service and the `fetchNodeInfo` helper are retired
  (unwired, `@deprecated`, scheduled for deletion).

First stage edited primitive types only (`string` / `integer` / `real` /
`boolean` / `enum`) and showed a non-string-convertible `object<...>` property
as a single read-only `<node>` row, on the assumption that nested writes were
unsupported. That assumption was wrong (corrected 2026-06-03 — see Update):
nested dot-path writes route through `LPropSupport::setNestedProperty`.

## Consequences

- One editor now serves objects, renderers and scenes generically; the 13
  per-type `prop_dlgs` become a structured *view* over the same data, not 13
  modals.
- Live-apply removes the Apply/Cancel affordance; mis-edits are undone with
  Cmd+Z instead. Acceptable for a docked pane, and matches the guideline.
- Nested object properties are now editable via dot-path keys (see Update).
  Still pending: color-picker / vector / timeval widgets, and `camera` /
  `style` node support in `resolvePropTarget`.
- `getNodeInfo` / `NodePropertyDialog` remain compiling but dead until a
  follow-up deletes them.

## Update (2026-06-03): nested-object editing enabled

The original "nested writes unsupported" rationale was a misreading of the C++.
The N-API path tritium uses does support dot-path properties:

- `tritium/core/cxx_src/wrapper.cpp` (`getProp` / `setProp` / `resetProp`) calls
  the shared `cuemol2::getProp` / `setProp` / `resetProp`
  (`src/libcuemol2_api/binding.cpp`), which call
  `LPropSupport::getNestedProperty` / `setNestedProperty` /
  `resetNestedProperty` (`src/qlib/LPropSupport.cpp`).
- Those use `NestedPropHandler` (`src/qlib/NestedPropHandler.hpp`): split the
  name on `.`, walk into each child object via `getProperty`, then get / set /
  reset the leaf. The commented-out `//if (handleNestedProp...)` in
  `LScrObjects.cpp` is a *different*, superseded inline path that the binding
  does not use. The UXP xpcom binding (`XPCObjWrapper.cpp`) calls the very same
  `cuemol2::*` functions, so both front-ends share one code path.
- A top-level `object<...>` property declared `(readonly)` (e.g. tube `section`,
  cartoon `helix` / `sheet` / `coil`) only blocks replacing the object
  wholesale; its sub-properties stay writable through the dot-path.

The only tritium-side gap was `parseGenericProps`, which now recurses into
nested objects and emits each child as a `depth`-tagged dot-path entry
(`section.type`, ...) after its read-only container row. `GenericTab` indents
children by depth. First consumer: `inspector/TubeRendererSection` (the tube
`section.*` cross-section shape). Cartoon's nested shape controls can be wired
onto its curated page the same way (follow-up).

## Notes

- View properties are editable too: `View`/`GUIView` extend `BaseWrapper`,
  so the same `getGenericProps` / `setGenericProp` path serves them.
  `resolvePropTarget` gains a `view` case (`sceMgr.getView`) and the
  inspector layer uses `PropTargetType = SceneNodeType | 'view'` (the scene
  tree has no View node, so `SceneNodeType` itself is left untouched). The
  View has no scene-tree node; it is reached via the `menu:view-props`
  channel (View menu > "View property...") -> `CmdId.UiViewProperty`.
- The inspector follows content-tab switches: `useInspectorState` keeps a
  per-scene `Map<sceneId, InspectorTarget>` and restores a scene's last
  target on tab switch, so it never edits a hidden scene's node.
- Implementation: `worker/server/services/genericProps.service.ts`,
  `worker/server/services/helpers/parseGenericProps.ts`,
  `worker/server/services/helpers/resolvePropTarget.ts`,
  `worker/shared/WorkerCalls.ts` (`getGenericProps` / `setGenericProp` rows),
  `components/inspector/GenericTab.tsx`,
  `components/panels/InspectorPanel.tsx`, `hooks/useInspectorState.ts`,
  `App.tsx` (`handleSceneShowProperty` → `handleShowGeneric`).
- C++ source of truth: `src/qlib/LScrObjects.cpp` `getPropsJSONImpl`
  (JSON shape, recurses into nested objects), `LPropSupport::setNestedProperty`
  / `getNestedProperty` / `resetNestedProperty` (`src/qlib/LPropSupport.cpp`)
  and `src/qlib/NestedPropHandler.hpp` (dot-path traversal).
- UXP parity: `uxp_gui/cuemol2/base/content/propeditor-generic-page.{xul,js}`,
  `generic-propdlg.xul`.
- Tests: `__test__/genericProps.test.ts` (parser + service undo-txn
  contract), `__test__/useInspectorState.test.ts` (invokeService wire).
- Related: ADR-0004 (renderer context menu — per-type style dialogs).
