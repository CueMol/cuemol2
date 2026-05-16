# ADR-0015: Generic property inspector — docked pane, live-apply, getPropsJSON bridge

- Status: accepted (color / vector / timeval / nested-object editing pending)
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

First stage edits primitive types only (`string` / `integer` / `real` /
`boolean` / `enum`). C++ `LScrObjBase::setProperty` does not accept dot-paths
(`handleNestedProp` is commented out), so a non-string-convertible
`object<...>` property is shown as a single read-only `<node>` row rather
than being recursed into.

## Consequences

- One editor now serves objects, renderers and scenes generically; the 13
  per-type `prop_dlgs` become a structured *view* over the same data, not 13
  modals.
- Live-apply removes the Apply/Cancel affordance; mis-edits are undone with
  Cmd+Z instead. Acceptable for a docked pane, and matches the guideline.
- Nested object properties (`coil.detail`, colors, vectors, time values) are
  not yet editable. Follow-up: per-child wrapper resolution for nested
  objects, plus color-picker / vector / timeval / selection widgets, and
  `camera` / `style` node support in `resolvePropTarget`.
- `getNodeInfo` / `NodePropertyDialog` remain compiling but dead until a
  follow-up deletes them.

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
  (JSON shape) and `LScrObjBase::setProperty` / `resetProperty`.
- UXP parity: `uxp_gui/cuemol2/base/content/propeditor-generic-page.{xul,js}`,
  `generic-propdlg.xul`.
- Tests: `__test__/genericProps.test.ts` (parser + service undo-txn
  contract), `__test__/useInspectorState.test.ts` (invokeService wire).
- Related: ADR-0004 (renderer context menu — per-type style dialogs).
